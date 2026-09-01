// @vitest-environment jsdom
// RetryDock behavior: the docked strip above the composer — terminal-state
// label, failure detail, and a retry click that resends through the public
// input actions in order (setDraft, then submit).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { AbnormalEndInput } from '../src/client/retry-model.ts'
import { RetryDock, RetryStrip } from '../src/client/RetryDock.tsx'
import type { RetryKey } from '../src/client/locales.ts'
import { zh } from '../src/client/locales.ts'
import { SID, chatNode, makeSession } from './session-fixtures.client.ts'

// The framework-injected t seat, stubbed over the zh dictionary (the default locale).
const t: (key: RetryKey) => string = makeTranslate(zh, commonZh)

afterEach(cleanup)

function makeInputActions() {
  return {
    setDraft: vi.fn(),
    submit: vi.fn(),
  }
}

/** Selector-seat stub: answers one selector over `value` and erases the hook type. */
function seatOf<T>(value: T) {
  return ((selector: (snapshot: T) => unknown) => selector(value)) as never
}

// Framework seats: the dock reads the standard seats, not owner props.
function dockProps(fixture: AbnormalEndInput, inputActions: ReturnType<typeof makeInputActions>) {
  const chat = fixture.chat as ChatSnapshot
  const pendingMap = new Map<SessionId, SessionPendingInteraction>()
  if (fixture.pendingInteraction !== undefined) pendingMap.set(SID, fixture.pendingInteraction)
  return {
    sessionId: SID,
    session: fixture.session,
    input: {} as never,
    inputActions: inputActions as never,
    t: t as never,
    useSession: seatOf(fixture.session),
    useChat: seatOf(chat),
    useSessionPendingInteraction: seatOf(pendingMap),
    useConversation: (() => undefined) as never,
    useProjection: (() => undefined) as never,
    useInput: (() => undefined) as never,
    useSessions: (() => undefined) as never,
    useWorkspaces: (() => undefined) as never,
    useTrajectory: (() => undefined) as never,
  }
}

describe('RetryStrip', () => {
  it('labels the terminal state and shows the failure detail', () => {
    render(<RetryStrip end={{ kind: 'error', message: 'provider overloaded' }} onRetry={() => {}} t={t} />)
    expect(screen.getByText('对话异常结束')).toBeTruthy()
    expect(screen.getByText('provider overloaded')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新发送上一条消息' })).toBeTruthy()
  })

  it('switches the label per ending kind and omits the absent detail', () => {
    render(<RetryStrip end={{ kind: 'interrupted' }} onRetry={() => {}} t={t} />)
    expect(screen.getByText('对话已中断')).toBeTruthy()
    expect(screen.queryByText('provider overloaded')).toBeNull()
  })
})

describe('RetryDock', () => {
  it('renders nothing for a normal ending', () => {
    const { container } = render(
      <RetryDock {...dockProps(makeSession({ chatNodes: [] }), makeInputActions())} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('the retry click writes the last user text and submits, in order', () => {
    const inputActions = makeInputActions()
    render(<RetryDock {...dockProps(makeSession(), inputActions)} />)
    fireEvent.click(screen.getByRole('button', { name: '重新发送上一条消息' }))
    expect(inputActions.setDraft).toHaveBeenCalledWith('帮我看看这个报错')
    expect(inputActions.submit).toHaveBeenCalledTimes(1)
    const [draftCall, submitCall] = [
      inputActions.setDraft.mock.invocationCallOrder[0] as number,
      inputActions.submit.mock.invocationCallOrder[0] as number,
    ]
    expect(draftCall).toBeLessThan(submitCall)
  })

  // The whole point of the crash-recovery node: after a restart the strip must
  // appear even though the killed turn streamed nothing.
  it('offers the retry after a restart cut the turn short with no streamed content', () => {
    const inputActions = makeInputActions()
    render(<RetryDock {...dockProps(makeSession({
      chatNodes: [chatNode('turn-interrupted', { turn: 1, seq: 10, time: 10 })],
    }), inputActions)} />)
    expect(screen.getByText('服务重启，回合被中断')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新发送上一条消息' }))
    expect(inputActions.setDraft).toHaveBeenCalledWith('帮我看看这个报错')
  })
})
