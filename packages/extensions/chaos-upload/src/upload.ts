/**
 * Pure upload admission and storage. One browser upload is decoded from
 * canonical base64, its display name is reduced to a safe workspace basename,
 * and its bytes are written into the session workspace's upload directory
 * under a collision-free name. File bytes cross exactly this module; nothing
 * here reads or transforms content beyond the write.
 */
import { Buffer } from 'node:buffer'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative as pathRelative, resolve, sep } from 'node:path'
import type { ResolvedConfig, UploadRequest, UploadResult } from './types.ts'

/** Upper bound on the sanitised basename length before the suffix loop. */
const MAX_NAME_LENGTH = 128

/** Upper bound on collision-suffix attempts before admission fails. */
const MAX_COLLISION_ATTEMPTS = 1000

/**
 * Decode one upload payload while rejecting non-canonical base64 forms.
 * @param data - the wire base64 payload.
 * @returns the decoded bytes.
 * @throws Error on empty or non-canonical base64.
 */
export function decodeUploadBase64(data: string): Uint8Array {
  const decoded = Buffer.from(data, 'base64')
  if (data.length === 0 || decoded.toString('base64') !== data) {
    throw new Error('chaos-upload: upload payload is not canonical base64.')
  }
  return new Uint8Array(decoded)
}

/**
 * Reduce one caller-declared name to a safe bare basename: separators are
 * collapsed, control characters dropped, and the result is length-capped.
 * @param name - the browser-declared file name.
 * @returns the safe basename.
 * @throws Error when nothing nameable remains.
 */
export function sanitizeUploadName(name: string): string {
  const cleaned = basename(name.replaceAll('\\', '/'))
    .replaceAll(/[\u0000-\u001f\u007f]/gu, '')
    .trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    throw new Error('chaos-upload: upload name has no usable basename.')
  }
  return cleaned.slice(0, MAX_NAME_LENGTH)
}

/**
 * Resolve the upload directory inside one workspace and prove confinement.
 * @param cwd - the session's workspace directory.
 * @param dir - the configured workspace-relative upload directory.
 * @returns the absolute upload directory.
 * @throws Error when the configured directory escapes the workspace.
 */
export function uploadDirectory(cwd: string, dir: string): string {
  const absolute = resolve(cwd, dir)
  const confined = pathRelative(cwd, absolute)
  if (confined === '' || confined === '..' || confined.startsWith(`..${sep}`) || isAbsolute(confined)) {
    throw new Error('chaos-upload: upload directory escapes the session workspace.')
  }
  return absolute
}

/**
 * Admit and store one upload inside the session workspace.
 * @param cwd - the session's workspace directory.
 * @param config - resolved plugin limits and directory.
 * @param request - the browser upload request.
 * @param signal - caller lifetime.
 * @returns the stored file's workspace-relative path and byte length.
 * @throws Error on refused input or filesystem failure.
 */
export async function writeUpload(
  cwd: string,
  config: ResolvedConfig,
  request: UploadRequest,
  signal: AbortSignal,
): Promise<UploadResult> {
  const bytes = decodeUploadBase64(request.data)
  if (bytes.byteLength === 0) {
    throw new Error('chaos-upload: upload is empty.')
  }
  if (bytes.byteLength > config.maxFileBytes) {
    throw new Error(`chaos-upload: upload of ${bytes.byteLength} bytes exceeds the ${config.maxFileBytes}-byte limit.`)
  }
  const name = sanitizeUploadName(request.name)
  signal.throwIfAborted()
  const directory = uploadDirectory(cwd, config.dir)
  await mkdir(directory, { recursive: true })
  signal.throwIfAborted()
  // 'wx' fails atomically when the target exists, so concurrent uploads of
  // the same name never overwrite one another; each retry numbers the
  // ORIGINAL stem instead of trusting a pre-checked stat.
  const extension = extname(name)
  const stem = basename(name, extension)
  for (let attempt = 1; attempt <= MAX_COLLISION_ATTEMPTS; attempt += 1) {
    signal.throwIfAborted()
    const candidate = attempt === 1
      ? join(directory, name)
      : join(directory, `${stem}-${attempt}${extension}`)
    try {
      await writeFile(candidate, bytes, { flag: 'wx' })
      const relative = pathRelative(cwd, candidate).split(sep).join('/')
      return { relative, bytes: bytes.byteLength }
    } catch (error) {
      if (!isFileExistsError(error)) throw error
    }
  }
  throw new Error(`chaos-upload: no free name for "${name}" after ${MAX_COLLISION_ATTEMPTS} attempts.`)
}

/** Whether one filesystem error reports an existing target. */
function isFileExistsError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EEXIST'
}

/**
 * Prove one resolved workspace path still exists; used by the marker boundary.
 * @param cwd - the session's workspace directory.
 * @param relative - the workspace-relative path to prove.
 * @param signal - caller lifetime.
 * @returns whether the path names an existing regular file.
 */
export async function workspaceFileExists(cwd: string, relative: string, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  const info = await stat(resolve(cwd, relative)).catch(() => undefined)
  signal.throwIfAborted()
  return info?.isFile() ?? false
}
