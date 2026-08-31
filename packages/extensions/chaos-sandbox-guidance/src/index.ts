/**
 * Prevents redundant sandbox escalation arguments after a resumed agent sees
 * earlier tool failures in its transcript.
 * @module @deepseek-ai/dsh-plugin-chaos-sandbox-guidance
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'chaos-sandbox-guidance'

/** Required services for resolving and presenting the effective session policy. */
export const inject = ['sandboxPolicy', 'systemPrompt']

/** Guidance for a session already operating at the highest sandbox mode. */
const DANGER_FULL_ACCESS_GUIDANCE = 'This session already has danger-full-access. Do not set sandbox_permissions or justification on bash, filesystem, or file-edit calls: call the tool directly. sandbox_permissions is only for one retry after a real sandbox denial from a strictly narrower current mode.'

/** Guidance for a session operating in a sandboxed mode. */
const CONFINED_GUIDANCE = 'Use sandbox_permissions only for one retry after a real sandbox denial, and only when the requested mode is strictly wider than the current mode. Do not retry an operation merely because another tool call failed.'

/**
 * Add per-request sandbox-escalation guidance to model context.
 * @param ctx - Plugin context with the policy and system-prompt services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['sandboxPolicy', 'systemPrompt'], (scope: Context) => {
    scope.systemPrompt.context({
      name: 'chaos:sandbox-escalation',
      order: 111,
      text: (context) => {
        const session = context.agent?.session
        if (session === undefined) return ''
        return scope.sandboxPolicy.resolve({ session }).mode === 'danger-full-access'
          ? DANGER_FULL_ACCESS_GUIDANCE
          : CONFINED_GUIDANCE
      },
    })
  })
}

/** Re-export guidance text for focused composition tests. */
export { CONFINED_GUIDANCE, DANGER_FULL_ACCESS_GUIDANCE }
