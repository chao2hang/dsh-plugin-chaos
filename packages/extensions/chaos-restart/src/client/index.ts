/**
 * Server self-restart plugin, browser half: the System section on the Settings
 * page, over this package's own `/api/system/*` routes.
 *
 * Restart is deliberately an operator action behind a confirmation rather than
 * an automatic recovery: it replaces the process, so any in-flight turn dies
 * with it. What survives is everything durable — the session log — which the
 * persistence layer repairs on reload by closing the killed turn with its
 * crash-recovery marker.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings slot declarations into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { RestartSection } from './RestartSection.tsx'
import type { RestartSectionInjected } from './RestartSection.tsx'
import { createRestartPort } from './restart-port.ts'
import { en, zh } from './locales.ts'

export { RestartSection } from './RestartSection.tsx'
export type { RestartSectionInjected, RestartSectionProps } from './RestartSection.tsx'
export { createRestartPort } from './restart-port.ts'
export type { RestartAck, RestartPort, RestartStatus } from './restart-port.ts'
export type { RestartKey } from './locales.ts'

/** Dictionary namespace owned by this plugin (merge lives in locales.ts). */
const NS = 'chaos-restart'

/** The one session-list fact this section needs, read structurally. */
interface RunningSessionsRead {
  readonly list: {
    getSnapshot(): {
      readonly ids: readonly string[]
      readonly byId: Readonly<Record<string, { readonly running?: boolean } | undefined>>
    }
  }
}

/**
 * Count the sessions currently mid-turn.
 * @param sessions - the session-list face resolved from the scoped context.
 * @returns how many sessions report `running`; 0 when the face is absent.
 */
function countRunning(sessions: unknown): number {
  const face = sessions as RunningSessionsRead | undefined
  const snapshot = face?.list.getSnapshot()
  if (snapshot === undefined) return 0
  return snapshot.ids.filter(id => snapshot.byId[id]?.running === true).length
}

/** Required services for the settings section and its copy. */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Client plugin body: register the System settings section.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chaos-restart: dictionaries')

  const t = ctx.locale.bind(NS)
  const port = createRestartPort()

  // The session list arrives through the scoped context of a declared
  // injection: the `ctx.<name>` property proxy is topology-sensitive.
  ctx.inject(['slots', 'sessions'], (scope: ClientContext) => {
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section',
      id: 'chaos-system',
      order: 90,
      label: () => t('nav'),
      locale: NS,
      inject: (): RestartSectionInjected => ({
        port,
        busySessions: () => countRunning(scope.get('sessions')),
      }),
    }, RestartSection))
  })
}
