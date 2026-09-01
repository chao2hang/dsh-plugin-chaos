import { describe, expect, it } from 'vitest'
import { scanMentions } from '../src/mention.ts'
import { protectPastedMentions, stripPastedMentionMarkers } from '../src/paste.ts'

describe('chaos-at-file mention grammar', () => {
  it('deduplicates @path tokens and removes a directory suffix', () => {
    expect(scanMentions('Read @src/index.ts and @docs/ then @src/index.ts')).toEqual(['src/index.ts', 'docs'])
  })

  it('keeps protected pasted mentions out of reference detection while restoring visible text', () => {
    const pasted = protectPastedMentions('Review @draft.md')
    expect(scanMentions(pasted)).toEqual([])
    expect(stripPastedMentionMarkers(pasted)).toBe('Review @draft.md')
    expect(scanMentions(pasted, false)).toEqual(['draft.md'])
  })
})
