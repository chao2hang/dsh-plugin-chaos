import type { ReactNode } from 'react'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'

/**
 * Render the Session-scoped export result dialog.
 * @param props - Session runtime, download controller, and localized dialog copy.
 * @returns the dialog mounted with the current Session header.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  return <SessionLogDownloadDialog {...props} />
}
