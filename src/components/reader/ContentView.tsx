'use client'
import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { RootContent } from 'mdast'
import type { ReaderBlock, ReaderDocument } from '@/types/reader'
import { flattenInline, groupLeavesIntoSentences, type StyledLeaf } from '@/lib/markdown/inline'
import { plainText } from '@/lib/markdown/inline'
import { sanitizeUrl } from '@/lib/security/url'
import { useReaderStore } from '@/lib/state/readerStore'

function InlineParts({ parts }: { parts: StyledLeaf[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.href) {
          const safe = sanitizeUrl(part.href)
          if (safe) {
            return (
              <a key={i} href={safe} target="_blank" rel="noreferrer">
                {part.text}
              </a>
            )
          }
        }
        let content: React.ReactNode = part.text
        if (part.code) content = <code>{content}</code>
        if (part.italic) content = <em>{content}</em>
        if (part.bold) content = <strong>{content}</strong>
        return <span key={i}>{content}</span>
      })}
    </>
  )
}

function BlockContent({
  block,
  skipCode,
  skipTable,
}: {
  block: ReaderBlock
  skipCode: boolean
  skipTable: boolean
}) {
  let idIndex = 0
  const consumeId = () => {
    const id = block.sentenceIds[idIndex]
    idIndex += 1
    return id ?? `s-extra-${idIndex}`
  }

  const renderInline = (node: RootContent) => {
    const sentences = groupLeavesIntoSentences(flattenInline(node), consumeId)
    return sentences.map((sentence) => (
      <mark key={sentence.id} data-sent={sentence.id}>
        <InlineParts parts={sentence.parts} />
      </mark>
    ))
  }

  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.min(Math.max(block.depth, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return (
        <Tag id={`block-${block.id}`}>
          {renderInline(block.node)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p>{renderInline(block.node)}</p>
    case 'list': {
      const node = block.node
      const ordered = node.type === 'list' ? node.ordered : false
      const items = node.type === 'list' ? node.children : []
      const ListTag = ordered ? 'ol' : 'ul'
      return (
        <ListTag className={ordered ? 'list-decimal' : 'list-disc'}>
          {items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ListTag>
      )
    }
    case 'blockquote':
      return <blockquote>{renderInline(block.node)}</blockquote>
    case 'code':
      if (skipCode) {
        return <p className="skipped">已跳过代码块，可在朗读设置中开启</p>
      }
      return (
        <pre data-sent-block={block.sentenceIds.join(' ')}>
          <code>{block.text}</code>
        </pre>
      )
    case 'table': {
      const node = block.node
      if (node.type !== 'table') return null
      if (skipTable) {
        return <p className="skipped">已跳过表格，可在朗读设置中开启</p>
      }
      return (
        <div data-sent-block={block.sentenceIds.join(' ')} className="table-wrap">
          <table>
            <tbody>
              {node.children.map((row, i) => (
                <tr key={i}>
                  {row.children.map((cell, j) => (
                    <td key={j} className={i === 0 ? 'head' : undefined}>
                      {plainText(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'thematicBreak':
      return <hr />
    default:
      return null
  }
}

function HighlightDriver({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const activeSentenceId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
  const firstSentenceId = useReaderStore((s) => s.speakableIds[0] ?? null)
  const skipCode = useReaderStore((s) => s.settings.skipCode)
  const skipTable = useReaderStore((s) => s.settings.skipTable)
  const firstRun = useRef(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container
      .querySelectorAll('mark.current-sentence, [data-sent-block].current-sentence')
      .forEach((el) => el.classList.remove('current-sentence'))
    if (!activeSentenceId) return
    const escaped = CSS.escape(activeSentenceId)
    const target =
      container.querySelector(`mark[data-sent="${escaped}"]`) ??
      container.querySelector(`[data-sent-block~="${escaped}"]`)
    if (!target) return
    target.classList.add('current-sentence')
    if (firstRun.current) {
      firstRun.current = false
      if (activeSentenceId && activeSentenceId !== firstSentenceId) {
        target.scrollIntoView({ behavior: 'auto', block: 'center' })
      }
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeSentenceId, firstSentenceId, skipCode, skipTable, containerRef])

  return null
}

export function ContentView({ document }: { document: ReaderDocument }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const skipCode = useReaderStore((s) => s.settings.skipCode)
  const skipTable = useReaderStore((s) => s.settings.skipTable)

  const blocks = useMemo(
    () =>
      document.blocks.map((block) => (
        <BlockContent key={block.id} block={block} skipCode={skipCode} skipTable={skipTable} />
      )),
    [document, skipCode, skipTable],
  )

  return (
    <div ref={containerRef}>
      {blocks}
      <HighlightDriver containerRef={containerRef} />
    </div>
  )
}
