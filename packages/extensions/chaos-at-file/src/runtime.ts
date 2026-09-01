/**
 * The workspace path service (`ctx.chaosAtFile`, wire namespace `chaosAtFile`)
 * and the plugin's whole Host behavior: it owns the durable settings section,
 * answers the browser picker's index search, and appends one existence-only
 * reference per validated `@path` at each agent's pre-step boundary.
 *
 * File content never crosses this service. An index entry carries a path and a
 * kind; a reference carries a path and a kind. Whether to open a referenced
 * path is the agent's decision, made with the tools its session already has.
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { CHAOS_AT_FILE_INVOCATIONS } from './remote.ts'
import { DEFAULT_IGNORE_DIRS, effectiveIgnoreFiles } from './defaults.ts'
import { indexWorkspace } from './files.ts'
import { mentionPreStep } from './mention.ts'
import { AT_FILE_SETTINGS_NAMESPACE, AtFileSettingsSchema } from './settings.ts'
import type { AtFileSettings, FileEntry, ResolvedConfig } from './types.ts'

/** Host plugin configuration for the index walk. */
export interface Config {
  /** Hard cap on indexed entries per workspace; the walk stops and reports truncation. */
  maxIndexedFiles?: number
  /** Directory basenames the index walk never enters; `[]` indexes every directory. */
  ignoreDirs?: string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    chaosAtFile: AtFileRuntime
  }
}

/** Workspace path search and validated `@path` reference marking. */
export class AtFileRuntime extends TypertRemoteService {
  static inject = ['agents', 'settings', 'typert']

  static Config: z<Config> = z.object({
    maxIndexedFiles: z.natural().min(1).default(5000),
    ignoreDirs: z.array(z.string()).default([...DEFAULT_IGNORE_DIRS]),
  })

  private readonly config: ResolvedConfig
  private readonly settings: SettingsScope<AtFileSettings>

  /**
   * @param ctx - owning plugin context; the service registers as `chaosAtFile`.
   * @param config - validated plugin configuration (schema defaults applied).
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'chaosAtFile')
    this.config = {
      maxIndexedFiles: config.maxIndexedFiles ?? 5000,
      ignoreDirs: config.ignoreDirs ?? [...DEFAULT_IGNORE_DIRS],
    }
    if (!Number.isSafeInteger(this.config.maxIndexedFiles) || this.config.maxIndexedFiles <= 0) {
      throw new Error('chaos-at-file: maxIndexedFiles must be a positive safe integer')
    }
    if (this.config.ignoreDirs.some(name => name === '' || name.includes('/') || name.includes('\\'))) {
      throw new Error('chaos-at-file: ignoreDirs entries must be non-empty directory basenames')
    }
    // The section is registered on this service's own fiber, so the scope dies
    // with the plugin and the Settings page loses the namespace with it.
    this.settings = ctx.settings.register(AT_FILE_SETTINGS_NAMESPACE, AtFileSettingsSchema, { applies: 'live' })
    ctx.effect(() => {
      const dispose = ctx.typert.register({ package: '@deepseek-ai/dsh-plugin-chaos-at-file', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: CHAOS_AT_FILE_INVOCATIONS })
      return () => { void dispose() }
    }, 'chaos-at-file: Typert manifest')
    // The event is agent-scoped, so the listener is installed per agent and
    // withdraws with that agent; the boundary itself is `mentionPreStep`.
    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> =>
      mentionPreStep(
        agent,
        () => this.settings.get().enabled,
        messages,
        signal,
        next,
        () => this.settings.get().ignorePastedMentions,
      ))
  }

  /**
   * Index the addressed agent's workspace within the configured bounds. The
   * browser caches the answer per session and filters it per keystroke.
   * @param agent - the live agent resolved from the wire `agentId`; its session
   *   header owns the workspace directory.
   * @param signal - caller lifetime; the walk races every filesystem await against it.
   * @returns the workspace entries, each with its relative and absolute path.
   * @throws Error when the surface is disabled or the session has no workspace directory.
   */
  @Remote('search')
  async remoteExportSearch(agent: Agent, signal: AbortSignal): Promise<readonly FileEntry[]> {
    const settings = this.settings.get()
    if (!settings.enabled) {
      throw new Error('chaos-at-file: the @ path surface is disabled in Settings')
    }
    const cwd = agent.session.header.cwd
    if (cwd === undefined) {
      throw new Error('chaos-at-file: this session has no workspace directory')
    }
    const index = await indexWorkspace(cwd, {
      maxFiles: this.config.maxIndexedFiles,
      ignoreDirs: this.config.ignoreDirs,
      ignoreFiles: effectiveIgnoreFiles(settings, cwd),
    }, signal)
    return index.files
  }
}
