import type { Dir } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexWorkspace } from '../src/files.ts'

const options = { maxFiles: 100, ignoreDirs: [], ignoreFiles: [] }

describe('workspace index cancellation', () => {
  it('closes a directory handle that resolves after cancellation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-'))
    let resolveOpen: ((value: Dir) => void) | undefined
    let signalOpen: (() => void) | undefined
    const opened = new Promise<void>((resolve) => { signalOpen = resolve })
    let closed = 0
    const controller = new AbortController()
    const openDirectory = () => new Promise((resolve) => {
      resolveOpen = resolve
      signalOpen!()
    })
    const pending = indexWorkspace(root, options, controller.signal, openDirectory as never)
    await opened
    controller.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
    resolveOpen!({ close: async () => { closed++ } } as unknown as Dir)
    await new Promise<void>((resolve) => { queueMicrotask(resolve) })
    expect(closed).toBe(1)
    await rm(root, { recursive: true, force: true })
  })
})
