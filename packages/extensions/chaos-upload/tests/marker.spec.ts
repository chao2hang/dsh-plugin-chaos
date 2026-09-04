import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { expandUploadMentions, scanUploadMentions, uploadMentionPreStep, uploadReferenceForm } from '../src/marker.ts'
import type { MentionAgent } from '../src/marker.ts'

const signal = new AbortController().signal

describe('chaos-upload mention grammar', () => {
  it('collects only tokens under the upload directory, deduplicated in first-seen order', () => {
    const text = '读 @uploads/spec.pdf 和 @uploads/spec.pdf 再看 @docs/other.md 以及 @uploads/'
    expect(scanUploadMentions(text, 'uploads')).toEqual(['uploads/spec.pdf'])
  })

  it('keeps a custom configured directory prefix', () => {
    expect(scanUploadMentions('见 @files/报告.docx', 'files')).toEqual(['files/报告.docx'])
  })

  it('escapes attribute values without altering the referenced path', () => {
    expect(uploadReferenceForm({ relative: 'uploads/a&"b.pdf' }))
      .toBe('<workspace-reference path="uploads/a&amp;&quot;b.pdf" kind="file" />')
  })
})

describe('expandUploadMentions', () => {
  let workspace: string

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'chaos-upload-marker-'))
  })

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true })
  })

  const userMessage = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

  it('appends one marker per existing uploaded file and keeps missing paths ordinary prose', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(join(workspace, 'uploads'), { recursive: true })
    await writeFile(join(workspace, 'uploads/spec.pdf'), 'bytes')
    const messages = [userMessage('总结 @uploads/spec.pdf 与 @uploads/missing.pdf')]
    const injections = await expandUploadMentions(messages, workspace, 'uploads', signal)
    expect(injections).toHaveLength(1)
    expect(injections[0]?.content[0]).toEqual({ type: 'text', text: uploadReferenceForm({ relative: 'uploads/spec.pdf' }) })
    expect(injections[0]?.source).toEqual({ kind: 'chaos-upload-mention', relative: 'uploads/spec.pdf' })
  })

  it('ignores producer text that is not the user', async () => {
    const other = {
      id: 'm1', role: 'user', time: 0,
      content: [{ type: 'text', text: '@uploads/spec.pdf' }],
      source: { kind: 'model' },
    } as unknown as UserMessage
    const injections = await expandUploadMentions([other], workspace, 'uploads', signal)
    expect(injections).toHaveLength(0)
  })
})

describe('uploadMentionPreStep', () => {
  const agent: MentionAgent = { session: { header: {} } }
  const next = (): Promise<PreStepDecision> => Promise.resolve({ kind: 'enter', messages: [] })

  it('returns the downstream decision when markers are disabled', async () => {
    const decision = await uploadMentionPreStep(agent, () => false, 'uploads', [], signal, next)
    expect(decision.kind).toBe('enter')
  })

  it('returns the downstream decision when no marker resolves', async () => {
    const decision = await uploadMentionPreStep(agent, () => true, 'uploads', [], signal, next)
    expect(decision.kind).toBe('enter')
  })
})
