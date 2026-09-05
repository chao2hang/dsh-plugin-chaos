// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { BootPage } from '../src/boot-page.ts'

afterEach(() => { document.body.innerHTML = '' })

function mount() {
  const el = document.createElement('div')
  document.body.append(el)
  return { el, page: new BootPage(el) }
}

describe('BootPage', () => {
  it('draws the loading skeleton before any plugin state arrives', () => {
    const { el } = mount()
    expect(el.firstElementChild?.getAttribute('data-dsh-boot')).toBe('')
    expect(el.textContent).toContain('DEEPSEEK HARNESS')
    expect(el.textContent).toContain('正在进入')
    expect(el.textContent).toContain('正在准备工作区')
    expect(el.querySelector('[role="status"]')?.textContent).toBe('正在准备工作区')
  })

  it('keeps loading while entries are active or loading', () => {
    const { el, page } = mount()
    page.setTotal(2)
    const spinner = el.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('72deg')
    page.setState('a', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('180deg')
    page.setState('b', 'loading')
    expect(el.querySelector('[data-dsh-boot-spinner]')).toBe(spinner)
    page.setState('b', 'active')
    expect(spinner?.style.getPropertyValue('--dsh-boot-arc')).toBe('288deg')
    expect(el.textContent).toContain('正在准备工作区')
    expect(el.textContent).not.toContain('启动未完成')
  })

  it('lists failed entries', () => {
    const { el, page } = mount()
    page.setState('@deepseek-ai/dsh-client-ui-layout', 'failed')
    page.setState('ok', 'active')
    page.setState('@deepseek-ai/dsh-client-ui-tool', 'failed')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(el.textContent).toContain('@deepseek-ai/dsh-client-ui-tool')
    expect(el.textContent).not.toContain('ok')
    expect(el.textContent).toContain('启动未完成')
    expect(el.querySelector('[role="alert"]')).not.toBeNull()
    expect(el.textContent).not.toContain('正在准备工作区')
  })

  it('shows the complete sweep report', () => {
    const { el, page } = mount()
    const report = 'web boot: 1 entry did not activate\nx: pending (waiting for service: y)'
    page.fail(report)
    page.setState('a', 'active')
    expect(el.textContent).toContain(report)
    expect(el.textContent).not.toContain('正在准备工作区')
  })

  it('detaches on disposal', () => {
    const { el, page } = mount()
    page.dispose()
    expect(el.childNodes).toHaveLength(0)
  })
})
