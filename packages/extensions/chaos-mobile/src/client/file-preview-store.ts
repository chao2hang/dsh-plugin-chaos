/**
 * Shared client store for file preview overlay state.
 *
 * Provides reactive open/close control across chat file clicks,
 * markdown file references, tool cards, and the preview modal.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-mobile/file-preview-store
 */

/** State of the active file preview. */
export interface FilePreviewState {
  readonly open: boolean
  readonly path: string
}

const INITIAL_STATE: FilePreviewState = {
  open: false,
  path: '',
}

class FilePreviewStore {
  private state: FilePreviewState = INITIAL_STATE
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): FilePreviewState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  open = (path: string): void => {
    if (!path) return
    this.state = { open: true, path }
    this.emit()
  }

  close = (): void => {
    if (!this.state.open) return
    this.state = { ...this.state, open: false }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** Global singleton store for file preview. */
export const filePreviewStore = new FilePreviewStore()
