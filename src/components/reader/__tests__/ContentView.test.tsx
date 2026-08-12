// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContentView } from '../ContentView'
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
    settings: { rate: 1, volume: 1, skipCode: true, skipTable: true, ...settingsOverride },
    speakableIds: DOC.sentenceIds,
    currentIndex,
    isPlaying: true,
    queue: null,
    engine: null,
  })
  render(<ContentView document={DOC} />)
}

describe('ContentView', () => {
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
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    render(<ContentView document={DOC} />)
    expect(screen.getByText('已跳过代码块，可在朗读设置中开启')).toBeInTheDocument()
  })
})
