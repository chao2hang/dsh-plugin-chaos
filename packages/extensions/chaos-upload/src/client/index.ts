/**
 * Browser half of document upload. It mounts this package's upload Remote,
 * provides the `chaosUpload` service (one upload-and-mention operation) for
 * composer surfaces such as the chaos-mobile attachment picker, and
 * intercepts pasted or dropped non-image files on the composer through
 * capture-phase document listeners. It renders no UI of its own.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CHAOS_UPLOAD_REMOTE } from '../remote.ts'
import { installDesktopFileIntake, isRasterImage } from './intake.ts'
import { createChaosUploadClient } from './service.ts'
import type { ChaosUploadClientFace } from './service.ts'
import type { UploadRemoteFace } from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Upload-and-mention over the session workspace; absent when this plugin is not mounted. */
    chaosUpload: ChaosUploadClientFace
  }
}

/** Dependencies required before this browser plugin activates. */
export const inject = ['remote', 'sessions', 'conversation']

export { createChaosUploadClient } from './service.ts'
export type { ChaosUploadClientDeps, ChaosUploadClientFace, UploadAndMentionResult } from './service.ts'
export { endDetectOffset, endOfDraftSpan, mentionInsertText } from './insert.ts'
export { installDesktopFileIntake, isRasterImage } from './intake.ts'

/**
 * Mount the upload Remote, provide the `chaosUpload` service, and install the
 * desktop paste/drop intake.
 * @param ctx - browser root context.
 */
export function apply(ctx: ClientContext): void {
  let remoteFace: UploadRemoteFace | undefined
  let settleRemote!: (face: UploadRemoteFace) => void
  let failRemote!: (reason?: unknown) => void
  const whenRemote = new Promise<UploadRemoteFace>((resolve, reject) => {
    settleRemote = resolve
    failRemote = reject
  })
  // Mark the settlement handled up front: only remote() consumers await it,
  // and a failed mount fails this plugin's effect, unloading the service
  // before any caller can observe the rejection.
  void whenRemote.catch(() => {})
  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(CHAOS_UPLOAD_REMOTE)
    const mounted = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.chaosUpload') as UploadRemoteFace | undefined
    if (mounted === undefined) {
      const error = new Error('chaos-upload: upload Remote did not mount')
      failRemote(error)
      throw error
    }
    remoteFace = mounted
    settleRemote(mounted)
    return async () => {
      remoteFace = undefined
      await dispose()
    }
  }, 'chaos-upload: upload Remote')
  const client = createChaosUploadClient({
    remote: () => (remoteFace !== undefined ? Promise.resolve(remoteFace) : whenRemote),
    sessions: ctx.sessions,
    conversation: ctx.conversation,
  })
  ctx.effect(() => ctx.reflect.provide('chaosUpload', client), 'chaos-upload: client service')

  const notify = (sessionId: SessionId, level: 'info' | 'error', text: string): void => {
    const actx = ctx.sessions.scope(sessionId)
    if (actx !== undefined) ctx.conversation.input.for(actx).notify(level, text)
  }

  /** Route one intercepted batch: raster images to the draft rail, the rest to the workspace. */
  const routeFiles = (sessionId: SessionId, files: readonly File[]): void => {
    const actx = ctx.sessions.scope(sessionId)
    if (actx === undefined) return
    // The draft-image registry lives on the concrete controller face, like
    // the chaos-mobile attachment picker reads it (same-process cast).
    const conversation = ctx.conversation as unknown as ConversationController
    const images = files.filter(isRasterImage)
    const documents = files.filter(file => !isRasterImage(file))
    if (images.length > 0) {
      try {
        const created = conversation.createDraftImages(images)
        if (!conversation.input.for(actx).addImages(created.map(image => image.id))) {
          conversation.releaseDraftImages(created)
        }
      } catch {
        conversation.input.for(actx).notify('error', '仅支持 PNG、JPEG、WebP 和 GIF 图片。')
      }
    }
    for (const file of documents) {
      client.uploadAndMention(sessionId, file)
        .then(({ upload, mentioned }) => {
          if (!mentioned) {
            notify(sessionId, 'info', `已上传 ${upload.relative}，请手动输入 @${upload.relative} 引用。`)
          }
        })
        .catch((error: unknown) => {
          notify(sessionId, 'error', error instanceof Error ? error.message : String(error))
        })
    }
  }
  ctx.effect(
    () => installDesktopFileIntake({
      currentSessionId: () => ctx.sessions.list.getSnapshot().current,
      routeFiles,
    }),
    'chaos-upload: desktop intake',
  )
}
