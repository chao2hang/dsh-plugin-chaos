/** Expandable workspace file tree for the workbench explorer tab. */
import { useEffect, useState } from 'react'
import css from './DeskPanel.module.css'

type Entry = { name: string; path: string; directory: boolean }
type Listing = { entries: Entry[]; error?: string }
type TreeProps = {
  onOpen: (path: string) => void
  sessionId: string | undefined
  refresh: number
  mutate: (action: 'create' | 'delete' | 'mkdir' | 'rename', path: string, destination?: string) => void
  upload: (path: string, source: string) => void
}

function listingError(error: unknown): Listing { return { entries: [], error: error instanceof Error ? error.message : String(error) } }

function useListing(path: string, expanded: boolean, sessionId: string | undefined, refresh: number): Listing | undefined {
  const [listing, setListing] = useState<Listing>()
  useEffect(() => {
    if (!expanded) return
    let live = true
    const query = new URLSearchParams({ path })
    if (sessionId !== undefined) query.set('sessionId', sessionId)
    void fetch('/api/chaos-desktop/files?' + query.toString())
      .then(response => response.json() as Promise<Listing>)
      .then((value) => { if (live) setListing(value) })
      .catch((error: unknown) => { if (live) setListing(listingError(error)) })
    return () => { live = false }
  }, [expanded, path, refresh, sessionId])
  return listing
}

function RenameButton(props: TreeProps & { entry: Entry }) {
  const rename = (): void => {
    const name = window.prompt('新名称', props.entry.name)?.trim()
    if (name !== undefined && name !== '' && name !== props.entry.name) {
      props.mutate('rename', props.entry.path, props.entry.path.replace(/[^/]+$/, name))
    }
  }
  return <button type="button" className={css.treeAction} aria-label={'重命名 ' + props.entry.name} onClick={rename}>✎</button>
}

/** One recursively expandable directory row. */
function Directory(props: TreeProps & { entry: Entry; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const listing = useListing(props.entry.path, expanded, props.sessionId, props.refresh)
  return <li>
    <div className={css.treeItem}>
      <button type="button" className={css.treeRow} style={{ paddingLeft: 10 + props.depth * 14 }} onClick={() => { setExpanded(value => !value) }}>
        <span>{expanded ? '⌄' : '›'}</span><span>▸</span>{props.entry.name}
      </button>
      <button type="button" className={css.treeAction} aria-label={'删除 ' + props.entry.name} onClick={() => { props.mutate('delete', props.entry.path) }}>×</button>
      <RenameButton {...props} />
    </div>
    {expanded && <Tree {...props} listing={listing} depth={props.depth + 1} />}
  </li>
}

/** Renders a lazy workspace directory listing. */
function Tree(props: TreeProps & { listing: Listing | undefined; depth: number }) {
  if (props.listing === undefined) return <p className={css.treeHint}>正在读取…</p>
  if (props.listing.error !== undefined) return <p className={css.error}>{props.listing.error}</p>
  return <ul className={css.tree}>{props.listing.entries.map(entry => entry.directory
    ? <Directory key={entry.path} {...props} entry={entry} />
    : <li className={css.treeItem} key={entry.path}>
      <button type="button" className={css.treeRow} style={{ paddingLeft: 10 + props.depth * 14 }} onClick={() => { props.onOpen(entry.path) }}>
        <span> </span><span>▫</span>{entry.name}
      </button>
      <button type="button" className={css.treeAction} aria-label={'删除 ' + entry.name} onClick={() => { props.mutate('delete', entry.path) }}>×</button>
      <RenameButton {...props} entry={entry} />
    </li>)}</ul>
}

/** Explorer panel starting at the selected session workspace root. */
export function FileTree(props: TreeProps) {
  const listing = useListing('', true, props.sessionId, props.refresh)
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState<Listing>()
  useEffect(() => {
    const query = term.trim()
    if (query.length < 2) { setSearch(undefined); return }
    let live = true
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams({ q: query })
      if (props.sessionId !== undefined) parameters.set('sessionId', props.sessionId)
      void fetch('/api/chaos-desktop/search?' + parameters.toString())
        .then(response => response.json() as Promise<Listing>)
        .then((value) => { if (live) setSearch(value) })
        .catch((error: unknown) => { if (live) setSearch(listingError(error)) })
    }, 180)
    return () => { live = false; window.clearTimeout(timer) }
  }, [props.sessionId, term])
  const ask = (action: 'create' | 'mkdir'): void => {
    const name = window.prompt(action === 'mkdir' ? '新建文件夹路径' : '新建文件路径')?.trim()
    if (name !== undefined && name !== '') props.mutate(action, name)
  }
  const upload = (file: File | undefined): void => {
    if (file === undefined) return
    if (file.size > 1_000_000) { window.alert('上传文件不能超过 1 MB'); return }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') props.upload(file.name, reader.result) }
    reader.onerror = () => { window.alert('读取上传文件失败') }
    reader.readAsText(file)
  }
  const results = search === undefined ? listing : search
  return <div className={css.explorer}>
    <header className={css.explorerHeader}>
      <strong>资源管理器</strong>
      <span className={css.explorerActions}>
        <button type="button" aria-label="新建文件" onClick={() => { ask('create') }}>＋文件</button>
        <button type="button" aria-label="新建文件夹" onClick={() => { ask('mkdir') }}>＋目录</button>
        <label className={css.uploadButton}>
          上传
          <input type="file" aria-label="上传文本文件" onChange={(event) => { upload(event.currentTarget.files?.[0]) }} />
        </label>
      </span>
    </header>
    <input className={css.treeSearch} aria-label="搜索文件" value={term} onChange={(event) => { setTerm(event.target.value) }} placeholder="搜索文件名…" />
    {term.trim().length >= 2 && <p className={css.treeHint}>搜索结果</p>}
    <Tree {...props} listing={results} depth={0} />
  </div>
}
