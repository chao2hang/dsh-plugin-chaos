import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChaosUploadClientFace } from '@deepseek-ai/dsh-plugin-chaos-upload/client'
import { IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AttachmentButton.module.css'

interface DraftImageConversation {
  createDraftImages(files: readonly File[]): readonly ComposerAttachment[]
  releaseDraftImages(attachments: readonly ComposerAttachment[]): void
}

type AttachmentPickerProps = PropsRuntime<'conversation.input.left'> & {
  conversation: DraftImageConversation
  upload: () => ChaosUploadClientFace | undefined
  unsupportedImageNotice: string
  notifyInput: (level: 'info' | 'error', text: string) => void
}

/** One chooser action: its visible label and the hidden input it drives. */
type AttachmentAction = 'camera' | 'images' | 'files'

/** Fixed chooser labels (Chinese-first surface, matching this plugin's copy). */
const ACTION_LABELS: Readonly<Record<AttachmentAction, string>> = {
  camera: '拍照',
  images: '图片',
  files: '附件',
}

/**
 * Mobile attachment chooser: the composer's paperclip opens a three-action
 * menu — camera capture, image library, and document upload. Images join the
 * draft-image rail through the scoped conversation service; every other file
 * is stored in the session workspace through `chaosUpload`, which also appends
 * the `@path` mention to the draft.
 */
export function AttachmentButton(
  { conversation, sessionId, inputActions, upload, unsupportedImageNotice, notifyInput }: AttachmentPickerProps,
): ReactNode {
  const root = useRef<HTMLDivElement | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const images = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Resolved per render: a late-loading chaos-upload becomes visible the
  // next time this component re-renders (opening the menu is one such tick).
  const actions: readonly AttachmentAction[] = upload() === undefined
    ? ['camera', 'images']
    : ['camera', 'images', 'files']

  // Close the chooser on outside pointer or Escape; the menu is anchored to
  // the button, so the capture-phase listener checks containment by node.
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  /** Route one browser-picked image batch into the draft-image rail. */
  const addImages = (picked: readonly File[]): void => {
    if (picked.length === 0) return
    try {
      const created = conversation.createDraftImages(picked)
      if (!inputActions.addImages(created.map(image => image.id))) conversation.releaseDraftImages(created)
    } catch {
      notifyInput('error', unsupportedImageNotice)
    }
  }

  /** Route one browser-picked batch: images to the rail, others to the workspace. */
  const addAttachments = async (picked: readonly File[]): Promise<void> => {
    addImages(picked.filter(file => file.type.startsWith('image/')))
    const documents = picked.filter(file => !file.type.startsWith('image/'))
    if (documents.length === 0) return
    const face = upload()
    if (face === undefined) {
      notifyInput('error', '附件上传未启用：chaos-upload 插件未加载。')
      return
    }
    setBusy(true)
    try {
      for (const file of documents) {
        try {
          const { upload: stored, mentioned } = await face.uploadAndMention(sessionId, file)
          if (!mentioned) {
            notifyInput('info', `已上传 ${stored.relative}，请手动输入 @${stored.relative} 引用。`)
          }
        } catch (error) {
          notifyInput('error', error instanceof Error ? error.message : String(error))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  /** Shared change handler: reset the input value and route by action. */
  const selectFiles = (action: AttachmentAction) => (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (action === 'files') {
      void addAttachments(picked)
    } else {
      addImages(picked)
    }
  }

  const openPicker = (action: AttachmentAction): void => {
    setMenuOpen(false)
    if (busy) return
    const target = action === 'camera' ? camera : action === 'images' ? images : files
    target.current?.click()
  }

  return (
    <div ref={root} className={css.root}>
      <input ref={camera} className={css.picker} type="file" accept="image/*" capture="environment" onChange={selectFiles('camera')} />
      <input ref={images} className={css.picker} type="file" accept="image/*" multiple onChange={selectFiles('images')} />
      {/* Document-only accept: without it several mobile browsers route a bare
          file input to the camera/gallery sheet instead of the file picker. */}
      <input ref={files} className={css.picker} type="file" accept="application/*,text/*" multiple onChange={selectFiles('files')} />
      <button
        type="button"
        className={css.button}
        data-chaos-attachment-picker
        aria-label="添加附件"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => { setMenuOpen(open => !open) }}
      >
        <IconPaperclipOutline16 size={18} />
      </button>
      {menuOpen && (
        <div className={css.menu} role="menu" aria-label="选择附件类型">
          {actions.map(action => (
            <button
              key={action}
              type="button"
              className={css.menuItem}
              role="menuitem"
              disabled={busy}
              onClick={() => { openPicker(action) }}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
      {busy && <span className={css.busy} role="status">上传中…</span>}
    </div>
  )
}
