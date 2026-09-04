/**
 * The workspace upload service (`ctx.chaosUpload`, wire namespace
 * `chaosUpload`) and the plugin's whole Host behavior: it answers the
 * browser's upload RPC by storing bytes inside the session workspace,
 * appends one existence-only reference per validated `@<dir>/...` token at
 * each agent's pre-step boundary, and retains stored uploads by age when
 * `maxAgeDays` is set.
 *
 * File content crosses the RPC exactly once, on the way in. Whether to read a
 * stored path is the agent's decision, made with the tools its session
 * already has.
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-typert-registry'
// Type-only: pulls the sessionPersistence service and the timer helpers
// (ctx.interval / ctx.timeout) into this program's Context merge.
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/cordis-plugin-timer'
import { uploadMentionPreStep } from './marker.ts'
import { sweepUploads } from './sweep.ts'
import { writeUpload } from './upload.ts'
import type { ResolvedConfig, UploadRequest, UploadResult } from './types.ts'

/** Default upload directory inside the session workspace. */
export const DEFAULT_UPLOAD_DIR = 'uploads'

/** Default byte cap for one upload (20 MiB). */
export const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024

/** Default retention sweep cadence (minutes). */
export const DEFAULT_SWEEP_INTERVAL_MINUTES = 60

/** Host plugin configuration for the upload surface. */
export interface Config {
  /** Workspace-relative directory receiving every upload; created on demand. */
  dir?: string
  /** Hard cap on one upload's decoded byte length. */
  maxFileBytes?: number
  /** Whether the pre-step marker validates `@<dir>/...` tokens. */
  markers?: boolean
  /** Age in days beyond which a stored upload is deleted; 0 (default) keeps uploads forever. */
  maxAgeDays?: number
  /** Retention sweep cadence in minutes. */
  sweepIntervalMinutes?: number
  /** Rehearsal switch: log the deletions a sweep would perform without deleting. */
  dryRun?: boolean
}

/**
 * Prove one configured upload directory is a relative, forward-slashed path
 * of usable segments.
 * @param dir - the configured directory.
 * @throws Error on an absolute path, a backslash, or an unusable segment.
 */
function validateDir(dir: string): void {
  if (dir === '' || dir.startsWith('/') || dir.includes('\\')) {
    throw new Error('chaos-upload: dir must be a relative, forward-slashed path')
  }
  for (const segment of dir.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`chaos-upload: dir segment "${segment}" is not a usable directory name`)
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    chaosUpload: ChaosUploadRuntime
  }
}

/** Workspace upload storage, uploaded-path reference marking, and retention. */
export class ChaosUploadRuntime extends TypertRemoteService {
  static inject = ['agents', 'typert', 'sessionPersistence', 'timer']

  static Config: z<Config> = z.object({
    dir: z.string().default(DEFAULT_UPLOAD_DIR),
    maxFileBytes: z.natural().min(1).default(DEFAULT_MAX_FILE_BYTES),
    markers: z.boolean().default(true),
    maxAgeDays: z.natural().default(0),
    sweepIntervalMinutes: z.natural().min(1).default(DEFAULT_SWEEP_INTERVAL_MINUTES),
    dryRun: z.boolean().default(false),
  })

  private readonly config: ResolvedConfig
  private readonly retention: { maxAgeDays: number; sweepIntervalMinutes: number; dryRun: boolean }

  /**
   * @param ctx - owning plugin context; the service registers as `chaosUpload`.
   * @param config - validated plugin configuration (schema defaults applied).
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'chaosUpload')
    const dir = config.dir ?? DEFAULT_UPLOAD_DIR
    const maxFileBytes = config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    const markers = config.markers ?? true
    validateDir(dir)
    if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error('chaos-upload: maxFileBytes must be a positive safe integer')
    }
    this.config = { dir, maxFileBytes, markers }
    const maxAgeDays = config.maxAgeDays ?? 0
    const sweepIntervalMinutes = config.sweepIntervalMinutes ?? DEFAULT_SWEEP_INTERVAL_MINUTES
    const dryRun = config.dryRun ?? false
    if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 0) {
      throw new Error('chaos-upload: maxAgeDays must be a non-negative safe integer')
    }
    if (!Number.isSafeInteger(sweepIntervalMinutes) || sweepIntervalMinutes <= 0) {
      throw new Error('chaos-upload: sweepIntervalMinutes must be a positive safe integer')
    }
    this.retention = { maxAgeDays, sweepIntervalMinutes, dryRun }
    // The Typert loader discovers the package-owned `./typert` artifact from
    // the mounted plugin entry. Registering the same manifest here as well
    // makes every startup attempt report a duplicate package face.
    // The event is agent-scoped, so the listener is installed per agent and
    // withdraws with that agent; the boundary itself is `uploadMentionPreStep`.
    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> =>
      uploadMentionPreStep(
        agent,
        () => this.config.markers,
        this.config.dir,
        messages,
        signal,
        next,
      ))
    if (this.retention.maxAgeDays > 0) this.installRetentionSweep(ctx)
  }

  /**
   * Sweep every workspace known to session persistence on an interval. Each
   * pass lists headers fresh, so a workspace first seen later in the process
   * lifetime joins the next sweep without a restart.
   * @param ctx - owning plugin context; the timer rides this fiber.
   */
  private installRetentionSweep(ctx: Context): void {
    const run = async (): Promise<void> => {
      const headers = await ctx.sessionPersistence.list().catch((error: unknown) => {
        ctx.logger.warn(`chaos-upload: retention sweep skipped: session listing failed: ${String(error)}`)
        return []
      })
      const workspaces = [...new Set(headers.flatMap(header => header.cwd === undefined ? [] : [header.cwd]))]
      for (const cwd of workspaces) {
        const outcome = await sweepUploads({ cwd }, {
          dir: this.config.dir,
          maxAgeDays: this.retention.maxAgeDays,
          dryRun: this.retention.dryRun,
          now: Date.now,
        })
        for (const deletion of outcome.deleted) {
          ctx.logger.info(
            `chaos-upload: ${this.retention.dryRun ? '[dry-run] ' : ''}deleted ${deletion.path} (${deletion.ageDays}d old)`,
          )
        }
        for (const failure of outcome.failures) {
          ctx.logger.warn(`chaos-upload: could not delete ${failure.path}: ${failure.reason}`)
        }
      }
    }
    const intervalMs = this.retention.sweepIntervalMinutes * 60_000
    const sweep = (): void => {
      void run().catch((error: unknown) => {
        ctx.logger.warn(`chaos-upload: retention sweep failed: ${String(error)}`)
      })
    }
    // The timer rides the plugin fiber; the boot pass runs promptly so a
    // long-lived process does not wait a full interval for its first cleanup.
    ctx.interval(sweep, intervalMs)
    ctx.timeout(sweep, 5_000)
  }

  /**
   * Store one uploaded file inside the addressed agent's workspace.
   * @param agent - the live agent resolved from the wire `agentId`; its
   *   session header owns the workspace directory.
   * @param request - display name and canonical base64 bytes.
   * @param signal - caller lifetime; every filesystem await races it.
   * @returns the stored file's workspace-relative path and byte length.
   * @throws Error when the session has no workspace directory or the upload
   *   is refused.
   */
  @Remote('upload')
  async remoteUpload(agent: Agent, request: UploadRequest, signal: AbortSignal): Promise<UploadResult> {
    const cwd = agent.session.header.cwd
    if (cwd === undefined) {
      throw new Error('chaos-upload: this session has no workspace directory')
    }
    return writeUpload(cwd, this.config, request, signal)
  }
}
