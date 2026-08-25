/** Browser half for the desktop companion panel. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { DeskPanel } from './DeskPanel.tsx'
export const inject = ['slots']
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'chaos-desktop-panel', priority: 3 }, DeskPanel))
}
