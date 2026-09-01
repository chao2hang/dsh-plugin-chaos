/** Package-owned invariant companion for the think-tag presentation plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-think-tags'

/** Cordis companion plugin name. */
export const name = 'plugin-chaos-think-tags-invariant'
/** Service required before the companion reserves package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the plugin owns one disposed keyed UI registration. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
