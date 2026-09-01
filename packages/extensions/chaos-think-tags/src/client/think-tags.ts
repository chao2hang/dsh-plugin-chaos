import type { AssistantBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/** Convert provider-emitted think delimiters in text blocks into reasoning blocks. */
export function normalizeThinkTags(blocks: readonly AssistantBlock[]): AssistantBlock[] {
  const normalized: AssistantBlock[] = []
  let reasoning = false
  const append = (kind: 'text' | 'reasoning', text: string): void => {
    if (text === '') return
    const previous = normalized.at(-1)
    if (previous?.kind === kind) {
      normalized[normalized.length - 1] = { kind, text: previous.text + text }
    } else {
      normalized.push({ kind, text })
    }
  }
  const parseText = (source: string): void => {
    let offset = 0
    while (offset < source.length) {
      const marker = reasoning ? CLOSE_TAG : OPEN_TAG
      const markerAt = source.indexOf(marker, offset)
      if (markerAt === -1) {
        append(reasoning ? 'reasoning' : 'text', source.slice(offset))
        return
      }
      append(reasoning ? 'reasoning' : 'text', source.slice(offset, markerAt))
      reasoning = !reasoning
      offset = markerAt + marker.length
    }
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block === undefined) continue
    if (block.kind !== 'text') {
      normalized.push(block)
      continue
    }
    let source = block.text
    while (true) {
      const next = blocks[index + 1]
      if (next?.kind !== 'text') break
      index += 1
      source += next.text
    }
    parseText(source)
  }
  return normalized
}
