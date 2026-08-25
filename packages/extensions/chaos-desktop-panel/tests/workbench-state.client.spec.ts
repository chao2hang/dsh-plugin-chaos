import { describe, expect, it } from 'vitest'
import { clampWorkbenchDimension, clampWorkbenchSplit, closeWorkbenchTab, moveWorkbenchTab, workbenchShowsGit } from '../src/client/workbench-state.ts'

describe('workbench dimensions', () => {
  it('rounds values within the permitted range', () => {
    expect(clampWorkbenchDimension(460.6, 320, 760)).toBe(461)
  })

  it('clamps the right workbench width at both edges', () => {
    expect(clampWorkbenchDimension(1, 320, 760)).toBe(320)
    expect(clampWorkbenchDimension(2_000, 320, 760)).toBe(760)
  })

  it('clamps a bottom workbench height using its viewport maximum', () => {
    expect(clampWorkbenchDimension(80, 160, 720)).toBe(160)
    expect(clampWorkbenchDimension(1_000, 160, 720)).toBe(720)
  })
})

describe('workbench tabs', () => {
  it('moves a tab ahead of another tab', () => {
    expect(moveWorkbenchTab(['explorer', 'review', 'terminal'], 'terminal', 'review')).toEqual(['explorer', 'terminal', 'review'])
  })

  it('closes a tab while retaining the final tab', () => {
    expect(closeWorkbenchTab(['explorer', 'review'], 'explorer')).toEqual(['review'])
    expect(closeWorkbenchTab(['review'], 'review')).toEqual(['review'])
  })
})

describe('workbench split', () => {
  it('keeps both split panes usable', () => {
    expect(clampWorkbenchSplit(0.1)).toBe(0.2)
    expect(clampWorkbenchSplit(0.55)).toBe(0.55)
    expect(clampWorkbenchSplit(0.9)).toBe(0.8)
  })
})

describe('Git review visibility', () => {
  it('refreshes when Git is visible in either open workbench pane', () => {
    expect(workbenchShowsGit({ open: true, active: 'review', split: false, splitActive: 'explorer', bottomOpen: false, bottomActive: 'terminal' })).toBe(true)
    expect(workbenchShowsGit({ open: true, active: 'terminal', split: true, splitActive: 'review', bottomOpen: false, bottomActive: 'terminal' })).toBe(true)
    expect(workbenchShowsGit({ open: false, active: 'review', split: false, splitActive: 'explorer', bottomOpen: true, bottomActive: 'review' })).toBe(true)
    expect(workbenchShowsGit({ open: false, active: 'review', split: false, splitActive: 'explorer', bottomOpen: false, bottomActive: 'terminal' })).toBe(false)
  })
})
