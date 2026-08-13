// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useReaderStore } from '../readerStore'
import { parseDocument } from '@/lib/markdown/parse'
import { BrowserTtsEngine, type TtsEngine } from '@/lib/tts/engine'
import { CloudTtsEngine } from '@/lib/tts/cloud'
import { defaultSettings } from '@/types/reader'

class FakeEngine implements TtsEngine {
  speakCalls: { text: string; onend: () => void }[] = []
  cancelCalls = 0
  speak(text: string, opts: { rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }): void {
    this.speakCalls.push({ text, onend: opts.onend })
  }
  pause(): void {}
  resume(): void {}
  cancel(): void { this.cancelCalls += 1 }
  get isSpeaking(): boolean { return false }
}

const DOC = parseDocument(`# 第一章

你好。世界！

## 第二章

继续。`)

function freshStore() {
  useReaderStore.setState({
    document: null,
    settings: { ...defaultSettings },
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

function playToEnd(engine: FakeEngine) {
  for (let i = 0; i < 5; i++) {
    engine.speakCalls[i].onend()
  }
}

describe('readerStore', () => {
  beforeEach(() => {
    freshStore()
  })

  it('逐句模式开关与时长设置生效', () => {
    const { store } = freshStore()
    expect(store.settings.sentencePause).toBe(false)
    expect(store.settings.sentencePauseSeconds).toBe(2)
    store.setSentencePause(true)
    store.setSentencePauseSeconds(5)
    const state = useReaderStore.getState()
    expect(state.settings.sentencePause).toBe(true)
    expect(state.settings.sentencePauseSeconds).toBe(5)
    const opts = state.getOptions()
    expect(opts.sentencePause).toBe(true)
    expect(opts.sentencePauseSeconds).toBe(5)
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
    useReaderStore.setState({ settings: { ...defaultSettings } })
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

  it('seekTo 只定位不自动播放', () => {
    const { engine } = freshStore()
    useReaderStore.getState().seekTo('s3')
    expect(useReaderStore.getState().currentIndex).toBe(2)
    expect(useReaderStore.getState().isPlaying).toBe(false)
    expect(engine.speakCalls).toHaveLength(0)
  })

  it('播放中 seekTo 定位后不受迟到 onend 影响', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    engine.speakCalls[0].onend()
    useReaderStore.getState().seekTo('s5')
    expect(useReaderStore.getState().currentIndex).toBe(4)
    expect(useReaderStore.getState().isPlaying).toBe(false)
    engine.speakCalls[1].onend()
    expect(useReaderStore.getState().currentIndex).toBe(4)
  })

  it('seekTo 后从目标句开始播放', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    engine.speakCalls[0].onend()
    useReaderStore.getState().seekTo('s4')
    useReaderStore.getState().togglePlay()
    expect(useReaderStore.getState().currentIndex).toBe(3)
    expect(engine.speakCalls[engine.speakCalls.length - 1].text).toBe('第二章')
  })

  it('seekTo 到最后一句后播放从最后一句开始', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    engine.speakCalls[0].onend()
    useReaderStore.getState().seekTo('s5')
    useReaderStore.getState().togglePlay()
    expect(engine.speakCalls[engine.speakCalls.length - 1].text).toBe('继续。')
  })

  it('toggleSkipTable 重建可朗读列表并保持当前句', () => {
    const doc = parseDocument('# 标题\n正文。\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n结尾。')
    useReaderStore.setState({ settings: { ...defaultSettings } })
    useReaderStore.getState().init(doc, new FakeEngine())
    expect(useReaderStore.getState().speakableIds).toEqual(['s1', 's2'])
    useReaderStore.getState().seekTo('s2')
    useReaderStore.getState().toggleSkipTable()
    const state = useReaderStore.getState()
    expect(state.speakableIds).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(state.currentIndex).toBe(1)
  })

  it('自然播完后 togglePlay 从头重播', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    playToEnd(engine)
    expect(useReaderStore.getState().currentIndex).toBe(4)
    expect(useReaderStore.getState().isPlaying).toBe(false)
    useReaderStore.getState().togglePlay()
    expect(engine.speakCalls[engine.speakCalls.length - 1].text).toBe('第一章')
  })

  it('自然播完后 seekTo 再播放从目标句开始', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    playToEnd(engine)
    useReaderStore.getState().seekTo('s3')
    useReaderStore.getState().togglePlay()
    expect(useReaderStore.getState().currentIndex).toBe(2)
    expect(engine.speakCalls[engine.speakCalls.length - 1].text).toBe('世界！')
  })

  it('setVoice 更新 settings.voice 并重建为 CloudTtsEngine，保持当前句', () => {
    const { engine } = freshStore()
    const oldQueue = useReaderStore.getState().queue
    expect(useReaderStore.getState().settings.voice).toBe('browser')
    useReaderStore.getState().seekTo('s3')
    useReaderStore.getState().setVoice('nova')
    const state = useReaderStore.getState()
    expect(state.settings.voice).toBe('nova')
    expect(state.engine).toBeInstanceOf(CloudTtsEngine)
    expect(state.engine).not.toBe(engine)
    expect(state.queue).not.toBe(oldQueue)
    expect(state.currentIndex).toBe(2)
    expect(state.isPlaying).toBe(false)
  })

  it('setVoice 切换时停止旧队列并取消旧引擎', () => {
    const { engine } = freshStore()
    useReaderStore.getState().setVoice('nova')
    expect(engine.cancelCalls).toBe(1)
  })

  it('setVoice 切回浏览器音色重建为 BrowserTtsEngine', () => {
    freshStore()
    useReaderStore.getState().setVoice('nova')
    useReaderStore.getState().setVoice('browser')
    const state = useReaderStore.getState()
    expect(state.settings.voice).toBe('browser')
    expect(state.engine).toBeInstanceOf(BrowserTtsEngine)
  })

  it('setVoice 相同音色不重建引擎', () => {
    const { engine } = freshStore()
    useReaderStore.getState().setVoice('browser')
    expect(useReaderStore.getState().engine).toBe(engine)
  })
})
