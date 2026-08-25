/** Package-owned invariant companion for the desktop-panel plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-plugin-chaos-desktop-panel'
export const name = 'plugin-chaos-desktop-panel-invariant'
export const inject = ['invariants']
/** No runtime invariant: this plugin owns only reversible web-server routes and a client slot registration. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
