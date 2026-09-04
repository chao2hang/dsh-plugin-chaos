/**
 * Public upload records. This module contains types only so the browser half
 * and the Remote descriptors consume them without Host runtime code.
 * @module @deepseek-ai/dsh-plugin-chaos-upload/types
 */

/** One browser upload request: display name plus canonical base64 bytes. */
export interface UploadRequest {
  /** Caller-declared file name; sanitised to a bare workspace basename. */
  readonly name: string
  /** Canonical base64 encoding of the file bytes. */
  readonly data: string
}

/** One admitted upload: the workspace-relative path the agent can read. */
export interface UploadResult {
  /** Workspace-relative, forward-slashed path of the stored file. */
  readonly relative: string
  /** Exact stored byte length. */
  readonly bytes: number
}

/** Resolved plugin configuration (schema defaults applied). */
export interface ResolvedConfig {
  /** Workspace-relative directory that receives every upload. */
  readonly dir: string
  /** Hard cap on one upload's decoded byte length. */
  readonly maxFileBytes: number
  /** Whether the pre-step marker validates `@dir/...` tokens. */
  readonly markers: boolean
}

/** Structural Remote face for the upload invocation, shared by both halves. */
export interface UploadRemoteFace {
  /**
   * Store one uploaded file inside the addressed agent's workspace.
   * @param agentId - the session whose workspace receives the file.
   * @param request - display name and base64 bytes.
   * @param signal - caller lifetime.
   * @returns the stored file's workspace-relative path and byte length.
   */
  upload(
    agentId: string,
    request: UploadRequest,
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: UploadResult }
    | { ok: false; error: { code: string; message: string } }
  >
}
