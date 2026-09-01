/**
 * Browser half of workspace `@path` references. It mounts this package's
 * generated path-search Remote, registers an independent `@` picker and
 * reference dock, and binds the Host-owned `chaos-at-file` settings section.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CHAOS_AT_FILE_REMOTE as remoteContribution } from '../remote.ts'
import type { AtFileSettings, FileEntry } from '../types.ts'
import { defaultAtFileSettings, ignoreFilesSettingsKey, normalizeIgnoreFiles, normalizeWorkspaceIgnoreFiles, workspacePathKey } from '../defaults.ts'
/** Host settings namespace, kept literal so this browser bundle does not import Host schema code. */
const AT_FILE_SETTINGS_NAMESPACE = 'chaos-at-file'
import { FilesDock, type AtFileDockInjected } from './FilesDock.tsx'
import { FolderNavigator, type FolderNavigatorInjected } from './FolderNavigator.tsx'
import { NS, en, zh } from './locales.ts'
import { createAtFileSource } from './source.ts'
import { AtFileSection, type AtFileSectionInjected, type AtFileSectionViewState } from './SettingsSection.tsx'
import { adoptStyles } from './styles.ts'

/** Dependencies required before this browser plugin activates. */
export const inject = ['inputTriggers', 'sessions', 'remote', 'slots', 'locale', 'settingsScope']

/** Structural Remote face supplied by this package's generated contribution. */
interface SearchRemote {
  search(agentId: SessionId, signal?: AbortSignal): Promise<
    | { ok: true; value: readonly FileEntry[] }
    | { ok: false; error: { code: string; message: string } }
  >
}

/**
 * Register the self-contained @path picker, dock, and settings page.
 * @param ctx - browser root context.
 */
export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chaos-at-file: dictionaries')
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  const sessions = ctx.get('sessions') as unknown as ISessions
  const settingsScope = ctx.settingsScope.bind<AtFileSettings>({ namespace: AT_FILE_SETTINGS_NAMESPACE })
  const snapshot = createSnapshotStore({ value: defaultAtFileSettings() })
  const syncSettings = (): void => {
    const next = settingsScope.getSnapshot()
    if (next.status === 'ready' && next.value !== undefined) snapshot.set({ value: next.value })
  }
  syncSettings()
  ctx.effect(() => settingsScope.subscribe(syncSettings), 'chaos-at-file: settings snapshot')

  let searchRemote: SearchRemote | undefined
  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(remoteContribution)
    searchRemote = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.chaosAtFile') as SearchRemote | undefined
    if (searchRemote === undefined) throw new Error('chaos-at-file: search Remote did not mount')
    return async () => { searchRemote = undefined; await dispose() }
  }, 'chaos-at-file: search Remote')

  const entries = new Map<string, FileEntry>()
  const search = async (sessionId: SessionId, signal: AbortSignal): Promise<readonly FileEntry[]> => {
    const remote = searchRemote
    if (remote === undefined) throw new Error('chaos-at-file: search Remote is unavailable')
    const result = await remote.search(sessionId, signal)
    if (!result.ok) throw new Error(`chaos-at-file: search failed: ${result.error.code}: ${result.error.message}`)
    for (const entry of result.value) entries.set(entry.relative, entry)
    return result.value
  }
  const { source, invalidateAll } = createAtFileSource({ search })
  ctx.on('connection/reset', () => { invalidateAll(); entries.clear() })

  let sourceRegistered = false
  let disposeSource = (): void => {}
  let filtersKey: string | undefined
  const syncSource = (): void => {
    const value = snapshot.getSnapshot().value
    const nextFiltersKey = ignoreFilesSettingsKey(value)
    if (filtersKey !== undefined && filtersKey !== nextFiltersKey) { invalidateAll(); entries.clear() }
    filtersKey = nextFiltersKey
    if (value.enabled && !sourceRegistered) { disposeSource = inputTriggers.registerSource(source); sourceRegistered = true }
    else if (!value.enabled && sourceRegistered) { disposeSource(); disposeSource = (): void => {}; sourceRegistered = false }
  }
  ctx.effect(() => {
    syncSource()
    const off = snapshot.subscribe(syncSource)
    return () => { off(); disposeSource() }
  }, 'chaos-at-file: settings-gated source')

  const openRelative = (relative: string): void => {
    const entry = entries.get(relative)
    if (entry === undefined) { console.error('[chaos-at-file] no indexed path to open:', relative); return }
    void ctx.remote.session.openWorkspacePath({ path: entry.path }).then((result) => {
      if (!result.ok) console.error('[chaos-at-file] path open failed:', result.error.message)
    }, (error: unknown) => { console.error('[chaos-at-file] path open failed:', error) })
  }
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'chaos-at-file', order: 21, locale: NS,
    inject: (): AtFileDockInjected => ({ onOpen: openRelative, hooks: { scope: snapshot } }),
  }, FilesDock))
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay', id: 'chaos-at-file-navigation', order: 1,
    inject: (sessionId): FolderNavigatorInjected => {
      const scope = sessions.scope(sessionId)
      if (scope === undefined) throw new Error(`chaos-at-file: session "${String(sessionId)}" has no client scope`)
      return { controller: inputTriggers.sessionOf(scope), hooks: { scope: snapshot } }
    },
  }, FolderNavigator))

  const state: AtFileSectionViewState = { filterScope: 'global', selectedWorkspace: '' }
  const t = ctx.locale.bind(NS)
  const write = (field: keyof AtFileSettings, value: unknown): Promise<void> => settingsScope.set(field, value)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'chaos-at-file', order: 55, label: () => t('nav'), locale: NS,
    inject: (): AtFileSectionInjected => ({
      hooks: { scope: snapshot }, viewState: state,
      setEnabled: enabled => write('enabled', enabled),
      setIgnorePastedMentions: ignore => write('ignorePastedMentions', ignore),
      setIgnoreFiles: ignoreFiles => write('ignoreFiles', [...ignoreFiles]),
      setWorkspaceIgnoreFiles: (workspace, ignoreFiles) => {
        const current = normalizeWorkspaceIgnoreFiles(snapshot.getSnapshot().value.workspaceIgnoreFiles)
        const key = workspacePathKey(workspace)
        const next = current.filter(entry => workspacePathKey(entry.workspace) !== key)
        const normalized = normalizeIgnoreFiles(ignoreFiles)
        if (normalized.length > 0) next.push({ workspace, ignoreFiles: normalized })
        return write('workspaceIgnoreFiles', next)
      },
    }),
  }, AtFileSection))
}
