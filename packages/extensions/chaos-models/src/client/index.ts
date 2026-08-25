/** Browser UI for configuring capabilities on non-official pi-ai models. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ModelCapabilities } from './ModelCapabilities.tsx'

/** Required client services. */
export const inject = ['slots', 'connection', 'remote']

/** The bounded in-process settings mirror removes menu-open round trips. */
class PiAiSettingsCache {
  private value: { writable: boolean; namespaces: SettingsNamespaceView[] } | undefined
  private pending: Promise<{ writable: boolean; namespaces: SettingsNamespaceView[] }> | undefined

  constructor(private readonly connection: ConnectionHandle) {}

  /** Return the last known settings snapshot, loading only when absent. */
  load(): Promise<{ writable: boolean; namespaces: SettingsNamespaceView[] }> {
    if (this.value !== undefined) return Promise.resolve(this.value)
    if (this.pending !== undefined) return this.pending
    this.pending = this.connection.api.settings.describe({}).then((response) => {
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.value = response.result.value
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
  const settings = new PiAiSettingsCache(connection)
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
      api: connection.api,
      describe: () => settings.load(),
      invalidateSettings: () => { settings.invalidate() },
    }),
  }, ModelCapabilities))
}

export { ModelCapabilities, modelProfileOf, parseCapacity, saveModelCapabilities } from './ModelCapabilities.tsx'
