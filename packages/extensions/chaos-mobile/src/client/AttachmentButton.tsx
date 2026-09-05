import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AttachmentButton.module.css'

interface DraftConversation {
  createDrafts(sessionId: string, files: readonly File[]): readonly ComposerAttachment[]
  releaseDraftAttachments(attachments: readonly ComposerAttachment[]): void
  addAttachments(sessionId: string, ids: readonly string[]): boolean
  notify(sessionId: string, level: 'info' | 'error', text: string): void
}

type AttachmentPickerProps = PropsRuntime<'conversation.input.left'> & {
  conversation: DraftConversation
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
 * menu — camera capture, image library, and document upload. Every pick
 * enters the conversation's unified attachment intake (images ride the image
 * rail, other files the background upload queue with file cards); the
 * document action keeps its document-only accept so mobile browsers open
 * the file picker instead of the camera/gallery sheet.
 */
export function AttachmentButton(
  { conversation, sessionId }: AttachmentPickerProps,
): ReactNode {
  const root = useRef<HTMLDivElement | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const images = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

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

  /** Route one browser-picked batch through the unified attachment intake. */
  const addFiles = (picked: readonly File[]): void => {
    if (picked.length === 0) return
    try {
      const drafts = conversation.createDrafts(String(sessionId), picked)
      if (!conversation.addAttachments(String(sessionId), drafts.map(draft => draft.id))) {
        conversation.releaseDraftAttachments(drafts)
      }
    } catch (error: unknown) {
      conversation.notify(String(sessionId), 'error', error instanceof Error ? error.message : String(error))
    }
  }

  /** Shared change handler: reset the input value and route the batch. */
  const selectFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    addFiles(picked)
  }

  const openPicker = (action: AttachmentAction): void => {
    setMenuOpen(false)
    const target = action === 'camera' ? camera : action === 'images' ? images : files
    target.current?.click()
  }

  return (
    <div ref={root} className={css.root}>
      <input ref={camera} className={css.picker} type="file" accept="image/*" capture="environment" onChange={selectFiles} />
      <input ref={images} className={css.picker} type="file" accept="image/*" multiple onChange={selectFiles} />
      {/* Document-only accept: without it several mobile browsers route a bare
          file input to the camera/gallery sheet instead of the file picker. */}
      <input ref={files} className={css.picker} type="file" accept="application/*,text/*" multiple onChange={selectFiles} />
      <button
        type="button"
        className={css.button}
        data-chaos-attachment-picker
        aria-label="添加附件"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => { setMenuOpen(open => !open) }}
      >
        <IconPaperclipOutline16 size={18} />
      </button>
      {menuOpen && (
        <div className={css.menu} role="menu" aria-label="选择附件类型">
          {(Object.keys(ACTION_LABELS) as AttachmentAction[]).map(action => (
            <button
              key={action}
              type="button"
              className={css.menuItem}
              role="menuitem"
              onClick={() => { openPicker(action) }}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
