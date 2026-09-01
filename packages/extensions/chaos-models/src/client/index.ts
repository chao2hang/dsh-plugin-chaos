/** Browser UI for configuring capabilities on non-official pi-ai models. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ModelCapabilities, type ModelSettingsApi } from './ModelCapabilities.tsx'

interface SettingsRemote {
  describe(): Promise<{
    ok: true
    value: { writable: boolean; namespaces: SettingsNamespaceView[] }
  } | { ok: false; error: { message: string } }>
  mutate(
    namespace: string,
    ops: readonly unknown[],
    revision: number | undefined,
  ): Promise<{ ok: true; value: SettingsNamespaceView } | { ok: false; error: { message: string } }>
}

/** Installed dsh wire: the deployment model catalog (no session parameter). */
type ModelCatalogResponse = {
  ok: true
  value: {
    default: { provider: string; model: string; reasoningEffort?: string }
    groups: { id: string; name: string; models: { id: string; name: string; description?: string }[] }[]
  }
} | { ok: false; error: { code?: string; message: string } }

interface SessionRemote {
  modelCatalog(): Promise<ModelCatalogResponse>
}

function settingsRemoteOf(ctx: ClientContext): SettingsRemote {
  const remote = ctx.remote as ClientContext['remote'] & { settings?: SettingsRemote }
  if (remote.settings === undefined) throw new Error('chaos-models: the dsh settings remote is unavailable')
  return remote.settings
}

function sessionRemoteOf(ctx: ClientContext): SessionRemote {
  const remote = ctx.remote as ClientContext['remote'] & { session?: SessionRemote }
  if (remote.session === undefined) throw new Error('chaos-models: the dsh session remote is unavailable')
  return remote.session
}

/** Required client services. */
export const inject = ['slots', 'remote', 'remote.settings', 'remote.session']

/** The bounded in-process settings mirror removes menu-open round trips. */
class PiAiSettingsCache {
  private value: { writable: boolean; namespaces: SettingsNamespaceView[] } | undefined
  private pending: Promise<{ writable: boolean; namespaces: SettingsNamespaceView[] }> | undefined

  constructor(private readonly settingsRemote: SettingsRemote) {}

  /** Return the last known settings snapshot, loading only when absent. */
  load(): Promise<{ writable: boolean; namespaces: SettingsNamespaceView[] }> {
    if (this.value !== undefined) return Promise.resolve(this.value)
    if (this.pending !== undefined) return this.pending
    this.pending = this.settingsRemote.describe().then((response) => {
      if (!response.ok) throw new Error(response.error.message)
      this.value = response.value
      return this.value
    }).finally(() => { this.pending = undefined })
    return this.pending
  }

  /** Discard a snapshot after the extension writes the same document. */
  invalidate(): void {
    this.value = undefined
  }
}

/**
 * Build the dialog's wire surface from the installed runtime's remotes.
 * Fork builds carry the same wire methods on `connection.api`; this adapter
 * keeps one component contract over whichever carrier is live.
 * @param settingsRemote - the mounted settings namespace.
 * @param sessionRemote - the mounted session namespace.
 * @returns the settings describe/mutate plus the model-catalog read.
 */
function apiFromRemotes(settingsRemote: SettingsRemote, sessionRemote: SessionRemote): ModelSettingsApi {
  return {
    settings: {
      describe: () => settingsRemote.describe().then(result => ({ result })),
      mutate: request => settingsRemote
        .mutate(request.ns, request.ops, request.expectedRevision)
        .then(result => ({ result })),
    },
    sessions: {
      models: async () => {
        const response = await sessionRemote.modelCatalog()
        if (!response.ok) return { result: { ok: false as const, error: { message: response.error.message } } }
        return {
          result: {
            ok: true as const,
            value: { current: response.value.default, groups: response.value.groups },
          },
        }
      },
    },
  }
}

/**
 * Register the composer-row configuration control. The cached settings document
 * is warmed once per client lifetime, so opening the form needs only the small
 * model-catalog request instead of waiting for a full settings descriptor.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const settingsRemote = settingsRemoteOf(ctx)
  const sessionRemote = sessionRemoteOf(ctx)
  const settings = new PiAiSettingsCache(settingsRemote)
  const api = apiFromRemotes(settingsRemote, sessionRemote)
  ctx.effect(() => {
    const dispose = ctx.remote.$on('settings/document-updated', () => { settings.invalidate() })
    return dispose
  }, 'chaos-models: settings cache invalidation')
  void settings.load().catch(() => {})
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'chaos-model-capabilities',
    inject: (sessionId: SessionId) => ({
      sessionId,
      api,
      describe: () => settings.load(),
      invalidateSettings: () => { settings.invalidate() },
    }),
  }, ModelCapabilities))
}

export { ModelCapabilities, modelProfileOf, parseCapacity, saveModelCapabilities } from './ModelCapabilities.tsx'
