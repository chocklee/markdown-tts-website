// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderWithI18n } from '@/test-utils/i18n'
import { ContentView } from '../ContentView'
import { defaultSettings } from '@/types/reader'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'
import type { ReaderSettings } from '@/types/reader'

const DOC = parseDocument(`# 如何高效学习

今天想聊聊**学习方法**。很多人以为学习靠天赋。

## 方法

\`\`\`js
const a = 1
\`\`\`

| 技巧 | 效果 |
| --- | --- |
| 番茄钟 | 好 |
`)

function renderWithStore(currentIndex: number, settingsOverride?: Partial<ReaderSettings>) {
  useReaderStore.setState({
    document: DOC,
    settings: { ...defaultSettings, ...settingsOverride },
    speakableIds: DOC.sentenceIds,
    currentIndex,
    isPlaying: true,
    queue: null,
    engine: null,
  })
  return renderWithI18n(<ContentView document={DOC} />)
}

describe('ContentView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('渲染标题、段落、代码块与表格', () => {
    renderWithStore(0, { skipCode: false, skipTable: false })
    expect(screen.getByText('如何高效学习')).toBeInTheDocument()
    expect(screen.getByText('const a = 1')).toBeInTheDocument()
    expect(screen.getByText('番茄钟')).toBeInTheDocument()
  })

  it('句子带 data-sent 标记', () => {
    renderWithStore(0)
    const mark = document.querySelector('mark[data-sent="s2"]')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('今天想聊聊学习方法。')
  })

  it('当前句高亮，其他句不高亮', () => {
    renderWithStore(1)
    expect(document.querySelector('mark[data-sent="s2"]')?.className).toContain('current-sentence')
    expect(document.querySelector('mark[data-sent="s3"]')?.className).not.toContain('current-sentence')
  })

  it('跳过代码块时显示占位提示', () => {
    useReaderStore.setState({ settings: { ...defaultSettings } })
    renderWithI18n(<ContentView document={DOC} />)
    expect(screen.getByText('已跳过代码块，可在朗读设置中开启')).toBeInTheDocument()
  })

  it('当前句变化时滚动到对应句子', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderWithStore(0)
    act(() => {
      useReaderStore.setState({ currentIndex: 2 })
    })
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(scrollSpy.mock.instances[0]).toHaveAttribute('data-sent', 's3')
  })

  it('朗读代码块时块级锚点获得高亮', () => {
    renderWithStore(4, { skipCode: false })
    expect(document.querySelector('pre[data-sent-block]')?.className).toContain('current-sentence')
  })

  it('嵌套列表内容渲染并参与句子编号', () => {
    const doc = parseDocument('- 第一项。\n  - 嵌套项。')
    useReaderStore.setState({
      document: doc,
      settings: { ...defaultSettings },
      speakableIds: doc.sentenceIds,
      currentIndex: 0,
      isPlaying: false,
      queue: null,
      engine: null,
    })
    renderWithI18n(<ContentView document={doc} />)
    expect(screen.getByText('嵌套项。')).toBeInTheDocument()
    expect(doc.sentenceIds).toHaveLength(2)
  })
})
