/** Workbench host routes for bounded workspace review, edits, staging, and commands. */
import { execFile } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { IncomingMessage } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { BrowserTerminalRegistry } from './terminal-registry.ts'
import type {} from '@deepseek-ai/dsh-host-webserver'

const run = promisify(execFile)
type ChangeCount = { additions: number; deletions: number }
type ChangedFile = ChangeCount & { code: string; path: string }
type Response = { writeHead: (status: number, headers: Record<string, string>) => void; end: (value?: string) => void }

function parseNumstat(source: string): Map<string, ChangeCount> {
  return new Map(source.split('\n').filter(Boolean).map((line) => {
    const [added, deleted, path] = line.split('\t')
    return [path ?? '', { additions: Number(added) || 0, deletions: Number(deleted) || 0 }]
  }))
}
function json(res: Response, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (site === 'cross-site') return false
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined) return true
  if (typeof origin !== 'string' || typeof host !== 'string') return false
  try { return new URL(origin).host === new URL('http://' + host).host } catch { return false }
}
function trustedWebSocketOrigin(req: IncomingMessage, authenticated: boolean): boolean {
  const host = req.headers.host
  const origin = req.headers.origin
  if (typeof host !== 'string' || typeof origin !== 'string' || req.headers['sec-fetch-site'] === 'cross-site') return false
  try {
    const authority = new URL('http://' + host)
    const loopback = authority.hostname === 'localhost' || authority.hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(authority.hostname)
    return new URL(origin).host === authority.host && (loopback || authenticated)
  } catch { return false }
}
async function body(req: IncomingMessage): Promise<unknown> {
  let source = ''
  for await (const chunk of req) {
    source += String(chunk)
    if (source.length > 65_536) throw new Error('request body too large')
  }
  return JSON.parse(source)
}
function lexicalWorkspacePath(root: string, path: string): string | undefined {
  const target = resolve(root, path)
  return target === root || target.startsWith(root + sep) ? target : undefined
}

/** Resolve an existing path and reject symlinks that leave its session workspace. */
async function safeFile(root: string, path: string): Promise<string | undefined> {
  const target = lexicalWorkspacePath(root, path)
  if (target === undefined) return undefined
  try {
    const [workspace, resolved] = await Promise.all([realpath(root), realpath(target)])
    return resolved === workspace || resolved.startsWith(workspace + sep) ? target : undefined
  } catch {
    return undefined
  }
}

/** Resolve a mutation target through its existing parent, rejecting escaping symlinks. */
async function safeNewFile(root: string, path: string): Promise<string | undefined> {
  const target = lexicalWorkspacePath(root, path)
  if (target === undefined) return undefined
  const parent = dirname(target)
  try {
    const [workspace, resolvedParent] = await Promise.all([realpath(root), realpath(parent)])
    return resolvedParent === workspace || resolvedParent.startsWith(workspace + sep) ? target : undefined
  } catch {
    return undefined
  }
}

/** Resolve a mutation target whether it exists already or is about to be created. */
async function safeMutationFile(root: string, path: string): Promise<string | undefined> {
  const target = lexicalWorkspacePath(root, path)
  if (target === undefined) return undefined
  try {
    await lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return safeNewFile(root, path)
    return undefined
  }
  return safeFile(root, path)
}

export const inject = ['webServer', 'sessions', 'subprocess']
export interface Config { terminal?: { argv?: string[]; reconnectGraceMs?: number; transcriptBytes?: number; terminationGraceMs?: number } }
/** Register same-origin routes scoped to the selected live session workspace. */
export function apply(ctx: Context, config: Config = {}): void {
  const fallbackCwd = process.cwd()
  const terminal = config.terminal ?? {}
  const argv = terminal.argv ?? ['/bin/bash', '--noprofile', '--norc', '-i']
  const reconnectGraceMs = terminal.reconnectGraceMs ?? 30_000
  const transcriptBytes = terminal.transcriptBytes ?? 1_000_000
  const terminationGraceMs = terminal.terminationGraceMs ?? 3_000
  if (!Array.isArray(argv) || argv.length === 0 || argv.some(value => typeof value !== 'string' || value === '') || !Number.isSafeInteger(reconnectGraceMs) || reconnectGraceMs < 1 || !Number.isSafeInteger(transcriptBytes) || transcriptBytes < 1 || !Number.isSafeInteger(terminationGraceMs) || terminationGraceMs < 1) throw new Error('chaos-desktop-panel: invalid terminal configuration')
  const terminals = new BrowserTerminalRegistry({
    spawn: (cwd, cols, rows) => ctx.subprocess.spawnTerminal({ argv, cwd, env: { TERM: 'xterm-256color', PAGER: 'cat', GIT_PAGER: 'cat' }, cols, rows, graceMs: terminationGraceMs }),
    reconnectGraceMs, transcriptBytes,
  })
  ctx.effect(() => () => terminals.dispose(), 'chaos-desktop-panel: terminal teardown')
  const requestedSession = (req: IncomingMessage, payload?: { sessionId?: unknown }): string | undefined => {
    const queryId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId')
    return typeof payload?.sessionId === 'string' ? payload.sessionId : queryId ?? undefined
  }
  const workspace = (req: IncomingMessage, payload?: { sessionId?: unknown }): string | undefined => {
    const sessionId = requestedSession(req, payload)
    return sessionId === undefined ? fallbackCwd : ctx.sessions.get(SessionId(sessionId))?.header.cwd
  }
  const requireWorkspace = (req: IncomingMessage, res: Response, payload?: { sessionId?: unknown }): string | undefined => {
    const cwd = workspace(req, payload)
    if (cwd === undefined) json(res, 404, { error: 'unknown session workspace' })
    return cwd
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/chaos-desktop/files', handler: async (req, res) => {
    if (req.method !== 'GET' || !sameOrigin(req)) { res.writeHead(req.method === 'GET' ? 403 : 405, {}); res.end(); return }
    const requested = new URL(req.url ?? '/', 'http://localhost').searchParams.get('path') ?? ''
    const cwd = requireWorkspace(req, res)
    const target = cwd === undefined ? undefined : await safeMutationFile(cwd, requested)
    if (target === undefined) { if (cwd !== undefined) json(res, 400, { error: 'invalid path' }); return }
    try {
      const entries = await readdir(target, { withFileTypes: true })
      json(res, 200, { path: requested, entries: entries.filter(entry => entry.name !== '.git').map(entry => ({ name: entry.name, path: requested === '' ? entry.name : requested + '/' + entry.name, directory: entry.isDirectory() })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)) })
    } catch (error) { json(res, 200, { path: requested, entries: [], error: error instanceof Error ? error.message : String(error) }) }
  } }), 'chaos-desktop-panel: file tree route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/chaos-desktop/search', handler: async (req, res) => {
    if (req.method !== 'GET' || !sameOrigin(req)) { res.writeHead(req.method === 'GET' ? 403 : 405, {}); res.end(); return }
    const query = new URL(req.url ?? '/', 'http://localhost')
    const term = (query.searchParams.get('q') ?? '').trim().toLowerCase()
    const cwd = requireWorkspace(req, res)
    if (cwd === undefined) return
    if (term.length < 2 || term.length > 128) { json(res, 400, { entries: [], error: 'search query must contain 2–128 characters' }); return }
    const entries: { name: string; path: string; directory: boolean }[] = []
    const visit = async (folder: string, relative: string): Promise<void> => {
      if (entries.length >= 100) return
      const children = await readdir(folder, { withFileTypes: true })
      for (const child of children) {
        if (entries.length >= 100 || child.name === '.git') continue
        const path = relative === '' ? child.name : relative + '/' + child.name
        if (child.name.toLowerCase().includes(term)) entries.push({ name: child.name, path, directory: child.isDirectory() })
        if (child.isDirectory()) await visit(join(folder, child.name), path)
      }
    }
    try { await visit(cwd, ''); json(res, 200, { entries }) } catch (error) { json(res, 200, { entries, error: error instanceof Error ? error.message : String(error) }) }
  } }), 'chaos-desktop-panel: workspace search route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/chaos-desktop/file', handler: async (req, res) => {
    if (req.method === 'GET') {
      if (!sameOrigin(req)) { res.writeHead(403, {}); res.end(); return }
      const requested = new URL(req.url ?? '/', 'http://localhost').searchParams.get('path')
      const cwd = requireWorkspace(req, res)
      const target = cwd === undefined || requested === null ? undefined : await safeMutationFile(cwd, requested)
      if (target === undefined) { if (cwd !== undefined) json(res, 400, { error: 'invalid path' }); return }
      try { const source = await readFile(target, 'utf8'); json(res, 200, { path: requested, source: source.slice(0, 1_000_000), truncated: source.length > 1_000_000 }) } catch (error) { json(res, 200, { path: requested, source: '', error: error instanceof Error ? error.message : String(error) }) }
      return
    }
    if (req.method !== 'POST') { res.writeHead(405, {}); res.end(); return }
    if (!sameOrigin(req) || req.headers['content-type']?.split(';', 1)[0] !== 'application/json' || req.headers['x-requested-with'] !== 'dsh-workbench') { res.writeHead(403, {}); res.end(); return }
    try {
      const payload = await body(req) as { path?: unknown; source?: unknown; sessionId?: unknown }
      const cwd = requireWorkspace(req, res, payload)
      const target = cwd === undefined || typeof payload.path !== 'string' ? undefined : await safeMutationFile(cwd, payload.path)
      if (target === undefined || typeof payload.source !== 'string' || payload.source.length > 1_000_000) { if (cwd !== undefined) json(res, 400, { error: 'invalid file request' }); return }
      await writeFile(target, payload.source, 'utf8')
      json(res, 200, { ok: true })
    } catch (error) { json(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
  } }), 'chaos-desktop-panel: file route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/chaos-desktop/fs', handler: async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405, {}); res.end(); return }
    if (!sameOrigin(req) || req.headers['content-type']?.split(';', 1)[0] !== 'application/json' || req.headers['x-requested-with'] !== 'dsh-workbench') { res.writeHead(403, {}); res.end(); return }
    try {
      const payload = await body(req) as { action?: unknown; path?: unknown; destination?: unknown; sessionId?: unknown }
      const cwd = requireWorkspace(req, res, payload)
      const action = String(payload.action)
      const target = cwd === undefined || typeof payload.path !== 'string'
        ? undefined
        : action === 'mkdir' || action === 'create'
          ? await safeNewFile(cwd, payload.path)
          : await safeFile(cwd, payload.path)
      const destination = cwd === undefined || typeof payload.destination !== 'string' ? undefined : await safeNewFile(cwd, payload.destination)
      if (target === undefined || target === cwd || !['mkdir', 'create', 'delete', 'rename'].includes(action) || action === 'rename' && (destination === undefined || destination === cwd)) { if (cwd !== undefined) json(res, 400, { ok: false, error: 'invalid filesystem request' }); return }
      if (action === 'mkdir') await mkdir(target, { recursive: false })
      else if (action === 'create') await writeFile(target, '', { flag: 'wx' })
      else if (action === 'rename' && destination !== undefined) await rename(target, destination)
      else await rm(target, { recursive: true, force: false })
      json(res, 200, { ok: true })
    } catch (error) { json(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
  } }), 'chaos-desktop-panel: filesystem mutation route')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/chaos-desktop/git', handler: async (req, res) => {
    if (req.method === 'POST') {
      if (!sameOrigin(req) || req.headers['content-type']?.split(';', 1)[0] !== 'application/json' || req.headers['x-requested-with'] !== 'dsh-workbench') { res.writeHead(403, {}); res.end(); return }
      try {
        const payload = await body(req) as { action?: unknown; path?: unknown; message?: unknown; branch?: unknown; sessionId?: unknown }
        const cwd = requireWorkspace(req, res, payload)
        if (cwd === undefined) return
        const repository = await run('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', maxBuffer: 64_000 })
        const root = repository.stdout.trim()
        if (payload.action === 'checkout') {
          const branch = typeof payload.branch === 'string' ? payload.branch.trim() : ''
          if (branch === '' || branch.length > 255 || branch.includes('..') || branch.startsWith('-')) { json(res, 400, { ok: false, error: 'invalid branch name' }); return }
          await run('git', ['check-ref-format', '--branch', branch], { cwd: root, encoding: 'utf8', maxBuffer: 64_000 })
          await run('git', ['switch', branch], { cwd: root, encoding: 'utf8', maxBuffer: 64_000 })
        } else if (payload.action === 'commit') {
          const message = typeof payload.message === 'string' ? payload.message.trim() : ''
          if (message === '' || message.length > 4_000) { json(res, 400, { ok: false, error: 'invalid commit message' }); return }
          await run('git', ['commit', '-m', message], { cwd: root, encoding: 'utf8', maxBuffer: 1_000_000 })
        } else {
          if (!['stage', 'unstage', 'discard'].includes(String(payload.action)) || typeof payload.path !== 'string' || await safeFile(cwd, payload.path) === undefined) { json(res, 400, { ok: false, error: 'invalid Git request' }); return }
          const args = payload.action === 'stage' ? ['add', '--', payload.path] : payload.action === 'unstage' ? ['restore', '--staged', '--', payload.path] : ['restore', '--worktree', '--', payload.path]
          await run('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64_000 })
        }
        json(res, 200, { ok: true })
      } catch (error) { json(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
      return
    }
    if (req.method !== 'GET' || !sameOrigin(req)) { res.writeHead(req.method === 'GET' ? 403 : 405, {}); res.end(); return }
    const file = new URL(req.url ?? '/', 'http://localhost').searchParams.get('file')
    const cwd = requireWorkspace(req, res)
    if (cwd === undefined) return
    if (file !== null && await safeFile(cwd, file) === undefined) { json(res, 400, { cwd, branch: '', branches: [], history: [], files: [], diff: '', error: 'invalid file path' }); return }
    try {
      const repository = await run('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', maxBuffer: 64_000 })
      const root = repository.stdout.trim()
      const [status, branch, branches, history, numstat, diff] = await Promise.all([
        run('git', ['status', '--short', '--untracked-files=all'], { cwd: root, encoding: 'utf8', maxBuffer: 1_000_000 }),
        run('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', maxBuffer: 64_000 }),
        run('git', ['branch', '--format=%(refname:short)'], { cwd: root, encoding: 'utf8', maxBuffer: 64_000 }),
        run('git', ['log', '-n', '30', '--format=%H%x1f%s'], { cwd: root, encoding: 'utf8', maxBuffer: 256_000 }),
        run('git', ['diff', '--numstat', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 1_000_000 }),
        file === null ? Promise.resolve({ stdout: '' }) : run('git', ['diff', '--no-ext-diff', 'HEAD', '--', file], { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 }),
      ])
      const counts = parseNumstat(numstat.stdout)
      const files: ChangedFile[] = []
      for (const line of status.stdout.split('\n').filter(Boolean)) {
        const path = line.slice(3)
        const code = line.slice(0, 2).trim() || '??'
        const count = counts.get(path)
        if (count !== undefined) files.push({ code, path, ...count })
        else files.push({ code, path, additions: 0, deletions: 0 })
      }
      json(res, 200, { cwd: root, branch: branch.stdout.trim() || 'HEAD', branches: branches.stdout.split('\n').filter(Boolean), history: history.stdout.split('\n').filter(Boolean).map((line) => { const [id, subject] = line.split('\x1f'); return { id, subject: subject ?? '' } }), files, diff: diff.stdout })
    } catch (error) { json(res, 200, { cwd, branch: '', branches: [], history: [], files: [], diff: '', error: error instanceof Error ? error.message : String(error) }) }
  } }), 'chaos-desktop-panel: Git review route')
  const terminalSockets = new WebSocketServer({ noServer: true, maxPayload: 65_536 })
  ctx.effect(() => ctx.webServer.registerUpgrade({ path: '/api/chaos-desktop/terminal/ws', handler: (req, socket, head) => {
    const authenticated = ctx.webServer.isAuthenticated(req)
    if (!trustedWebSocketOrigin(req, authenticated) || ctx.webServer.host === '0.0.0.0' && !authenticated) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    const query = new URL(req.url ?? '/', 'http://localhost').searchParams
    const sessionId = query.get('sessionId')
    const tabId = query.get('tabId')
    const cols = Number(query.get('cols') ?? 120)
    const rows = Number(query.get('rows') ?? 30)
    const cwd = sessionId === null ? undefined : ctx.sessions.get(SessionId(sessionId))?.header.cwd
    if (sessionId === null || tabId === null || !/^[a-zA-Z0-9_-]{1,80}$/.test(tabId) || cwd === undefined || !Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols < 20 || cols > 400 || rows < 5 || rows > 200) { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return }
    terminalSockets.handleUpgrade(req, socket, head, (websocket) => {
      void terminals.open(sessionId, tabId, cwd, cols, rows).then((terminal) => {
        websocket.send(JSON.stringify({ type: 'replay', data: terminal.transcript, exited: terminal.exited }))
        const unsubscribe = terminals.subscribe(terminal, (data) => { if (websocket.readyState !== WebSocket.OPEN) return; if (websocket.bufferedAmount > 1_000_000) { websocket.close(1013, 'terminal output backpressure'); return }; websocket.send(JSON.stringify({ type: 'output', data })) })
        const unsubscribeExit = terminals.subscribeExit(terminal, () => { if (websocket.readyState === WebSocket.OPEN) { websocket.send(JSON.stringify({ type: 'exit' })); websocket.close() } })
        websocket.on('message', (data) => {
          try {
            const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : data) as { type?: unknown; data?: unknown }
            if (frame.type === 'input' && typeof frame.data === 'string' && frame.data.length <= 65_536) terminals.write(terminal, frame.data)
            else if (frame.type === 'signal' && frame.data === 'SIGINT') terminals.signal(terminal)
            else if (frame.type === 'close') void terminals.close(terminal.key).finally(() =>{  websocket.close() })
            else websocket.close(1008, 'invalid terminal frame')
          } catch { websocket.close(1008, 'invalid terminal frame') }
        })
        websocket.once('close', () => { unsubscribe(); unsubscribeExit(); terminals.scheduleClose(sessionId, tabId) })
      }).catch(() => { websocket.close(1011, 'terminal unavailable') })
    })
  } }), 'chaos-desktop-panel: persistent terminal WebSocket')
}
