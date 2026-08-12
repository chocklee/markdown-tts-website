import { describe, expect, it } from 'vitest'
import { splitSentences } from '../sentenceize'

describe('splitSentences', () => {
  it('按中文句末标点切句', () => {
    expect(splitSentences('你好。世界！')).toEqual(['你好。', '世界！'])
  })

  it('按英文句末标点切句', () => {
    expect(splitSentences('Hello. World!')).toEqual(['Hello.', 'World!'])
  })

  it('保留句内逗号', () => {
    expect(splitSentences('你好，世界。')).toEqual(['你好，世界。'])
  })

  it('合并换行为一个空格，不额外切句', () => {
    expect(splitSentences('第一行\n第二行')).toEqual(['第一行 第二行'])
  })

  it('去除空结果并 trim 空白', () => {
    expect(splitSentences('   \n  ')).toEqual([])
    expect(splitSentences('  你好。  世界！ ')).toEqual(['你好。', '世界！'])
  })

  it('连续句末标点并入同一句', () => {
    expect(splitSentences('你好！！')).toEqual(['你好！！'])
  })
})
