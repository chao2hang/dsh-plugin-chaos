// Mobile sheet presentation: the composed directory dialog renders through
// chaos-mobile's bottom sheet, whose body must hand the dialog's flexible
// middle (the Miller columns) a definite height. When the body was a plain
// block scroller, the columns — both scroll containers, whose content
// contributes nothing to intrinsic sizing — collapsed to zero height and the
// picker listed nothing on a phone: the rows existed in the DOM but painted
// into a clipped 0px scroller. This scenario pins the real geometry at a
// phone viewport: directory rows render visible inside the sheet without
// scrolling. Zero model calls.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { saveFailureShot, ZH_BROWSER_LOCALE } from './support.ts'

const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: mobile workspace directory picker', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let _tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // A narrow portrait viewport is what MobileOverlay keys the mobile shell
    // (and with it the sheet presentation) to; touch flags match a phone.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: ZH_BROWSER_LOCALE,
      isMobile: true,
      hasTouch: true,
    })
    page = await context.newPage()
    _tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('#root', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    expect(_tripwire?.warnings).toEqual([])
    expect(_tripwire?.pageErrors).toEqual([])
    await browser?.close()
    await scaffold?.close()
  })

  it('lists home directories visibly inside the sheet', async () => {
    onTestFailed(() => { void saveFailureShot(page, 'mobile-directory-picker') })

    await page.getByRole('textbox', { name: '选择工作区' }).click()
    const dialog = page.getByRole('dialog', { name: '选择工作区目录' })
    await dialog.waitFor({ timeout: 15_000 })

    // The home listing lands as rows in the Miller column; every row must sit
    // inside a column with real height — a collapsed scroller would clip them
    // all out of view while the footer stays reachable below.
    const firstRow = dialog.locator('[role="listitem"] button').first()
    await firstRow.waitFor({ timeout: 15_000 })
    const geometry = await firstRow.evaluate((row) => {
      const column = row.closest('[role="list"]')
      if (column === null) throw new Error('directory row rendered outside a list column')
      return {
        rowHeight: row.getBoundingClientRect().height,
        columnHeight: column.getBoundingClientRect().height,
        sheet: row.closest('[aria-modal="true"]')?.getBoundingClientRect() ?? null,
        rowRect: row.getBoundingClientRect(),
      }
    })
    expect(geometry.rowHeight).toBeGreaterThan(0)
    expect(geometry.columnHeight).toBeGreaterThanOrEqual(geometry.rowHeight)
    expect(geometry.sheet).not.toBeNull()
    if (geometry.sheet !== null) {
      expect(geometry.rowRect.top).toBeGreaterThanOrEqual(geometry.sheet.top)
      expect(geometry.rowRect.bottom).toBeLessThanOrEqual(geometry.sheet.bottom)
    }
  }, 60_000)
})
