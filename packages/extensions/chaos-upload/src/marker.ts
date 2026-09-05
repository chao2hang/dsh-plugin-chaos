/**
 * The Host reference marker: recognises `@<upload-dir>/...` tokens in the
 * user's own outgoing messages, confirms each names an existing file inside
 * the session workspace, and appends one existence-only message per validated
 * path. File content never crosses this boundary; the agent decides whether
 * to read a referenced path with the tools its session already has. Only
 * `user`-sourced text is scanned, so text from another producer cannot forge
 * the gesture.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { workspaceFileExists } from './upload.ts'

/** One recognised reference: its workspace-relative path. */
export interface UploadMention {
  /** Workspace-relative path, without the leading `@`. */
  readonly relative: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** One validated uploaded-path reference appended at the pre-step boundary. */
    'chaos-upload-mention': { kind: 'chaos-upload-mention'; relative: string }
  }
}

/** The message source this boundary scans; other producers cannot forge it. */
const USER_SOURCE_KIND = 'user'

/** The token grammar: `@` followed by a path with no whitespace and no second `@`. */
const MENTION_PATTERN = /@([^\s@]+)/gu

/** Escape one XML-like attribute value without altering the referenced path. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * The existence-only reference text one validated mention contributes.
 * @param mention - the validated upload mention to render.
 * @returns the self-closing `workspace-reference` element for the mention.
 */
export function uploadReferenceForm(mention: UploadMention): string {
  return `<workspace-reference path="${escapeAttribute(mention.relative)}" kind="file" />`
}

/**
 * Scan one text block for `@<dir>/...` tokens, deduplicated in first-seen
 * order. A trailing slash (the directory spelling) drops the token.
 * @param text - one message text block.
 * @param dir - the configured workspace-relative upload directory.
 * @returns the unique workspace-relative tokens in first-seen order.
 */
export function scanUploadMentions(text: string, dir: string): readonly string[] {
  const prefix = `${dir}/`
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    const relative = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (!relative.startsWith(prefix) || relative === prefix || seen.has(relative)) continue
    seen.add(relative)
    out.push(relative)
  }
  return out
}

/**
 * Turn every `@<dir>/...` token into one validated existence-only reference,
 * in first-seen order. A token that names no existing file inside the
 * workspace stays ordinary prose.
 * @param messages - the user's claimed messages for this step.
 * @param cwd - the session's workspace directory.
 * @param dir - the configured workspace-relative upload directory.
 * @param signal - caller lifetime.
 * @returns the reference messages to append; empty when nothing resolved.
 */
export async function expandUploadMentions(
  messages: readonly UserMessage[],
  cwd: string | undefined,
  dir: string,
  signal: AbortSignal,
): Promise<UserMessage[]> {
  if (cwd === undefined) return []
  const tokens: string[] = []
  for (const message of messages) {
    if (message.source.kind !== USER_SOURCE_KIND) continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      tokens.push(...scanUploadMentions(block.text, dir))
    }
  }
  const injections: UserMessage[] = []
  for (const relative of [...new Set(tokens)]) {
    signal.throwIfAborted()
    if (!await workspaceFileExists(cwd, relative, signal)) continue
    injections.push(createUserMessage({
      content: [{ type: 'text', text: uploadReferenceForm({ relative }) }],
      source: { kind: 'chaos-upload-mention', relative },
    }))
  }
  return injections
}

/** The session facts this boundary reads. */
export interface MentionAgent {
  session: { header: { cwd?: string } }
}

/**
 * The `agent/pre-step` waterfall body: append one existence-only reference per
 * validated uploaded-path mention.
 * @param agent - the addressed agent; its session header owns the workspace.
 * @param isEnabled - live config read for the whole surface.
 * @param dir - the configured workspace-relative upload directory.
 * @param messages - the claimed messages, i.e. the user's own words.
 * @param signal - caller lifetime.
 * @param next - the downstream waterfall.
 * @returns the downstream decision with references appended.
 */
export async function uploadMentionPreStep(
  agent: MentionAgent,
  isEnabled: () => boolean,
  dir: string,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  const decision = await next()
  if (decision.kind === 'reject' || !isEnabled()) return decision
  const injections = await expandUploadMentions(messages, agent.session.header.cwd, dir, signal)
  if (injections.length === 0) return decision
  return { kind: 'enter', messages: [...decision.messages, ...injections] }
}
