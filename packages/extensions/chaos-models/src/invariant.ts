/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-plugin-chaos-models`.
 * @module @deepseek-ai/dsh-plugin-chaos-models/invariant
 */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-models'
export const name = 'plugin-chaos-models-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
