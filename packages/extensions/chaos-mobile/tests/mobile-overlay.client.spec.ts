import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MOBILE_BREAKPOINT } from '../src/client/columns.ts'

const indexSource = readFileSync(
  resolve(import.meta.dirname, '../src/client/index.ts'),
  'utf8',
)

describe('MobileOverlay structure', () => {
  it('MOBILE_BREAKPOINT is 768px', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })
})

describe('client/index.ts integration', () => {
  // The approach: register into shell.overlay (list slot, additive),
  // NOT root slot (which would re-declare child slots and fail).
  it('does NOT register into root slot', () => {
    expect(indexSource).not.toMatch(/slots\.register\(\s*\{[^}]*name:\s*['"]root['"]/)
  })

  it('registers into shell.overlay slot', () => {
    expect(indexSource).toMatch(/name:\s*['"]shell\.overlay['"]/)
  })

  it('injects layout actions into the overlay entry', () => {
    expect(indexSource).toMatch(/toggleSidebar: \(\) => \{ ctx\.layout\.toggleSidebar\(\) \}/)
    expect(indexSource).toMatch(/openDetails: \(\) => \{ ctx\.layout\.openDetails\(\) \}/)
    expect(indexSource).toMatch(/closeDetails: \(\) => \{ ctx\.layout\.closeDetails\(\) \}/)
  })

  it('injects a new-session action backed by the workspaces service', () => {
    expect(indexSource).toContain("'slots', 'conversation', 'layout', 'workspaces'")
    expect(indexSource).toMatch(/newSession: \(\) => \{ ctx\.workspaces\.startSession\(\) \}/)
  })
})
