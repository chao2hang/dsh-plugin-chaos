/**
 * The `chaosUpload` browser service: one upload-and-mention operation over
 * the mounted upload Remote and the session's input machine. Pure factory
 * over injected deps: the browser bundle wires the real Remote, sessions, and
 * conversation faces; tests wire stubs.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { AgentContext, ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UploadRemoteFace, UploadRequest, UploadResult } from '../types.ts'
import { base64OfFile } from './base64.ts'
import { endOfDraftSpan, mentionInsertText } from './insert.ts'

/** One settled upload-and-mention operation. */
export interface UploadAndMentionResult {
  /** The stored upload's workspace-relative path and byte length. */
  readonly upload: UploadResult
  /** Whether the draft mention landed; false leaves the path only in the result. */
  readonly mentioned: boolean
}

/** The `chaosUpload` browser service face consumed by composer surfaces. */
export interface ChaosUploadClientFace {
  /**
   * Read one browser file, store it in the addressed session's workspace, and
   * append its `@path` mention to that session's draft.
   * @param sessionId - the session that owns the draft and workspace.
   * @param file - the browser-picked file.
   * @returns the stored upload and whether the draft mention landed.
   * @throws Error when the Remote is unavailable, the upload is refused, or
   *   the file is empty.
   */
  uploadAndMention(sessionId: SessionId, file: File): Promise<UploadAndMentionResult>

  /**
   * Append one `@path` mention to the session's draft at its end.
   * @param sessionId - the session that owns the draft.
   * @param relative - workspace-relative path to reference.
   * @returns whether the input machine applied the insertion; false leaves
   *   the draft untouched for manual `@path` typing.
   */
  insertMention(sessionId: SessionId, relative: string): boolean
}

/** Everything the service needs that the browser bundle supplies (tests stub). */
export interface ChaosUploadClientDeps {
  /** Resolve the mounted upload Remote; rejects while it is unavailable. */
  remote(): Promise<UploadRemoteFace>
  /** Session-scope resolution for the addressed draft. */
  sessions: Pick<ISessions, 'scope'>
  /** Conversation input registry for draft state reads. */
  conversation: Pick<IConversation, 'input'>
}

/**
 * Build the `chaosUpload` browser service over the injected deps.
 * @param deps - Remote, sessions, and conversation faces.
 * @returns the service face to provide as `chaosUpload`.
 */
export function createChaosUploadClient(deps: ChaosUploadClientDeps): ChaosUploadClientFace {
  const store = async (sessionId: SessionId, request: UploadRequest): Promise<UploadResult> => {
    const remote = await deps.remote()
    const result = await remote.upload(sessionId, request)
    if (!result.ok) {
      throw new Error(`chaos-upload: upload failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const insertMention = (sessionId: SessionId, relative: string): boolean => {
    const actx = deps.sessions.scope(sessionId)
    if (actx === undefined) return false
    return insertMentionAtEnd(actx, deps.conversation, relative)
  }
  return {
    async uploadAndMention(sessionId, file) {
      if (file.size === 0) throw new Error('chaos-upload: upload is empty.')
      const data = await base64OfFile(file)
      const upload = await store(sessionId, { name: file.name, data })
      return { upload, mentioned: insertMention(sessionId, upload.relative) }
    },
    insertMention,
  }
}

/**
 * Append the mention text at the session draft's end through the scoped
 * insert-text event; the span CAS drops a concurrent edit instead of racing it.
 * @param actx - the session scope whose input shell listens.
 * @param conversation - the conversation input registry.
 * @param relative - workspace-relative path to reference.
 * @returns whether the input machine applied the insertion.
 */
export function insertMentionAtEnd(
  actx: AgentContext,
  conversation: Pick<IConversation, 'input'>,
  relative: string,
): boolean {
  const state = conversation.input.for(actx).state.getSnapshot()
  const span = endOfDraftSpan(state)
  return actx.bail(actx, 'slash/input-insert-text', {
    text: mentionInsertText(state.draft, relative),
    span,
  }) === true
}
