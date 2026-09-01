/**
 * Workspace `@path` references for the Web composer, Host half. The service
 * owns the durable settings section, the bounded workspace path index the
 * browser picker searches, and the pre-step marker that turns each validated
 * `@path` into an existence-only reference the model can act on.
 *
 * The browser half ships in the same package (`./client`) and is discovered
 * through the package.json `dsh.client` declaration.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-at-file
 */

export { AtFileRuntime, AtFileRuntime as default, type Config } from './runtime.ts'
export {
  compileIgnoreRules, compileRegex, DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_FILES,
  defaultAtFileSettings, effectiveIgnoreFiles, ignoreFilesSettingsKey, ignoreRuleKey,
  normalizeIgnoreFiles, normalizeIgnoreRule, normalizeWorkspaceIgnoreFiles,
  workspaceIgnoreFilesFor, workspacePathKey,
} from './defaults.ts'
export { indexWorkspace, type IndexOptions, type OpenWorkspaceDirectory, type WorkspaceIndex } from './files.ts'
export {
  expandMentions, mentionPreStep, scanMentions, type Mention, type MentionAgent,
} from './mention.ts'
export {
  isProtectedMentionToken, PASTED_MENTION_MARKER, protectPastedMentions, stripPastedMentionMarkers,
} from './paste.ts'
export { AT_FILE_SETTINGS_NAMESPACE, AtFileSettingsSchema } from './settings.ts'
export type * from './types.ts'
