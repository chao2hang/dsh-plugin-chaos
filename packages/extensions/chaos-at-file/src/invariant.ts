/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-plugin-chaos-at-file`.
 * @module @deepseek-ai/dsh-plugin-chaos-at-file/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-at-file'

/** Cordis companion plugin name. */
export const name = 'plugin-chaos-at-file-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every index answer is derived per call from the live
 * filesystem, the settings section is owned by the settings provider, and the
 * pre-step marker appends messages the agent loop itself logs — the package
 * holds no mutable state relating two event streams. Registration disposal is
 * proven by the HMR-safety spec instead.
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
