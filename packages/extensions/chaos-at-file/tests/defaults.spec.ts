import { describe, expect, it } from 'vitest'
import {
  effectiveIgnoreFiles, normalizeIgnoreFiles, normalizeWorkspaceIgnoreFiles,
  workspacePathKey,
} from '../src/defaults.ts'

const settings = {
  enabled: true,
  ignorePastedMentions: true,
  ignoreFiles: ['Thumbs.db', { kind: 'regex' as const, pattern: '^secret', caseSensitive: false }],
  workspaceIgnoreFiles: [{ workspace: '/work/project', ignoreFiles: ['local.log'] }],
}

describe('chaos-at-file filter normalization', () => {
  it('deduplicates legacy exact rules without changing their persisted spelling', () => {
    expect(normalizeIgnoreFiles(['Thumbs.db', ' thumbs.db ', '', 'desktop.ini'])).toEqual(['Thumbs.db', 'desktop.ini'])
  })

  it('merges workspace rules with global rules using normalized workspace identity', () => {
    expect(effectiveIgnoreFiles(settings, '/work/project/')).toEqual([
      'Thumbs.db', { kind: 'regex', pattern: '^secret', caseSensitive: false }, 'local.log',
    ])
    expect(workspacePathKey('/work/project/')).toBe(workspacePathKey('/work/project'))
  })

  it('combines duplicate workspace rows in first-seen order', () => {
    expect(normalizeWorkspaceIgnoreFiles([
      { workspace: '/work/project', ignoreFiles: ['first.log'] },
      { workspace: '/work/project/', ignoreFiles: ['second.log', 'first.log'] },
    ])).toEqual([{ workspace: '/work/project', ignoreFiles: ['first.log', 'second.log'] }])
  })
})
