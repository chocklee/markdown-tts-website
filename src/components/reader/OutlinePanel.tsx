'use client'
import type { ReaderDocument } from '@/types/reader'
import { useReaderStore } from '@/lib/state/readerStore'

export function OutlinePanel({ document }: { document: ReaderDocument }) {
  const currentId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const seekTo = useReaderStore((s) => s.seekTo)

  if (document.chapters.length === 0) {
    return <p className="text-sm text-slate-400">本文没有标题，无法生成大纲</p>
  }

  return (
    <nav aria-label="大纲">
      <h2 className="mb-2 text-sm font-semibold text-slate-500">大纲</h2>
      <ul className="space-y-1">
        {document.chapters.map((chapter) => {
          const firstId = chapter.sentenceIds.find((id) => speakableIds.includes(id))
          const active = currentId !== null && chapter.sentenceIds.includes(currentId)
          return (
            <li key={chapter.id}>
              <button
                type="button"
                className={`w-full truncate rounded px-2 py-1 text-left text-sm ${
                  active ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => {
                  if (firstId) seekTo(firstId)
                }}
              >
                {chapter.title || '（无标题）'}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
