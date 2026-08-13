import { create } from 'zustand'
import type { ReaderDocument, ReaderSettings } from '@/types/reader'
import { defaultSettings } from '@/types/reader'
import { getSentenceText, getSpeakableIds } from './selectors'
import { BrowserTtsEngine, type TtsEngine } from '@/lib/tts/engine'
import { SpeechQueue, type SpeechOptions } from '@/lib/tts/queue'

interface ReaderState {
  document: ReaderDocument | null
  settings: ReaderSettings
  speakableIds: string[]
  currentIndex: number
  isPlaying: boolean
  queue: SpeechQueue | null
  engine: TtsEngine | null
  rebuildSpeakable: () => void
  init: (document: ReaderDocument, engine?: TtsEngine) => void
  togglePlay: () => void
  stop: () => void
  nextSentence: () => void
  prevSentence: () => void
  nextChapter: () => void
  prevChapter: () => void
  seekTo: (sentenceId: string) => void
  restoreIndex: (sentenceId: string) => void
  getOptions: () => SpeechOptions
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  setSentencePause: (enabled: boolean) => void
  setSentencePauseSeconds: (seconds: number) => void
  toggleSkipCode: () => void
  toggleSkipTable: () => void
}

function buildQueue(
  engine: TtsEngine,
  document: ReaderDocument,
  getOptions: () => SpeechOptions,
  onIndex: (i: number) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): SpeechQueue {
  const ids = getSpeakableIds(document, useReaderStore.getState().settings)
  const texts = ids.map((sentenceId) => getSentenceText(document, sentenceId))
  return new SpeechQueue(engine, texts, getOptions, { onIndex, onEnd, onError })
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  document: null,
  settings: { ...defaultSettings },
  speakableIds: [],
  currentIndex: 0,
  isPlaying: false,
  queue: null,
  engine: null,

  init: (document, engine) => {
    const engineInstance = engine ?? (typeof window !== 'undefined' ? new BrowserTtsEngine() : null)
    if (!engineInstance) return

    get().queue?.stop()
    const settings = get().settings
    const speakableIds = getSpeakableIds(document, settings)
    const queue = buildQueue(
      engineInstance,
      document,
      () => ({
        rate: get().settings.rate,
        volume: get().settings.volume,
        sentencePause: get().settings.sentencePause,
        sentencePauseSeconds: get().settings.sentencePauseSeconds,
      }),
      (i) => set({ currentIndex: i }),
      () => set({ isPlaying: false }),
      (message) => {
        console.error(message)
        set({ isPlaying: false })
      },
    )
    set({ document, engine: engineInstance, queue, speakableIds, currentIndex: 0, isPlaying: false })
  },

  togglePlay: () => {
    const { queue, isPlaying, speakableIds, currentIndex } = get()
    if (!queue || speakableIds.length === 0) return
    if (isPlaying) {
      queue.pause()
      set({ isPlaying: false })
      return
    }
    if (queue.isIdle() && queue.ended) {
      queue.playFrom(0)
    } else {
      queue.resumeOrStart(currentIndex)
    }
    set({ isPlaying: true })
  },

  stop: () => {
    get().queue?.stop()
    set({ isPlaying: false })
  },

  nextSentence: () => {
    const { speakableIds, currentIndex, queue } = get()
    if (!queue || speakableIds.length === 0) return
    const next = Math.min(currentIndex + 1, speakableIds.length - 1)
    if (next === currentIndex) return
    queue.playFrom(next)
    set({ isPlaying: true })
  },

  prevSentence: () => {
    const { speakableIds, currentIndex, queue } = get()
    if (!queue || speakableIds.length === 0) return
    const prev = Math.max(currentIndex - 1, 0)
    if (prev === currentIndex) return
    queue.playFrom(prev)
    set({ isPlaying: true })
  },

  nextChapter: () => {
    const { document, speakableIds, currentIndex, queue } = get()
    if (!document || !queue) return
    const currentId = speakableIds[currentIndex]
    const chapterIndex = document.chapters.findIndex((c) => c.sentenceIds.includes(currentId))
    if (chapterIndex < 0) return
    const next = document.chapters[chapterIndex + 1]
    if (!next) return
    const target = next.sentenceIds.find((sentenceId) => speakableIds.includes(sentenceId))
    if (!target) return
    queue.playFrom(speakableIds.indexOf(target))
    set({ isPlaying: true })
  },

  prevChapter: () => {
    const { document, speakableIds, currentIndex, queue } = get()
    if (!document || !queue) return
    const currentId = speakableIds[currentIndex]
    const chapterIndex = document.chapters.findIndex((c) => c.sentenceIds.includes(currentId))
    const prev = document.chapters[chapterIndex > 0 ? chapterIndex - 1 : 0]
    if (!prev) return
    const target = prev.sentenceIds.find((sentenceId) => speakableIds.includes(sentenceId))
    if (!target) return
    const targetIndex = speakableIds.indexOf(target)
    if (targetIndex === currentIndex) return
    queue.playFrom(targetIndex)
    set({ isPlaying: true })
  },

  seekTo: (sentenceId) => {
    const { speakableIds, queue } = get()
    const target = speakableIds.indexOf(sentenceId)
    if (target < 0) return
    queue?.reposition(target)
    set({ currentIndex: target, isPlaying: false })
  },

  restoreIndex: (sentenceId) => {
    const target = get().speakableIds.indexOf(sentenceId)
    if (target >= 0) {
      get().queue?.reposition(target)
      set({ currentIndex: target, isPlaying: false })
    }
  },

  setRate: (rate) => {
    set((s) => ({ settings: { ...s.settings, rate } }))
  },

  setVolume: (volume) => {
    set((s) => ({ settings: { ...s.settings, volume } }))
  },

  getOptions: () => {
    const s = get().settings
    return {
      rate: s.rate,
      volume: s.volume,
      sentencePause: s.sentencePause,
      sentencePauseSeconds: s.sentencePauseSeconds,
    }
  },

  setSentencePause: (enabled) => {
    set((s) => ({ settings: { ...s.settings, sentencePause: enabled } }))
  },

  setSentencePauseSeconds: (seconds) => {
    set((s) => ({ settings: { ...s.settings, sentencePauseSeconds: seconds } }))
  },

  toggleSkipCode: () => {
    set((s) => ({ settings: { ...s.settings, skipCode: !s.settings.skipCode } }))
    get().rebuildSpeakable()
  },

  toggleSkipTable: () => {
    set((s) => ({ settings: { ...s.settings, skipTable: !s.settings.skipTable } }))
    get().rebuildSpeakable()
  },

  rebuildSpeakable: () => {
    const { document, engine, speakableIds, currentIndex, settings, queue } = get()
    if (!document || !engine) return
    const currentId = speakableIds[currentIndex]
    queue?.stop()
    const newIds = getSpeakableIds(document, settings)
    const newQueue = buildQueue(
      engine,
      document,
      () => ({
        rate: get().settings.rate,
        volume: get().settings.volume,
        sentencePause: get().settings.sentencePause,
        sentencePauseSeconds: get().settings.sentencePauseSeconds,
      }),
      (i) => set({ currentIndex: i }),
      () => set({ isPlaying: false }),
      (message) => {
        console.error(message)
        set({ isPlaying: false })
      },
    )
    const newIndex = currentId ? Math.max(newIds.indexOf(currentId), 0) : 0
    set({ queue: newQueue, speakableIds: newIds, currentIndex: newIndex, isPlaying: false })
  },
}))
