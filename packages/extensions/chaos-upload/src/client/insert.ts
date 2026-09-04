/**
 * Pure computations behind the draft mention insertion: the detect-plane end
 * offset of the current draft (chips count as one detect character while
 * occupying their clipboard length) and the mention text to append.
 */
import type { InputState, TokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Detect-plane offset of the draft's end. In the detect projection every
 * reference chip is one character while its clipboard form occupies
 * {@link InputState.occurrences occurrence} length, so each occurrence shrinks
 * the clipboard length by its length minus one.
 * @param draft - clipboard-text projection of the editor document.
 * @param occurrences - live chip occurrences, any order.
 * @returns the detect offset of the document end.
 */
export function endDetectOffset(draft: string, occurrences: readonly { readonly length: number }[]): number {
  const chipShrink = occurrences.reduce((total, occurrence) => total + occurrence.length - 1, 0)
  return draft.length - chipShrink
}

/**
 * Build the collapsed end-of-draft span guarded by the input revision.
 * @param state - live input state.
 * @returns the span addressing the draft end in detect coordinates.
 */
export function endOfDraftSpan(state: Pick<InputState, 'draft' | 'draftRev' | 'occurrences'>): TokenSpan {
  const end = endDetectOffset(state.draft, state.occurrences)
  return { start: end, end, draftRev: state.draftRev }
}

/**
 * The mention text to append for one uploaded path: a separating space when
 * the draft needs one, the `@path` token, and a trailing space.
 * @param draft - clipboard-text projection of the editor document.
 * @param relative - workspace-relative path to reference.
 * @returns the text to insert at the draft end.
 */
export function mentionInsertText(draft: string, relative: string): string {
  const needsSpace = draft !== '' && !/\s$/u.test(draft)
  return `${needsSpace ? ' ' : ''}@${relative} `
}
