/**
 * The browser-side port over this package's two host routes. Kept apart from
 * the component so request sequencing stays testable without a DOM.
 */

/** What the host reports about its own restart capability. */
export interface RestartStatus {
  /** Whether the launcher can spawn a successor (`processControl.canRestart`). */
  readonly canRestart: boolean
}

/** One restart attempt's immediate acknowledgement (the successor may still fail to bind). */
export type RestartAck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/** The two verbs the settings section drives. */
export interface RestartPort {
  /** Read whether the running host supports restart. */
  status(): Promise<RestartStatus>
  /** Ask the host to replace itself; resolves once the host acknowledged, before it exits. */
  restart(): Promise<RestartAck>
}

/**
 * Build the port over `fetch`. The host answers `/api/system/restart` BEFORE
 * it stops, so a resolved ack means "accepted", never "already back".
 * @param origin - optional base URL; defaults to the page origin.
 * @returns the port.
 */
export function createRestartPort(origin = ''): RestartPort {
  return {
    async status() {
      const response = await fetch(`${origin}/api/system/status`)
      if (!response.ok) return { canRestart: false }
      const body = await response.json() as Partial<RestartStatus>
      return { canRestart: body.canRestart === true }
    },
    async restart() {
      const response = await fetch(`${origin}/api/system/restart`, { method: 'POST' })
      const body = await response.json().catch(() => ({})) as Partial<RestartAck & { reason?: string }>
      if (response.ok && body.ok === true) return { ok: true }
      return { ok: false, reason: body.reason ?? `restart request failed (${String(response.status)})` }
    },
  }
}
