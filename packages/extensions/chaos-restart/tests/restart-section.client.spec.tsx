// @vitest-environment jsdom
// The System settings section: capability gating, the confirmation step, the
// running-session warning, and the wait state the operator sees while the
// successor takes over.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { RestartSection } from '../src/client/RestartSection.tsx'
import type { RestartPort } from '../src/client/restart-port.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh)

afterEach(cleanup)

function makePort(over: Partial<RestartPort> = {}): RestartPort {
  return {
    status: () => Promise.resolve({ canRestart: true }),
    restart: () => Promise.resolve({ ok: true }),
    ...over,
  }
}

function renderSection(port: RestartPort, busy = 0) {
  return render(
    <RestartSection
      port={port} busySessions={() => busy} close={() => {}} t={t as never}
      useSessions={(() => undefined) as never} useWorkspaces={(() => undefined) as never}
      useSessionPendingInteraction={(() => undefined) as never}
    />,
  )
}

describe('RestartSection', () => {
  it('explains instead of offering a control when the launcher cannot restart', async () => {
    renderSection(makePort({ status: () => Promise.resolve({ canRestart: false }) }))
    expect(await screen.findByText('当前启动方式不支持自助重启。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重启' })).toBeNull()
  })

  it('requires a confirmation before touching the host', async () => {
    const restart = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderSection(makePort({ restart }))
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    expect(restart).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认重启' }))
    await waitFor(() => { expect(restart).toHaveBeenCalledTimes(1) })
  })

  it('cancelling leaves the host untouched', async () => {
    const restart = vi.fn(() => Promise.resolve({ ok: true as const }))
    renderSection(makePort({ restart }))
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(restart).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '重启' })).toBeTruthy()
  })

  it('warns about running sessions in the confirmation, and stays quiet when idle', async () => {
    const { unmount } = renderSection(makePort(), 2)
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    expect(screen.getByText('当前有 2 个会话正在运行，重启会中断它们。')).toBeTruthy()
    unmount()

    renderSection(makePort(), 0)
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    expect(screen.queryByText(/正在运行/)).toBeNull()
  })

  it('shows the wait state once the host accepted, since the process is about to exit', async () => {
    renderSection(makePort())
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重启' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('正在重启'))
  })

  it('returns to idle with the reason when the host refuses', async () => {
    renderSection(makePort({ restart: () => Promise.resolve({ ok: false, reason: 'restart not supported' }) }))
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重启' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '重启失败：restart not supported')
    expect(screen.getByRole('button', { name: '重启' })).toBeTruthy()
  })

  it('reports a thrown transport failure instead of hanging in the wait state', async () => {
    renderSection(makePort({ restart: () => Promise.reject(new Error('network down')) }))
    fireEvent.click(await screen.findByRole('button', { name: '重启' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重启' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '重启失败：network down')
  })
})
