/**
 * The marker distinguishing a pasted @ token from one the user typed. The
 * browser half inserts it during a paste; the Host boundary removes it from
 * every message before the prompt reaches the model, so it is never
 * model-visible. Word joiner has no glyph, so the visible draft is unchanged.
 */

/** The zero-width marker inserted after a pasted `@`. */
export const PASTED_MENTION_MARKER = '\u2060'

/** An `@` that opens a token: the next character is neither space nor another `@`. */
const MENTION_START = /@(?=[^\s@])/gu

/**
 * Mark every `@` that opens a token in pasted text.
 * @param text - the clipboard text.
 * @returns the same text with each token-opening `@` marked.
 */
export function protectPastedMentions(text: string): string {
  return text.replaceAll(MENTION_START, `@${PASTED_MENTION_MARKER}`)
}

/**
 * Whether one parsed token came from pasted text.
 * @param token - the token body after `@`.
 * @returns true when the token carries the paste marker.
 */
export function isProtectedMentionToken(token: string): boolean {
  return token.includes(PASTED_MENTION_MARKER)
}

/**
 * Remove every marker, restoring the text a consumer or the model sees.
 * @param text - text that may carry markers.
 * @returns the text without markers.
 */
export function stripPastedMentionMarkers(text: string): string {
  return text.replaceAll(PASTED_MENTION_MARKER, '')
}
