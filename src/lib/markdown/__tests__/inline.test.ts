import { describe, expect, it } from 'vitest'
import { remark } from 'remark'
import type { Root, RootContent } from 'mdast'
import { flattenInline, groupLeavesIntoSentences } from '../inline'

function inlineNode(md: string): RootContent {
  const tree = remark().parse(md) as Root
  const paragraph = tree.children.find((n) => n.type === 'paragraph')
  if (!paragraph || paragraph.type !== 'paragraph') throw new Error('need paragraph')
  return paragraph
}

describe('flattenInline', () => {
  it('提取纯文本', () => {
    expect(flattenInline(inlineNode('你好'))).toEqual([{ text: '你好' }])
  })

  it('保留加粗与斜体标记', () => {
    const leaves = flattenInline(inlineNode('**重点**和*斜体*'))
    expect(leaves).toEqual([
      { text: '重点', bold: true },
      { text: '和' },
      { text: '斜体', italic: true },
    ])
  })

  it('链接保留 href，图片用 alt 作为文本', () => {
    const leaves = flattenInline(inlineNode('[链接](https://a.b) ![图](https://c.d/x.png)'))
    expect(leaves).toEqual([
      { text: '链接', href: 'https://a.b' },
      { text: ' ' },
      { text: '图', href: 'https://c.d/x.png' },
    ])
  })
})

describe('groupLeavesIntoSentences', () => {
  it('把叶子按句子分组并分配 id', () => {
    const leaves = [{ text: '你好，' }, { text: '世界。' }]
    let n = 0
    const sentences = groupLeavesIntoSentences(leaves, () => `s${++n}`)
    expect(sentences).toEqual([
      {
        id: 's1',
        parts: [
          { text: '你好，' },
          { text: '世界。' },
        ],
      },
    ])
  })

  it('跨加粗边界的句子只分配一个 id', () => {
    const leaves = [
      { text: '这是', bold: true },
      { text: '一句话。' },
    ]
    let n = 0
    const sentences = groupLeavesIntoSentences(leaves, () => `s${++n}`)
    expect(sentences).toHaveLength(1)
    expect(sentences[0].id).toBe('s1')
    expect(sentences[0].parts).toHaveLength(2)
  })

  it('句末标点处切分句子', () => {
    const leaves = [{ text: '第一句。第二句！' }]
    let n = 0
    const sentences = groupLeavesIntoSentences(leaves, () => `s${++n}`)
    expect(sentences.map((s) => s.id)).toEqual(['s1', 's2'])
  })
})
