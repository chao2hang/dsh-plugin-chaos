// @vitest-environment jsdom
/**
 * MobileSheet behavior tests: detent rendering, drag-to-dismiss threshold,
 * focus trap, Escape close, backdrop close, scroll lock, reduced-motion.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MobileSheet } from '../src/client/MobileSheet.tsx'

afterEach(() => {
  cleanup()
  // Reset body scroll lock
  document.body.style.overflow = ''
  // Reset pointer capture stubs
  delete (Element.prototype as Partial<Element>).setPointerCapture
  delete (Element.prototype as Partial<Element>).releasePointerCapture
  delete (Element.prototype as Partial<Element>).hasPointerCapture
})

function setupPointerCapture(): void {
  const captured = new WeakSet<Element>()
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
}

describe('MobileSheet — rendering', () => {
  it('renders a dialog with the grabber and body', () => {
    render(<MobileSheet onClose={vi.fn()}>sheet content</MobileSheet>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('data-detent')).toBe('medium')
    expect(dialog.textContent).toContain('sheet content')
  })

  it('renders the large detent when specified', () => {
    render(<MobileSheet onClose={vi.fn()} detent="large">content</MobileSheet>)
    expect(screen.getByRole('dialog').getAttribute('data-detent')).toBe('large')
  })

  it('uses the title as aria-label', () => {
    render(<MobileSheet onClose={vi.fn()} title="Settings">content</MobileSheet>)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Settings')
  })
})

describe('MobileSheet — close interactions', () => {
  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<MobileSheet onClose={onClose}>content</MobileSheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    const { container } = render(<MobileSheet onClose={onClose}>content</MobileSheet>)
    // The backdrop is the first child of the root (before the sheet)
    const root = container.ownerDocument.body.querySelector('[role="presentation"]')!
    const backdrop = root.querySelector('[aria-hidden="true"]')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('MobileSheet — drag-to-dismiss', () => {
  it('dismisses when dragged past the threshold', () => {
    setupPointerCapture()
    const onClose = vi.fn()
    render(<MobileSheet onClose={onClose}>content</MobileSheet>)
    const grabber = screen.getByRole('button', { name: 'Adjust sheet size' })

    // Start drag at y=100, move to y=250 (150px down, past 120px threshold)
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100, bubbles: true })
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 250, bubbles: true })
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 250, bubbles: true })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('snaps back when dragged below the threshold', () => {
    setupPointerCapture()
    const onClose = vi.fn()
    render(<MobileSheet onClose={onClose}>content</MobileSheet>)
    const grabber = screen.getByRole('button', { name: 'Adjust sheet size' })
    const sheet = screen.getByRole('dialog')

    // Start drag at y=100, move to y=150 (50px down, below 120px threshold)
    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100, bubbles: true })
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 150, bubbles: true })
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 150, bubbles: true })

    expect(onClose).not.toHaveBeenCalled()
    // Sheet snaps back to translateY(0)
    expect(sheet.style.transform).toBe('translateY(0px)')
  })

  it('expands a medium sheet on an upward handle drag', () => {
    setupPointerCapture()
    render(<MobileSheet onClose={vi.fn()}>content</MobileSheet>)
    const grabber = screen.getByRole('button', { name: 'Adjust sheet size' })

    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 220, bubbles: true })
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 120, bubbles: true })
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 120, bubbles: true })

    expect(screen.getByRole('dialog').getAttribute('data-detent')).toBe('large')
  })

  it('collapses a large sheet before it dismisses', () => {
    setupPointerCapture()
    const onClose = vi.fn()
    render(<MobileSheet onClose={onClose} detent="large">content</MobileSheet>)
    const grabber = screen.getByRole('button', { name: 'Adjust sheet size' })

    fireEvent.pointerDown(grabber, { pointerId: 1, clientY: 100, bubbles: true })
    fireEvent.pointerMove(grabber, { pointerId: 1, clientY: 250, bubbles: true })
    fireEvent.pointerUp(grabber, { pointerId: 1, clientY: 250, bubbles: true })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').getAttribute('data-detent')).toBe('medium')
  })

  it('does not start dragging from the body (only from the grabber)', () => {
    setupPointerCapture()
    const onClose = vi.fn()
    render(<MobileSheet onClose={onClose}>body content</MobileSheet>)
    const body = document.querySelector('[class*="body"]') as HTMLElement

    fireEvent.pointerDown(body, { pointerId: 1, clientY: 100, bubbles: true })
    fireEvent.pointerMove(body, { pointerId: 1, clientY: 300, bubbles: true })
    fireEvent.pointerUp(body, { pointerId: 1, clientY: 300, bubbles: true })

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('MobileSheet — focus trap', () => {
  it('locks body scroll while open', () => {
    render(<MobileSheet onClose={vi.fn()}>content</MobileSheet>)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body scroll on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<MobileSheet onClose={vi.fn()}>content</MobileSheet>)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('moves focus into the sheet on mount', () => {
    render(<MobileSheet onClose={vi.fn()}>content</MobileSheet>)
    const sheet = screen.getByRole('dialog')
    expect(document.activeElement).toBe(sheet)
  })

  it('keeps an edited input focused when its owner rerenders', () => {
    function EditableSheet(): ReactNode {
      const [value, setValue] = useState('')
      return <MobileSheet onClose={() => {}}><input aria-label="Editable" value={value} onChange={(event) => { setValue(event.target.value) }} /></MobileSheet>
    }
    render(<EditableSheet />)
    const input = screen.getByRole('textbox', { name: 'Editable' })
    input.focus()
    fireEvent.change(input, { target: { value: '1' } })
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('value')).toBe('1')
  })

  it('traps Tab within the sheet (wraps from last to first)', () => {
    render(
      <MobileSheet onClose={vi.fn()}>
        <button>First</button>
        <button>Second</button>
      </MobileSheet>,
    )
    const buttons = screen.getAllByRole('button')
    const last = buttons[buttons.length - 1]!
    last.focus()
    expect(document.activeElement).toBe(last)

    // Tab from last should wrap to first
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('traps Shift+Tab within the sheet (wraps from first to last)', () => {
    render(
      <MobileSheet onClose={vi.fn()}>
        <button>First</button>
        <button>Second</button>
      </MobileSheet>,
    )
    const buttons = screen.getAllByRole('button')
    const first = buttons[0]!
    first.focus()
    expect(document.activeElement).toBe(first)

    // Shift+Tab from first should wrap to last
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })
})
