// @vitest-environment jsdom
// Assembled Statistics snapshot: boots the real built client bundles, opens the
// fixture session, and validates the host-backed report tab's 30-day calendar
// and per-model stacked-token presentation through the production slot graph.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/statistics-usage/stacked-calendar.expected.txt')

installAssembledBootEnv()

/** Return the test browser's local calendar date in report wire format. */
function localDate(): string {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

/** Normalize the durable Statistics report into stable presentation facts. */
function statisticsShape(chart: HTMLElement): string {
  const segments = [...new Set([...chart.querySelectorAll<HTMLElement>('[data-model]')]
    .map(segment => segment.dataset.model ?? '<missing>'))].sort()
  return [
    `columns=${chart.querySelectorAll('[data-date]').length}`,
    `zero-days=${chart.querySelectorAll('[data-date][data-zero]').length}`,
    `segments=${segments.join(',')}`,
    `total=${screen.getByText('Total tokens').parentElement?.textContent?.trim() ?? '<missing>'}`,
    `requests=${screen.getByText('Requests').parentElement?.textContent?.trim() ?? '<missing>'}`,
    `legend=${['deepseek / reasoner', 'openai / gpt', 'Unattributed historical usage'].map(label =>
      screen.getAllByText(label)[0]?.textContent?.trim() ?? '<missing>').join(',')}`,
  ].join('\n') + '\n'
}

describe('assembled Statistics tab', () => {
  it('renders an interactive 30-day stacked-token calendar with neutral zero days', async () => {
    mountAssembledApp()

    const tree = await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
    fireEvent.click(await within(tree).findByText('Fixture 历史会话'))
    fireEvent.click(await screen.findByRole('tab', { name: 'Statistics' }, { timeout: 10_000 }))
    const chart = await screen.findByRole('group', { name: 'Daily token trend' }, { timeout: 10_000 })
    await waitFor(() =>{  expect(chart.querySelectorAll('[data-date]')).toHaveLength(30) })
    expect(chart.querySelector(`[data-date="${localDate()}"]`)).toBeTruthy()
    const zeroDay = chart.querySelector<HTMLButtonElement>('[data-zero]')
    if (zeroDay === null) throw new Error('fixture report must contain a zero-use day')
    fireEvent.click(zeroDay)
    expect(screen.getByText('No completed requests on this date.')).toBeTruthy()

    const shape = statisticsShape(chart)
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, shape)
    }
    await expect(shape).toMatchFileSnapshot(EXPECTED)
  })
})
