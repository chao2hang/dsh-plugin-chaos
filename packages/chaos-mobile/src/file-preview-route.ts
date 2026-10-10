/**
 * HTTP route handler for workspace file previews in the Web GUI.
 *
 * Serves file contents, metadata, and raw streams over `/api/chaos/file`
 * so the browser can display clicked files directly in-page rather than
 * spawning an external desktop application like `xdg-open`.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-mobile/file-preview-route
 */

import { Buffer } from 'node:buffer'
import { createReadStream, type Dirent } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, extname, join, resolve } from 'node:path'

/** Maximum file size in bytes to return as inlined text (2 MB). */
const MAX_INLINE_TEXT_BYTES = 2 * 1024 * 1024

/** Known image extensions. */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif',
])

/** Known audio extensions. */
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
])

/** Known video extensions. */
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.mkv',
])

/** Known code and text extensions. */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.json', '.jsonc', '.json5', '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.xml', '.svg', '.vue', '.svelte', '.astro',
  '.py', '.pyi', '.rs', '.go', '.java', '.kt', '.kts', '.c', '.cc', '.cpp', '.cxx',
  '.h', '.hh', '.hpp', '.cs', '.php', '.rb', '.sh', '.bash', '.zsh', '.fish',
  '.ps1', '.bat', '.cmd', '.yaml', '.yml', '.toml', '.ini', '.conf', '.env',
  '.sql', '.graphql', '.gql', '.proto', '.txt', '.log', '.diff', '.patch',
  '.lua', '.r', '.dart', '.swift', '.scala', '.dockerfile',
])

/** Map extensions to standard MIME types for raw streaming. */
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

/**
 * Determine the preview kind from extension.
 * @param ext - File extension with leading dot (e.g. '.ts').
 * @returns The categorized file preview kind.
 */
export function classifyFileKind(ext: string): 'markdown' | 'image' | 'media' | 'pdf' | 'text' | 'binary' {
  const lower = ext.toLowerCase()
  if (lower === '.md' || lower === '.markdown') return 'markdown'
  if (IMAGE_EXTENSIONS.has(lower)) return 'image'
  if (AUDIO_EXTENSIONS.has(lower) || VIDEO_EXTENSIONS.has(lower)) return 'media'
  if (lower === '.pdf') return 'pdf'
  if (TEXT_EXTENSIONS.has(lower)) return 'text'
  return 'binary'
}

/**
 * Language identifier for syntax tags.
 * @param ext - File extension with or without leading dot.
 * @returns Normalized language identifier.
 */
export function languageForExtension(ext: string): string {
  const lower = ext.toLowerCase().replace(/^\./, '')
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    pyi: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
    md: 'markdown',
    markdown: 'markdown',
  }
  return map[lower] ?? lower
}

/**
 * Handle incoming file preview requests.
 * @param req - Incoming HTTP request.
 * @param res - Server HTTP response.
 */
export async function handleFilePreview(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const requestedPath = url.searchParams.get('path')
  const raw = url.searchParams.get('raw') === '1'
  const download = url.searchParams.get('download') === '1'

  if (!requestedPath || requestedPath.trim().length === 0) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing path query parameter' }))
    return
  }

  const targetPath = resolve(requestedPath.trim())

  let fileStat
  try {
    fileStat = await stat(targetPath)
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    res.statusCode = code === 'ENOENT' ? 404 : 403
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      error: code === 'ENOENT' ? 'File not found' : 'Permission denied',
      path: targetPath,
    }))
    return
  }

  const fileName = basename(targetPath)
  const ext = extname(targetPath)
  const mimeType = MIME_MAP[ext.toLowerCase()] ?? 'application/octet-stream'

  // Handle Directory listing
  if (fileStat.isDirectory()) {
    try {
      const dirEntries = await readdir(targetPath, { withFileTypes: true })
      const entries = await Promise.all(dirEntries.map(async (entry: Dirent) => {
        let size: number | undefined
        let mtime: number | undefined
        try {
          const itemStat = await stat(join(targetPath, entry.name))
          size = itemStat.isFile() ? itemStat.size : undefined
          mtime = itemStat.mtimeMs
        } catch {
          // ignore unreadable child item
        }
        return {
          name: entry.name,
          path: join(targetPath, entry.name),
          isDirectory: entry.isDirectory(),
          size,
          mtime,
        }
      }))

      // Sort directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        ok: true,
        kind: 'directory',
        path: targetPath,
        name: fileName || targetPath,
        entries,
      }))
      return
    } catch (err: unknown) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Failed to list directory: ${String(err)}` }))
      return
    }
  }

  // Handle raw streaming (images, media, download, etc.)
  if (raw || download) {
    res.statusCode = 200
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Length', fileStat.size)
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    }
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(targetPath)
    stream.pipe(res)
    stream.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 500
        res.end()
      }
    })
    return
  }

  // Handle JSON metadata and content
  const kind = classifyFileKind(ext)
  const rawUrl = `/api/chaos/file?path=${encodeURIComponent(targetPath)}&raw=1`

  if (kind === 'text' || kind === 'markdown') {
    let content = ''
    let truncated = false
    try {
      if (fileStat.size > MAX_INLINE_TEXT_BYTES) {
        const fileHandle = createReadStream(targetPath, { end: MAX_INLINE_TEXT_BYTES - 1 })
        const chunks: Buffer[] = []
        for await (const chunk of fileHandle) {
          chunks.push(chunk as Buffer)
        }
        content = Buffer.concat(chunks).toString('utf-8')
        truncated = true
      } else {
        content = await readFile(targetPath, 'utf-8')
      }
    } catch (err: unknown) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Failed to read file: ${String(err)}` }))
      return
    }

    const lineCount = content.length === 0 ? 0 : content.split('\n').length
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({
      ok: true,
      kind,
      path: targetPath,
      name: fileName,
      extension: ext.replace(/^\./, ''),
      language: languageForExtension(ext),
      size: fileStat.size,
      mtime: fileStat.mtimeMs,
      lineCount,
      content,
      truncated,
      rawUrl,
    }))
    return
  }

  // Non-text files: return metadata and rawUrl for client rendering
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({
    ok: true,
    kind,
    mediaType: AUDIO_EXTENSIONS.has(ext.toLowerCase()) ? 'audio' : VIDEO_EXTENSIONS.has(ext.toLowerCase()) ? 'video' : undefined,
    path: targetPath,
    name: fileName,
    extension: ext.replace(/^\./, ''),
    size: fileStat.size,
    mtime: fileStat.mtimeMs,
    mimeType,
    rawUrl,
  }))
}
