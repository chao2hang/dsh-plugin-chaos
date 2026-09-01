// Mobile hero phase: the new-session composer docks at the column floor like
// the active phase, instead of flex-centering. A centered hero stranded the
// input card mid-screen with the lower half empty and detached the model
// popup from its trigger — the compact model menu pins to
// calc(88px + safe-area-inset-bottom), the spot of a DOCKED composer, so the
// popup opened at the screen floor hundreds of pixels below the chip. This
// scenario pins both geometries at a phone viewport: the hero card rests at
// the floor and the open model menu sits beside its trigger. Zero model calls.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { saveFailureShot, ZH_BROWSER_LOCALE } from './support.ts'

const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: mobile hero composer docking', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let _tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // A narrow portrait viewport is what MobileOverlay keys the mobile shell
    // to; touch flags match a phone.
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

  it('docks the hero composer and opens the model menu beside its trigger', async () => {
    onTestFailed(() => { void saveFailureShot(page, 'mobile-hero-composer') })

    // Connect a workspace through the dialog's path editor: a fresh world has
    // nothing to select, so this is the one route into the hero composer.
    mkdirSync(join(scaffold.workspaceCwd, 'workspace'), { recursive: true })
    await page.getByRole('textbox', { name: '选择工作区' }).click()
    const dialog = page.getByRole('dialog', { name: '选择工作区目录' })
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByRole('button', { name: '编辑路径' }).click()
    const pathInput = dialog.getByRole('textbox', { name: '编辑路径' })
    await pathInput.fill(join(scaffold.workspaceCwd, 'workspace'))
    await pathInput.press('Enter')
    await dialog.getByRole('button', { name: '打开', exact: true }).click()
    await page.locator('textarea:enabled[placeholder="描述你想要构建的内容"]').waitFor({ timeout: 20_000 })

    // The hero card rests at the column floor (its own 32px foot pad plus the
    // column's safe-area inset keep it clear of the edge).
    const card = await page.locator('[data-composer-card]').evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return { bottom: rect.bottom, viewportHeight: window.innerHeight }
    })
    expect(card.viewportHeight - card.bottom).toBeLessThanOrEqual(64)

    // The open model menu hugs its trigger: the menu's floor stays within a
    // chip-height of the trigger's top instead of dropping to the screen
    // bottom the way an unanchored fixed popup would.
    await page.locator('[data-composer-model]').click()
    const proximity = await page.evaluate(() => {
      const trigger = document.querySelector('[data-composer-model]')?.getBoundingClientRect() ?? null
      const menu = document.querySelector('[role="menu"]')?.getBoundingClientRect() ?? null
      if (trigger === null || menu === null) return null
      return { triggerTop: trigger.top, menuBottom: menu.bottom }
    })
    expect(proximity).not.toBeNull()
    if (proximity !== null) {
      expect(proximity.triggerTop - proximity.menuBottom).toBeLessThanOrEqual(80)
    }
  }, 90_000)
})
