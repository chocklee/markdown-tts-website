// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutlinePanel } from '../OutlinePanel'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'
import { defaultSettings } from '@/types/reader'

const DOC = parseDocument('# 第一章\n你好。\n\n## 第二章\n继续。')

describe('OutlinePanel', () => {
  it('渲染章节标题并高亮当前章节', () => {
    useReaderStore.setState({
      document: DOC,
      settings: { ...defaultSettings },
      speakableIds: DOC.sentenceIds,
      currentIndex: 2,
      isPlaying: false,
      queue: null,
      engine: null,
    })
    render(<OutlinePanel document={DOC} />)
    expect(screen.getByText('第一章')).toBeInTheDocument()
    expect(screen.getByText('第二章')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第二章/ }).className).toContain('active')
  })

  it('点击章节跳转到该章节第一句', async () => {
    const seekTo = vi.spyOn(useReaderStore.getState(), 'seekTo')
    useReaderStore.setState({
      document: DOC,
      settings: { ...defaultSettings },
      speakableIds: DOC.sentenceIds,
      currentIndex: 0,
      isPlaying: false,
      queue: null,
      engine: null,
    })
    const user = userEvent.setup()
    render(<OutlinePanel document={DOC} />)
    await user.click(screen.getByText('第二章'))
    expect(seekTo).toHaveBeenCalledWith('s3')
  })
})
