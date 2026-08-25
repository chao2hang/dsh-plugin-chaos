import type { IncomingMessage } from 'node:http'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

type Handler = (req: IncomingMessage, res: Response) => Promise<void>
type Response = { writeHead: (status: number, headers: Record<string, string>) => void; end: (value?: string) => void }
type Upgrade = { path: string; handler: (req: IncomingMessage, socket: { end: (data: string) => void }, head: Buffer) => void }

const execFile = promisify(execFileCallback)
const JSON_HEADERS = { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }
const NO_MARKER = { 'content-type': 'application/json' }
const LOOPBACK = { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }
const TERMINAL_WS = '/api/chaos-desktop/terminal/ws?sessionId=active&tabId=primary&cols=80&rows=30'

function request(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method: 'GET', url, headers } as IncomingMessage
}
function post(url: string, source: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method: 'POST', url, headers, async *[Symbol.asyncIterator]() { yield Buffer.from(source) } } as IncomingMessage
}
function response(): { value: () => { status: number; body: unknown }; response: Response } {
  let status = 0
  let body: unknown
  return {
    value: () => ({ status, body }),
    response: {
      writeHead: (next) => { status = next },
      end: (value) => { body = value === undefined ? undefined : JSON.parse(value) },
    },
  }
}

/** Mount the host half with in-memory HTTP and upgrade route registries. */
function terminalSocket(): { calls: string[]; socket: { end: (data: string) => void } } {
  const calls: string[] = []
  return { calls, socket: { end: (data) => { calls.push(data) } } }
}
type Bench = { handlers: Map<string, Handler>; upgrades: Upgrade[] }
function bench(sessionCwd: string | undefined, host = '127.0.0.1', authenticated = false): Bench {
  const handlers = new Map<string, Handler>()
  const upgrades: Upgrade[] = []
  const ctx = {
    sessions: { get: () => sessionCwd === undefined ? undefined : { header: { cwd: sessionCwd } } },
    subprocess: {},
    webServer: {
      host,
      isAuthenticated: () => authenticated,
      register: (route: { path: string; handler: Handler }) => { handlers.set(route.path, route.handler); return () => {} },
      registerUpgrade: (route: Upgrade) => { upgrades.push(route); return () => {} },
    },
    effect: (callback: () => unknown) => { callback() },
  }
  apply(ctx as never)
  return { handlers, upgrades }
}

describe('desktop workbench host routes', () => {
  it('registers a dedicated persistent-terminal upgrade route', () => {
    expect(bench('/workspace').upgrades.map(route => route.path)).toEqual(['/api/chaos-desktop/terminal/ws'])
  })

  it('rejects untrusted terminal websocket origins before upgrade', () => {
    const route = bench('/workspace').upgrades[0]!
    const target = terminalSocket()
    route.handler(request(TERMINAL_WS, { host: '127.0.0.1:3080', origin: 'http://attacker.invalid' }), target.socket, Buffer.alloc(0))
    expect(target.calls).toEqual(['HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'])
  })
  it('rejects same-origin DNS-rebinding terminal websocket hosts', () => {
    const route = bench('/workspace').upgrades[0]!
    const target = terminalSocket()
    route.handler(request(TERMINAL_WS, { host: 'attacker.invalid', origin: 'http://attacker.invalid' }), target.socket, Buffer.alloc(0))
    expect(target.calls).toEqual(['HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'])
  })
  it('rejects malformed terminal websocket dimensions before upgrade', () => {
    const route = bench('/workspace').upgrades[0]!
    const target = terminalSocket()
    const malformed = request(TERMINAL_WS.replace('cols=80', 'cols=1'), LOOPBACK)
    route.handler(malformed, target.socket, Buffer.alloc(0))
    expect(target.calls).toEqual(['HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'])
  })
  it('requires authentication for terminal websocket upgrades on remote binds', () => {
    const route = bench('/workspace', '0.0.0.0').upgrades[0]!
    const target = terminalSocket()
    route.handler(request(TERMINAL_WS, LOOPBACK), target.socket, Buffer.alloc(0))
    expect(target.calls).toEqual(['HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'])
  })
  it('rejects terminal websocket requests without a valid session and tab identity', () => {
    const route = bench(undefined).upgrades[0]!
    const missing = terminalSocket()
    const malformed = terminalSocket()
    const missingUrl = TERMINAL_WS.replace('sessionId=active', 'sessionId=missing')
    const malformedUrl = TERMINAL_WS.replace('tabId=primary', 'tabId=../bad')
    route.handler(request(missingUrl, LOOPBACK), missing.socket, Buffer.alloc(0))
    route.handler(request(malformedUrl, LOOPBACK), malformed.socket, Buffer.alloc(0))
    expect(missing.calls).toEqual(['HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'])
    expect(malformed.calls).toEqual(['HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'])
  })

  it('rejects invalid terminal configuration at plugin loading', () => {
    const invalid = 'chaos-desktop-panel: invalid terminal configuration'
    expect(() => { apply({} as never, { terminal: { argv: [] } }) }).toThrow(invalid)
    expect(() => { apply({} as never, { terminal: { argv: 'bash' } as never }) }).toThrow(invalid)
    expect(() => { apply({} as never, { terminal: { argv: ['bash', 1] } as never }) }).toThrow(invalid)
    expect(() => { apply({} as never, { terminal: { reconnectGraceMs: 0 } }) }).toThrow(invalid)
    expect(() => { apply({} as never, { terminal: { transcriptBytes: 0 } }) }).toThrow(invalid)
    expect(() => { apply({} as never, { terminal: { terminationGraceMs: 0 } }) }).toThrow(invalid)
  })
  it('rejects an unknown session instead of falling back to the server directory', async () => {
    const { handlers } = bench(undefined)
    const result = response()
    await handlers.get('/api/chaos-desktop/files')!(request('/api/chaos-desktop/files?sessionId=missing'), result.response)
    expect(result.value()).toEqual({ status: 404, body: { error: 'unknown session workspace' } })
  })
  it('rejects file-tree path traversal inside a live workspace', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    await handlers.get('/api/chaos-desktop/files')!(request('/api/chaos-desktop/files?path=../outside&sessionId=active'), result.response)
    expect(result.value()).toEqual({ status: 400, body: { error: 'invalid path' } })
  })
  it('rejects file read and write traversal inside a live workspace', async () => {
    const { handlers } = bench('/workspace')
    const read = response()
    const write = response()
    await handlers.get('/api/chaos-desktop/file')!(request('/api/chaos-desktop/file?path=../outside&sessionId=active'), read.response)
    const writeBody = JSON.stringify({ path: '../outside', source: 'unsafe', sessionId: 'active' })
    await handlers.get('/api/chaos-desktop/file')!(post('/api/chaos-desktop/file', writeBody, JSON_HEADERS), write.response)
    expect(read.value()).toEqual({ status: 400, body: { error: 'invalid path' } })
    expect(write.value()).toEqual({ status: 400, body: { error: 'invalid file request' } })
  })
  it('rejects a symlinked file that resolves outside the session workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-workspace-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-desktop-outside-'))
    try {
      await writeFile(join(outside, 'secret.txt'), 'unsafe')
      await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'))
      const { handlers } = bench(root)
      const result = response()
      await handlers.get('/api/chaos-desktop/file')!(request('/api/chaos-desktop/file?path=escape.txt&sessionId=active'), result.response)
      expect(result.value()).toEqual({ status: 400, body: { error: 'invalid path' } })
    } finally {
      await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })])
    }
  })

  it('rejects mismatched Origin file requests before workspace access', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const headers = { host: '127.0.0.1:3080', origin: 'http://attacker.invalid' }
    await handlers.get('/api/chaos-desktop/files')!(request('/api/chaos-desktop/files?sessionId=active', headers), result.response)
    expect(result.value()).toEqual({ status: 403, body: undefined })
  })
  it('rejects cross-site workspace searches before traversal', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const headers = { 'sec-fetch-site': 'cross-site' }
    await handlers.get('/api/chaos-desktop/search')!(request('/api/chaos-desktop/search?q=src&sessionId=active', headers), result.response)
    expect(result.value()).toEqual({ status: 403, body: undefined })
  })
  it('rejects cross-site file tree requests before workspace access', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const headers = { 'sec-fetch-site': 'cross-site' }
    await handlers.get('/api/chaos-desktop/files')!(request('/api/chaos-desktop/files?sessionId=active', headers), result.response)
    expect(result.value()).toEqual({ status: 403, body: undefined })
  })
  it('rejects Git mutation paths outside the session subdirectory', async () => {
    const repository = await mkdtemp(join(tmpdir(), 'dsh-desktop-repository-'))
    const session = join(repository, 'session')
    try {
      await mkdir(session)
      await writeFile(join(repository, 'sibling.txt'), 'unsafe')
      await execFile('git', ['init'], { cwd: repository })
      const { handlers } = bench(session)
      const result = response()
      const stageBody = JSON.stringify({ action: 'stage', path: '../sibling.txt', sessionId: 'active' })
      await handlers.get('/api/chaos-desktop/git')!(post('/api/chaos-desktop/git', stageBody, JSON_HEADERS), result.response)
      expect(result.value()).toEqual({ status: 400, body: { ok: false, error: 'invalid Git request' } })
    } finally {
      await rm(repository, { recursive: true, force: true })
    }
  })

  it('rejects a Git stage action without the workbench request marker', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const stageBody = JSON.stringify({ action: 'stage', path: 'file.ts', sessionId: 'active' })
    const gitPost = post('/api/chaos-desktop/git?sessionId=active', stageBody, NO_MARKER)
    await handlers.get('/api/chaos-desktop/git')!(gitPost, result.response)
    expect(result.value()).toEqual({ status: 403, body: undefined })
  })
  it('rejects marked filesystem mutation traversal inside a live workspace', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const deleteBody = JSON.stringify({ action: 'delete', path: '../outside', sessionId: 'active' })
    await handlers.get('/api/chaos-desktop/fs')!(post('/api/chaos-desktop/fs', deleteBody, JSON_HEADERS), result.response)
    expect(result.value()).toEqual({ status: 400, body: { ok: false, error: 'invalid filesystem request' } })
  })
  it('rejects filesystem mutations without the workbench request marker', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const deleteBody = JSON.stringify({ action: 'delete', path: 'unsafe', sessionId: 'active' })
    const fsPost = post('/api/chaos-desktop/fs', deleteBody, NO_MARKER)
    await handlers.get('/api/chaos-desktop/fs')!(fsPost, result.response)
    expect(result.value()).toEqual({ status: 403, body: undefined })
  })
  it('rejects a Git commit action without the workbench request marker', async () => {
    const { handlers } = bench('/workspace')
    const result = response()
    const commitBody = JSON.stringify({ action: 'commit', message: 'unsafe commit', sessionId: 'active' })
    const gitPost = post('/api/chaos-desktop/git', commitBody, NO_MARKER)
    await handlers.get('/api/chaos-desktop/git')!(gitPost, result.response)
    expect(result.value()).toEqual({ status: 403, body: undefined })
  })
  it('allows an explicit server-directory request without a session identity', async () => {
    const { handlers } = bench(undefined)
    const result = response()
    await handlers.get('/api/chaos-desktop/files')!(request('/api/chaos-desktop/files?path=missing'), result.response)
    expect(result.value()).toMatchObject({ status: 200, body: { path: 'missing', entries: [] } })
  })
})
