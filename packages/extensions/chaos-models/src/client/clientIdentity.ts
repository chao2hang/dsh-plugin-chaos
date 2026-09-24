/**
 * Client-identity presets for a pi-ai route's `headers`. An explicitly
 * configured `user-agent` replaces the Harness attribution default on that
 * route (llm-pi-ai merges profile headers over attribution defaults), so a
 * gateway that gates models by client identity receives the identity the
 * deployment chose. Formats and the Codex `originator` value come from
 * verified wire captures and client sources:
 * `claude-cli/<version> (external, cli)` (claude-relay-service #972),
 * `codex-tui/...` with `originator: codex_cli_rs` (openai/codex
 * `codex-rs/login/src/auth/default_client.rs` DEFAULT_ORIGINATOR),
 * `QwenCode/<version> (<platform>; <arch>)` (QwenLM/qwen-code #11947).
 */

/** One client-identity preset the capability dialog offers beside free text. */
export interface ClientIdentityPreset {
  /** Stable select value. */
  readonly id: string
  /** Preset label; client proper nouns stay verbatim. */
  readonly label: string
  /** npm package the version lookup queries. */
  readonly npmPackage: string
  /** `user-agent` template; `{version}`, `{os}`, and `{arch}` fill on lookup. */
  readonly template: string
  /** Additional headers the preset manages alongside `user-agent`. */
  readonly extraHeaders?: Readonly<Record<string, string>>
}

/** Ordered client-identity presets. */
export const CLIENT_IDENTITY_PRESETS: readonly ClientIdentityPreset[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    npmPackage: '@anthropic-ai/claude-code',
    template: 'claude-cli/{version} (external, cli)',
  },
  {
    id: 'codex',
    label: 'OpenAI Codex CLI',
    npmPackage: '@openai/codex',
    template: 'codex-tui/{version} ({os}; {arch}) (codex-tui; {version})',
    extraHeaders: { originator: 'codex_cli_rs' },
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    npmPackage: '@qwen-code/qwen-code',
    template: 'QwenCode/{version} ({os}; {arch})',
  },
]

/** The select values that do not name a preset. */
export const CUSTOM_IDENTITY_ID = 'custom'

/** The operating system and architecture a filled template reports. */
export interface ClientPlatform {
  readonly os: string
  readonly arch: string
}

/**
 * Best-effort platform detection from the browser user-agent string; the
 * filled value stays editable, so a wrong guess costs one correction.
 * @param userAgent - the browser's `navigator.userAgent`.
 * @returns the platform words the templates embed.
 */
export function detectClientPlatform(userAgent: string): ClientPlatform {
  const os = /Mac|iPhone|iPad/.test(userAgent) ? 'Mac OS' : /Windows/.test(userAgent) ? 'Windows' : 'Linux'
  const arch = /arm|aarch/i.test(userAgent) ? 'arm64' : 'x64'
  return { os, arch }
}

/**
 * Fill one preset template with concrete values.
 * @param template - the preset's `user-agent` template.
 * @param version - the client version to insert.
 * @param platform - the platform words to insert.
 * @returns the ready-to-send `user-agent` value.
 */
export function fillIdentityTemplate(
  template: string,
  version: string,
  platform: ClientPlatform,
): string {
  return template
    .replaceAll('{version}', version)
    .replaceAll('{os}', platform.os)
    .replaceAll('{arch}', platform.arch)
}

/**
 * Match a `user-agent` value back to the preset whose template could have
 * produced it, so a saved route re-selects its preset when the dialog opens.
 * @param presets - the presets to match against.
 * @param value - the stored `user-agent` value.
 * @returns the matching preset id: `''` for the Harness default, `'custom'`
 * for a value no template describes.
 */
export function presetIdOfValue(presets: readonly ClientIdentityPreset[], value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return ''
  for (const preset of presets) {
    // Escape the template as a whole first, then relax the placeholders —
    // escaping after substitution would break the `.+` wildcards.
    const escaped = preset.template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = escaped
      .replaceAll('\\{version\\}', '.+')
      .replaceAll('\\{os\\}', '.+')
      .replaceAll('\\{arch\\}', '.+')
    if (new RegExp(`^${pattern}$`).test(trimmed)) {
      return preset.id
    }
  }
  return CUSTOM_IDENTITY_ID
}

/**
 * Query the npm registry for a package's latest published version.
 * @param npmPackage - the package name, scoped or not.
 * @param fetchImpl - the fetch implementation; tests inject a double.
 * @returns the version string the registry's `latest` dist-tag names.
 */
export async function latestNpmVersion(npmPackage: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(npmPackage)}/latest`)
  if (!response.ok) throw new Error(`npm registry 查询失败（HTTP ${response.status}）`)
  const body = await response.json() as { version?: unknown }
  if (typeof body.version !== 'string' || body.version.length === 0) {
    throw new Error('npm registry 响应缺少 version 字段')
  }
  return body.version
}

/**
 * Merge the dialog-managed identity keys over the route's stored headers.
 * A managed key with no value removes the stored one; unmanaged headers pass
 * through untouched.
 * @param previous - the route's stored `headers` object.
 * @param managed - the values this dialog owns, `undefined` meaning removal.
 * @returns the complete next `headers` object.
 */
export function mergedIdentityHeaders(
  previous: Readonly<Record<string, string>>,
  managed: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const removals = new Set(
    Object.entries(managed)
      .filter(([, value]) => value === undefined || value.length === 0)
      .map(([name]) => name),
  )
  const next: Record<string, string> = {}
  for (const [name, value] of Object.entries(previous)) {
    if (!removals.has(name)) next[name] = value
  }
  for (const [name, value] of Object.entries(managed)) {
    if (value !== undefined && value.length > 0) next[name] = value
  }
  return next
}
