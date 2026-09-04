/**
 * Document upload for the Web composer, Host half. The service stores
 * browser-uploaded files inside the session workspace, marks validated
 * `@uploads/...` references at the pre-step boundary so the model reads them
 * with the tools its session already has, and retains stored uploads by age
 * when `maxAgeDays` is set.
 *
 * The browser half ships in the same package (`./client`) and is discovered
 * through the package.json `dsh.client` declaration.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-upload
 */

export { ChaosUploadRuntime, ChaosUploadRuntime as default, DEFAULT_MAX_FILE_BYTES, DEFAULT_SWEEP_INTERVAL_MINUTES, DEFAULT_UPLOAD_DIR, type Config } from './runtime.ts'
export {
  expandUploadMentions, scanUploadMentions, uploadMentionPreStep, uploadReferenceForm,
  type MentionAgent, type UploadMention,
} from './marker.ts'
export { sweepUploads, type SweepDeletion, type SweepFailure, type SweepOptions, type SweepOutcome, type SweepTarget } from './sweep.ts'
export {
  decodeUploadBase64, sanitizeUploadName, uploadDirectory, workspaceFileExists, writeUpload,
} from './upload.ts'
export { CHAOS_UPLOAD_INVOCATIONS, CHAOS_UPLOAD_REMOTE } from './remote.ts'
export type * from './types.ts'
