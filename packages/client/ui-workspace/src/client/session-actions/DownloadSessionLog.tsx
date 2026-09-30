/**
 * The download action: a `sidebar.workspaces.session.menu.item` row over one
 * injected behavior. The entry is always offered — archived rows keep their
 * persisted log — and the injected callback owns the service resolution and
 * the browser download.
 */
import { IconDownloadOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DownloadSessionLogInjected, SessionMenuItemProps } from '../contract/slots.ts'

/**
 * Menu row: start a browser download of the Session's persisted log archive.
 * @param props - owner share, the download share, and the menu open state.
 * @returns the row.
 */
export function DownloadSessionLogMenuItem(props: SessionMenuItemProps<DownloadSessionLogInjected>) {
  const { sessionId, useMenuOpenState, downloadSessionLog, t } = props
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={<IconDownloadOutlineRegular />}
      onSelect={() => {
        setMenuOpen(false)
        downloadSessionLog(sessionId)
      }}
    >
      {t('menu.downloadLog')}
    </MenuItemButton>
  )
}
