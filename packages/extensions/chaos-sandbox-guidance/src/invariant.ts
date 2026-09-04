/** Package-owned invariant companion for sandbox escalation guidance. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-sandbox-guidance'

/** Cordis companion plugin name. */
export const name = 'plugin-chaos-sandbox-guidance-invariant'
/** Service required before the companion reserves package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the plugin owns one disposed system-prompt registration. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
