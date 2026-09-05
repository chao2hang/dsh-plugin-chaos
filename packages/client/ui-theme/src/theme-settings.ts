/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'
/** Field carrying the shared application text size. */
export const UI_FONT_SIZE_FIELD = 'uiFontSize'
/** Field carrying the code-surface text size. */
export const CODE_FONT_SIZE_FIELD = 'codeFontSize'

/** Fixed, layout-safe UI text sizes exposed by Appearance settings. */
export const UI_FONT_SIZES = [12, 13, 14, 15, 16] as const
/** Fixed, layout-safe code text sizes exposed by Appearance settings. */
export const CODE_FONT_SIZES = [11, 12, 13, 14, 15] as const

/** Field carrying the conversation content font size. */
export const FONT_SIZE_FIELD = 'fontSize'

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]
/** Persistable UI text size. */
export type UiFontSize = typeof UI_FONT_SIZES[number]
/** Persistable code-surface text size. */
export type CodeFontSize = typeof CODE_FONT_SIZES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'
/** Default application text size. */
export const DEFAULT_UI_FONT_SIZE: UiFontSize = 14
/** Default code-surface text size. */
export const DEFAULT_CODE_FONT_SIZE: CodeFontSize = 12

/** Smallest accepted content font size (px). */
export const FONT_SIZE_MIN = 12

/** Largest accepted content font size (px). */
export const FONT_SIZE_MAX = 17

/** Content font size when the user-settings document has no override (px). */
export const DEFAULT_FONT_SIZE = 14

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Conversation content font size in px (integer within {@link FONT_SIZE_MIN}..{@link FONT_SIZE_MAX}). */
  fontSize: number
  /** Shared application text size in CSS pixels. */
  uiFontSize: UiFontSize
  /** Code-surface text size in CSS pixels. */
  codeFontSize: CodeFontSize
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [FONT_SIZE_FIELD]: z.number().step(1).min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(DEFAULT_FONT_SIZE),
  [UI_FONT_SIZE_FIELD]: z.union([...UI_FONT_SIZES]).default(DEFAULT_UI_FONT_SIZE),
  [CODE_FONT_SIZE_FIELD]: z.union([...CODE_FONT_SIZES]).default(DEFAULT_CODE_FONT_SIZE),
})

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}
