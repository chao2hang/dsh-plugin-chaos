/**
 * @deepseek-ai/dsh-process-control — Generic process-control service.
 * Provides `canRestart` and `restart()` for process replacement. A launcher
 * first disposes the current application tree, then this service starts a
 * successor with the same command line. The service reports whether restart is
 * supported (a launcher without a quiescent shutdown callback reports
 * `canRestart: false` so UIs can hide the control).
 *
 * This is a generic extension point, not specific to any plugin. The concrete
 * launcher implementation (CLI, Electron, etc.) provides the service; plugins
 * consume it through `ctx.processControl`.
 */
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-cmdline'

/** The result of a restart attempt. */
export type RestartResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * The outward process-control face (`ctx.processControl`).
 */
export interface IProcessControl {
  /** Whether this process supports a quiescent successor handoff. */
  readonly canRestart: boolean
  /**
   * Dispose the current application tree, then spawn a detached successor with
   * the same command line. The successor inherits the same port and configuration.
   * @returns `{ ok: true }` when the successor was spawned after teardown, or
   * `{ ok: false, reason }` when it cannot.
   */
  restart(): Promise<RestartResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Process-control service: restart capability. */
    processControl: IProcessControl
  }
}

/** Test seam for the process spawn operation. */
export const internals: { spawn: typeof spawn } = { spawn }

/**
 * Waits for launcher-owned application teardown, then spawns a detached
 * successor with the same Node executable and argv. Releasing owned listeners
 * before spawning lets a fixed listener port transfer without a timing race.
 */
export class ProcessControlService extends Service implements IProcessControl {
  private pending = false

  constructor(ctx: Context) {
    super(ctx, 'processControl')
  }

  get canRestart(): boolean {
    return process.argv.length > 1 && this.ctx.get('appExit') !== undefined
  }

  async restart(): Promise<RestartResult> {
    if (this.pending) return { ok: false, reason: 'restart already pending' }
    const appExit = this.ctx.get('appExit')
    if (process.argv.length <= 1 || appExit === undefined) {
      return { ok: false, reason: 'no quiescent launch command available' }
    }
    this.pending = true

    try {
      await appExit(0)
      const child = internals.spawn(process.execPath, process.argv.slice(1), {
        stdio: 'inherit',
        env: { ...process.env },
        detached: true,
      })
      child.unref()
      return { ok: true }
    } catch (error) {
      this.pending = false
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false, reason }
    }
  }
}

export default ProcessControlService
