/**
 * Public path-index and filter records. This module contains types only so the
 * browser half and generated Remote client consume them without Host runtime code.
 * @module @deepseek-ai/dsh-plugin-chaos-at-file/types
 */

/** One indexed workspace entry with its absolute path and display path. */
export interface FileEntry {
  /** Absolute host path, used only to open the entry from the reference dock. */
  readonly path: string
  /** Workspace-root-relative path, forward-slashed on every platform. */
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/** One basename filter. Legacy strings remain accepted as case-insensitive exact rules. */
export interface FileIgnoreRule {
  readonly kind: 'exact' | 'regex'
  readonly pattern: string
  readonly caseSensitive: boolean
}

/** Durable and wire-accepted input for one basename filter. */
export type FileIgnoreRuleInput = string | FileIgnoreRule

/** Basename filters attached to one canonical workspace path. */
export interface WorkspaceIgnoreFiles {
  /** Canonical workspace directory path as the Harness reports it. */
  readonly workspace: string
  /** Basenames ignored only inside this workspace, added to the global rules. */
  readonly ignoreFiles: readonly FileIgnoreRuleInput[]
}

/** The `chaos-at-file` settings namespace section, shared by both halves. */
export interface AtFileSettings {
  /** Whether the @path surface is active; false hides the picker and dock and stops marking references. */
  readonly enabled: boolean
  /** Global basename filters; legacy strings are case-insensitive exact rules. */
  readonly ignoreFiles: readonly FileIgnoreRuleInput[]
  /** Workspace-specific filters applied together with the global ones. */
  readonly workspaceIgnoreFiles: readonly WorkspaceIgnoreFiles[]
  /** Whether @ tokens that arrived by paste stay ordinary text. */
  readonly ignorePastedMentions: boolean
}

/** Resolved plugin configuration (schema defaults applied). */
export interface ResolvedConfig {
  /** Hard cap on indexed entries per workspace; the walk stops and reports truncation. */
  readonly maxIndexedFiles: number
  /** Directory basenames the index walk never enters. */
  readonly ignoreDirs: readonly string[]
}
