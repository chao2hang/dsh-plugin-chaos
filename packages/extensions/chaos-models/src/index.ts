/** Model capability configuration extension, Host half. */

/**
 * Return the empty Host plugin. The browser writes model overrides through the
 * existing live `llm-pi-ai` settings section, which is already the owner of
 * pi-ai profile validation and adapter refresh.
 */
export function apply(): void {}

/** Stable settings namespace that pi-ai owns. */
export const PI_AI_SETTINGS_NAMESPACE = 'llm-pi-ai'

/** One level the capability form can translate to pi-ai's wire map. */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Ordered pi-ai reasoning levels exposed by the configuration form. */
export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
]

/** Convert selected levels to pi-ai's exact `reasoningEfforts` profile field. */
export function reasoningEffortsOf(levels: readonly ThinkingLevel[]): false | Record<string, string | null> {
  if (levels.length === 0) return false
  const efforts: Record<string, string | null> = {}
  for (const level of levels) efforts[level] = level === 'off' ? null : level
  return efforts
}
