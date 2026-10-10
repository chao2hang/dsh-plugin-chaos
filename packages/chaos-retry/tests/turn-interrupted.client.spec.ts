// @vitest-environment jsdom
// The crash-recovery node Definition: it exists because the shipped node set
// has no Definition for `turn/end { kind: 'interrupted' }` — the marker the
// persistence layer writes when it closes a turn whose process died — and the
// interrupted-assistant fallback needs streamed content evidence that a turn
// killed before its first token never produced.

import { describe, expect, it } from 'vitest'
import { turnInterruptedDefinition } from '../src/client/turn-interrupted.ts'

function turnEnd(reasonKind: string, turn = 1, seq = 10) {
  return {
    type: 'turn/end' as const,
    seq,
    time: seq * 100,
    data: { turn, reason: { kind: reasonKind } },
  }
}

describe('turnInterruptedDefinition', () => {
  it('matches only the persistence-written interrupted closure', () => {
    expect(turnInterruptedDefinition.match(turnEnd('interrupted') as never)).toEqual({ id: '1', role: 'start' })
    expect(turnInterruptedDefinition.match(turnEnd('aborted') as never)).toBeNull()
    expect(turnInterruptedDefinition.match(turnEnd('error') as never)).toBeNull()
    expect(turnInterruptedDefinition.match(turnEnd('completed') as never)).toBeNull()
    expect(turnInterruptedDefinition.match({ type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } as never)).toBeNull()
  })

  it('carries the turn identity and the recovery event position into its state', () => {
    const match = { event: turnEnd('interrupted', 7, 42) } as never
    expect(turnInterruptedDefinition.start({} as never, match, {} as never)).toEqual({ turn: 7, seq: 42, time: 4200 })
  })

  it('rejects a start it cannot describe rather than inventing one', () => {
    const match = { event: turnEnd('completed') } as never
    expect(() => turnInterruptedDefinition.start({} as never, match, {} as never)).toThrow(/interrupted turn\/end/)
  })

  it('builds a visible chat row anchored at the recovery event', () => {
    const context = {
      key: 'turn-interrupted:7',
      kind: 'turn-interrupted',
      id: '7',
      state: { turn: 7, seq: 42, time: 4200 },
      start: undefined,
      matches: [],
      current: new Map(),
    } as never
    expect(turnInterruptedDefinition.buildViewNode!(context)).toMatchObject({
      kind: 'turn-interrupted',
      target: 'chat',
      anchorSeq: 42,
      visibility: 'visible',
      data: { turn: 7, seq: 42, time: 4200 },
    })
  })

  it('builds nothing without state (a window cut left the closure outside)', () => {
    const context = {
      key: 'k', kind: 'turn-interrupted', id: '1',
      state: undefined, start: undefined, matches: [], current: new Map(),
    } as never
    expect(turnInterruptedDefinition.buildViewNode!(context)).toBeNull()
  })
})
