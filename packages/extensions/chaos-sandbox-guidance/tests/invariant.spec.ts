import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

describe('chaos-sandbox-guidance invariant companion', () => {
  it('has the correct plugin name', () => {
    expect(name).toBe('plugin-chaos-sandbox-guidance-invariant')
  })

  it('injects the invariants service', () => {
    expect(inject).toEqual(['invariants'])
  })

  it('registers the package name', async () => {
    const registered: string[] = []
    const fakeCtx = {
      invariants: { register(packageName: string) { registered.push(packageName); return () => {} } },
    }
    const dispose = await apply(fakeCtx as never)
    expect(registered).toEqual(['@deepseek-ai/dsh-plugin-chaos-sandbox-guidance'])
    dispose()
  })
})
