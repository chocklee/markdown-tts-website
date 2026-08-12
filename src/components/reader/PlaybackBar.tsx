'use client'
import { useReaderStore } from '@/lib/state/readerStore'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

export function PlaybackBar() {
  const isPlaying = useReaderStore((s) => s.isPlaying)
  const currentIndex = useReaderStore((s) => s.currentIndex)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const settings = useReaderStore((s) => s.settings)
  const hasChapters = useReaderStore((s) => (s.document?.chapters.length ?? 0) > 0)
  const togglePlay = useReaderStore((s) => s.togglePlay)
  const nextSentence = useReaderStore((s) => s.nextSentence)
  const prevSentence = useReaderStore((s) => s.prevSentence)
  const nextChapter = useReaderStore((s) => s.nextChapter)
  const prevChapter = useReaderStore((s) => s.prevChapter)
  const seekTo = useReaderStore((s) => s.seekTo)
  const setRate = useReaderStore((s) => s.setRate)

  const total = speakableIds.length

  return (
    <div className="border-t border-slate-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevSentence}
            disabled={total === 0}
            aria-label="上一句"
            className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={total === 0}
            aria-label={isPlaying ? '暂停' : '播放'}
            className="rounded-full bg-blue-600 p-3 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            onClick={nextSentence}
            disabled={total === 0}
            aria-label="下一句"
            className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            ⏭
          </button>
          <span className="ml-2 flex items-center border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={prevChapter}
              disabled={!hasChapters}
              aria-label="上一章"
              className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ⏪
            </button>
            <button
              type="button"
              onClick={nextChapter}
              disabled={!hasChapters}
              aria-label="下一章"
              className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ⏩
            </button>
          </span>
        </div>

        <div className="flex flex-1 items-center gap-3 px-4">
          <span className="text-xs text-slate-500">{total === 0 ? '—' : `${currentIndex + 1} / ${total} 句`}</span>
          <input
            type="range"
            min={0}
            max={Math.max(total - 1, 0)}
            value={currentIndex}
            onChange={(e) => {
              const id = speakableIds[Number(e.target.value)]
              if (id) seekTo(id)
            }}
            aria-label="进度"
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">
            语速
            <select
              value={settings.rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="ml-1 rounded border border-slate-300 px-1 py-0.5 text-sm"
              aria-label="语速"
            >
              {RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {formatRate(rate)}x
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
