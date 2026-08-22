// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createCombinedLayoutStore } from '../src/client/combined-store.ts'
import {
  SIDEBAR_DEFAULT, DETAILS_DEFAULT,
} from '../src/client/columns.ts'

describe('createCombinedLayoutStore', () => {
  const handle = createCombinedLayoutStore()
  const instance = handle.create()

  it('starts with default panel geometry and closed drawer', () => {
    const snap = instance.getSnapshot()
    expect(snap.sidebar).toBe(SIDEBAR_DEFAULT)
    expect(snap.details).toBe(0)
    expect(snap.narrow).toBe(false)
    expect(snap.narrowExpanded).toBe(false)
    expect(snap.drawerOpen).toBe(false)
  })

  it('openDrawer / closeDrawer toggle the drawer', () => {
    instance.actions.openDrawer()
    expect(instance.getSnapshot().drawerOpen).toBe(true)
    instance.actions.closeDrawer()
    expect(instance.getSnapshot().drawerOpen).toBe(false)
  })

  it('toggleDrawer flips the drawer', () => {
    expect(instance.getSnapshot().drawerOpen).toBe(false)
    instance.actions.toggleDrawer()
    expect(instance.getSnapshot().drawerOpen).toBe(true)
    instance.actions.toggleDrawer()
    expect(instance.getSnapshot().drawerOpen).toBe(false)
  })

  it('panel actions work: openDetails / closeDetails', () => {
    instance.actions.openDetails()
    expect(instance.getSnapshot().details).toBe(DETAILS_DEFAULT)
    instance.actions.closeDetails()
    expect(instance.getSnapshot().details).toBe(0)
  })

  it('panel actions work: toggleSidebar on wide viewport', () => {
    instance.actions.toggleSidebar()
    expect(instance.getSnapshot().sidebar).toBe(0)
    instance.actions.toggleSidebar()
    expect(instance.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('toggleSidebar on narrow viewport flips narrowExpanded', () => {
    instance.actions.setNarrow(true)
    expect(instance.getSnapshot().narrow).toBe(true)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
    instance.actions.toggleSidebar()
    expect(instance.getSnapshot().narrowExpanded).toBe(true)
    instance.actions.toggleSidebar()
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })

  it('setNarrow crossing the breakpoint resets narrowExpanded', () => {
    instance.actions.setNarrow(true)
    instance.actions.toggleSidebar()
    expect(instance.getSnapshot().narrowExpanded).toBe(true)
    instance.actions.setNarrow(false)
    expect(instance.getSnapshot().narrowExpanded).toBe(false)
  })

  it('setNarrow is idempotent (no change when same value)', () => {
    const before = instance.getSnapshot()
    instance.actions.setNarrow(false)
    expect(instance.getSnapshot()).toEqual(before)
  })

  it('notifies subscribers on state change', () => {
    let calls = 0
    const unsub = instance.subscribe(() => { calls++ })
    instance.actions.openDrawer()
    expect(calls).toBe(1)
    instance.actions.closeDrawer()
    expect(calls).toBe(2)
    unsub()
    instance.actions.openDrawer()
    expect(calls).toBe(2)
  })
})

describe('createCombinedLayoutStore instance isolation', () => {
  it('two instances are independent', () => {
    const a = createCombinedLayoutStore().create()
    const b = createCombinedLayoutStore().create()
    a.actions.openDrawer()
    expect(a.getSnapshot().drawerOpen).toBe(true)
    expect(b.getSnapshot().drawerOpen).toBe(false)
  })
})
