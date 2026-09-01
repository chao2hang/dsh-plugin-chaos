import { describe, expect, it } from 'vitest'
import { cssText } from '../src/client/styles.ts'

describe('chaos-at-file mobile layout', () => {
  it('keeps picker and touch actions usable on narrow screens', () => {
    expect(cssText).toContain('@media (max-width: 560px)')
    expect(cssText).toContain('width: min(100vw - 24px, 537px)')
    expect(cssText).toContain('min-height: 44px')
    expect(cssText).toContain('width: 32px')
  })
})
