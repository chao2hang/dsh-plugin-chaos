// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { AttachmentButton } from '../src/client/AttachmentButton.tsx'

describe('mobile attachment picker', () => {
  it('notifies the user when image decoding rejects a selected file', () => {
    const notifyInputError = vi.fn()
    const { container } = render(
      <AttachmentButton
        sessionId={'s1' as never}
        useSession={(() => undefined) as never}
        useProjection={(() => undefined) as never}
        useInput={(() => undefined) as never}
        useSessions={(() => undefined) as never}
        useWorkspaces={(() => undefined) as never}
        useConversation={(() => undefined) as never}
        useChat={(() => undefined) as never}
        useTrajectory={(() => undefined) as never}
        useSessionPendingInteraction={(() => undefined) as never}
        conversation={{ createDraftImages: () => { throw new Error('unsupported') }, releaseDraftImages: vi.fn() }}
        inputActions={{ addImages: vi.fn() } as never}
        unsupportedImageNotice="仅支持 PNG、JPEG、WebP 和 GIF 图片。"
        notifyInputError={notifyInputError}
      />,
    )
    const picker = container.querySelector<HTMLInputElement>('input[type=file]')!
    const file = new File(['not an image'], 'image.svg', { type: 'image/svg+xml' })
    fireEvent.change(picker, { target: { files: [file] } })
    expect(notifyInputError).toHaveBeenCalledWith('仅支持 PNG、JPEG、WebP 和 GIF 图片。')
  })
})
