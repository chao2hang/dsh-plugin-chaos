/**
 * Built-in filter lists and the normalization every filter consumer shares:
 * the Host index walk, the settings writer, and the browser cache key all
 * resolve legacy strings and structured rules through these functions, so one
 * stored document cannot mean two different filter sets.
 */
import type {
  AtFileSettings, FileIgnoreRule, FileIgnoreRuleInput, WorkspaceIgnoreFiles,
} from './types.ts'

/** Directory basenames omitted from the index unless the profile supplies its own list. */
export const DEFAULT_IGNORE_DIRS = [
  '.git', '.hg', '.svn',
  '.idea', '.vs', '.vscode', '.fleet', '.history', '.metadata', '.settings',
  'node_modules', 'bower_components', 'vendor', 'Pods',
  '.gradle', '.kotlin', '.cxx', '.externalNativeBuild', '.dart_tool', '.swiftpm', '.build',
  '.cache', '.parcel-cache', '.turbo', '.nx',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.venv', 'venv',
  '.next', '.nuxt', '.output', '.svelte-kit', '.angular',
  'build', 'bin', 'dist', 'out', 'target', 'obj', 'coverage',
  'DerivedData', 'xcuserdata',
  'CMakeFiles', 'cmake-build-debug', 'cmake-build-release',
  'cmake-build-relwithdebinfo', 'cmake-build-minsizerel', '_deps',
  '.godot', 'Library', 'Temp', 'Logs', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache',
] as const

/** File basenames omitted from the index unless the settings section replaces the list. */
export const DEFAULT_IGNORE_FILES = ['desktop.ini', 'Thumbs.db', '.DS_Store'] as const

/**
 * The section both halves start from before the first settings read.
 * @returns a fresh default section.
 */
export function defaultAtFileSettings(): AtFileSettings {
  return {
    enabled: true,
    ignoreFiles: [...DEFAULT_IGNORE_FILES],
    workspaceIgnoreFiles: [],
    ignorePastedMentions: true,
  }
}

/**
 * Resolve one stored or wire value into its canonical rule.
 * @param value - a legacy string or a structured rule.
 * @returns the canonical rule, or undefined when the pattern is blank.
 * @throws Error when a regex rule's pattern is not a valid regular expression.
 */
export function normalizeIgnoreRule(value: FileIgnoreRuleInput): FileIgnoreRule | undefined {
  if (typeof value === 'string') {
    const pattern = value.trim()
    return pattern === '' ? undefined : { kind: 'exact', pattern, caseSensitive: false }
  }
  const pattern = value.pattern.trim()
  if (pattern === '') return undefined
  const rule: FileIgnoreRule = { kind: value.kind, pattern, caseSensitive: value.caseSensitive }
  if (rule.kind === 'regex') compileRegex(rule)
  return rule
}

/**
 * Compile one regex rule, naming the offending pattern on failure.
 * @param rule - a canonical regex rule.
 * @returns the compiled expression.
 * @throws Error when the pattern is not a valid regular expression.
 */
export function compileRegex(rule: FileIgnoreRule): RegExp {
  try {
    return new RegExp(rule.pattern, rule.caseSensitive ? 'u' : 'iu')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`chaos-at-file: invalid regular expression "${rule.pattern}": ${message}`)
  }
}

/**
 * Stable identity of one rule, including its matching semantics, so two
 * spellings of the same filter deduplicate.
 * @param value - a legacy string or a structured rule.
 * @returns the identity key; empty for a blank pattern.
 */
export function ignoreRuleKey(value: FileIgnoreRuleInput): string {
  const rule = normalizeIgnoreRule(value)
  if (rule === undefined) return ''
  const pattern = rule.kind === 'exact' && !rule.caseSensitive ? rule.pattern.toLowerCase() : rule.pattern
  return JSON.stringify([rule.kind, pattern, rule.caseSensitive])
}

/**
 * Trim rules and drop blanks and duplicates, keeping legacy strings as strings
 * so an existing settings document survives a rewrite unchanged.
 * @param values - stored or submitted filters in author order.
 * @returns the normalized list in first-seen order.
 */
export function normalizeIgnoreFiles(values: readonly FileIgnoreRuleInput[]): FileIgnoreRuleInput[] {
  const seen = new Set<string>()
  const normalized: FileIgnoreRuleInput[] = []
  for (const value of values) {
    const rule = normalizeIgnoreRule(value)
    if (rule === undefined) continue
    const key = ignoreRuleKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(typeof value === 'string' && rule.kind === 'exact' && !rule.caseSensitive
      ? rule.pattern
      : rule)
  }
  return normalized
}

/**
 * Resolve every filter to its canonical rule once, ahead of a bounded walk.
 * @param values - stored filters.
 * @returns canonical rules in normalized order.
 */
export function compileIgnoreRules(values: readonly FileIgnoreRuleInput[]): readonly FileIgnoreRule[] {
  return normalizeIgnoreFiles(values).map(value => normalizeIgnoreRule(value) as FileIgnoreRule)
}

/**
 * Comparison key for one workspace path: separators unify, a trailing
 * separator drops, and case folds only where the platform path is case-insensitive.
 * @param value - a workspace directory path.
 * @returns the comparison key.
 */
export function workspacePathKey(value: string): string {
  const slashed = value.replaceAll('\\', '/')
  const withoutTrailing = slashed === '/' || /^[a-z]:\/$/iu.test(slashed)
    ? slashed
    : slashed.replace(/\/+$/u, '')
  return /^[a-z]:\//iu.test(withoutTrailing) || withoutTrailing.startsWith('//')
    ? withoutTrailing.toLowerCase()
    : withoutTrailing
}

/**
 * Merge duplicate workspace rows and normalize each row's filters.
 * @param entries - stored or submitted workspace rows.
 * @returns one row per workspace, in first-seen order.
 */
export function normalizeWorkspaceIgnoreFiles(
  entries: readonly WorkspaceIgnoreFiles[],
): WorkspaceIgnoreFiles[] {
  const order: string[] = []
  const byWorkspace = new Map<string, WorkspaceIgnoreFiles>()
  for (const entry of entries) {
    const key = workspacePathKey(entry.workspace)
    if (key === '') continue
    const current = byWorkspace.get(key)
    if (current === undefined) order.push(key)
    byWorkspace.set(key, {
      workspace: current?.workspace ?? entry.workspace,
      ignoreFiles: normalizeIgnoreFiles([...current?.ignoreFiles ?? [], ...entry.ignoreFiles]),
    })
  }
  return order.map(key => byWorkspace.get(key) as WorkspaceIgnoreFiles)
}

/**
 * The filters one workspace adds on top of the global list.
 * @param entries - stored workspace rows.
 * @param workspace - the workspace directory to resolve.
 * @returns that workspace's own filters, empty when it has none.
 */
export function workspaceIgnoreFilesFor(
  entries: readonly WorkspaceIgnoreFiles[],
  workspace: string,
): readonly FileIgnoreRuleInput[] {
  const key = workspacePathKey(workspace)
  return normalizeWorkspaceIgnoreFiles(entries)
    .find(candidate => workspacePathKey(candidate.workspace) === key)?.ignoreFiles ?? []
}

/**
 * The filters one index walk applies: global rules plus that workspace's additions.
 * @param settings - the resolved settings section.
 * @param workspace - the workspace being indexed.
 * @returns the merged, normalized filter list.
 */
export function effectiveIgnoreFiles(
  settings: AtFileSettings,
  workspace: string,
): readonly FileIgnoreRuleInput[] {
  return normalizeIgnoreFiles([
    ...settings.ignoreFiles,
    ...workspaceIgnoreFilesFor(settings.workspaceIgnoreFiles, workspace),
  ])
}

/**
 * Cache key covering every filter setting, so the browser index drops exactly
 * when a filter change would produce a different list.
 * @param settings - the resolved settings section.
 * @returns an order-independent key over all filters.
 */
export function ignoreFilesSettingsKey(settings: AtFileSettings): string {
  const global = normalizeIgnoreFiles(settings.ignoreFiles).map(ignoreRuleKey).sort()
  const workspaces = normalizeWorkspaceIgnoreFiles(settings.workspaceIgnoreFiles)
    .map(entry => ({
      workspace: workspacePathKey(entry.workspace),
      ignoreFiles: entry.ignoreFiles.map(ignoreRuleKey).sort(),
    }))
    .sort((left, right) => left.workspace.localeCompare(right.workspace))
  return JSON.stringify({ global, workspaces })
}
