import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { handleFilePreview, classifyFileKind, languageForExtension } from '../src/file-preview-route.ts'

interface FakeResponse {
  statusCode: number
  headers: Record<string, string | number>
  body: string
  ended: boolean
  res: ServerResponse
}

function createFakeResponse(): FakeResponse {
  const result: FakeResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    res: {} as ServerResponse,
  }

  const res = {
    get statusCode() { return result.statusCode },
    set statusCode(code: number) { result.statusCode = code },
    setHeader(name: string, value: string | number) {
      result.headers[name.toLowerCase()] = value
    },
    end(chunk?: string) {
      if (chunk) result.body += chunk
      result.ended = true
    },
    on() { return res },
    once() { return res },
    emit() { return true },
  } as unknown as ServerResponse

  result.res = res
  return result
}

function createFakeRequest(url: string, method = 'GET'): IncomingMessage {
  return {
    url,
    method,
    headers: {},
  } as unknown as IncomingMessage
}

describe('file-preview-route classifier and language mapping', () => {
  it('classifies file extensions into preview kinds correctly', () => {
    expect(classifyFileKind('.md')).toBe('markdown')
    expect(classifyFileKind('.markdown')).toBe('markdown')
    expect(classifyFileKind('.png')).toBe('image')
    expect(classifyFileKind('.svg')).toBe('image')
    expect(classifyFileKind('.mp3')).toBe('media')
    expect(classifyFileKind('.mp4')).toBe('media')
    expect(classifyFileKind('.pdf')).toBe('pdf')
    expect(classifyFileKind('.ts')).toBe('text')
    expect(classifyFileKind('.json')).toBe('text')
    expect(classifyFileKind('.py')).toBe('text')
    expect(classifyFileKind('.unknownbin')).toBe('binary')
  })

  it('maps extensions to language tags', () => {
    expect(languageForExtension('.ts')).toBe('typescript')
    expect(languageForExtension('.tsx')).toBe('typescript')
    expect(languageForExtension('.py')).toBe('python')
    expect(languageForExtension('.rs')).toBe('rust')
    expect(languageForExtension('.json')).toBe('json')
    expect(languageForExtension('.md')).toBe('markdown')
  })
})

describe('handleFilePreview HTTP route', () => {
  const fixturePath = join(__dirname, '../package.json')
  const dirPath = join(__dirname, '../src')

  it('rejects unsupported HTTP methods with 405', async () => {
    const req = createFakeRequest('/api/chaos/file?path=' + fixturePath, 'POST')
    const fake = createFakeResponse()
    await handleFilePreview(req, fake.res)
    expect(fake.statusCode).toBe(405)
    expect(JSON.parse(fake.body)).toEqual({ error: 'Method not allowed' })
  })

  it('rejects missing or empty path with 400', async () => {
    const req = createFakeRequest('/api/chaos/file')
    const fake = createFakeResponse()
    await handleFilePreview(req, fake.res)
    expect(fake.statusCode).toBe(400)
    expect(JSON.parse(fake.body).error).toContain('Missing path')
  })

  it('returns 404 for nonexistent path', async () => {
    const req = createFakeRequest('/api/chaos/file?path=/nonexistent/file.txt')
    const fake = createFakeResponse()
    await handleFilePreview(req, fake.res)
    expect(fake.statusCode).toBe(404)
    expect(JSON.parse(fake.body).error).toBe('File not found')
  })

  it('serves JSON metadata and text content for code/json files', async () => {
    const req = createFakeRequest('/api/chaos/file?path=' + fixturePath)
    const fake = createFakeResponse()
    await handleFilePreview(req, fake.res)
    expect(fake.statusCode).toBe(200)
    expect(fake.headers['content-type']).toContain('application/json')
    const json = JSON.parse(fake.body)
    expect(json.ok).toBe(true)
    expect(json.kind).toBe('text')
    expect(json.name).toBe('package.json')
    expect(json.extension).toBe('json')
    expect(json.language).toBe('json')
    expect(json.content).toContain('@deepseek-ai/dsh-plugin-chaos-mobile')
    expect(json.lineCount).toBeGreaterThan(10)
  })

  it('serves directory listings with child entries', async () => {
    const req = createFakeRequest('/api/chaos/file?path=' + dirPath)
    const fake = createFakeResponse()
    await handleFilePreview(req, fake.res)
    expect(fake.statusCode).toBe(200)
    const json = JSON.parse(fake.body)
    expect(json.ok).toBe(true)
    expect(json.kind).toBe('directory')
    expect(json.entries.some((e: { name: string }) => e.name === 'client')).toBe(true)
    expect(json.entries.some((e: { name: string }) => e.name === 'index.ts')).toBe(true)
  })
})
