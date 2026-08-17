'use client'
import type { ReaderDocument } from '@/types/reader'
import { useReaderStore } from '@/lib/state/readerStore'

export function OutlinePanel({ document }: { document: ReaderDocument }) {
  const currentId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const seekTo = useReaderStore((s) => s.seekTo)

  if (document.chapters.length === 0) {
    return <p className="meta">本文没有标题，无法生成大纲</p>
  }

  return (
    <nav aria-label="大纲">
      {document.chapters.map((chapter, i) => {
        const firstId = chapter.sentenceIds.find((id) => speakableIds.includes(id))
        const active = currentId !== null && chapter.sentenceIds.includes(currentId)
        return (
          <button
            key={chapter.id}
            type="button"
            disabled={!firstId}
            aria-current={active ? 'true' : undefined}
            className={`outline-row ${active ? 'active' : ''}`}
            onClick={() => {
              if (firstId) seekTo(firstId)
            }}
          >
            <span className="idx" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="t">{chapter.title || '（无标题）'}</span>
          </button>
        )
      })}
    </nav>
  )
}
