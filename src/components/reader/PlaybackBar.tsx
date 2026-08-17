'use client'
import { useEffect, useRef, useState } from 'react'
import { useReaderStore } from '@/lib/state/readerStore'
import { useI18n } from '@/lib/i18n'
import { IconPlay, IconPause, IconDownload } from '@/components/app/icons'

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function SeamlessBar({ url, downloadUrl, title }: { url: string; downloadUrl: string; title: string }) {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0)
    const onTime = () => setTime(el.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => setPlaying(false)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }

  const seek = (clientX: number) => {
    const el = audioRef.current
    const track = trackRef.current
    if (!el || !track || duration <= 0) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    el.currentTime = ratio * duration
  }

  const seekFromKey = (delta: number) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.min(Math.max(el.currentTime + delta, 0), duration)
  }

  const progress = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div className="player" role="region" aria-label={t('reader.seamless')}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <div className="p-times">
        <span>{title}</span>
        <span>{formatTime(time)} / {formatTime(duration)}</span>
      </div>
      <div
        ref={trackRef}
        className="p-track"
        role="slider"
        aria-label={t('reader.seamless')}
        aria-valuemin={0}
        aria-valuemax={Math.max(duration, 1)}
        aria-valuenow={time}
        tabIndex={0}
        onMouseDown={(e) => seek(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') seekFromKey(5)
          else if (e.key === 'ArrowLeft') seekFromKey(-5)
        }}
      >
        <div className="rail" aria-hidden="true" />
        <div className="fill" aria-hidden="true" style={{ width: `${progress}%` }} />
        <div className="thumb" aria-hidden="true" style={{ left: `${progress}%` }} />
      </div>
      <div className="p-row">
        <div className="p-info">
          <div className="t">{title}</div>
          <div className="m">
            {playing ? t('reader.playing') : t('reader.paused')} · {t('reader.seamless')}
          </div>
        </div>
        <div className="p-controls">
          <button type="button" className="c-btn play" onClick={toggle} aria-label={playing ? t('reader.pause') : t('reader.play')}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <a className="c-btn" href={downloadUrl} download aria-label={t('convert.download')}>
            <IconDownload />
          </a>
        </div>
      </div>
    </div>
  )
}

export function PlaybackBar({ seamlessUrl, seamlessDownloadUrl }: { seamlessUrl?: string; seamlessDownloadUrl?: string }) {
  const { t } = useI18n()
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

  if (seamlessUrl && seamlessDownloadUrl) {
    return (
      <SeamlessBar
        url={seamlessUrl}
        downloadUrl={seamlessDownloadUrl}
        title={document?.title ?? ''}
      />
    )
  }

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
    <div className="player" role="region" aria-label={t('reader.playerLabel')}>
      <div
        ref={trackRef}
        className="p-track"
        role="slider"
        aria-label={t('reader.progressLabel')}
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
          {currentIndex + 1} / {t('reader.sentences', { n: total })}
        </span>
        <span>
          {formatRate(settings.rate)}x
          {currentChapter ? ` · ${t('reader.chapterOf', { n: chapterIndex + 1 })} · ${currentChapter.title}` : ` · ${t('reader.fullDoc')}`}
        </span>
      </div>

      <div className="p-row">
        <div className="p-info">
          <div className="t">{document?.title ?? ''}</div>
          <div className="m">
            {isPlaying ? t('reader.playing') : t('reader.paused')}
            {currentChapter ? ` · ${currentChapter.title}` : ''}
          </div>
        </div>
        <div className="p-controls">
          <button type="button" className="c-btn" onClick={prevChapter} disabled={!hasChapters} aria-label={t('reader.prevChapter')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M18 6v12M6 12l10-6v12z" />
            </svg>
          </button>
          <button type="button" className="c-btn" onClick={prevSentence} disabled={currentIndex === 0} aria-label={t('reader.prevSentence')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" className="c-btn play" onClick={togglePlay} aria-label={isPlaying ? t('reader.pause') : t('reader.play')}>
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button type="button" className="c-btn" onClick={nextSentence} disabled={currentIndex >= total - 1} aria-label={t('reader.nextSentence')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <button type="button" className="c-btn" onClick={nextChapter} disabled={!hasChapters} aria-label={t('reader.nextChapter')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6v12M18 12L8 6v12z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
