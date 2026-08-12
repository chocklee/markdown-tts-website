// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearPosition, loadDocument, loadPosition, saveDocument, savePosition } from '../local'

describe('local storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存并读取文档', () => {
    saveDocument({ id: 'doc-1', title: '笔记', content: '# hi', savedAt: 1 })
    expect(loadDocument()).toEqual({ id: 'doc-1', title: '笔记', content: '# hi', savedAt: 1 })
  })

  it('无文档时返回 null', () => {
    expect(loadDocument()).toBeNull()
  })

  it('保存并读取位置（仅匹配同一文档）', () => {
    savePosition('doc-1', 's3')
    expect(loadPosition('doc-1')).toBe('s3')
    expect(loadPosition('doc-2')).toBeNull()
  })

  it('清除位置后读取为 null', () => {
    savePosition('doc-1', 's3')
    clearPosition()
    expect(loadPosition('doc-1')).toBeNull()
  })

  it('损坏的 JSON 返回 null', () => {
    localStorage.setItem('mtts:doc', '{broken')
    expect(loadDocument()).toBeNull()
  })
})

  it('形状不完整的 JSON 返回 null', () => {
    localStorage.setItem('mtts:doc', JSON.stringify({ id: 'doc-1' }))
    expect(loadDocument()).toBeNull()
})
