/**
 * Top-level file preview overlay entry mounted in the `shell.overlay` slot.
 *
 * Observes `filePreviewStore` and renders `FilePreviewModal` when open.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-mobile/FilePreviewOverlay
 */

import { memo, useSyncExternalStore } from 'react'
import { filePreviewStore } from './file-preview-store.ts'
import { FilePreviewModal } from './FilePreviewModal.tsx'

export const FilePreviewOverlay = memo(function FilePreviewOverlay() {
  const state = useSyncExternalStore(
    filePreviewStore.subscribe,
    filePreviewStore.getSnapshot,
  )

  if (!state.open) return null

  return (
    <FilePreviewModal
      open={state.open}
      path={state.path}
      onClose={filePreviewStore.close}
    />
  )
})
