'use client'
import type { ReaderDocument } from '@/types/reader'
import { useReaderStore } from '@/lib/state/readerStore'
import { useI18n } from '@/lib/i18n'

export function OutlinePanel({ document }: { document: ReaderDocument }) {
  const { t } = useI18n()
  const currentId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const seekTo = useReaderStore((s) => s.seekTo)

  if (document.chapters.length === 0) {
    return <p className="meta">{t('reader.noOutline')}</p>
  }

  return (
    <nav aria-label={t('reader.outline')}>
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
            <span className="t">{chapter.title || t('reader.untitledChapter')}</span>
          </button>
        )
      })}
    </nav>
  )
}
