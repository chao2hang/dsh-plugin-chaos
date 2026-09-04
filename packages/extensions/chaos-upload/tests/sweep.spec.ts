import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sweepUploads } from '../src/sweep.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-04T12:00:00Z')

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'chaos-upload-sweep-'))
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

/** Write one file with an age in days. */
async function aged(relative: string, ageDays: number): Promise<string> {
  const path = join(workspace, relative)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, 'x')
  const at = new Date(NOW - ageDays * DAY_MS)
  await utimes(path, at, at)
  return path
}

const options = { dir: 'uploads', maxAgeDays: 30, dryRun: false, now: () => NOW }

describe('sweepUploads', () => {
  it('deletes aged files and keeps fresh ones', async () => {
    const old = await aged('uploads/old.pdf', 40)
    const fresh = await aged('uploads/fresh.pdf', 3)
    const outcome = await sweepUploads({ cwd: workspace }, options)
    expect(outcome.deleted.map(d => d.path)).toEqual([old])
    expect(outcome.deleted[0]?.ageDays).toBe(40)
    expect(outcome.failures).toEqual([])
    await expect((await import('node:fs/promises')).stat(fresh)).resolves.toBeDefined()
  })

  it('leaves directories and subdirectory contents untouched', async () => {
    const nested = await aged('uploads/sub/keep.pdf', 90)
    await mkdir(join(workspace, 'uploads/emptydir'), { recursive: true })
    await sweepUploads({ cwd: workspace }, options)
    await expect((await import('node:fs/promises')).stat(nested)).resolves.toBeDefined()
    await expect((await import('node:fs/promises')).stat(join(workspace, 'uploads/emptydir'))).resolves.toBeDefined()
  })

  it('answers an empty outcome when retention is disabled or the directory is absent', async () => {
    await aged('uploads/disabled.pdf', 400)
    await expect(sweepUploads({ cwd: workspace }, { ...options, maxAgeDays: 0 })).resolves.toEqual({ deleted: [], failures: [] })
    await expect(sweepUploads({ cwd: join(workspace, 'no-such-project') }, options)).resolves.toEqual({ deleted: [], failures: [] })
    await expect((await import('node:fs/promises')).stat(join(workspace, 'uploads/disabled.pdf'))).resolves.toBeDefined()
  })

  it('rehearses without deleting in dry-run mode', async () => {
    const old = await aged('uploads/rehearse.pdf', 60)
    const outcome = await sweepUploads({ cwd: workspace }, { ...options, dryRun: true })
    expect(outcome.deleted.map(d => d.path)).toContain(old)
    await expect((await import('node:fs/promises')).stat(old)).resolves.toBeDefined()
  })
})
