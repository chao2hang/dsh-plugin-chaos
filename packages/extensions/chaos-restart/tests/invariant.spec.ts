import { describe, it, expect } from 'vitest'
import { name, inject, apply } from '../src/invariant.ts'

describe('chaos-restart invariant companion', () => {
  it('has the correct plugin name', () => {
    expect(name).toBe('plugin-chaos-restart-invariant')
  })
  it('injects the invariants service', () => {
    expect(inject).toEqual(['invariants'])
  })
  it('registers the package name', async () => {
    const registered: string[] = []
    const fakeCtx = {
      invariants: { register(pkgName: string) { registered.push(pkgName); return () => {} } },
    }
    const dispose = await apply(fakeCtx as never)
    expect(registered).toEqual(['@deepseek-ai/dsh-plugin-chaos-restart'])
    dispose()
  })
})
