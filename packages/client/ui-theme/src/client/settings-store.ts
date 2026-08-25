/**
 * Appearance row slot store: a mirror of the theme service snapshot. The
 * plugin's apply-world change listener is the only writer; the row component
 * reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { CodeFontSize, ThemePreference, UiFontSize } from '../theme-settings.ts'

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted preference (selection state reads this, never the resolved active theme). */
  preference: ThemePreference
  /** Shared application text size in CSS pixels. */
  uiFontSize: UiFontSize
  /** Code-surface text size in CSS pixels. */
  codeFontSize: CodeFontSize
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (
    draft: AppearanceRowState,
    preference: ThemePreference,
    uiFontSize: UiFontSize,
    codeFontSize: CodeFontSize,
    revision: number,
  ) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ preference: 'system', uiFontSize: 14, codeFontSize: 12, revision: -1 }),
    actions: {
      sync: (d, preference: ThemePreference, uiFontSize: UiFontSize, codeFontSize: CodeFontSize, revision: number) => {
        if (revision <= d.revision) return
        d.preference = preference
        d.uiFontSize = uiFontSize
        d.codeFontSize = codeFontSize
        d.revision = revision
      },
    },
  })
}
