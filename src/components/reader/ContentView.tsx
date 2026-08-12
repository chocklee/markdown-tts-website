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
              <a key={i} href={safe} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {part.text}
              </a>
            )
          }
        }
        let content: React.ReactNode = part.text
        if (part.code) content = <code className="rounded bg-slate-100 px-1">{content}</code>
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
      const sizes: Record<string, string> = {
        h1: 'mt-8 mb-4 text-3xl font-bold',
        h2: 'mt-8 mb-3 text-2xl font-bold',
        h3: 'mt-6 mb-2 text-xl font-semibold',
      }
      return (
        <Tag id={`block-${block.id}`} className={sizes[Tag] ?? 'mt-6 mb-2 text-lg font-semibold'}>
          {renderInline(block.node)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p className="my-3 leading-8">{renderInline(block.node)}</p>
    case 'list': {
      const node = block.node
      const ordered = node.type === 'list' ? node.ordered : false
      const items = node.type === 'list' ? node.children : []
      const ListTag = ordered ? 'ol' : 'ul'
      return (
        <ListTag className={`my-3 space-y-1 ${ordered ? 'list-decimal' : 'list-disc'} pl-6`}>
          {items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ListTag>
      )
    }
    case 'blockquote':
      return <blockquote className="my-3 border-l-4 border-slate-300 pl-4 text-slate-600">{renderInline(block.node)}</blockquote>
    case 'code':
      if (skipCode) {
        return <p className="my-3 rounded bg-slate-100 p-3 text-sm text-slate-400">已跳过代码块，可在朗读设置中开启</p>
      }
      return (
        <pre
          data-sent-block={block.sentenceIds.join(' ')}
          className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100"
        >
          <code>{block.text}</code>
        </pre>
      )
    case 'table': {
      const node = block.node
      if (node.type !== 'table') return null
      if (skipTable) {
        return <p className="my-3 rounded bg-slate-100 p-3 text-sm text-slate-400">已跳过表格，可在朗读设置中开启</p>
      }
      return (
        <div data-sent-block={block.sentenceIds.join(' ')} className="my-3 overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>
              {node.children.map((row, i) => (
                <tr key={i}>
                  {row.children.map((cell, j) => (
                    <td key={j} className={`border border-slate-300 px-3 py-1 ${i === 0 ? 'bg-slate-100 font-medium' : ''}`}>
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
      return <hr className="my-6 border-slate-200" />
    default:
      return null
  }
}

function HighlightDriver({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const activeSentenceId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
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
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeSentenceId, skipCode, skipTable, containerRef])

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
