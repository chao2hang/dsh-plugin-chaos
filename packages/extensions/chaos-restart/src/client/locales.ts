/** `chaos-restart` namespace dictionaries. */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The System settings section's copy. */
    'chaos-restart': RestartKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '系统',
  'title': '重启服务',
  'description': '用新进程替换当前服务。会话记录保存在磁盘上，重启后自动恢复。',
  'action.restart': '重启',
  'action.cancel': '取消',
  'action.confirm': '确认重启',
  'confirm.title': '确认重启服务？',
  'confirm.body': '进行中的回合会被中断，重启后可在对话里点击「重试」继续。已完成的对话记录不受影响。',
  'confirm.busy': '当前有 {count} 个会话正在运行，重启会中断它们。',
  'status.restarting': '正在重启，请稍候…',
  'unsupported': '当前启动方式不支持自助重启。',
  'error': '重启失败：{reason}',
} satisfies Record<string, string>

/** The chaos-restart namespace key union. */
export type RestartKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'System',
  'title': 'Restart server',
  'description': 'Replace the running server with a fresh process. Sessions are stored on disk and come back automatically.',
  'action.restart': 'Restart',
  'action.cancel': 'Cancel',
  'action.confirm': 'Restart now',
  'confirm.title': 'Restart the server?',
  'confirm.body': 'An in-flight turn is cut short; you can continue it from the conversation with Retry afterwards. Completed history is unaffected.',
  'confirm.busy': '{count} session(s) are running right now and will be interrupted.',
  'status.restarting': 'Restarting, please wait…',
  'unsupported': 'This launch method does not support self-restart.',
  'error': 'Restart failed: {reason}',
} satisfies Record<RestartKey, string>
