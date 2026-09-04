/**
 * Desktop file intake: capture-phase document listeners that route pasted
 * and dropped non-image files into the `chaosUpload` service. Capture phase
 * at document is deterministic — it runs before both the composer editor's
 * paste handling and the image rail's drop listener — so an intercepted
 * event never reaches the core's image-only intake, and an unintercepted
 * one (text-only, or raster images only) keeps the core flow untouched.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'

/** The composer card marker the paste gate requires. */
const COMPOSER_CARD = '[data-composer-card]'

/** Raster media types the core image intake accepts; every other file uploads. */
const RASTER_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * Whether one file rides the core image rail rather than the upload path.
 * @param file - the browser file to classify.
 * @returns true for the four raster types the draft-image intake accepts.
 */
export function isRasterImage(file: File): boolean {
  return RASTER_IMAGE_TYPES.has(file.type)
}

/** Everything the intake needs that the browser bundle supplies (tests stub). */
export interface DesktopIntakeDeps {
  /** The session whose composer is active; undefined leaves the event untouched. */
  currentSessionId(): SessionId | undefined
  /** Route one intercepted file batch: images to the rail, others to the workspace. */
  routeFiles(sessionId: SessionId, files: readonly File[]): void
}

/** Collect the files one clipboard or drag payload carries. */
function filesOf(dataTransfer: DataTransfer | null): readonly File[] {
  return Array.from(dataTransfer?.files ?? [])
}

/** Whether the batch carries at least one file that is not a raster image. */
function carriesUpload(files: readonly File[]): boolean {
  return files.some(file => !isRasterImage(file))
}

/** Whether one paste landed inside the session composer card. */
function inComposerCard(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(COMPOSER_CARD) !== null
}

/**
 * Install the capture-phase paste and drop listeners.
 * @param deps - current-session resolution and the routing callback.
 * @returns the disposer removing both listeners.
 */
export function installDesktopFileIntake(deps: DesktopIntakeDeps): () => void {
  if (typeof document === 'undefined') return () => {}

  const intercept = (event: Event, files: readonly File[]): void => {
    if (files.length === 0 || !carriesUpload(files)) return
    const sessionId = deps.currentSessionId()
    if (sessionId === undefined) return
    event.preventDefault()
    event.stopPropagation()
    deps.routeFiles(sessionId, files)
  }

  const onPaste = (event: Event): void => {
    if (!inComposerCard(event.target)) return
    intercept(event, filesOf((event as ClipboardEvent).clipboardData))
  }

  const onDrop = (event: Event): void => {
    intercept(event, filesOf((event as DragEvent).dataTransfer))
    // The image rail's drop listener owns the overlay reset; stopping the
    // event keeps it from running, so end the drag for it synthetically.
    if (event.defaultPrevented && typeof window !== 'undefined') {
      const end = typeof DragEvent === 'function' ? new DragEvent('dragend') : new Event('dragend')
      window.dispatchEvent(end)
    }
  }

  document.addEventListener('paste', onPaste, true)
  document.addEventListener('drop', onDrop, true)
  return () => {
    document.removeEventListener('paste', onPaste, true)
    document.removeEventListener('drop', onDrop, true)
  }
}
