/** Docked right and bottom workbench inspired by dsh-better-sidebar. */
import { useEffect, useState, type KeyboardEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { closeWorkbenchTab, moveWorkbenchTab, useWorkbenchState, workbenchShowsGit, type WorkbenchTab } from './workbench-state.ts'
import { FileTree } from './FileTree.tsx'
import { TerminalView } from './TerminalView.tsx'
import css from './DeskPanel.module.css'

type GitFile = { code: string; path: string; additions: number; deletions: number }
type GitState = {
  cwd: string
  branch: string
  branches: string[]
  history: { id: string; subject: string }[]
  files: GitFile[]
  diff: string
  error?: string
}
type DiffLine = { kind: 'context' | 'addition' | 'deletion' | 'meta'; oldLine: string; newLine: string; text: string }
type Panel = 'right' | 'bottom' | 'split'
const tabs: readonly { id: WorkbenchTab; label: string; icon: string }[] = [
  { id: 'explorer', label: '资源管理器', icon: '▸' },
  { id: 'preview', label: '预览', icon: '▫' },
  { id: 'review', label: 'Git', icon: '⌘' },
  { id: 'terminal', label: '终端', icon: '›_' },
  { id: 'browser', label: '浏览器', icon: '◎' },
  { id: 'tasks', label: '任务', icon: '◌' },
  { id: 'assistant', label: '辅助对话', icon: '▤' },
]

function parseDiff(source: string): DiffLine[] {
  let oldLine = 0
  let newLine = 0
  const rows: DiffLine[] = []
  for (const line of source.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line)
    if (hunk !== null) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      rows.push({ kind: 'meta', oldLine: '', newLine: '', text: line })
    } else if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
      rows.push({ kind: 'meta', oldLine: '', newLine: '', text: line })
    }
    else if (line.startsWith('+')) rows.push({ kind: 'addition', oldLine: '', newLine: String(newLine++), text: line.slice(1) })
    else if (line.startsWith('-')) rows.push({ kind: 'deletion', oldLine: String(oldLine++), newLine: '', text: line.slice(1) })
    else if (line.startsWith(' ')) rows.push({ kind: 'context', oldLine: String(oldLine++), newLine: String(newLine++), text: line.slice(1) })
  }
  return rows
}
function mobile(): boolean { return window.innerWidth < 768 || window.innerHeight < 500 }
function resizeKey(event: KeyboardEvent, adjust: (delta: number) => void): void {
  const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -20 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 20 : 0
  if (delta !== 0) { event.preventDefault(); adjust(delta) }
}

/** Renders the session-persisted right workbench and bottom dock. */
export function DeskPanel(props: PropsRuntime<'shell.overlay'>) {
  const session = props.useSessions(state => state.current === undefined ? undefined : state.byId[state.current])
  const jobs = props.useSessions(state => state.current === undefined ? [] : state.jobsBySession[state.current] ?? [])
  const [workbench, update] = useWorkbenchState(session?.id)
  const [resizing, setResizing] = useState(false)
  const [bottomResizing, setBottomResizing] = useState(false)
  const [splitResizing, setSplitResizing] = useState(false)
  const [git, setGit] = useState<GitState | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [switchingBranch, setSwitchingBranch] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('https://example.com')
  const [browserUrl, setBrowserUrl] = useState<string | undefined>()
  const [browserHistory, setBrowserHistory] = useState<string[]>([])
  const [browserIndex, setBrowserIndex] = useState(-1)
  const [browserReload, setBrowserReload] = useState(0)
  const [preview, setPreview] = useState<{ path: string; source: string; error?: string }>()
  const [previewMode, setPreviewMode] = useState<'source' | 'html'>('source')
  const [saving, setSaving] = useState(false)
  const [treeRefresh, setTreeRefresh] = useState(0)
  const [compact, setCompact] = useState(mobile)
  useEffect(() => {
    const updateCompact = (): void => { setCompact(mobile()) }
    window.addEventListener('resize', updateCompact)
    return () => { window.removeEventListener('resize', updateCompact) }
  }, [])
  const cwd = session?.cwd
  const loadGit = async (file: string | null = selectedFile): Promise<void> => {
    const query = new URLSearchParams(session?.id === undefined ? {} : { sessionId: session.id })
    if (file !== null) query.set('file', file)
    const response = await fetch('/api/chaos-desktop/git?' + query.toString())
    setGit(await response.json() as GitState)
  }
  useEffect(() => {
    if (workbenchShowsGit(workbench)) void loadGit()
  }, [cwd, workbench.active, workbench.bottomActive, workbench.bottomOpen, workbench.open, workbench.split, workbench.splitActive])
  useEffect(() => { setSelectedFile(null); setPreview(undefined); setPreviewMode('source') }, [session?.id])
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--chaos-desktop-panel-width', workbench.open && !compact ? String(workbench.width) + 'px' : '0px')
    root.style.setProperty('--chaos-desktop-bottom-height', workbench.bottomOpen && !compact ? String(workbench.bottomHeight) + 'px' : '0px')
    document.body.toggleAttribute('data-chaos-workbench-resizing', resizing || bottomResizing || splitResizing)
    return () => {
      root.style.removeProperty('--chaos-desktop-panel-width')
      root.style.removeProperty('--chaos-desktop-bottom-height')
      document.body.removeAttribute('data-chaos-workbench-resizing')
    }
  }, [bottomResizing, compact, resizing, splitResizing, workbench.bottomHeight, workbench.bottomOpen, workbench.open, workbench.width])
  const send = (): void => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-composer-card] textarea')
    if (textarea === null || message.trim() === '') return
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, message)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLButtonElement>('[data-composer-primary]')?.click()
    setMessage('')
  }
  const navigate = (): void => {
    try {
      const target = new URL(url)
      const loopback = target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '::1'
      if (!['http:', 'https:'].includes(target.protocol) || loopback) throw new Error()
      const next = target.toString()
      const history = [...browserHistory.slice(0, browserIndex + 1), next]
      setBrowserHistory(history)
      setBrowserIndex(history.length - 1)
      setBrowserUrl(next)
      setBrowserReload(value => value + 1)
    } catch { setBrowserUrl(undefined) }
  }
  const browse = (index: number): void => {
    const next = browserHistory[index]
    if (next !== undefined) { setBrowserIndex(index); setBrowserUrl(next); setUrl(next); setBrowserReload(value => value + 1) }
  }
  const mutateFile = async (action: 'create' | 'delete' | 'mkdir' | 'rename', path: string, destination?: string): Promise<void> => {
    if (action === 'delete' && !window.confirm('删除 ' + path + '？')) return
    const body = JSON.stringify({ action, path, destination, sessionId: session?.id })
    const response = await fetch('/api/chaos-desktop/fs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }, body })
    const result = await response.json() as { ok: boolean; error?: string }
    if (result.ok) { setTreeRefresh(value => value + 1); if (action === 'create') openFile(path) } else window.alert(result.error ?? '文件操作失败')
  }
  const uploadFile = async (path: string, source: string): Promise<void> => {
    const body = JSON.stringify({ path, source, sessionId: session?.id })
    const response = await fetch('/api/chaos-desktop/file', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }, body })
    const result = await response.json() as { ok?: boolean; error?: string }
    if (result.ok) { setTreeRefresh(value => value + 1); openFile(path) } else window.alert(result.error ?? '上传失败')
  }
  const openFile = (path: string): void => {
    const query = '?path=' + encodeURIComponent(path) + (session?.id === undefined ? '' : '&sessionId=' + encodeURIComponent(session.id))
    void fetch('/api/chaos-desktop/file' + query)
      .then(response => response.json() as Promise<{ path: string; source: string; error?: string }>)
      .then((value) => {
        setPreview(value)
        setPreviewMode(value.path.toLowerCase().endsWith('.html') || value.path.toLowerCase().endsWith('.htm') ? 'html' : 'source')
        update({ active: 'preview', tabs: workbench.tabs.includes('preview') ? workbench.tabs : [...workbench.tabs, 'preview'] })
      })
  }
  const downloadPreview = (): void => {
    if (preview === undefined) return
    const url = URL.createObjectURL(new Blob([preview.source], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = preview.path.split('/').at(-1) ?? 'download.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  const savePreview = async (): Promise<void> => {
    if (preview === undefined) return
    setSaving(true)
    const body = JSON.stringify({ path: preview.path, source: preview.source, sessionId: session?.id })
    const response = await fetch('/api/chaos-desktop/file', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }, body })
    const result = await response.json() as { ok?: boolean; error?: string }
    setSaving(false)
    if (result.ok !== true) setPreview({ ...preview, error: result.error ?? '保存失败' })
  }
  const gitAction = async (action: 'stage' | 'unstage' | 'discard', path: string): Promise<void> => {
    if (action === 'discard' && !window.confirm('丢弃 ' + path + ' 的未暂存修改？')) return
    const body = JSON.stringify({ action, path, sessionId: session?.id })
    await fetch('/api/chaos-desktop/git', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }, body })
    await loadGit(selectedFile)
  }
  const commit = async (): Promise<void> => {
    const message = commitMessage.trim()
    if (message === '' || committing) return
    setCommitting(true)
    try {
      const body = JSON.stringify({ action: 'commit', message, sessionId: session?.id })
      const response = await fetch('/api/chaos-desktop/git', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }, body })
      const result = await response.json() as { ok: boolean; error?: string }
      if (result.ok) { setCommitMessage(''); await loadGit(null) } else window.alert(result.error ?? '提交失败')
    } finally { setCommitting(false) }
  }
  const checkout = async (branch: string): Promise<void> => {
    if (branch === git?.branch || switchingBranch) return
    setSwitchingBranch(true)
    try {
      const body = JSON.stringify({ action: 'checkout', branch, sessionId: session?.id })
      const response = await fetch('/api/chaos-desktop/git', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'dsh-workbench' }, body })
      const result = await response.json() as { ok: boolean; error?: string }
      if (result.ok) await loadGit(null); else window.alert(result.error ?? '切换分支失败')
    } finally { setSwitchingBranch(false) }
  }
  const diff = parseDiff(git?.diff ?? '')
  const renderExplorer = () => <FileTree
    onOpen={openFile}
    sessionId={session?.id}
    refresh={treeRefresh}
    mutate={(action, path, destination) => void mutateFile(action, path, destination)}
    upload={(path, source) => void uploadFile(path, source)} />
  const renderPreview = () => <div className={css.preview}>
    <header>
      <span>{preview?.path ?? '选择一个文件'}</span>
      {preview !== undefined && <span className={css.previewActions}>
        {/\.html?$/i.test(preview.path) && <button type="button" onClick={() => { setPreviewMode(mode => mode === 'html' ? 'source' : 'html') }}>
          {previewMode === 'html' ? '源码' : '预览'}
        </button>}
        <button type="button" onClick={downloadPreview}>下载</button>
        <button type="button" disabled={saving} onClick={() => void savePreview()}>{saving ? '保存中…' : '保存'}</button>
      </span>}
    </header>
    {preview === undefined && <p>在资源管理器中选择文件以编辑。</p>}
    {preview !== undefined && previewMode === 'html' &&
      <iframe className={css.htmlPreview} title="HTML 预览" srcDoc={preview.source} sandbox="allow-scripts" referrerPolicy="no-referrer" />}
    {preview !== undefined && previewMode !== 'html' && <textarea
      aria-label="文件内容"
      value={preview.source}
      onChange={(event) => { const { error: _error, ...current } = preview; setPreview({ ...current, source: event.target.value }) }}
      onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); void savePreview() } }} />}
    {preview?.error !== undefined && <p className={css.error}>{preview.error}</p>}
  </div>
  const renderReview = () => {
    const staged = (code: string): boolean => code.startsWith('M') || code.startsWith('A')
    const diffClass = (line: DiffLine): string => css['diff' + line.kind.charAt(0).toUpperCase() + line.kind.slice(1)]
    return <div className={css.review}>
      <div className={css.toolbar}><strong>Git 工具</strong><button type="button" onClick={() => void loadGit()}>↻ 刷新</button></div>
      <p className={css.path}>{git?.cwd ?? '正在读取工作目录…'}</p>
      <div className={css.branch}>
        ⌘{' '}
        <select aria-label="Git 分支" disabled={switchingBranch} value={git?.branch ?? ''} onChange={event => void checkout(event.target.value)}>
          <option value="">{git?.branch ?? '…'}</option>
          {git?.branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
        </select>
        <span>{git?.files.length ?? 0} 个变更</span>
      </div>
      <details className={css.history}>
        <summary>历史 ({git?.history.length ?? 0})</summary>
        <ul>{git?.history.map(entry => <li key={entry.id}><code>{entry.id.slice(0, 8)}</code><span>{entry.subject}</span></li>)}</ul>
      </details>
      <form className={css.commitForm} onSubmit={(event) => { event.preventDefault(); void commit() }}>
        <input
          aria-label="提交说明"
          disabled={committing}
          value={commitMessage}
          onChange={(event) => { setCommitMessage(event.target.value) }}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void commit() } }}
          placeholder="提交说明" />
        <button disabled={committing || commitMessage.trim() === ''}>{committing ? '提交中…' : '提交'}</button>
      </form>
      <div className={css.reviewBody}>
        <div className={css.files}>{git?.files.map(file => <div className={css.fileRow} key={file.path}>
          <button type="button" data-selected={selectedFile === file.path || undefined} onClick={() => { setSelectedFile(file.path); void loadGit(file.path) }}>
            <b data-code={file.code}>{file.code}</b><span>{file.path}</span><em>+{file.additions} −{file.deletions}</em>
          </button>
          <button type="button" className={css.stageButton} onClick={() => void gitAction(staged(file.code) ? 'unstage' : 'stage', file.path)}>
            {staged(file.code) ? '取消暂存' : '暂存'}
          </button>
          {!file.code.startsWith('M') && <button type="button" className={css.stageButton} onClick={() => void gitAction('discard', file.path)}>丢弃</button>}
        </div>)}</div>
        <div className={css.diff}>
          {selectedFile === null
            ? <p>选择文件以查看改动。</p>
            : diff.map((line, index) => <div key={index} className={diffClass(line)}>
              <i>{line.oldLine}</i><i>{line.newLine}</i><code>{line.text}</code>
            </div>)}
        </div>
      </div>
    </div>
  }
  const renderBrowser = () => <div className={css.browser}>
    <form onSubmit={(event) => { event.preventDefault(); navigate() }}>
      <button type="button" aria-label="后退" disabled={browserIndex <= 0} onClick={() => { browse(browserIndex - 1) }}>‹</button>
      <button type="button" aria-label="前进" disabled={browserIndex >= browserHistory.length - 1} onClick={() => { browse(browserIndex + 1) }}>›</button>
      <input aria-label="网页地址" value={url} onChange={(event) => { setUrl(event.target.value) }} />
      <button>打开</button>
      <button type="button" aria-label="重新加载" disabled={browserUrl === undefined} onClick={() => { setBrowserReload(value => value + 1) }}>↻</button>
    </form>
    {browserUrl === undefined
      ? <p>输入非本机 HTTP/HTTPS 地址后在隔离沙箱中打开。</p>
      : <iframe key={browserReload} title="内置浏览器" src={browserUrl} sandbox="allow-scripts allow-forms allow-popups allow-downloads" referrerPolicy="no-referrer" />}
  </div>
  const renderTasks = () => <div className={css.tasks}>
    <h2>任务与子代理</h2>
    <p>当前会话的后台任务。</p>
    {jobs.length === 0
      ? <p>没有后台任务。</p>
      : <ul>{jobs.map(job => <li key={job.id}>
        <div>
          <strong>{job.label}</strong>
          <small>{job.kind} · {new Date(job.startedAt).toLocaleTimeString()}</small>
          {job.detail !== undefined && <small>{job.detail}</small>}
        </div>
        <em data-status={job.status}>{job.status}</em>
      </li>)}</ul>}
  </div>
  const renderAssistant = () => <div className={css.assistant}>
    <h2>辅助对话</h2>
    <p>发送到当前主对话。</p>
    <textarea value={message} onChange={(event) => { setMessage(event.target.value) }} placeholder="输入消息…" />
    <button type="button" disabled={message.trim() === ''} onClick={send}>发送</button>
  </div>
  const render = (active: WorkbenchTab, pane: Panel) => <section className={css.content}>
    {active === 'explorer' && renderExplorer()}
    {active === 'preview' && renderPreview()}
    {active === 'review' && renderReview()}
    {active === 'terminal' && <TerminalView sessionId={session?.id} tabId={pane} />}
    {active === 'browser' && renderBrowser()}
    {active === 'tasks' && renderTasks()}
    {active === 'assistant' && renderAssistant()}
  </section>
  const strip = (panel: Panel) => {
    const active = panel === 'right' ? workbench.active : panel === 'bottom' ? workbench.bottomActive : workbench.splitActive
    const listed = panel === 'right' ? workbench.tabs : panel === 'bottom' ? workbench.bottomTabs : workbench.splitTabs
    const select = (next: WorkbenchTab): void => {
      if (panel === 'right') update({ active: next })
      else if (panel === 'bottom') update({ bottomActive: next })
      else update({ splitActive: next })
    }
    const close = (next: WorkbenchTab): void => {
      const remaining = closeWorkbenchTab(listed, next)
      if (panel === 'right') update({ tabs: remaining, active: active === next ? remaining[0] as WorkbenchTab : active })
      else if (panel === 'bottom') update({ bottomTabs: remaining, bottomActive: active === next ? remaining[0] as WorkbenchTab : active })
      else update({ splitTabs: remaining, splitActive: active === next ? remaining[0] as WorkbenchTab : active })
    }
    const add = (): void => {
      const next = tabs.find(item => !listed.includes(item.id))?.id
      if (next === undefined) return
      if (panel === 'right') update({ tabs: [...listed, next], active: next })
      else if (panel === 'bottom') update({ bottomTabs: [...listed, next], bottomActive: next })
      else update({ splitTabs: [...listed, next], splitActive: next })
    }
    const reorder = (tab: WorkbenchTab, before: WorkbenchTab): void => {
      const reordered = moveWorkbenchTab(listed, tab, before)
      if (panel === 'right') update({ tabs: reordered })
      else if (panel === 'bottom') update({ bottomTabs: reordered })
      else update({ splitTabs: reordered })
    }
    const drop = (id: WorkbenchTab) => (event: React.DragEvent): void => {
      const dragged = event.dataTransfer.getData('application/x-dsh-workbench-tab') as WorkbenchTab
      if (listed.includes(dragged) && dragged !== id) reorder(dragged, id)
    }
    return <header className={css.tabs}>
      {listed.map((id) => {
        const item = tabs.find(candidate => candidate.id === id) as (typeof tabs)[number]
        return <span
          className={css.tabItem}
          key={id}
          draggable
          onDragStart={(event) => { event.dataTransfer.setData('application/x-dsh-workbench-tab', id) }}
          onDragOver={(event) => { event.preventDefault() }}
          onDrop={drop(id)}>
          <button type="button" data-active={active === id || undefined} onClick={() => { select(id) }}>
            <span>{item.icon}</span>{item.label}
          </button>
          <button type="button" className={css.tabClose} aria-label={'关闭 ' + item.label} onClick={() => { close(id) }}>×</button>
        </span>
      })}
      <button type="button" className={css.tabAdd} aria-label="新建工作台标签" onClick={add}>+</button>
    </header>
  }
  const resizeProps = {
    role: 'separator',
    tabIndex: 0,
  } as const
  return <div className={css.host} data-chaos-workbench-host>
    <div className={css.toggleCluster}>
      <button type="button" aria-label="切换底部工作台" onClick={() => { update({ bottomOpen: !workbench.bottomOpen }) }}>▱</button>
      <button type="button" aria-label="切换右侧工作台" onClick={() => { update({ open: !workbench.open }) }}>▯</button>
    </div>
    <aside
      className={css.panel}
      data-open={workbench.open || compact || undefined}
      data-resizing={resizing || undefined}
      style={compact ? undefined : { width: workbench.width }}
      aria-label="右侧工作台">
      <div
        className={css.resizeHandle}
        {...resizeProps}
        aria-label="调整右侧工作台宽度"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={760}
        aria-valuenow={workbench.width}
        onKeyDown={(event) => { resizeKey(event, (delta) => { update({ width: workbench.width + delta }) }) }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setResizing(true) }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) update({ width: window.innerWidth - event.clientX })
        }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false) }}
        onPointerCancel={() => { setResizing(false) }} />
      {workbench.split
        ? <div className={css.splitLayout}>
          <div className={css.splitPane} style={{ flexGrow: workbench.splitRatio }}>
            {strip('right')}{render(workbench.active, 'right')}
          </div>
          <div
            className={css.splitResize}
            {...resizeProps}
            aria-label="调整工作台分屏"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={Math.round(workbench.splitRatio * 100)}
            onKeyDown={(event) => { resizeKey(event, (delta) => { update({ splitRatio: workbench.splitRatio + delta / 100 }) }) }}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setSplitResizing(true) }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                const box = event.currentTarget.parentElement?.getBoundingClientRect()
                if (box !== undefined) update({ splitRatio: (event.clientX - box.left) / box.width })
              }
            }}
            onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setSplitResizing(false) }}
            onPointerCancel={() => { setSplitResizing(false) }} />
          <div className={css.splitPane} style={{ flexGrow: 1 - workbench.splitRatio }}>
            {strip('split')}{render(workbench.splitActive, 'split')}
          </div>
        </div>
        : <>{strip('right')}{render(workbench.active, 'right')}</>}
      <button type="button" className={css.splitToggle} onClick={() => { update({ split: !workbench.split }) }}>
        {workbench.split ? '合并窗格' : '分割窗格'}
      </button>
    </aside>
    {!compact && <section
      className={css.bottomPanel}
      data-open={workbench.bottomOpen || undefined}
      data-resizing={bottomResizing || undefined}
      style={{ height: workbench.bottomHeight }}
      aria-label="底部工作台">
      <div
        className={css.bottomResize}
        {...resizeProps}
        aria-label="调整底部工作台高度"
        aria-orientation="horizontal"
        aria-valuemin={160}
        aria-valuemax={Math.max(160, window.innerHeight - 180)}
        aria-valuenow={workbench.bottomHeight}
        onKeyDown={(event) => { resizeKey(event, (delta) => { update({ bottomHeight: workbench.bottomHeight + delta }) }) }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setBottomResizing(true) }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) update({ bottomHeight: window.innerHeight - event.clientY })
        }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setBottomResizing(false) }}
        onPointerCancel={() => { setBottomResizing(false) }} />
      {strip('bottom')}{render(workbench.bottomActive, 'bottom')}
    </section>}
  </div>
}
