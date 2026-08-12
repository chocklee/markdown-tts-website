import { describe, expect, it } from 'vitest'
import { parseDocument, hashContent } from '../parse'

const SAMPLE = `# 如何高效学习

今天想聊聊学习方法。很多人以为学习靠天赋。

## 方法一：番茄钟

使用番茄钟可以提高专注度。

\`\`\`js
const focus = 25
\`\`\`

| 技巧 | 效果 |
| --- | --- |
| 番茄钟 | 好 |

> 引用一句名言。结束。
`

describe('parseDocument', () => {
  it('提取第一个 h1 作为标题', () => {
    const doc = parseDocument(SAMPLE)
    expect(doc.title).toBe('如何高效学习')
  })

  it('按顺序生成句子 id', () => {
    const doc = parseDocument(SAMPLE)
    expect(doc.sentenceIds[0]).toBe('s1')
    expect(doc.sentenceIds).toHaveLength(10)
  })

  it('代码块与表格块类型正确', () => {
    const doc = parseDocument(SAMPLE)
    const code = doc.blocks.find((b) => b.type === 'code')
    const table = doc.blocks.find((b) => b.type === 'table')
    expect(code?.text).toBe('const focus = 25')
    expect(table?.text).toBe('技巧，效果。番茄钟，好')
  })

  it('根据 h1/h2 生成章节', () => {
    const doc = parseDocument(SAMPLE)
    expect(doc.chapters.map((c) => c.title)).toEqual(['如何高效学习', '方法一：番茄钟'])
  })

  it('相同内容生成相同 id', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abd'))
  })

  it('无标题时使用兜底标题', () => {
    const doc = parseDocument('只有一段文字。', '我的笔记')
    expect(doc.title).toBe('我的笔记')
  })
})
