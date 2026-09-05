import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sessionDir } from '@deepseek-ai/dsh-session-persistence-jsonl'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import { sweepArchivedSessions } from '../src/sweep.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-04T12:00:00Z')
const CWD = '/tmp/project-x'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'chaos-janitor-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Materialize one session directory holding a log file with an age in days. */
async function session(id: string, ageDays: number, logName = 'session.jsonl.zstd'): Promise<string> {
  const directory = sessionDir(root, CWD, id as never)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, logName), 'x')
  const at = new Date(NOW - ageDays * DAY_MS)
  await utimes(join(directory, logName), at, at)
  return directory
}

const header = (id: string, version = 0): SessionHeader => ({
  version: version as never, isSeeded: false, id: id as never, createdAt: NOW, cwd: CWD,
})

/** Sweep inputs resolved per call so `root` is read after beforeAll assigns it. */
const options = () => ({ root, maxArchivedDays: 30, dryRun: false, now: () => NOW })

describe('sweepArchivedSessions', () => {
  it('deletes a quiet archived session and its directory', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const directory = await session(id, 45)
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [header(id)], isLive: () => false }, options(),
    )
    expect(outcome.deleted).toEqual([{ id, path: directory, ageDays: 45 }])
    expect(outcome.skipped).toEqual([])
    await expect((await import('node:fs/promises')).stat(directory)).rejects.toThrow()
  })

  it('never deletes a live session regardless of age', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const directory = await session(id, 90)
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [header(id)], isLive: () => true }, options(),
    )
    expect(outcome.deleted).toEqual([])
    expect(outcome.skipped).toEqual([{ id, reason: 'live' }])
    await expect((await import('node:fs/promises')).stat(directory)).resolves.toBeDefined()
  })

  it('keeps an archived session that is still fresh', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    await session(id, 5)
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [header(id)], isLive: () => false }, options(),
    )
    expect(outcome.deleted).toEqual([])
    expect(outcome.skipped).toEqual([{ id, reason: 'fresh' }])
  })

  it('skips an archived session whose log is missing and stays silent without a header', async () => {
    const known = '44444444-4444-4444-8444-444444444444'
    const gone = '55555555-5555-4555-8555-555555555555'
    await session(known, 90)
    const outcome = await sweepArchivedSessions(
      {
        archived: new Set([known, gone, 'missing-header']),
        // `gone` has a header but no log directory; `missing-header` has neither.
        headers: [header(known), header(gone)],
        isLive: () => false,
      },
      options(),
    )
    expect(outcome.deleted.map(d => d.id)).toEqual([known])
    expect(outcome.skipped).toEqual([{ id: gone, reason: 'log-missing' }])
  })

  it('refuses a session directory holding foreign content', async () => {
    const id = '66666666-6666-4666-8666-666666666666'
    const directory = await session(id, 90)
    await writeFile(join(directory, 'notes.txt'), 'not a session artifact')
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [header(id)], isLive: () => false }, options(),
    )
    expect(outcome.deleted).toEqual([])
    expect(outcome.skipped).toEqual([{ id, reason: 'foreign-contents' }])
    await expect((await import('node:fs/promises')).stat(directory)).resolves.toBeDefined()
  })

  it('answers an empty outcome when retention is disabled', async () => {
    const id = '77777777-7777-4777-8777-777777777777'
    await session(id, 400)
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [header(id)], isLive: () => false },
      { ...options(), maxArchivedDays: 0 },
    )
    expect(outcome).toEqual({ deleted: [], skipped: [], failures: [] })
  })

  it('rehearses without deleting in dry-run mode', async () => {
    const id = '88888888-8888-4888-8888-888888888888'
    const directory = await session(id, 60)
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [header(id)], isLive: () => false },
      { ...options(), dryRun: true },
    )
    expect(outcome.deleted.map(d => d.id)).toEqual([id])
    await expect((await import('node:fs/promises')).stat(directory)).resolves.toBeDefined()
  })

  it('sweeps a no-cwd session through the _no-cwd directory', async () => {
    const id = '99999999-9999-4999-8999-999999999999'
    const directory = sessionDir(root, undefined, id as never)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'session.jsonl'), 'x')
    const at = new Date(NOW - 60 * DAY_MS)
    await utimes(join(directory, 'session.jsonl'), at, at)
    const outcome = await sweepArchivedSessions(
      { archived: new Set([id]), headers: [{ ...header(id), cwd: undefined }], isLive: () => false },
      options(),
    )
    expect(outcome.deleted.map(d => d.id)).toEqual([id])
    await expect((await import('node:fs/promises')).stat(directory)).rejects.toThrow()
  })

  it('sweeps version-tagged generation logs in either compression spelling', async () => {
    const plain = 'aaaaaaaa-0000-4000-8000-000000000001'
    const zstd = 'aaaaaaaa-0000-4000-8000-000000000002'
    const plainDirectory = await session(plain, 45, 'session.v2.jsonl')
    const zstdDirectory = await session(zstd, 45, 'session.v2.jsonl.zstd')
    const outcome = await sweepArchivedSessions(
      {
        archived: new Set([plain, zstd]),
        headers: [header(plain, 2), header(zstd, 2)],
        isLive: () => false,
      },
      options(),
    )
    expect(outcome.deleted).toEqual([
      { id: plain, path: plainDirectory, ageDays: 45 },
      { id: zstd, path: zstdDirectory, ageDays: 45 },
    ])
    expect(outcome.skipped).toEqual([])
  })
})
