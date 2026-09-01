/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-plugin-chaos-auth`.
 * @module @deepseek-ai/dsh-plugin-chaos-auth/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-auth'

export const name = 'plugin-chaos-auth-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: the session store is per-plugin-instance with no
 * cross-plugin state; guard registration is transactional through ctx.effect.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
