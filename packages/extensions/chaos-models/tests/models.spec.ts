import { describe, it, expect } from 'vitest'
import { ModelListCache, shouldVirtualScroll, virtualScrollRange } from '../src/client/index.ts'

describe('ModelListCache', () => {
  it('returns undefined when empty', () => {
    const cache = new ModelListCache<string>()
    expect(cache.get()).toBeUndefined()
  })

  it('stores and returns models', () => {
    const cache = new ModelListCache<string>()
    cache.set(['model-a', 'model-b'])
    expect(cache.get()).toEqual(['model-a', 'model-b'])
  })

  it('returns undefined after invalidation', () => {
    const cache = new ModelListCache<string>()
    cache.set(['model-a'])
    cache.invalidate()
    expect(cache.get()).toBeUndefined()
  })

  it('expires after TTL', () => {
    const cache = new ModelListCache<string>()
    cache.set(['model-a'])
    // Fast-forward past TTL
    const originalNow = Date.now
    Date.now = () => originalNow() + 31_000
    expect(cache.get()).toBeUndefined()
    Date.now = originalNow
  })
})

describe('shouldVirtualScroll', () => {
  it('returns false for small lists', () => {
    expect(shouldVirtualScroll(10)).toBe(false)
    expect(shouldVirtualScroll(50)).toBe(false)
  })
  it('returns true for large lists', () => {
    expect(shouldVirtualScroll(51)).toBe(true)
    expect(shouldVirtualScroll(500)).toBe(true)
  })
})

describe('virtualScrollRange', () => {
  it('returns correct range for top of list', () => {
    const result = virtualScrollRange(0, 40, 400, 100, 3)
    expect(result.startIndex).toBe(0)
    expect(result.endIndex).toBeGreaterThan(0)
    expect(result.totalHeight).toBe(4000)
  })

  it('clamps startIndex to 0', () => {
    const result = virtualScrollRange(-100, 40, 400, 100, 3)
    expect(result.startIndex).toBe(0)
  })

  it('clamps endIndex to totalItems', () => {
    const result = virtualScrollRange(3900, 40, 400, 100, 3)
    expect(result.endIndex).toBeLessThanOrEqual(100)
  })

  it('computes total height correctly', () => {
    const result = virtualScrollRange(0, 50, 300, 200, 5)
    expect(result.totalHeight).toBe(10000)
  })
})
