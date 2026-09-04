import { describe, expect, it } from 'vitest'
import { endDetectOffset, endOfDraftSpan, mentionInsertText } from '../src/client/insert.ts'
import { createChaosUploadClient } from '../src/client/service.ts'
import type { ChaosUploadClientDeps } from '../src/client/service.ts'
import type { UploadRemoteFace, UploadResult } from '../src/types.ts'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'

describe('draft mention insertion computations', () => {
  it('offsets the draft end by one detect character per chip', () => {
    expect(endDetectOffset('plain text', [])).toBe(10)
    expect(endDetectOffset('/goal abc', [{ length: 5 }])).toBe(5)
    expect(endDetectOffset('a@chip b@chip', [{ length: 6 }, { length: 6 }])).toBe(3)
  })

  it('builds a collapsed end span guarded by the input revision', () => {
    expect(endOfDraftSpan({ draft: 'hi', draftRev: 7, occurrences: [] }))
      .toEqual({ start: 2, end: 2, draftRev: 7 })
  })

  it('separates the mention when the draft needs a space', () => {
    expect(mentionInsertText('', 'uploads/a.pdf')).toBe('@uploads/a.pdf ')
    expect(mentionInsertText('word', 'uploads/a.pdf')).toBe(' @uploads/a.pdf ')
    expect(mentionInsertText('trailing ', 'uploads/a.pdf')).toBe('@uploads/a.pdf ')
  })
})

describe('createChaosUploadClient', () => {
  const sessionId = 'session-1' as SessionId
  const result: UploadResult = { relative: 'uploads/a.pdf', bytes: 2 }
  const file = new File([new Uint8Array([1, 2])], 'a.pdf', { type: 'application/pdf' })

  /** Minimal idle InputState: the service reads only the draft projection fields. */
  const idleState = { draft: '', imageIds: [], draftRev: 1, phase: 'plain' as const, occurrences: [], queue: [] }

  /** Recorded insert requests, each `[text, start, draftRev]`. */
  const inserts: [string, number, number][] = []

  function deps(
    upload: UploadRemoteFace['upload'],
    applied = true,
  ): ChaosUploadClientDeps {
    return {
      remote: () => Promise.resolve({ upload }),
      sessions: {
        scope: () => ({
          bail: (_subject: unknown, _event: 'slash/input-insert-text', request: unknown) => {
            const payload = request as { text: string; span: { start: number; draftRev: number } }
            inserts.push([payload.text, payload.span.start, payload.span.draftRev])
            return applied
          },
        }) as never,
      },
      // Narrow stub: the service reads only state.getSnapshot(); the writable
      // store members stay unused on this path.
      conversation: {
        input: {
          for: () => ({
            state: { getSnapshot: () => idleState },
          }),
        },
      } as unknown as ChaosUploadClientDeps['conversation'],
    }
  }

  it('uploads a file and inserts its mention', async () => {
    inserts.length = 0
    const face = createChaosUploadClient(deps((_id, request) => {
      expect(request.name).toBe('a.pdf')
      return Promise.resolve({ ok: true, value: result })
    }))
    const outcome = await face.uploadAndMention(sessionId, file)
    expect(outcome).toEqual({ upload: result, mentioned: true })
    expect(inserts).toEqual([['@uploads/a.pdf ', 0, 1]])
  })

  it('reports an unapplied insertion without failing the upload', async () => {
    const face = createChaosUploadClient(deps(
      () => Promise.resolve({ ok: true, value: result }),
      false,
    ))
    const outcome = await face.uploadAndMention(sessionId, file)
    expect(outcome.mentioned).toBe(false)
  })

  it('surfaces a refused upload as an error', async () => {
    const face = createChaosUploadClient(deps(
      () => Promise.resolve({ ok: false, error: { code: 'session/not-found', message: 'gone' } }),
    ))
    await expect(face.uploadAndMention(sessionId, file)).rejects.toThrow('session/not-found')
  })

  it('refuses an empty file before any remote call', async () => {
    let called = false
    const face = createChaosUploadClient(deps(() => {
      called = true
      return Promise.resolve({ ok: true, value: result })
    }))
    await expect(face.uploadAndMention(sessionId, new File([], 'a.pdf'))).rejects.toThrow('empty')
    expect(called).toBe(false)
  })

  it('leaves the draft untouched when the session has no scope', () => {
    const face = createChaosUploadClient({
      remote: () => Promise.resolve({ upload: () => Promise.resolve({ ok: true, value: result }) }),
      sessions: { scope: () => undefined },
      // Narrow stub: the service reads only state.getSnapshot(); the writable
      // store members stay unused on this path.
      conversation: {
        input: {
          for: () => ({
            state: { getSnapshot: () => idleState },
          }),
        },
      } as unknown as ChaosUploadClientDeps['conversation'],
    })
    expect(face.insertMention(sessionId, 'uploads/a.pdf')).toBe(false)
  })
})
