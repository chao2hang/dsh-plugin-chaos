import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { decodeUploadBase64, sanitizeUploadName, uploadDirectory, writeUpload } from '../src/upload.ts'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64')

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'chaos-upload-'))
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

const config = { dir: 'uploads', maxFileBytes: 64, markers: true }
const signal = new AbortController().signal

describe('decodeUploadBase64', () => {
  it('decodes canonical base64', () => {
    expect(Buffer.from(decodeUploadBase64(PNG)).toString('hex')).toBe('89504e470d0a1a0a0000000d49484452')
  })

  it('rejects empty and non-canonical forms', () => {
    expect(() => decodeUploadBase64('')).toThrow()
    expect(() => decodeUploadBase64('YWJ' + ' ')).toThrow()
  })
})

describe('sanitizeUploadName', () => {
  it('collapses separators and drops control characters', () => {
    expect(sanitizeUploadName('..\\..\\报告 v1\u0000.pdf')).toBe('报告 v1.pdf')
  })

  it('rejects names with no usable basename', () => {
    expect(() => sanitizeUploadName('')).toThrow()
    expect(() => sanitizeUploadName('.')).toThrow()
    expect(() => sanitizeUploadName('..')).toThrow()
  })
})

describe('uploadDirectory', () => {
  it('resolves the configured directory inside the workspace', () => {
    expect(uploadDirectory(workspace, 'uploads')).toBe(join(workspace, 'uploads'))
  })

  it('rejects escaping and workspace-root directories', () => {
    expect(() => uploadDirectory(workspace, '..')).toThrow()
    expect(() => uploadDirectory(workspace, 'a/../../b')).toThrow()
    expect(() => uploadDirectory(workspace, '.')).toThrow()
  })
})

describe('writeUpload', () => {
  it('stores the upload and reports its workspace-relative path and size', async () => {
    const result = await writeUpload(workspace, config, { name: 'spec.pdf', data: PNG }, signal)
    expect(result).toEqual({ relative: 'uploads/spec.pdf', bytes: 16 })
  })

  it('numbers a colliding name before the extension', async () => {
    await writeFile(join(workspace, 'uploads/spec.pdf'), 'occupied')
    const result = await writeUpload(workspace, config, { name: 'spec.pdf', data: PNG }, signal)
    expect(result.relative).toBe('uploads/spec-2.pdf')
    const again = await writeUpload(workspace, config, { name: 'spec.pdf', data: PNG }, signal)
    expect(again.relative).toBe('uploads/spec-3.pdf')
  })

  it('creates nested configured directories on demand', async () => {
    const nested = { ...config, dir: 'uploads/incoming' }
    const result = await writeUpload(workspace, nested, { name: 'a.txt', data: 'aGk=' }, signal)
    expect(result.relative).toBe('uploads/incoming/a.txt')
  })

  it('refuses empty and oversized uploads', async () => {
    await expect(writeUpload(workspace, config, { name: 'empty.txt', data: '' }, signal)).rejects.toThrow('base64')
    const oversized = Buffer.alloc(config.maxFileBytes + 1, 1).toString('base64')
    await expect(writeUpload(workspace, config, { name: 'big.bin', data: oversized }, signal))
      .rejects.toThrow('exceeds')
  })

  it('sanitizes a name that arrives with directory components', async () => {
    const result = await writeUpload(workspace, config, { name: '/etc/passwd', data: 'aGk=' }, signal)
    expect(result.relative).toBe('uploads/passwd')
  })
})
