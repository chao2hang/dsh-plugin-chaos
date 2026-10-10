/**
 * Cross-component handoff for the mobile context meter: the ContextStatusBar
 * slot entry owns the `contextPressure` / `contextBreakdown` projections and
 * publishes the folded occupancy here; the overflow sheet (a different slot
 * seat with no session kit) subscribes and renders the details section.
 *
 * One session-scoped composer renders at a time, so a single published value
 * is the complete state — no per-session keys.
 */

/** Folded context occupancy and its heuristic composition, when known. */
export interface ChaosContextMeter {
  /** Bounded 0-100 percent of the route capacity. */
  percent: number
  /** Next-request prompt size in tokens (provider-anchored). */
  usedTokens: number
  /** Route capacity in tokens. */
  contextWindow: number
  /** Heuristic system/tools/message composition; absent until a request reports it. */
  breakdown: {
    systemTokens: number
    toolsTokens: number
    messageTokens: number
  } | undefined
}

let current: ChaosContextMeter | undefined = undefined
const listeners = new Set<() => void>()

/**
 * Publish the current meter value (undefined clears it). No-op while the
 * value reference is unchanged, so projection re-reads at the same value
 * cost subscribers no re-render.
 * @param next - the folded meter, or undefined to clear.
 */
export function publishChaosContextMeter(next: ChaosContextMeter | undefined): void {
  if (next === current) return
  current = next
  for (const listener of listeners) listener()
}

/**
 * Subscribe to meter changes.
 * @param listener - change notification.
 * @returns the disposer.
 */
export function subscribeChaosContextMeter(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Read the current meter value.
 * @returns the published meter, or undefined while none is published.
 */
export function getChaosContextMeter(): ChaosContextMeter | undefined {
  return current
}

/**
 * Format a token count for the compact context details (K / M above 1000 /
 * 1e6, one decimal below 100K-scale precision).
 * @param value - token count.
 * @returns the compact count text.
 */
export function formatContextTokens(value: number): string {
  const scaled = (candidate: number): string => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`
  return `${scaled(value / 1_000_000)}M`
}
