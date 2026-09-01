/**
 * The `chaos-at-file` settings namespace: the enable switch, the paste policy,
 * and the basename filters the Settings page manages. The owner scope is read
 * live on every index and boundary call, so a change takes effect without a
 * restart. The browser half reads and writes the same namespace through the
 * Harness settings wire (`ctx.settingsScope`), never a plugin-private route.
 */
import z from '@deepseek-ai/schemastery'
import { DEFAULT_IGNORE_FILES } from './defaults.ts'
import type { AtFileSettings, FileIgnoreRule } from './types.ts'

/** The registered namespace name, shared by the Host owner and the browser scope. */
export const AT_FILE_SETTINGS_NAMESPACE = 'chaos-at-file'

/** One structured filter rule, as stored and as rendered by the Settings page. */
const ignoreRuleSchema = z.object({
  kind: z.union(['exact', 'regex'] as const).default('exact'),
  pattern: z.string().default(''),
  caseSensitive: z.boolean().default(false),
}) as z<FileIgnoreRule>

/** One filter entry: a legacy string or a structured rule. */
const ignoreRuleInputSchema = z.union([z.string(), ignoreRuleSchema])

/** Schemastery schema of the `chaos-at-file` section. */
export const AtFileSettingsSchema: z<AtFileSettings> = z.object({
  enabled: z.boolean().default(true),
  ignoreFiles: z.array(ignoreRuleInputSchema).default([...DEFAULT_IGNORE_FILES]),
  workspaceIgnoreFiles: z.array(z.object({
    workspace: z.string().default(''),
    ignoreFiles: z.array(ignoreRuleInputSchema).default([]),
  })).default([]),
  ignorePastedMentions: z.boolean().default(true),
}) as z<AtFileSettings>
