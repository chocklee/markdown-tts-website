// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaybackBar } from '../PlaybackBar'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'

const DOC = parseDocument('# 第一章\n你好。\n\n## 第二章\n继续。')

function seedState(overrides: Partial<ReturnType<typeof useReaderStore.getState>> = {}) {
  useReaderStore.setState({
    document: DOC,
    settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
    speakableIds: DOC.sentenceIds,
    currentIndex: 0,
    isPlaying: false,
    queue: null,
    engine: null,
    ...overrides,
  })
}

describe('PlaybackBar', () => {
  it('点击下一句调用 nextSentence', async () => {
    const nextSentence = vi.spyOn(useReaderStore.getState(), 'nextSentence')
    seedState()
    const user = userEvent.setup()
    render(<PlaybackBar />)
    await user.click(screen.getByLabelText('下一句'))
    expect(nextSentence).toHaveBeenCalled()
  })

  it('点击播放/暂停切换 togglePlay', async () => {
    const togglePlay = vi.spyOn(useReaderStore.getState(), 'togglePlay')
    seedState()
    const user = userEvent.setup()
    render(<PlaybackBar />)
    await user.click(screen.getByLabelText('播放'))
    expect(togglePlay).toHaveBeenCalled()
  })

  it('有章节时上一章/下一章可用，显示进度', () => {
    seedState({ currentIndex: 2 })
    render(<PlaybackBar />)
    expect(screen.getByLabelText('上一章')).toBeEnabled()
    expect(screen.getByLabelText('下一章')).toBeEnabled()
    expect(screen.getByText('3 / 4 句')).toBeInTheDocument()
  })

  it('无章节时上一章/下一章禁用', () => {
    seedState({ document: parseDocument('只有一段。') })
    render(<PlaybackBar />)
    expect(screen.getByLabelText('上一章')).toBeDisabled()
    expect(screen.getByLabelText('下一章')).toBeDisabled()
  })
})
