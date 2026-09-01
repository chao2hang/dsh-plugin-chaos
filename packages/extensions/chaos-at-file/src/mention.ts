/**
 * The Host reference marker: recognizes `@path` tokens in the user's own
 * outgoing messages, confirms each path exists inside the session workspace,
 * and appends a message carrying only that path and its kind. No file bytes
 * and no directory listing are read here — the agent decides whether to
 * inspect a reference with the tools it already has. Only `user`-sourced text
 * is scanned, so text from another producer cannot forge the gesture.
 */
import { isAbsolute, relative as pathRelative, resolve, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import {
  isProtectedMentionToken, PASTED_MENTION_MARKER, stripPastedMentionMarkers,
} from './paste.ts'

/** One recognized reference: its workspace-relative path and resolved kind. */
export interface Mention {
  /** Workspace-relative path, without the leading `@` or a trailing slash. */
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** One validated workspace path reference appended at the pre-step boundary. */
    'chaos-at-file-mention': { kind: 'chaos-at-file-mention'; relative: string }
  }
}

/** The message source this boundary scans; other producers cannot forge it. */
const USER_SOURCE_KIND = 'user'

/** The token grammar: `@` followed by a path with no whitespace and no second `@`. */
const MENTION_PATTERN = /@([^\s@]+)/gu

/**
 * Scan one text block for `@path` tokens, deduplicated in first-seen order.
 * A trailing slash (the directory spelling) is dropped from the path.
 * @param text - one message text block.
 * @param ignorePastedMentions - when true, tokens carrying the paste marker are skipped.
 * @returns the unique workspace-relative tokens in first-seen order.
 */
export function scanMentions(text: string, ignorePastedMentions = true): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    if (ignorePastedMentions && isProtectedMentionToken(raw)) continue
    const unmarked = ignorePastedMentions ? raw : stripPastedMentionMarkers(raw)
    const relative = unmarked.endsWith('/') ? unmarked.slice(0, -1) : unmarked
    if (relative === '' || seen.has(relative)) continue
    seen.add(relative)
    out.push(relative)
  }
  return out
}

/**
 * Resolve one token inside the workspace and read its kind.
 * @param token - a workspace-relative token.
 * @param cwd - the session's workspace directory.
 * @param signal - caller lifetime.
 * @returns the resolved reference, or undefined when the path escapes the
 *   workspace or does not exist.
 */
async function resolveMention(
  token: string,
  cwd: string,
  signal: AbortSignal,
): Promise<Mention | undefined> {
  if (isAbsolute(token)) return undefined
  const absolute = resolve(cwd, token)
  const confined = pathRelative(cwd, absolute)
  if (confined === '..' || confined.startsWith(`..${sep}`) || isAbsolute(confined)) return undefined
  signal.throwIfAborted()
  const info = await stat(absolute).catch(() => undefined)
  signal.throwIfAborted()
  if (info === undefined) return undefined
  return { relative: confined.split(sep).join('/') || '.', kind: info.isDirectory() ? 'dir' : 'file' }
}

/** Escape one XML-like attribute value without altering the referenced path. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** The existence-only reference text one validated mention contributes. */
function referenceForm(mention: Mention): string {
  const kind = mention.kind === 'dir' ? 'directory' : 'file'
  return `<workspace-reference path="${escapeAttribute(mention.relative)}" kind="${kind}" />`
}

/**
 * Turn every `@path` token into one validated existence-only reference, in
 * first-seen order. A token that names nothing inside the workspace stays
 * ordinary prose.
 * @param messages - the user's claimed messages for this step.
 * @param cwd - the session's workspace directory.
 * @param signal - caller lifetime.
 * @param ignorePastedMentions - when true, pasted tokens are not references.
 * @returns the reference messages to append; empty when nothing resolved.
 */
export async function expandMentions(
  messages: readonly UserMessage[],
  cwd: string | undefined,
  signal: AbortSignal,
  ignorePastedMentions = true,
): Promise<UserMessage[]> {
  if (cwd === undefined || !isAbsolute(cwd)) return []
  const tokens: string[] = []
  for (const message of messages) {
    if (message.source.kind !== USER_SOURCE_KIND) continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      const text = ignorePastedMentions ? block.text : stripPastedMentionMarkers(block.text)
      tokens.push(...scanMentions(text, ignorePastedMentions))
    }
  }
  const seen = new Set<string>()
  const injections: UserMessage[] = []
  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)
    signal.throwIfAborted()
    const mention = await resolveMention(token, cwd, signal)
    if (mention === undefined) continue
    injections.push(createUserMessage({
      content: [{ type: 'text', text: referenceForm(mention) }],
      source: { kind: 'chaos-at-file-mention', relative: mention.relative },
    }))
  }
  return injections
}

/** Remove every paste marker from the user's own messages before they are sent. */
function stripMarkers(messages: readonly UserMessage[]): readonly UserMessage[] {
  let changedAny = false
  const cleaned = messages.map((message) => {
    if (message.source.kind !== USER_SOURCE_KIND) return message
    let changed = false
    const content = message.content.map((block) => {
      if (block.type !== 'text' || !block.text.includes(PASTED_MENTION_MARKER)) return block
      changed = true
      return { ...block, text: stripPastedMentionMarkers(block.text) }
    })
    if (!changed) return message
    changedAny = true
    return { ...message, content }
  })
  return changedAny ? cleaned : messages
}

/** The session facts this boundary reads. */
export interface MentionAgent {
  session: { header: { cwd?: string } }
}

/**
 * The `agent/pre-step` waterfall body: strip paste markers from the user's
 * words, then append one existence-only reference per resolved `@path`.
 * @param agent - the addressed agent; its session header owns the workspace.
 * @param isEnabled - live settings read for the whole surface.
 * @param messages - the claimed messages, i.e. the user's own words.
 * @param signal - caller lifetime.
 * @param next - the downstream waterfall.
 * @param ignorePastedMentions - live settings read for the paste policy.
 * @returns the downstream decision with references appended.
 */
export async function mentionPreStep(
  agent: MentionAgent,
  isEnabled: () => boolean,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  next: () => Promise<PreStepDecision>,
  ignorePastedMentions: () => boolean = () => true,
): Promise<PreStepDecision> {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  const pasted = ignorePastedMentions()
  const cleaned = pasted ? stripMarkers(decision.messages) : decision.messages
  const unchanged = cleaned === decision.messages
  if (!isEnabled()) {
    return unchanged ? decision : { kind: 'enter', messages: [...cleaned] }
  }
  const injections = await expandMentions(messages, agent.session.header.cwd, signal, pasted)
  if (injections.length === 0) {
    return unchanged ? decision : { kind: 'enter', messages: [...cleaned] }
  }
  return { kind: 'enter', messages: [...cleaned, ...injections] }
}
