// @vitest-environment jsdom
/**
 * SurfacePresentation seam tests: default mode is inline (desktop behavior
 * unchanged), and when setSurfacePresentation switches to sheet mode with a
 * presenter, Modal/Menu delegate their content and Tooltip suppresses its
 * bubble. resetSurfacePresentation restores desktop.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives/src/Modal.tsx'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives/src/Menu.tsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives/src/Tooltip.tsx'
import {
  setSurfacePresentation,
  resetSurfacePresentation,
  type SurfacePresentation,
} from '@deepseek-ai/dsh-client-ui-primitives/src/SurfacePresentation.tsx'

const sheetPresenter = vi.fn(({ children }) => (
  <div data-testid="sheet" role="dialog" aria-label="sheet">{children}</div>
))

const sheetPresentation: SurfacePresentation = {
  mode: 'sheet',
  presentAsSheet: sheetPresenter,
}

afterEach(() => {
  cleanup()
  resetSurfacePresentation()
  sheetPresenter.mockClear()
})

describe('SurfacePresentation — default (inline)', () => {
  it('Modal renders a centered dialog with data-surface="dialog"', () => {
    render(
      <Modal open onClose={vi.fn()} title="Test" closeLabel="Close">
        <p>body</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('data-surface')).toBe('dialog')
    expect(dialog.textContent).toContain('Test')
  })

  it('Menu renders a positioned list with data-surface="menu"', () => {
    render(
      <Menu
        open
        anchor={<button>trigger</button>}
        items={[{ id: 'a', label: 'Option A' }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('data-surface')).toBe('menu')
  })

  it('Tooltip renders a bubble on focus (inline mode)', () => {
    render(
      <Tooltip label="hint" side="bottom">
        <button>anchor</button>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByText('anchor'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
})

describe('SurfacePresentation — sheet mode', () => {
  it('Modal delegates content to the sheet presenter', () => {
    setSurfacePresentation(sheetPresentation)
    render(
      <Modal open onClose={vi.fn()} title="Sheet Title" closeLabel="Close">
        <p>sheet body</p>
      </Modal>,
    )
    expect(sheetPresenter).toHaveBeenCalledTimes(1)
    const call = sheetPresenter.mock.calls[0]![0]
    expect(call.surface).toBe('dialog')
    expect(call.title).toBe('Sheet Title')
  })

  it('leaves Escape ownership to the sheet presenter for Modal and Menu', () => {
    const onClose = vi.fn()
    setSurfacePresentation({
      mode: 'sheet',
      presentAsSheet: ({ children, onClose: presenterClose }) => (
        <div role="dialog" onKeyDown={(event) => { if (event.key === 'Escape') presenterClose() }}>{children}</div>
      ),
    })
    const { rerender } = render(<Modal open onClose={onClose} title="Sheet" closeLabel="Close">body</Modal>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    onClose.mockClear()
    rerender(<Menu open anchor={<button>trigger</button>} items={[{ id: 'a', label: 'Option A' }]} onSelect={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Menu delegates items to the sheet presenter', () => {
    setSurfacePresentation(sheetPresentation)
    render(
      <Menu
        open
        anchor={<button>trigger</button>}
        items={[{ id: 'a', label: 'Option A' }]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(sheetPresenter).toHaveBeenCalledTimes(1)
    const call = sheetPresenter.mock.calls[0]![0]
    expect(call.surface).toBe('menu')
  })

  it('navigates a nested menu inside the sheet and selects its item', () => {
    setSurfacePresentation({
      mode: 'sheet',
      presentAsSheet: ({ children }) => <div role="dialog">{children}</div>,
    })
    const onSelect = vi.fn()
    render(
      <Menu
        open
        anchor={<button>trigger</button>}
        items={[{ id: 'parent', label: 'Parent', submenu: [{ id: 'child', label: 'Child' }] }]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Parent' }))
    expect(screen.getByRole('menuitem', { name: 'Child' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Child' }))
    expect(onSelect).toHaveBeenCalledWith('child')
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByRole('menuitem', { name: 'Parent' })).toBeTruthy()
  })

  it('selects an item from the portaled sheet before outside-click dismissal', () => {
    setSurfacePresentation({
      mode: 'sheet',
      presentAsSheet: ({ children }) => <div role="dialog">{children}</div>,
    })
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <Menu
        open
        anchor={<button>trigger</button>}
        items={[{ id: 'archive', label: 'Archive session' }]}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )
    const item = screen.getByRole('menuitem', { name: 'Archive session' })
    fireEvent.pointerDown(item)
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledWith('archive')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Tooltip suppresses its bubble in sheet mode', () => {
    setSurfacePresentation(sheetPresentation)
    render(
      <Tooltip label="hint" side="bottom">
        <button>anchor</button>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByText('anchor'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('falls back to inline when mode is sheet but no presenter is injected', () => {
    setSurfacePresentation({ mode: 'sheet' })
    render(
      <Modal open onClose={vi.fn()} title="Fallback" closeLabel="Close">
        <p>body</p>
      </Modal>,
    )
    // No sheet presenter: Modal renders its inline dialog.
    expect(screen.getByRole('dialog').getAttribute('data-surface')).toBe('dialog')
  })

  it('resetSurfacePresentation restores inline behavior after sheet mode', () => {
    setSurfacePresentation(sheetPresentation)
    resetSurfacePresentation()
    render(
      <Tooltip label="hint" side="bottom">
        <button>anchor</button>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByText('anchor'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
})
