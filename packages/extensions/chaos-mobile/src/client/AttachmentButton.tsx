import { useRef, type ChangeEvent, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AttachmentButton.module.css'

interface DraftImageConversation {
  createDraftImages(files: readonly File[]): readonly ComposerAttachment[]
  releaseDraftImages(attachments: readonly ComposerAttachment[]): void
}

type AttachmentPickerProps = PropsRuntime<'conversation.input.left'> & {
  conversation: DraftImageConversation
  unsupportedImageNotice: string
  notifyInputError: (text: string) => void
}

/** Mobile file-picker that creates draft images through the scoped conversation service. */
export function AttachmentButton(
  { conversation, inputActions, unsupportedImageNotice, notifyInputError }: AttachmentPickerProps,
): ReactNode {
  const picker = useRef<HTMLInputElement>(null)
  const selectFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (files.length === 0) return
    try {
      const images = conversation.createDraftImages(files)
      if (!inputActions.addImages(images.map(image => image.id))) conversation.releaseDraftImages(images)
    } catch {
      notifyInputError(unsupportedImageNotice)
    }
  }
  return (
    <>
      <input ref={picker} className={css.picker} type="file" accept="image/*" multiple onChange={selectFiles} />
      <button type="button" className={css.button} data-chaos-attachment-picker aria-label="上传图片附件" onClick={() => { picker.current?.click() }}>
        <IconPaperclipOutline16 size={18} />
      </button>
    </>
  )
}
