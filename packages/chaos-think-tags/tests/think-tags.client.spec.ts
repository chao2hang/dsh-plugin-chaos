// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeThinkTags } from '../src/client/think-tags.ts'

describe('normalizeThinkTags', () => {
  it('routes a provider-emitted think region into a reasoning block', () => {
    expect(normalizeThinkTags([{ kind: 'text', text: '<think>inspect the project</think>\n\nThe environment is ready.' }]))
      .toEqual([
        { kind: 'reasoning', text: 'inspect the project' },
        { kind: 'text', text: '\n\nThe environment is ready.' },
      ])
  })

  it('recognizes delimiters split across streamed text blocks', () => {
    expect(normalizeThinkTags([
      { kind: 'text', text: '<think>inspect' },
      { kind: 'text', text: ' and plan</think>answer' },
    ])).toEqual([
      { kind: 'reasoning', text: 'inspect and plan' },
      { kind: 'text', text: 'answer' },
    ])
  })

  it('preserves ordinary text and native reasoning blocks', () => {
    expect(normalizeThinkTags([
      { kind: 'text', text: 'Visible preface.' },
      { kind: 'reasoning', text: 'native provider reasoning' },
      { kind: 'text', text: 'Visible answer.' },
    ])).toEqual([
      { kind: 'text', text: 'Visible preface.' },
      { kind: 'reasoning', text: 'native provider reasoning' },
      { kind: 'text', text: 'Visible answer.' },
    ])
  })
})
