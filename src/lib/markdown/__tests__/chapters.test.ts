import { describe, expect, it } from 'vitest'
import { buildChapters } from '../chapters'
import type { ReaderBlock } from '@/types/reader'

function block(id: string, type: ReaderBlock['type'], sentenceIds: string[], depth = 0): ReaderBlock {
  return {
    id,
    type,
    depth,
    text: '',
    sentenceIds,
    sentenceTexts: [],
    node: { type: 'paragraph' } as ReaderBlock['node'],
  }
}

describe('buildChapters', () => {
  it('没有标题时返回空数组', () => {
    const blocks = [block('b0', 'paragraph', ['s1', 's2'])]
    expect(buildChapters(blocks)).toEqual([])
  })

  it('h1-h3 标题建立章节，h4 不建立', () => {
    const blocks = [
      block('b0', 'heading', ['s1'], 1),
      block('b1', 'paragraph', ['s2']),
      block('b2', 'heading', ['s3'], 2),
      block('b3', 'heading', ['s4'], 4),
    ]
    const chapters = buildChapters(blocks)
    expect(chapters.map((c) => c.title)).toEqual(['', ''])
    expect(chapters[0].sentenceIds).toEqual(['s1', 's2'])
    expect(chapters[1].sentenceIds).toEqual(['s3'])
  })

  it('第一个标题之前的句子归入第一章', () => {
    const blocks = [
      block('b0', 'paragraph', ['s1']),
      block('b1', 'heading', ['s2'], 1),
      block('b2', 'paragraph', ['s3']),
    ]
    const chapters = buildChapters(blocks)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].sentenceIds).toEqual(['s2', 's3', 's1'])
  })
})
