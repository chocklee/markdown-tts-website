import { describe, expect, it } from 'vitest'
import { splitIntoChunks } from '../convertChunks'

const BASE = { skipCode: true, skipTable: true, maxChars: 10 }

describe('splitIntoChunks', () => {
  it('跳过代码块与表格（按设置）', () => {
    const md = '# 标题\n\n一段正文。\n\n```js\nconst a = 1\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n'
    expect(splitIntoChunks(md, BASE).join('\n')).not.toContain('const a = 1')
    expect(splitIntoChunks(md, BASE).join('\n')).not.toContain('| 1 | 2 |')
    expect(splitIntoChunks(md, BASE).join('\n')).toContain('一段正文')
  })

  it('不跳过时保留代码块内容', () => {
    const md = '```js\nconst a = 1\n```'
    const chunks = splitIntoChunks(md, { ...BASE, skipCode: false, maxChars: 12 })
    expect(chunks.join('\n')).toContain('const a = 1')
  })

  it('单块不超过 maxChars（按字符数含空格）', () => {
    const md = Array.from({ length: 5 }, () => '一二三四五六七八九十').join('\n\n') // 5 x 10 字
    for (const chunk of splitIntoChunks(md, { ...BASE, maxChars: 12 })) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(12)
    }
  })

  it('合并相邻小段，保持顺序', () => {
    const md = '第一段。\n\n第二段。\n\n第三段。'
    const chunks = splitIntoChunks(md, { ...BASE, maxChars: 20 })
    expect(chunks.length).toBe(1)
    expect(chunks[0]).toContain('第一段')
    expect(chunks[0]).toContain('第三段')
  })
})
