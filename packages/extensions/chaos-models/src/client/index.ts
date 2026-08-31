/** Browser UI for configuring capabilities on non-official pi-ai models. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, IApiClient, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ModelCapabilities } from './ModelCapabilities.tsx'

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

function settingsRemoteOf(ctx: ClientContext): SettingsRemote {
  const remote = ctx.remote as ClientContext['remote'] & { settings?: SettingsRemote }
  if (remote.settings === undefined) throw new Error('chaos-models: the dsh settings remote is unavailable')
  return remote.settings
}

/** Required client services. */
export const inject = ['slots', 'remote', 'connection']

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
 * Register the composer-row configuration control. The cached settings document
 * is warmed once per client lifetime, so opening the form needs only the small
 * session-model request instead of waiting for a full settings descriptor.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const settingsRemote = settingsRemoteOf(ctx)
  const settings = new PiAiSettingsCache(settingsRemote)
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
      api: {
        ...connection.api,
        settings: {
          ...connection.api.settings,
          mutate: (request: { ns: string; ops: SettingsPathOpView[]; expectedRevision?: number }) => settingsRemote
            .mutate(request.ns, request.ops, request.expectedRevision)
            .then(result => ({ result })),
        },
      } as Pick<IApiClient, 'settings' | 'sessions'>,
      describe: () => settings.load(),
      invalidateSettings: () => { settings.invalidate() },
    }),
  }, ModelCapabilities))
}

export { ModelCapabilities, modelProfileOf, parseCapacity, saveModelCapabilities } from './ModelCapabilities.tsx'
