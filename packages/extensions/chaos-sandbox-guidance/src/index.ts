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
const DANGER_FULL_ACCESS_GUIDANCE = "IMPORTANT: the current session is already running with danger-full-access. For Bash, Read, Edit, Write, and filesystem calls, call the tool directly with only its normal arguments. Do not include sandbox_permissions or justification. Never try to change to workspace-write or danger-full-access through a permission command. The error \"not strictly wider than this call's current\" means the redundant escalation arguments must be removed; it is not a reason to retry escalation."

/** Guidance for a session operating in a sandboxed mode. */
const CONFINED_GUIDANCE = 'Use sandbox_permissions only for one retry after a real sandbox denial, and only when the requested mode is strictly wider than the current mode. Do not retry an operation merely because another tool call failed.'

/**
 * Add per-request sandbox-escalation guidance to model context.
 * @param ctx - Plugin context with the policy and system-prompt services.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.context({
    name: 'chaos:sandbox-escalation',
    order: 111,
    text: (context) => {
      const session = context.agent?.session
      if (session === undefined) return ''
      return ctx.sandboxPolicy.resolve({ session }).mode === 'danger-full-access'
        ? DANGER_FULL_ACCESS_GUIDANCE
        : CONFINED_GUIDANCE
    },
  })
}

/** Re-export guidance text for focused composition tests. */
export { CONFINED_GUIDANCE, DANGER_FULL_ACCESS_GUIDANCE }
