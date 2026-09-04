// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { AttachmentButton } from '../src/client/AttachmentButton.tsx'
import type { ChaosUploadClientFace } from '@deepseek-ai/dsh-plugin-chaos-upload/client'
import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Notice callback shape the button consumes. */
type NotifyInput = (level: 'info' | 'error', text: string) => void

/** Conversation face the button needs (AttachmentButton's internal contract). */
interface DraftConversation {
  createDraftImages: (files: readonly File[]) => readonly ComposerAttachment[]
  releaseDraftImages: (attachments: readonly ComposerAttachment[]) => void
}

function baseProps(overrides: {
  upload?: () => ChaosUploadClientFace | undefined
  conversation?: DraftConversation
  notifyInput?: NotifyInput
} = {}) {
  return {
    sessionId: 's1' as never,
    useSession: (() => undefined) as never,
    useProjection: (() => undefined) as never,
    useInput: (() => undefined) as never,
    useSessions: (() => undefined) as never,
    useWorkspaces: (() => undefined) as never,
    useConversation: (() => undefined) as never,
    useChat: (() => undefined) as never,
    useTrajectory: (() => undefined) as never,
    useSessionPendingInteraction: (() => undefined) as never,
    session: { sessionId: 's1' } as never,
    input: {} as never,
    conversation: overrides.conversation
      ?? { createDraftImages: () => { throw new Error('unsupported') }, releaseDraftImages: vi.fn() },
    inputActions: { addImages: vi.fn() } as never,
    upload: overrides.upload ?? (() => undefined),
    unsupportedImageNotice: '仅支持 PNG、JPEG、WebP 和 GIF 图片。',
    notifyInput: overrides.notifyInput ?? vi.fn<NotifyInput>(),
  }
}

function menuItems(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role=menuitem]')]
}

function pickerOf(container: HTMLElement, action: 'camera' | 'images' | 'files'): HTMLInputElement {
  const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type=file]')]
  const byAccept = action === 'camera' ? inputs.find(i => i.hasAttribute('capture'))
    : action === 'images' ? inputs.find(i => !i.hasAttribute('capture') && i.multiple)
      : inputs.find(i => !i.hasAttribute('capture') && !i.accept.includes('image'))
  if (byAccept === undefined) throw new Error(`picker ${action} not found`)
  return byAccept
}

describe('mobile attachment chooser', () => {
  it('offers camera and images without the document action when chaos-upload is absent', () => {
    const { container } = render(<AttachmentButton {...baseProps()} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    expect(menuItems(container).map(item => item.textContent)).toEqual(['拍照', '图片'])
  })

  it('offers the document action when chaos-upload is available', () => {
    const { container } = render(<AttachmentButton {...baseProps({
      upload: () => ({}) as ChaosUploadClientFace,
    })} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    expect(menuItems(container).map(item => item.textContent)).toEqual(['拍照', '图片', '附件'])
    // A document-only accept keeps mobile browsers from routing the picker
    // to the camera/gallery sheet.
    expect(pickerOf(container, 'files').getAttribute('accept')).toBe('application/*,text/*')
  })

  it('notifies the user when image decoding rejects a selected file', () => {
    const notifyInput = vi.fn()
    const { container } = render(<AttachmentButton {...baseProps({ notifyInput })} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[1]!)
    fireEvent.change(pickerOf(container, 'images'), { target: { files: [new File(['x'], 'image.svg', { type: 'image/svg+xml' })] } })
    expect(notifyInput).toHaveBeenCalledWith('error', '仅支持 PNG、JPEG、WebP 和 GIF 图片。')
  })

  it('routes a non-image pick through chaos-upload and inserts its mention', async () => {
    const notifyInput = vi.fn()
    const uploadAndMention = vi.fn().mockResolvedValue({
      upload: { relative: 'uploads/报告.pdf', bytes: 4 },
      mentioned: true,
    })
    const { container } = render(
      <AttachmentButton {...baseProps({
        upload: () => ({ uploadAndMention }) as unknown as ChaosUploadClientFace,
        conversation: { createDraftImages: vi.fn().mockReturnValue([]), releaseDraftImages: vi.fn() },
        notifyInput,
      })} />,
    )
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[2]!)
    const image = new File([new Uint8Array([1])], 'pic.png', { type: 'image/png' })
    const document = new File([new Uint8Array([1, 2, 3, 4])], '报告.pdf', { type: 'application/pdf' })
    fireEvent.change(pickerOf(container, 'files'), { target: { files: [image, document] } })
    await vi.waitFor(() => { expect(uploadAndMention).toHaveBeenCalledTimes(1) })
    expect(uploadAndMention).toHaveBeenCalledWith('s1', document)
    expect(notifyInput).not.toHaveBeenCalled()
  })

  it('notifies the manual reference when the draft insertion is refused', async () => {
    const notifyInput = vi.fn()
    const uploadAndMention = vi.fn().mockResolvedValue({
      upload: { relative: 'uploads/报告.pdf', bytes: 4 },
      mentioned: false,
    })
    const { container } = render(
      <AttachmentButton {...baseProps({
        upload: () => ({ uploadAndMention }) as unknown as ChaosUploadClientFace,
        conversation: { createDraftImages: vi.fn().mockReturnValue([]), releaseDraftImages: vi.fn() },
        notifyInput,
      })} />,
    )
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[2]!)
    fireEvent.change(pickerOf(container, 'files'), {
      target: { files: [new File([new Uint8Array([1])], '报告.pdf', { type: 'application/pdf' })] },
    })
    await vi.waitFor(() => {
      expect(notifyInput).toHaveBeenCalledWith(
        'info', '已上传 uploads/报告.pdf，请手动输入 @uploads/报告.pdf 引用。',
      )
    })
  })

  it('keeps the document option working when the picked file is an image only', async () => {
    const uploadAndMention = vi.fn()
    const createDraftImages = vi.fn().mockReturnValue([])
    const { container } = render(
      <AttachmentButton {...baseProps({
        upload: () => ({ uploadAndMention }) as unknown as ChaosUploadClientFace,
        conversation: { createDraftImages, releaseDraftImages: vi.fn() },
      })} />,
    )
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[2]!)
    fireEvent.change(pickerOf(container, 'files'), {
      target: { files: [new File([new Uint8Array([1])], 'pic.png', { type: 'image/png' })] },
    })
    await vi.waitFor(() => { expect(createDraftImages).toHaveBeenCalledTimes(1) })
    expect(uploadAndMention).not.toHaveBeenCalled()
  })
})
