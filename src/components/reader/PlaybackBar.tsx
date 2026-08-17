'use client'
import { useRef } from 'react'
import { useReaderStore } from '@/lib/state/readerStore'
import { IconPlay, IconPause } from '@/components/app/icons'

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

export function PlaybackBar() {
  const isPlaying = useReaderStore((s) => s.isPlaying)
  const currentIndex = useReaderStore((s) => s.currentIndex)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const settings = useReaderStore((s) => s.settings)
  const document = useReaderStore((s) => s.document)
  const togglePlay = useReaderStore((s) => s.togglePlay)
  const nextSentence = useReaderStore((s) => s.nextSentence)
  const prevSentence = useReaderStore((s) => s.prevSentence)
  const nextChapter = useReaderStore((s) => s.nextChapter)
  const prevChapter = useReaderStore((s) => s.prevChapter)
  const seekTo = useReaderStore((s) => s.seekTo)
  const trackRef = useRef<HTMLDivElement>(null)

  const total = speakableIds.length
  const chapters = document?.chapters ?? []
  const hasChapters = chapters.length > 0

  if (total === 0) return null

  const currentId = speakableIds[currentIndex]
  const chapterIndex = chapters.findIndex((c) => c.sentenceIds.includes(currentId ?? ''))
  const currentChapter = chapterIndex >= 0 ? chapters[chapterIndex] : null
  const progress = ((currentIndex + 1) / total) * 100

  const seekFromEvent = (clientX: number) => {
    const track = trackRef.current
    if (!track || total === 0) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    const target = Math.min(Math.floor(ratio * total), total - 1)
    const id = speakableIds[target]
    if (id) seekTo(id)
  }

  return (
    <div className="player" role="region" aria-label="播放控制">
      <div
        ref={trackRef}
        className="p-track"
        role="slider"
        aria-label="播放进度"
        aria-valuemin={1}
        aria-valuemax={Math.max(total, 1)}
        aria-valuenow={currentIndex + 1}
        tabIndex={0}
        onMouseDown={(e) => {
          e.preventDefault()
          seekFromEvent(e.clientX)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && currentIndex < total - 1) {
            const id = speakableIds[currentIndex + 1]
            if (id) seekTo(id)
          } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
            const id = speakableIds[currentIndex - 1]
            if (id) seekTo(id)
          }
        }}
      >
        <div className="rail" aria-hidden="true" />
        <div className="fill" aria-hidden="true" style={{ width: `${progress}%` }} />
        <div className="thumb" aria-hidden="true" style={{ left: `${progress}%` }} />
      </div>

      <div className="p-times">
        <span>
          {currentIndex + 1} / {total} 句
        </span>
        <span>
          {formatRate(settings.rate)}x
          {currentChapter ? ` · 第 ${chapterIndex + 1} 章 · ${currentChapter.title}` : ' · 全文'}
        </span>
      </div>

      <div className="p-row">
        <div className="p-info">
          <div className="t">{document?.title ?? ''}</div>
          <div className="m">
            {isPlaying ? '正在朗读' : '已暂停'}
            {currentChapter ? ` · ${currentChapter.title}` : ''}
          </div>
        </div>
        <div className="p-controls">
          <button type="button" className="c-btn" onClick={prevChapter} disabled={!hasChapters} aria-label="上一章">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M18 6v12M6 12l10-6v12z" />
            </svg>
          </button>
          <button type="button" className="c-btn" onClick={prevSentence} disabled={currentIndex === 0} aria-label="上一句">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="c-btn play" onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className="c-btn" onClick={nextSentence} disabled={currentIndex >= total - 1} aria-label="下一句">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <button type="button" className="c-btn" onClick={nextChapter} disabled={!hasChapters} aria-label="下一章">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6v12M18 12L8 6v12z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
