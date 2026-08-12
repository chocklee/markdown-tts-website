// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useReaderStore } from '../readerStore'
import { parseDocument } from '@/lib/markdown/parse'
import type { TtsEngine } from '@/lib/tts/engine'

class FakeEngine implements TtsEngine {
  speakCalls: { text: string; onend: () => void }[] = []
  speak(text: string, opts: { rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }): void {
    this.speakCalls.push({ text, onend: opts.onend })
  }
  pause(): void {}
  resume(): void {}
  cancel(): void {}
  get isSpeaking(): boolean { return false }
}

const DOC = parseDocument(`# 第一章

你好。世界！

## 第二章

继续。`)

function freshStore() {
  useReaderStore.setState({
    document: null,
    settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
    speakableIds: [],
    currentIndex: 0,
    isPlaying: false,
    queue: null,
    engine: null,
  })
  const engine = new FakeEngine()
  useReaderStore.getState().init(DOC, engine)
  return { engine, store: useReaderStore.getState() }
}

describe('readerStore', () => {
  beforeEach(() => {
    freshStore()
  })

  it('init 后生成可朗读句子列表', () => {
    const state = useReaderStore.getState()
    expect(state.speakableIds).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(state.currentIndex).toBe(0)
  })

  it('togglePlay 从当前句开始朗读', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    expect(engine.speakCalls[0].text).toBe('第一章')
    expect(useReaderStore.getState().isPlaying).toBe(true)
  })

  it('句子朗读结束自动推进到下一句', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    engine.speakCalls[0].onend()
    expect(useReaderStore.getState().currentIndex).toBe(1)
    expect(engine.speakCalls[1].text).toBe('你好。')
  })

  it('nextSentence / prevSentence 移动播放位置', () => {
    const { engine } = freshStore()
    useReaderStore.getState().seekTo('s3')
    expect(useReaderStore.getState().currentIndex).toBe(2)
    useReaderStore.getState().nextSentence()
    expect(useReaderStore.getState().currentIndex).toBe(3)
    expect(engine.speakCalls[0].text).toBe('第二章')
    useReaderStore.getState().prevSentence()
    expect(useReaderStore.getState().currentIndex).toBe(2)
    expect(engine.speakCalls[1].text).toBe('世界！')
  })

  it('nextChapter / prevChapter 按章节跳转', () => {
    useReaderStore.getState().nextChapter()
    expect(useReaderStore.getState().currentIndex).toBe(3)
    useReaderStore.getState().prevChapter()
    expect(useReaderStore.getState().currentIndex).toBe(0)
  })

  it('toggleSkipCode 重建可朗读列表并保持当前句', () => {
    const doc = parseDocument('# 标题\n正文。\n\n```js\nconst a = 1\n```\n结尾。')
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    useReaderStore.getState().init(doc, new FakeEngine())
    useReaderStore.getState().seekTo('s2')
    useReaderStore.getState().toggleSkipCode()
    const state = useReaderStore.getState()
    expect(state.speakableIds).toEqual(['s1', 's2', 's3', 's4'])
    expect(state.currentIndex).toBe(1)
  })

  it('restoreIndex 设置位置但不播放', () => {
    const { engine } = freshStore()
    useReaderStore.getState().restoreIndex('s4')
    expect(useReaderStore.getState().currentIndex).toBe(3)
    expect(engine.speakCalls).toHaveLength(0)
  })
})
