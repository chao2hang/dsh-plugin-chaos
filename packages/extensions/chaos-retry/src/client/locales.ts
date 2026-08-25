/** `chaos-retry` namespace dictionaries. */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The retry strip's copy. */
    'chaos-retry': RetryKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'end.error': '对话异常结束',
  'end.interrupted': '对话已中断',
  'end.maxTokens': '对话达到输出上限',
  'end.crashed': '服务重启，回合被中断',
  'action.retry': '重试',
  'action.retryAria': '重新发送上一条消息',
  'node.interrupted': '此处回合因服务停止而中断',
} satisfies Record<string, string>

/** The chaos-retry namespace key union. */
export type RetryKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'end.error': 'Conversation ended with an error',
  'end.interrupted': 'Conversation was interrupted',
  'end.maxTokens': 'Conversation hit the output-token cap',
  'end.crashed': 'The turn was cut short by a server restart',
  'action.retry': 'Retry',
  'action.retryAria': 'Resend the last message',
  'node.interrupted': 'This turn was interrupted when the server stopped',
} satisfies Record<RetryKey, string>
