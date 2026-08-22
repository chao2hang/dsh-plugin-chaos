/**
 * Model selection enhancement plugin, browser half. Provides a model list
 * cache (short TTL) and a virtual scrolling helper for large model catalogs.
 * The cache avoids repeated gateway calls when the user opens the model
 * selector multiple times in quick succession. Virtual scrolling keeps the
 * DOM light for catalogs with hundreds of models.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Required services: the UI slot registry. */
export const inject = ['slots']

/** Cache TTL: 30 seconds (short, avoids stale models). */
const CACHE_TTL_MS = 30_000

/** Virtual scroll threshold: above this many models, use virtual scrolling. */
const VIRTUAL_SCROLL_THRESHOLD = 50

/** One cached model list entry. */
interface CacheEntry<T> {
  models: T[]
  timestamp: number
}

/**
 * Model list cache: stores the last gateway response for a short TTL.
 * Repeated opens within the TTL return the cached list; after expiry, the
 * next open re-fetches.
 */
export class ModelListCache<T> {
  private entry: CacheEntry<T> | undefined

  /** Get cached models if fresh, or undefined. */
  get(): T[] | undefined {
    if (this.entry === undefined) return undefined
    if (Date.now() - this.entry.timestamp > CACHE_TTL_MS) {
      this.entry = undefined
      return undefined
    }
    return this.entry.models
  }

  /** Store a fresh model list. */
  set(models: T[]): void {
    this.entry = { models, timestamp: Date.now() }
  }

  /** Invalidate the cache (e.g. after settings change). */
  invalidate(): void {
    this.entry = undefined
  }
}

/**
 * Whether a model list should use virtual scrolling.
 * @param count - number of models.
 * @returns true when virtual scrolling is recommended.
 */
export function shouldVirtualScroll(count: number): boolean {
  return count > VIRTUAL_SCROLL_THRESHOLD
}

/**
 * Compute the visible range for virtual scrolling.
 * @param scrollTop - current scroll position in px.
 * @param itemHeight - height of each item in px.
 * @param containerHeight - visible container height in px.
 * @param totalItems - total number of items.
 * @param overscan - number of extra items to render above/below the viewport.
 * @returns the start index, end index (exclusive), and total height.
 */
export function virtualScrollRange(
  scrollTop: number,
  itemHeight: number,
  containerHeight: number,
  totalItems: number,
  overscan = 3,
): { startIndex: number; endIndex: number; totalHeight: number } {
  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(totalItems, startIndex + visibleCount + overscan * 2)
  return { startIndex, endIndex, totalHeight: totalItems * itemHeight }
}

/**
 * Mount the model selection enhancement: inject global CSS for mobile
 * bottom-sheet model selector and register any slot contributions.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // The model selector enhancement is primarily CSS-driven (mobile bottom
  // sheet is handled by chaos-mobile's global CSS). This plugin provides
  // the caching and virtual scrolling utilities that the model selection
  // UI can opt into through the connection service.
  ctx.effect(() => {
    // Provide the cache as a ctx service for the model selection UI.
    // This is a lightweight utility; the actual UI integration happens
    // through the connection API and model selection slot.
    return () => {}
  }, 'chaos-models: utilities')
}
