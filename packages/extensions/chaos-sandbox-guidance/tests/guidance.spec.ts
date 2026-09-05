import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ChaosSandboxGuidance from '../src/index.ts'

function session(id: string): Session {
  return Session.create(SessionId(id), undefined, {
    version: 0,
    id: SessionId(id),
    createdAt: 0,
    cwd: '/workspace',
    isSeeded: false,
  })
}

function agentFor(activeSession: Session): Agent {
  return { session: activeSession } as unknown as Agent
}

async function contextFor(mode: 'workspace-write' | 'danger-full-access'): Promise<string | undefined> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  // The policy service injects the projection registry; mount it so the
  // sandboxPolicy service publishes and the plugin's own inject resolves.
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, { mode, workspaceRoot: '/workspace' })
  await ctx.plugin(ChaosSandboxGuidance)
  return (await ctx.systemPrompt.assemble({ agent: agentFor(session(mode)) }))
    .contexts.find(context => context.name === 'chaos:sandbox-escalation')?.text
}

describe('chaos sandbox escalation guidance', () => {
  it('tells a danger-full-access session to omit redundant escalation arguments', async () => {
    await expect(contextFor('danger-full-access')).resolves.toBe(ChaosSandboxGuidance.DANGER_FULL_ACCESS_GUIDANCE)
    await expect(contextFor('danger-full-access')).resolves.toContain('not strictly wider than this call')
    await expect(contextFor('danger-full-access')).resolves.toContain('Never try to change to workspace-write or danger-full-access')
  })

  it('keeps strictly-wider retry guidance for a confined session', async () => {
    await expect(contextFor('workspace-write')).resolves.toBe(ChaosSandboxGuidance.CONFINED_GUIDANCE)
  })
})
