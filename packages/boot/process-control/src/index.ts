/**
 * @deepseek-ai/dsh-process-control — Generic process-control service.
 * Provides `canRestart` and `restart()` for process replacement: spawn a
 * successor with the same command line, then stop the current process. The
 * service reports whether restart is supported (a launcher that cannot spawn
 * a successor reports `canRestart: false` so UIs can hide the control).
 *
 * This is a generic extension point, not specific to any plugin. The concrete
 * launcher implementation (CLI, Electron, etc.) provides the service; plugins
 * consume it through `ctx.processControl`.
 */
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'

/** The result of a restart attempt. */
export type RestartResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * The outward process-control face (`ctx.processControl`).
 */
export interface IProcessControl {
  /** Whether this process supports restart (can spawn a successor). */
  readonly canRestart: boolean
  /**
   * Spawn a successor process with the same command line, then stop this
   * process. The successor inherits the same port and configuration.
   * @returns `{ ok: true }` when the successor started successfully, or
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

/**
 * Concrete process-control service: spawns a successor via the same Node
 * executable and argv, then signals this process to exit. Cancels a pending
 * restart on SIGTERM/SIGINT (operator intent priority).
 */
export class ProcessControlService extends Service implements IProcessControl {
  private pending = false
  private cancelled = false

  constructor(ctx: Context) {
    super(ctx, 'processControl')
  }

  get canRestart(): boolean {
    return process.argv.length > 1
  }

  async restart(): Promise<RestartResult> {
    if (this.pending) return { ok: false, reason: 'restart already pending' }
    if (!this.canRestart) return { ok: false, reason: 'no launch command available' }
    this.pending = true
    this.cancelled = false

    try {
      const execPath = process.execPath
      const args = process.argv.slice(1)
      const child = spawn(execPath, args, {
        stdio: 'inherit',
        env: { ...process.env },
        detached: false,
      })
      // Wait for the successor to start (it accepted spawn).
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error): void => {
          child.off('exit', onExit)
          reject(err)
        }
        const onExit = (code: number | null): void => {
          child.off('error', onError)
          // A successor that exits immediately failed to start.
          reject(new Error(`successor exited with code ${String(code)} before taking over`))
        }
        child.once('error', onError)
        // Give the successor a short window to bind before we exit.
        setTimeout(() => {
          child.off('error', onError)
          child.off('exit', onExit)
          resolve()
        }, 500)
        child.once('exit', onExit)
      })

      if (this.cancelled) {
        child.kill()
        return { ok: false, reason: 'cancelled by stop signal' }
      }

      // Successor is running; signal this process to exit.
      // Do NOT call process.exit() synchronously — the caller needs to
      // reply to the client first.
      process.kill(process.pid, 'SIGTERM')
      return { ok: true }
    } catch (error) {
      this.pending = false
      const reason = error instanceof Error ? error.message : String(error)
      return { ok: false, reason }
    }
  }

  protected [Service.init](): void {
    // Cancel pending restart on stop signal (operator intent priority).
    const cancel = (): void => {
      this.cancelled = true
      this.pending = false
    }
    process.once('SIGTERM', cancel)
    process.once('SIGINT', cancel)
    this.ctx.effect(() => () => {
      process.off('SIGTERM', cancel)
      process.off('SIGINT', cancel)
    }, 'processControl: signal listeners')
  }
}

export default ProcessControlService
