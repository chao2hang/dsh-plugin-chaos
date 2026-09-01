import { Fragment, memo, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps, TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { DisclosureRow, IconThinkOutline14, JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'
import { normalizeThinkTags } from './think-tags.ts'
import css from './ThinkTagAssistantNodeView.module.css'

/** Render one normalized reasoning block through the shared disclosure primitive. */
function ThinkRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const summary = text.split('\n', 1)[0] ?? ''
  return (
    <div className={css.root} data-variant="think">
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={<IconThinkOutline14 size={14} />}
        title="Think"
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => { setOpen(value => !value) }}
        collapsedContent={(
          <>
            <span className={css.separator} aria-hidden />
            <span className={css.summary}>{summary}</span>
          </>
        )}
      >
        <div className={css.body}>{text}</div>
      </DisclosureRow>
    </div>
  )
}

/** Render assistant blocks after presentation-only think-tag normalization. */
function ThinkTagAssistantContent({
  blocks, streaming, renderMessageImages, mentions, t,
}: Pick<ChatNodeViewProps<'assistant-step'>, 'renderMessageImages' | 't'> & {
  blocks: readonly AssistantBlock[]
  streaming: boolean
  mentions: MarkdownFileMentions | undefined
}) {
  const labels = useMemo(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])
  const rendered: ReactNode[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (block === undefined) continue
    switch (block.kind) {
      case 'text':
        rendered.push(<MarkdownText key={index} text={block.text} streaming={streaming} labels={labels} fileMentions={mentions} />)
        break
      case 'reasoning':
        rendered.push(<ThinkRow key={index} text={block.text} />)
        break
      case 'image': {
        const start = index
        const group = [block]
        while (true) {
          const next = blocks[index + 1]
          if (next?.kind !== 'image') break
          group.push(next)
          index += 1
        }
        rendered.push(<Fragment key={start}>{renderMessageImages({ images: group.map(({ attachment }) => ({ attachment })), align: 'start' })}</Fragment>)
        break
      }
      case 'tool-call':
        break
      default:
        rendered.push(<JsonBlock key={index} label={t('message.unknownBlock')} payload={block.block} truncatedLabel={total => t('json.truncated', { total })} />)
    }
  }
  return <div>{rendered}</div>
}

/** Assistant renderer that routes provider-emitted think tags to the Think disclosure. */
export const ThinkTagAssistantNodeView = memo(function ThinkTagAssistantNodeView({
  node, useTurnData, openFile, renderMessageImages, fileMentions, t,
}: ChatNodeViewProps<'assistant-step'>) {
  const data = node.data
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined
  const tail = useTurnData('turn-tail')
  const owner = useMemo<TurnTailOwnerProps | undefined>(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined
    return { turn, seq: data.finalNode.seq, openFile }
  }, [data.finalNode, openFile, tail, turn])
  const mentions = useMemo(() => owner === undefined ? undefined : fileMentions(owner), [fileMentions, owner])
  const blocks = useMemo(() => normalizeThinkTags(data.blocks), [data.blocks])
  return <ThinkTagAssistantContent blocks={blocks} streaming={data.status === 'running'} renderMessageImages={renderMessageImages} mentions={mentions} t={t} />
})
