/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-plugin-chaos-mobile`.
 * @module @deepseek-ai/dsh-plugin-chaos-mobile/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-mobile'

/** Cordis companion plugin name. */
export const name = 'plugin-chaos-mobile-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package contributes browser presentation only;
 * ui-layout owns the panel state and its observable state transitions.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
