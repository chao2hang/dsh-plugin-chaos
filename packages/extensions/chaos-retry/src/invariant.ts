/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-plugin-chaos-retry`.
 * @module @deepseek-ai/dsh-plugin-chaos-retry/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-retry'

/** Cordis companion plugin name. */
export const name = 'plugin-chaos-retry-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a single conversation.input.dock registration whose
 * disposal is proven by the HMR-safety spec — the plugin owns no store (the
 * abnormal-end state derives from the session snapshot each render), emits no
 * cordis events, and holds no cross-plugin mutable state.
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
