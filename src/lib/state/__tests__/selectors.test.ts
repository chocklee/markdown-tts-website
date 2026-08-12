import { describe, expect, it } from 'vitest'
import { getSpeakableIds, getSentenceText } from '../selectors'
import { parseDocument } from '@/lib/markdown/parse'
import { defaultSettings } from '@/types/reader'

const DOC = parseDocument(`# 标题

正文一。正文二。

\`\`\`js
const a = 1
\`\`\`

| 列 | 值 |
| --- | --- |
| a | b |

结尾。
`)

describe('getSpeakableIds', () => {
  it('默认跳过代码块与表格', () => {
    const ids = getSpeakableIds(DOC, defaultSettings)
    expect(ids).toEqual(['s1', 's2', 's3', 's7'])
  })

  it('关闭跳过时包含代码块与表格', () => {
    const ids = getSpeakableIds(DOC, { ...defaultSettings, skipCode: false, skipTable: false })
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7'])
  })
})

describe('getSentenceText', () => {
  it('返回指定句子的文本', () => {
    expect(getSentenceText(DOC, 's2')).toBe('正文一。')
    expect(getSentenceText(DOC, 's4')).toBe('const a = 1')
  })
})
