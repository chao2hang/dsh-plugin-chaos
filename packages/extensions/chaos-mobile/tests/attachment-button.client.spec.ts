import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const component = readFileSync(resolve(import.meta.dirname, '../src/client/AttachmentButton.tsx'), 'utf8')
const styles = readFileSync(resolve(import.meta.dirname, '../src/client/AttachmentButton.module.css'), 'utf8')
const plugin = readFileSync(resolve(import.meta.dirname, '../src/client/index.ts'), 'utf8')

describe('mobile attachment picker', () => {
  it('registers in the composer left tool row', () => {
    expect(plugin).toContain('conversation.input.left')
    expect(plugin).toContain('chaos-mobile-attachment-picker')
  })

  it('uses an image-only multi-file picker', () => {
    expect(component).toContain('accept="image/*"')
    expect(component).toContain('multiple')
    expect(component).toContain('data-chaos-attachment-picker')
    expect(component).toContain('aria-label')
  })

  it('creates and releases draft images through the conversation service', () => {
    expect(component).toContain('createDraftImages')
    expect(component).toContain('addImages')
    expect(component).toContain('releaseDraftImages')
  })

  it('shows the icon only below the mobile breakpoint', () => {
    expect(styles).toContain('display: none')
    expect(styles).toContain('@media (max-width: 767px)')
  })
})
