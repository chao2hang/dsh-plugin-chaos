/**
 * File Preview Modal: displays workspace files clicked in chat directly in the web page,
 * adapting presentation according to file type (code/text, markdown, image, media, pdf, directory, binary).
 *
 * @module @deepseek-ai/dsh-plugin-chaos-mobile/FilePreviewModal
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconCloseOutline16,
  IconCopyOutline16,
  LinkIcon,
  MarkdownText,
  Modal,
  classifyLinkPath,
  fileSizeText,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './FilePreviewModal.module.css'

export interface FilePreviewDataCommon {
  ok: boolean
  path: string
  name: string
  size?: number
  mtime?: number
  rawUrl?: string
}

export interface FilePreviewTextData extends FilePreviewDataCommon {
  kind: 'text' | 'markdown'
  extension: string
  language: string
  size: number
  lineCount: number
  content: string
  truncated: boolean
  rawUrl: string
}

export interface FilePreviewImageData extends FilePreviewDataCommon {
  kind: 'image'
  extension: string
  size: number
  mimeType: string
  rawUrl: string
}

export interface FilePreviewMediaData extends FilePreviewDataCommon {
  kind: 'media'
  mediaType: 'audio' | 'video'
  extension: string
  size: number
  mimeType: string
  rawUrl: string
}

export interface FilePreviewPdfData extends FilePreviewDataCommon {
  kind: 'pdf'
  extension: string
  size: number
  rawUrl: string
}

export interface FilePreviewDirEntry {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  mtime?: number
}

export interface FilePreviewDirectoryData extends FilePreviewDataCommon {
  kind: 'directory'
  entries: FilePreviewDirEntry[]
}

export interface FilePreviewBinaryData extends FilePreviewDataCommon {
  kind: 'binary'
  extension: string
  size: number
  mimeType: string
  rawUrl: string
}

export type FilePreviewData =
  | FilePreviewTextData
  | FilePreviewImageData
  | FilePreviewMediaData
  | FilePreviewPdfData
  | FilePreviewDirectoryData
  | FilePreviewBinaryData

export interface FilePreviewModalProps {
  open: boolean
  path: string
  onClose: () => void
  onNavigate?: (newPath: string) => void
}

const MARKDOWN_LABELS = {
  code: { copyLabel: '复制', copiedLabel: '已复制' },
  footnotes: '脚注',
}

export const FilePreviewModal = memo(function FilePreviewModal({
  open,
  path,
  onClose,
  onNavigate,
}: FilePreviewModalProps) {
  const [currentPath, setCurrentPath] = useState(path)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FilePreviewData | null>(null)
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview')
  const [copied, setCopied] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  // Sync incoming path changes
  useEffect(() => {
    if (open && path) {
      setCurrentPath(path)
    }
  }, [open, path])

  // Fetch file preview data from backend
  const loadFile = useCallback(async (targetPath: string) => {
    if (!targetPath) return
    setLoading(true)
    setError(null)
    setImageDimensions(null)
    try {
      const res = await fetch(`/api/chaos/file?path=${encodeURIComponent(targetPath)}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errJson.error ?? `HTTP ${res.status}: ${res.statusText}`)
      }
      const json = await res.json() as FilePreviewData
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && currentPath) {
      void loadFile(currentPath)
    }
  }, [open, currentPath, loadFile])

  const handleCopy = useCallback(async () => {
    if (!data || (data.kind !== 'text' && data.kind !== 'markdown')) return
    const ok = await writeClipboard(data.content)
    if (ok) {
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 2000)
    }
  }, [data])

  const handleDirectoryClick = useCallback((entry: FilePreviewDirEntry) => {
    setCurrentPath(entry.path)
    onNavigate?.(entry.path)
  }, [onNavigate])

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return []
    const parts = currentPath.split('/').filter(Boolean)
    return parts.map((part, index) => ({
      name: part,
      path: '/' + parts.slice(0, index + 1).join('/'),
    }))
  }, [currentPath])

  const lines = useMemo(() => {
    if (!data || (data.kind !== 'text' && data.kind !== 'markdown')) return []
    return data.content.split('\n')
  }, [data])

  if (!open) return null

  const linkKind = classifyLinkPath(currentPath)
  const isMarkdown = data?.kind === 'markdown'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data?.name ?? '文件预览'}
      className={`${css.dialog} ${css.dialog}`}
      headless
    >
      <div className={css.container}>
        {/* Header Bar */}
        <div className={css.header}>
          <div className={css.titleSection}>
            <div className={css.titleRow}>
              <LinkIcon kind={data?.kind === 'directory' ? 'folder' : linkKind} size={18} />
              <span className={css.fileName} title={data?.name || currentPath}>{data?.name || currentPath}</span>
              <div className={css.metaPills}>
                {data && 'extension' in data && data.extension && (
                  <span className={css.pill}>{data.extension.toUpperCase()}</span>
                )}
                {data && data.size !== undefined && (
                  <span className={css.pill}>{fileSizeText(data.size)}</span>
                )}
                {data && (data.kind === 'text' || data.kind === 'markdown') && (
                  <span className={css.pill}>{data.lineCount} 行</span>
                )}
              </div>
            </div>
            <span className={css.filePath} title={currentPath}>{currentPath}</span>
          </div>

          <div className={css.actions}>
            {/* Markdown Tab Switcher */}
            {isMarkdown && (
              <div className={css.segmented}>
                <button
                  type="button"
                  className={`${css.segmentedBtn} ${activeTab === 'preview' ? css.segmentedActive : ''}`}
                  onClick={() => { setActiveTab('preview') }}
                >
                  预览
                </button>
                <button
                  type="button"
                  className={`${css.segmentedBtn} ${activeTab === 'raw' ? css.segmentedActive : ''}`}
                  onClick={() => { setActiveTab('raw') }}
                >
                  源码
                </button>
              </div>
            )}

            {/* Copy Button for text */}
            {data && (data.kind === 'text' || data.kind === 'markdown') && (
              <button
                type="button"
                className={css.btnAction}
                onClick={handleCopy}
                title="复制全部内容"
              >
                <IconCopyOutline16 size={13} />
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
            )}

            {/* Download Button */}
            {data?.rawUrl && (
              <a
                href={`${data.rawUrl}&download=1`}
                download={data.name}
                className={css.btnAction}
                title="下载文件"
              >
                下载
              </a>
            )}

            {/* Close Button */}
            <button
              type="button"
              className={css.btnClose}
              onClick={onClose}
              aria-label="关闭预览"
              title="关闭"
            >
              <IconCloseOutline16 size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={css.body}>
          {loading && (
            <div className={css.centeredState}>
              <div className={css.spinner} />
              <span>正在加载文件...</span>
            </div>
          )}

          {error && !loading && (
            <div className={css.centeredState}>
              <div className={css.errorText}>无法打开文件：{error}</div>
              <button
                type="button"
                className={css.btnAction}
                onClick={() => { void loadFile(currentPath) }}
              >
                重试
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Markdown Rendered View */}
              {data.kind === 'markdown' && activeTab === 'preview' && (
                <div className={css.markdownBody}>
                  <MarkdownText text={data.content} labels={MARKDOWN_LABELS} />
                </div>
              )}

              {/* Code / Text or Markdown Raw View */}
              {((data.kind === 'text') || (data.kind === 'markdown' && activeTab === 'raw')) && (
                <>
                  <div className={css.codeViewer}>
                    <div className={css.lineNumbers} aria-hidden>
                      {lines.map((_, i) => (
                        <span key={i} className={css.lineNum}>{i + 1}</span>
                      ))}
                    </div>
                    <pre className={css.codeContent}>
                      <code>{data.content}</code>
                    </pre>
                  </div>
                  {data.truncated && (
                    <div className={css.truncatedNotice}>
                      文件较大，仅展示前 2MB 内容
                    </div>
                  )}
                </>
              )}

              {/* Image View */}
              {data.kind === 'image' && (
                <div className={css.imageViewer}>
                  <img
                    src={data.rawUrl}
                    alt={data.name}
                    className={css.previewImage}
                    onLoad={(e) => {
                      const img = e.currentTarget
                      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                    }}
                  />
                  {imageDimensions && (
                    <div className={css.imageMeta}>
                      {imageDimensions.width} × {imageDimensions.height} px · {fileSizeText(data.size)}
                    </div>
                  )}
                </div>
              )}

              {/* Media View (Audio / Video) */}
              {data.kind === 'media' && (
                <div className={css.mediaViewer}>
                  {data.mediaType === 'audio' ? (
                    <audio controls src={data.rawUrl} className={css.audioPlayer}>
                      您的浏览器不支持音频播放
                    </audio>
                  ) : (
                    <video controls src={data.rawUrl} className={css.videoPlayer}>
                      您的浏览器不支持视频播放
                    </video>
                  )}
                  <div className={css.imageMeta}>
                    {data.name} · {fileSizeText(data.size)}
                  </div>
                </div>
              )}

              {/* PDF View */}
              {data.kind === 'pdf' && (
                <iframe
                  src={data.rawUrl}
                  title={data.name}
                  className={css.pdfFrame}
                />
              )}

              {/* Directory Listing */}
              {data.kind === 'directory' && (
                <div className={css.dirContainer}>
                  <div className={css.dirBreadcrumb}>
                    <span
                      className={css.crumbPart}
                      onClick={() => {
                        setCurrentPath('/')
                      }}
                    >
                      /
                    </span>
                    {breadcrumbs.map(crumb => (
                      <span key={crumb.path}>
                        {' / '}
                        <span
                          className={css.crumbPart}
                          onClick={() => { setCurrentPath(crumb.path) }}
                        >
                          {crumb.name}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className={css.dirList}>
                    {data.entries.length === 0 && (
                      <div className={css.centeredState}>空目录</div>
                    )}
                    {data.entries.map(entry => (
                      <div
                        key={entry.path}
                        className={css.dirRow}
                        onClick={() => { handleDirectoryClick(entry) }}
                      >
                        <div className={css.dirRowMain}>
                          <span className={css.dirIcon}>
                            {entry.isDirectory ? '📁' : '📄'}
                          </span>
                          <span className={css.dirName}>{entry.name}</span>
                        </div>
                        {entry.size !== undefined && (
                          <span className={css.dirSize}>{fileSizeText(entry.size)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Binary fallback */}
              {data.kind === 'binary' && (
                <div className={css.binaryCard}>
                  <div className={css.binaryIcon}>📦</div>
                  <div className={css.fileName}>{data.name}</div>
                  <div className={css.binaryNotice}>
                    该文件格式不支持在浏览器中直接预览 ({fileSizeText(data.size)})
                  </div>
                  <a
                    href={`${data.rawUrl}&download=1`}
                    download={data.name}
                    className={css.btnAction}
                  >
                    下载文件
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
})
