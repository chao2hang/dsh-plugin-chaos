// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { AttachmentButton } from '../src/client/AttachmentButton.tsx'

import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Conversation face the button needs (AttachmentButton's internal contract). */
interface DraftConversation {
  createDrafts: (sessionId: string, files: readonly File[]) => readonly ComposerAttachment[]
  releaseDraftAttachments: (drafts: readonly ComposerAttachment[]) => void
  addAttachments: (sessionId: string, ids: readonly string[]) => boolean
  notify: (sessionId: string, level: 'info' | 'error', text: string) => void
}

function baseProps(overrides: { conversation?: DraftConversation } = {}) {
  return {
    useSession: (() => undefined) as never,
    useProjection: (() => undefined) as never,
    useInput: (() => undefined) as never,
    useSessions: (() => undefined) as never,
    useWorkspaces: (() => undefined) as never,
    useConversation: (() => undefined) as never,
    useChat: (() => undefined) as never,
    useTrajectory: (() => undefined) as never,
    useSessionPendingInteraction: (() => undefined) as never,
    sessionId: 's1' as never,
    input: {} as never,
    conversation: overrides.conversation ?? {
      createDrafts: vi.fn().mockReturnValue([]),
      releaseDraftAttachments: vi.fn(),
      addAttachments: vi.fn().mockReturnValue(true),
      notify: vi.fn(),
    },
    inputActions: {} as never,
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
  it('offers all three actions unconditionally', () => {
    const { container } = render(<AttachmentButton {...baseProps()} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    expect(menuItems(container).map(item => item.textContent)).toEqual(['拍照', '图片', '附件'])
  })

  it('routes a document pick through the unified attachment intake', () => {
    const conversation = {
      createDrafts: vi.fn().mockReturnValue([{ id: 'd1' } as never]),
      releaseDraftAttachments: vi.fn(),
      addAttachments: vi.fn().mockReturnValue(true),
      notify: vi.fn(),
    }
    const { container } = render(<AttachmentButton {...baseProps({ conversation })} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[2]!)
    const pdf = new File([new Uint8Array([1])], '报告.pdf', { type: 'application/pdf' })
    fireEvent.change(pickerOf(container, 'files'), { target: { files: [pdf] } })
    expect(conversation.createDrafts).toHaveBeenCalledWith('s1', [pdf])
    expect(conversation.addAttachments).toHaveBeenCalledWith('s1', ['d1'])
    expect(conversation.releaseDraftAttachments).not.toHaveBeenCalled()
    expect(conversation.notify).not.toHaveBeenCalled()
  })

  it('releases drafts when the input machine refuses the batch', () => {
    const conversation = {
      createDrafts: vi.fn().mockReturnValue([{ id: 'd2' } as never]),
      releaseDraftAttachments: vi.fn(),
      addAttachments: vi.fn().mockReturnValue(false),
      notify: vi.fn(),
    }
    const { container } = render(<AttachmentButton {...baseProps({ conversation })} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[1]!)
    fireEvent.change(pickerOf(container, 'images'), {
      target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] },
    })
    expect(conversation.releaseDraftAttachments).toHaveBeenCalledWith([{ id: 'd2' } as never])
  })

  it('notifies when draft creation rejects the batch', () => {
    const conversation = {
      createDrafts: vi.fn().mockImplementation(() => { throw new Error('unsupported') }),
      releaseDraftAttachments: vi.fn(),
      addAttachments: vi.fn().mockReturnValue(true),
      notify: vi.fn(),
    }
    const { container } = render(<AttachmentButton {...baseProps({ conversation })} />)
    fireEvent.click(container.querySelector('button[data-chaos-attachment-picker]')!)
    fireEvent.click(menuItems(container)[0]!)
    fireEvent.change(pickerOf(container, 'camera'), {
      target: { files: [new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' })] },
    })
    expect(conversation.notify).toHaveBeenCalledWith('s1', 'error', 'unsupported')
  })

  it('keeps the document picker document-only', () => {
    const { container } = render(<AttachmentButton {...baseProps()} />)
    expect(pickerOf(container, 'files').getAttribute('accept')).toBe('application/*,text/*')
    expect(pickerOf(container, 'camera').hasAttribute('capture')).toBe(true)
  })
})
