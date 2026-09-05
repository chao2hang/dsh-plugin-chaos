/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import {
  IconDarkOutline16, IconFollowsystemOutline16, IconLightOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { CODE_FONT_SIZES, UI_FONT_SIZES, type CodeFontSize, type ThemePreference, type UiFontSize } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Persist the shared application text size. */
  setUiFontSize: (size: UiFontSize) => void
  /** Persist the code-surface text size. */
  setCodeFontSize: (size: CodeFontSize) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutline16 }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setUiFontSize, setCodeFontSize, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  const uiFontSize = useStore(s => s.uiFontSize)
  const codeFontSize = useStore(s => s.codeFontSize)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, preference === id && css.selected)}
            aria-pressed={preference === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <FontSizeControl label={t('appearance.uiFontSize')} sizes={UI_FONT_SIZES} selected={uiFontSize} onSelect={setUiFontSize} />
      <FontSizeControl label={t('appearance.codeFontSize')} sizes={CODE_FONT_SIZES} selected={codeFontSize} onSelect={setCodeFontSize} />
    </div>
  )
}

/** Render one finite, persisted font-size choice group. */
function FontSizeControl<T extends number>({ label, sizes, selected, onSelect }: {
  label: string
  sizes: readonly T[]
  selected: T
  onSelect: (size: T) => void
}) {
  return (
    <div className={css.sizeControl}>
      <span className={css.sizeLabel}>{label}</span>
      <div className={css.sizeOptions}>
        {sizes.map(size => (
          <button key={size} type="button" className={clsx(css.sizeOption, selected === size && css.selected)} aria-pressed={selected === size} onClick={() => { onSelect(size) }}>
            {size} px
          </button>
        ))}
      </div>
    </div>
  )
}
