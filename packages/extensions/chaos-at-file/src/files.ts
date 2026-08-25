/**
 * Bounded workspace path index over node:fs. The walk streams one dirent at a
 * time, so memory stays proportional to a single directory level even under a
 * very large one; it follows file and directory symlinks without re-entering a
 * target already on the current path, skips configured directory basenames,
 * and stops at the configured entry cap with an honest `truncated` flag.
 */
import { opendir, realpath, stat } from 'node:fs/promises'
import type { Dir, Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { compileIgnoreRules, compileRegex } from './defaults.ts'
import type { FileEntry, FileIgnoreRuleInput } from './types.ts'

/** Bounds and filters for one index pass. */
export interface IndexOptions {
  /** Hard cap on collected entries. */
  readonly maxFiles: number
  /** Directory basenames the walk never enters. */
  readonly ignoreDirs: readonly string[]
  /** Basename filters applied to files before they enter the index. */
  readonly ignoreFiles: readonly FileIgnoreRuleInput[]
}

/** One index pass: the sorted entries plus whether the cap cut the walk short. */
export interface WorkspaceIndex {
  readonly files: readonly FileEntry[]
  /** True when the walk hit `maxFiles` before the tree was exhausted. */
  readonly truncated: boolean
}

/** Directory opener seam: the real filesystem in production, a fake in tests. */
export type OpenWorkspaceDirectory = (path: string) => Promise<Dir>

/** One queued directory and the real targets already present above it. */
interface DirectoryTask {
  readonly path: string
  readonly canonical: string
  readonly ancestors: ReadonlySet<string>
}

/** Await `operation`, rejecting with the signal's reason the moment it aborts. */
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined, onLateValue?: (value: T) => void): Promise<T> {
  if (signal === undefined) return operation
  return new Promise<T>((resolve, reject) => {
    let settled = false
    /* v8 ignore start -- needs a filesystem await stalling exactly while the abort
     * lands; a pre-aborted caller throws before reaching here. */
    const onAbort = (): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      operation.then(onLateValue, () => {
        // The abort reason already carries the outcome; a late rejection has no consumer.
      })
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    /* v8 ignore stop */
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (reason: unknown) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        reject(asError(reason))
      },
    )
  })
}

/** An unknown thrown or abort reason as an Error. */
function asError(reason: unknown): Error {
  /* v8 ignore next -- the non-Error arm needs a non-Error abort reason fired mid-await. */
  return reason instanceof Error ? reason : new Error(String(reason))
}

/** Message text of an unknown thrown value. */
function messageOf(error: unknown): string {
  /* v8 ignore next -- node:fs rejects with Error instances; the String arm only satisfies the unknown narrowing. */
  return error instanceof Error ? error.message : String(error)
}

/** Forward-slash display path of `child` under `root`, stable across platforms. */
function displayRelative(root: string, child: string): string {
  return relative(root, child).split(sep).join('/')
}

/** Close a departed caller's abandoned handle without awaiting a queued read. */
function closeOrSwallow(handle: Dir, signal: AbortSignal | undefined): Promise<void> {
  const closing = handle.close()
  /* v8 ignore start -- an abort landing between a read and its close needs a
   * filesystem stall; the abandoned close has no observable outcome. */
  if (signal?.aborted) {
    closing.catch(() => {
      // The caller already departed, so a close failure has no consumer.
    })
    return Promise.resolve()
  }
  /* v8 ignore stop */
  return closing.catch((error: unknown) => {
    console.warn(`[chaos-at-file] closing directory handle failed: ${messageOf(error)}`)
  })
}

/** Build the basename predicate once for a whole walk. */
function ignoredFilePredicate(values: readonly FileIgnoreRuleInput[]): (name: string) => boolean {
  const rules = compileIgnoreRules(values)
  const expressions = new Map(rules
    .filter(rule => rule.kind === 'regex')
    .map(rule => [rule, compileRegex(rule)]))
  return (name: string): boolean => rules.some((rule) => {
    if (rule.kind === 'exact') {
      return rule.caseSensitive
        ? name === rule.pattern
        : name.toLowerCase() === rule.pattern.toLowerCase()
    }
    return (expressions.get(rule) as RegExp).test(name)
  })
}

/**
 * Index one workspace directory tree within the configured bounds.
 * @param root - the workspace directory the session runs in.
 * @param options - entry cap and the directory and basename filters.
 * @param signal - caller lifetime; the walk races every filesystem await against it.
 * @param openDirectory - directory opener seam; defaults to node:fs `opendir`.
 * @returns the path-sorted entries and whether the cap truncated the walk.
 * @throws Error when the workspace root itself cannot be listed.
 */
export async function indexWorkspace(
  root: string,
  options: IndexOptions,
  signal?: AbortSignal,
  openDirectory: OpenWorkspaceDirectory = opendir,
): Promise<WorkspaceIndex> {
  const ignoreDirs = new Set(options.ignoreDirs)
  const isIgnoredFile = ignoredFilePredicate(options.ignoreFiles)
  const files: FileEntry[] = []
  let rootCanonical: string
  try {
    rootCanonical = await raceAbort(realpath(root), signal)
  } catch (error: unknown) {
    signal?.throwIfAborted()
    throw new Error(`chaos-at-file: cannot list "${root}": ${messageOf(error)}`)
  }
  const queue: DirectoryTask[] = [{ path: root, canonical: rootCanonical, ancestors: new Set() }]
  let truncated = false
  while (queue.length > 0) {
    signal?.throwIfAborted()
    const task = queue.shift() as DirectoryTask
    const dir = task.path
    // A directory link may point at itself or any parent. The alias stays an
    // indexed entry, but a target already on this path is never re-entered.
    if (task.ancestors.has(task.canonical)) continue
    const childAncestors = new Set(task.ancestors)
    childAncestors.add(task.canonical)
    let handle: Dir
    try {
      handle = await raceAbort(openDirectory(dir), signal, (late) => { void closeOrSwallow(late, undefined) })
    } catch (error: unknown) {
      signal?.throwIfAborted()
      if (dir === root) throw new Error(`chaos-at-file: cannot list "${dir}": ${messageOf(error)}`)
      console.warn(`[chaos-at-file] skipping unreadable directory "${dir}": ${messageOf(error)}`)
      continue
    }
    try {
      for (;;) {
        let dirent: Dirent | null
        try {
          dirent = await raceAbort(handle.read(), signal)
        } catch (error: unknown) {
          signal?.throwIfAborted()
          console.warn(`[chaos-at-file] stopped reading directory "${dir}": ${messageOf(error)}`)
          break
        }
        if (dirent === null) break
        if (files.length >= options.maxFiles) {
          truncated = true
          break
        }
        const child = join(dir, dirent.name)
        if (dirent.isSymbolicLink()) {
          let targetPath: string
          let target: Awaited<ReturnType<typeof stat>>
          try {
            targetPath = await raceAbort(realpath(child), signal)
            target = await raceAbort(stat(targetPath), signal)
          } catch {
            signal?.throwIfAborted()
            // Broken, inaccessible, and transient links do not invalidate the
            // rest of the workspace index.
            continue
          }
          if (target.isDirectory()) {
            if (ignoreDirs.has(dirent.name)) continue
            files.push({ path: child, relative: displayRelative(root, child), kind: 'dir' })
            queue.push({ path: child, canonical: targetPath, ancestors: childAncestors })
            continue
          }
          if (target.isFile() && !isIgnoredFile(dirent.name)) {
            files.push({ path: child, relative: displayRelative(root, child), kind: 'file' })
          }
          continue
        }
        if (dirent.isDirectory()) {
          if (ignoreDirs.has(dirent.name)) continue
          // Directories are indexed entries in their own right, so one path can
          // be referenced without inspecting its descendants.
          files.push({ path: child, relative: displayRelative(root, child), kind: 'dir' })
          queue.push({
            path: child,
            canonical: join(task.canonical, dirent.name),
            ancestors: childAncestors,
          })
          continue
        }
        if (dirent.isFile() && !isIgnoredFile(dirent.name)) {
          files.push({ path: child, relative: displayRelative(root, child), kind: 'file' })
        }
      }
    } finally {
      await closeOrSwallow(handle, signal)
    }
    if (truncated) break
  }
  files.sort((a, b) => a.relative < b.relative ? -1 : 1)
  return { files, truncated }
}
