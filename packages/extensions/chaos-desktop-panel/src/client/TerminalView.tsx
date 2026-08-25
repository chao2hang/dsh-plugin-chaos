/** Browser terminal view backed by the workbench persistent PTY socket. */
import { useEffect, useRef, useState } from 'react'

type TerminalFrame = { type?: unknown; data?: unknown; exited?: unknown }

/** Renders streamed terminal output and forwards interactive input to its PTY. */
export function TerminalView({ sessionId, tabId = 'primary' }: { sessionId: string | undefined; tabId?: string }) {
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'exited'>('disconnected')
  const [connection, reconnect] = useState(0)
  const socket = useRef<WebSocket | null>(null)
  const transcript = useRef<HTMLPreElement | null>(null)
  useEffect(() => {
    setOutput('')
    setInput('')
    setStatus('disconnected')
    if (sessionId === undefined) { setOutput('选择一个有工作目录的会话以打开终端。'); return }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const parameters = new URLSearchParams({
      sessionId, tabId, cols: String(Math.max(80, Math.floor(window.innerWidth / 9))), rows: '30',
    })
    const url = protocol + '//' + location.host + '/api/chaos-desktop/terminal/ws?' + parameters.toString()
    const ws = new WebSocket(url)
    socket.current = ws
    setStatus('connecting')
    ws.onopen = () => { if (socket.current === ws) setStatus('connected') }
    ws.onmessage = (event) => {
      if (socket.current !== ws) return
      try {
        const frame = JSON.parse(String(event.data)) as TerminalFrame
        if ((frame.type === 'replay' || frame.type === 'output') && typeof frame.data === 'string') {
          const data = frame.data
          setOutput(previous => (frame.type === 'replay' ? data : previous + data).slice(-1_000_000))
        }
        if (frame.type === 'replay' && frame.exited === true || frame.type === 'exit') setStatus('exited')
      } catch { setStatus('disconnected') }
    }
    ws.onclose = () => {
      if (socket.current !== ws) return
      setStatus(previous => previous === 'exited' ? 'exited' : 'disconnected')
      window.setTimeout(() => { if (socket.current === ws) socket.current = null }, 500)
    }
    ws.onerror = () => { if (socket.current === ws) setStatus(previous => previous === 'exited' ? 'exited' : 'disconnected') }
    return () => { ws.close(); if (socket.current === ws) socket.current = null }
  }, [connection, sessionId, tabId])
  useEffect(() => {
    const node = transcript.current
    if (node !== null && node.scrollHeight - node.scrollTop - node.clientHeight < 48) node.scrollTop = node.scrollHeight
  }, [output])
  const send = (data: string): void => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'input', data }))
  }
  const interrupt = (): void => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'signal', data: 'SIGINT' }))
  }
  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (input !== '') { send(input + '\r'); setInput('') }
  }
  const submitKey = (event: React.KeyboardEvent): void => {
    if (event.ctrlKey && event.key.toLowerCase() === 'c') { event.preventDefault(); interrupt(); setInput('') }
  }
  const transcriptKey = (event: React.KeyboardEvent): void => {
    const keys: Record<string, string> = {
      Enter: '\r', Tab: '\t', Backspace: '\u007f',
      ArrowUp: '\u001b[A', ArrowDown: '\u001b[B', ArrowLeft: '\u001b[D', ArrowRight: '\u001b[C',
    }
    const data = keys[event.key]
    if (data !== undefined) { event.preventDefault(); send(data) } else if (event.ctrlKey && event.key.length === 1) {
      event.preventDefault(); send(String.fromCharCode(event.key.toUpperCase().charCodeAt(0) - 64))
    } else if (!event.metaKey && !event.altKey && event.key.length === 1) { event.preventDefault(); send(event.key) }
  }
  const paste = (event: React.ClipboardEvent): void => {
    const text = event.clipboardData.getData('text')
    if (text !== '') { event.preventDefault(); send(text) }
  }
  const statusLabel = status === 'connected' ? '已连接' : status === 'connecting' ? '连接中…' : status === 'exited' ? '进程已退出' : '已断开'
  return <div className="terminal">
    <form className="terminalForm" onSubmit={submit}>
      <span>$</span>
      <input aria-label="终端输入" disabled={status !== 'connected'} value={input} onChange={(event) => { setInput(event.target.value) }} onKeyDown={submitKey} />
      <button disabled={status !== 'connected' || input === ''}>发送</button>
      <button type="button" disabled={status !== 'connected'} onClick={interrupt}>中断</button>
      <button type="button" disabled={status === 'connected'} onClick={() => { reconnect(value => value + 1) }}>重连</button>
      <button type="button" disabled={status !== 'connected'} onClick={() => socket.current?.send(JSON.stringify({ type: 'close' }))}>关闭</button>
    </form>
    <p>终端：{statusLabel}</p>
    <pre ref={transcript} className="terminalTranscript" tabIndex={0} aria-label="终端输出" onKeyDown={transcriptKey} onPaste={paste}>
      {output || '正在连接到会话工作目录…'}
    </pre>
  </div>
}
