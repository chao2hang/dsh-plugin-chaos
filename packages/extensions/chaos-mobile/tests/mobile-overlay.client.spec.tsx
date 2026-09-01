// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { resetSurfacePresentation } from '@deepseek-ai/dsh-client-ui-primitives'
import { apply, inject } from '../src/client/index.ts'
import { MobileOverlay, type MobileOverlayInjected } from '../src/client/MobileOverlay.tsx'
import { MOBILE_BREAKPOINT } from '../src/client/columns.ts'

afterEach(() => {
  cleanup()
  resetSurfacePresentation()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
})

function setMobileViewport(): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: MOBILE_BREAKPOINT - 1 })
}

function useSessions<S>(select: (state: SessionListState) => S): S {
  return select({
    current: undefined,
    ids: [],
    byId: {},
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  })
}

describe('MobileOverlay', () => {
  it('renders a nav bar with menu and overflow buttons on mobile', () => {
    setMobileViewport()
    const toggleSidebar = vi.fn()
    const closeDetails = vi.fn()

    render(<MobileOverlay toggleSidebar={toggleSidebar} closeDetails={closeDetails} useSessions={useSessions} />)

    // Menu toggle button is visible by default (details closed).
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy()
    // Back button exists but is hidden via CSS (data-chaos-back).
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    // Overflow button.
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()
  })

  it('shows the selected session title in the nav bar', () => {
    setMobileViewport()
    function useSelectedSession<S>(select: (state: SessionListState) => S): S {
      return select({
        current: 'session-1' as never,
        ids: ['session-1' as never],
        byId: {
          'session-1': {
            id: 'session-1' as never,
            displayTitle: '重构 Chaos 手机端样式与交互',
            running: false,
            blank: false,
            updatedAt: 1,
          },
        },
        phase: 'ready',
        subagentsByParent: {},
        jobsBySession: {},
        currentAddress: undefined,
      })
    }

    render(
      <MobileOverlay
        toggleSidebar={vi.fn()}
        closeDetails={vi.fn()}
        useSessions={useSelectedSession}
      />,
    )

    expect(screen.getByText('重构 Chaos 手机端样式与交互')).toBeTruthy()
  })

  it('menu toggle and backdrop route to injected actions', () => {
    setMobileViewport()
    const toggleSidebar = vi.fn()
    const closeDetails = vi.fn()

    render(<MobileOverlay toggleSidebar={toggleSidebar} closeDetails={closeDetails} useSessions={useSessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(document.querySelector('[data-chaos-drawer-backdrop]')!)

    expect(toggleSidebar).toHaveBeenCalledTimes(2)
  })

  it('closes an open drawer after a left swipe', () => {
    setMobileViewport()
    const toggleSidebar = vi.fn()
    render(<MobileOverlay toggleSidebar={toggleSidebar} closeDetails={vi.fn()} useSessions={useSessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.touchStart(document, { touches: [{ clientX: 260, clientY: 20 }] })
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 100, clientY: 20 }] })
    expect(toggleSidebar).toHaveBeenCalledTimes(2)
  })

  it('dispatches the mobile tools event from the existing overflow sheet', () => {
    setMobileViewport()
    const openTools = vi.fn()
    document.addEventListener('dsh-better-sidebar:open-mobile-tools', openTools)

    render(<MobileOverlay toggleSidebar={vi.fn()} closeDetails={vi.fn()} useSessions={useSessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /打开工具面板/ }))

    expect(openTools).toHaveBeenCalledTimes(1)
    document.removeEventListener('dsh-better-sidebar:open-mobile-tools', openTools)
  })

  it('removes the owned details history entry after an ordinary close', async () => {
    setMobileViewport()
    const frame = document.createElement('div')
    frame.dataset.shellFrame = ''
    frame.dataset.detailsCollapsed = ''
    document.body.appendChild(frame)
    const closeDetails = vi.fn()
    const pushSpy = vi.spyOn(history, 'pushState')
    const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { unmount } = render(<MobileOverlay toggleSidebar={vi.fn()} closeDetails={closeDetails} useSessions={useSessions} />)

    frame.removeAttribute('data-details-collapsed')
    await waitFor(() => { expect(pushSpy).toHaveBeenCalledTimes(1) })
    frame.dataset.detailsCollapsed = ''
    await waitFor(() => { expect(backSpy).toHaveBeenCalledTimes(1) })
    fireEvent.popState(window)
    expect(closeDetails).toHaveBeenCalledTimes(1)
    unmount()
    expect(backSpy).toHaveBeenCalledTimes(1)
    pushSpy.mockRestore()
    backSpy.mockRestore()
    frame.remove()
  })

  it('back button calls history.back() for system back-button support', () => {
    setMobileViewport()
    const toggleSidebar = vi.fn()
    const closeDetails = vi.fn()
    const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {})

    render(<MobileOverlay toggleSidebar={toggleSidebar} closeDetails={closeDetails} useSessions={useSessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(backSpy).toHaveBeenCalledTimes(1)
    backSpy.mockRestore()
  })

  it('uses the mobile navigation back button to close settings', async () => {
    setMobileViewport()
    const close = vi.fn()
    const settings = document.createElement('button')
    settings.dataset.settingsOverlay = ''
    settings.dataset.settingsPageClose = ''
    settings.addEventListener('click', close)
    document.body.appendChild(settings)

    render(<MobileOverlay toggleSidebar={vi.fn()} closeDetails={vi.fn()} useSessions={useSessions} />)

    await screen.findByText('设置')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(close).toHaveBeenCalledTimes(1)
    settings.remove()
  })

  it('shows the formatted statistics in the overflow sheet without a visibility toggle', () => {
    setMobileViewport()
    const stats = document.createElement('div')
    stats.dataset.statsLine = ''
    stats.textContent = '2 轮 · 4 步 | 输入 1.2K · 输出 800'
    document.body.appendChild(stats)

    render(<MobileOverlay toggleSidebar={vi.fn()} closeDetails={vi.fn()} useSessions={useSessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const summary = screen.getByRole('region', { name: '会话统计' })
    expect(screen.getByRole('heading', { name: '会话统计' })).toBeTruthy()
    expect(summary.textContent).toContain('2 轮 · 4 步 | 输入 1.2K · 输出 800')
    expect(screen.queryByText(/底部统计/)).toBeNull()
    stats.remove()
  })

  it('renders nothing on desktop viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    const { container } = render(<MobileOverlay toggleSidebar={vi.fn()} closeDetails={vi.fn()} useSessions={useSessions} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('chaos-mobile client composition', () => {
  it('declares layout and passes its actions into the shell overlay', () => {
    expect(inject).toEqual(['slots', 'conversation', 'layout', 'uiWorkspace'])

    const toggleSidebar = vi.fn()
    const closeDetails = vi.fn()
    const registrations: Array<{ name: string; inject?: () => MobileOverlayInjected }> = []
    const disposers: Array<() => void> = []
    const context = {
      get: (name: string) => name === 'uiWorkspace' ? { startSession: vi.fn() } : undefined,
      effect: (effect: () => () => void) => { disposers.push(effect()) },
      slots: {
        inject: (_name: string, install: () => void) => { install() },
        register: (entry: { name: string; inject?: () => MobileOverlayInjected }) => {
          registrations.push(entry)
          return () => {}
        },
      },
      layout: { toggleSidebar, openDetails: vi.fn(), closeDetails },
      conversation: {},
    } as unknown as ClientContext

    apply(context)

    const overlay = registrations.find(({ name }) => name === 'shell.overlay')
    const actions = overlay?.inject?.()
    actions?.toggleSidebar()
    actions?.closeDetails()

    expect(actions).toBeDefined()
    expect(toggleSidebar).toHaveBeenCalledTimes(1)
    expect(closeDetails).toHaveBeenCalledTimes(1)

    for (const dispose of disposers) dispose()
  })
})
