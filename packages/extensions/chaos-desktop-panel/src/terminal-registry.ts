/** Browser-scoped persistent terminal registry over the subprocess PTY primitive. */
import { Buffer } from 'node:buffer'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'

export type BrowserTerminal = {
  key: string
  sessionId: string
  tabId: string
  cwd: string
  transcript: string
  exited: boolean
  handle: SubprocessTerminalHandle
  subscribers: Set<(data: string) => void>
  exits: Set<() => void>
  closeTimer?: ReturnType<typeof setTimeout>
  write: Promise<void>
}

export type BrowserTerminalRegistryOptions = {
  spawn: (cwd: string, cols: number, rows: number) => Promise<SubprocessTerminalHandle>
  reconnectGraceMs: number
  transcriptBytes: number
}

/** Retain the latest UTF-8 text without beginning inside a multi-byte code point. */
function trimTranscript(source: string, bytes: number): string {
  const encoded = Buffer.from(source)
  if (encoded.length <= bytes) return source
  let start = encoded.length - bytes
  while (start < encoded.length && ((encoded[start] ?? 0) & 0xc0) === 0x80) start += 1
  return encoded.subarray(start).toString('utf8')
}

/** Keeps a bounded, reconnectable shell per session and tab. */
export class BrowserTerminalRegistry {
  private readonly terminals = new Map<string, BrowserTerminal>()

  constructor(private readonly options: BrowserTerminalRegistryOptions) {}

  /** Open or reconnect to a tab-owned shell. */
  async open(sessionId: string, tabId: string, cwd: string, cols: number, rows: number): Promise<BrowserTerminal> {
    const key = sessionId + ':' + tabId
    const current = this.terminals.get(key)
    if (current !== undefined && !current.exited && current.cwd === cwd) {
      this.cancelClose(current)
      return current
    }
    if (current !== undefined) await this.close(key)
    const handle = await this.options.spawn(cwd, Math.max(2, Math.floor(cols)), Math.max(2, Math.floor(rows)))
    const terminal: BrowserTerminal = {
      key, sessionId, tabId, cwd, transcript: '', exited: false, handle,
      subscribers: new Set(), exits: new Set(), write: Promise.resolve(),
    }
    handle.output.on('data', (chunk: Buffer | Uint8Array | string) => {
      const data = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      terminal.transcript += data
      if (Buffer.byteLength(terminal.transcript) > this.options.transcriptBytes) {
        terminal.transcript = trimTranscript(terminal.transcript, this.options.transcriptBytes)
      }
      for (const subscriber of terminal.subscribers) subscriber(data)
    })
    const notifyExit = (): void => { this.notifyExit(terminal) }
    void handle.done.then(notifyExit, notifyExit)
    this.terminals.set(key, terminal)
    return terminal
  }

  /** Resolve a terminal only when both browser-owned identities match. */
  get(sessionId: string, tabId: string): BrowserTerminal | undefined {
    return this.terminals.get(sessionId + ':' + tabId)
  }

  /** Serialize input writes for one terminal. */
  write(terminal: BrowserTerminal, data: string): void {
    if (!terminal.exited) {
      terminal.write = terminal.write.catch(() => undefined).then(() => terminal.handle.write(data))
    }
  }

  /** Send an interrupt to the foreground process when the shell remains live. */
  signal(terminal: BrowserTerminal): void {
    if (!terminal.exited) void terminal.handle.signalForeground('SIGINT').catch(() => undefined)
  }

  /** Attach one live-output subscriber and return its disposer. */
  subscribe(terminal: BrowserTerminal, listener: (data: string) => void): () => void {
    terminal.subscribers.add(listener)
    return () => { terminal.subscribers.delete(listener) }
  }

  /** Attach one terminal-exit subscriber and return its disposer. */
  subscribeExit(terminal: BrowserTerminal, listener: () => void): () => void {
    if (terminal.exited) listener()
    else terminal.exits.add(listener)
    return () => { terminal.exits.delete(listener) }
  }

  /** Schedule reconnect-grace cleanup after an unannounced socket loss. */
  scheduleClose(sessionId: string, tabId: string): void {
    const terminal = this.get(sessionId, tabId)
    if (terminal === undefined || terminal.subscribers.size !== 0 || terminal.closeTimer !== undefined) return
    terminal.closeTimer = setTimeout(() => { void this.close(terminal.key) }, this.options.reconnectGraceMs)
  }

  /** Close a tab-owned shell and release all retained state. */
  async close(key: string): Promise<void> {
    const terminal = this.terminals.get(key)
    if (terminal === undefined) return
    this.cancelClose(terminal)
    this.terminals.delete(key)
    await terminal.handle.terminate()
  }

  /** Dispose every shell on plugin teardown. */
  async dispose(): Promise<void> {
    await Promise.all([...this.terminals.keys()].map(key => this.close(key)))
  }

  private notifyExit(terminal: BrowserTerminal): void {
    terminal.exited = true
    for (const listener of terminal.exits) listener()
  }

  private cancelClose(terminal: BrowserTerminal): void {
    if (terminal.closeTimer !== undefined) {
      clearTimeout(terminal.closeTimer)
      delete terminal.closeTimer
    }
  }
}
