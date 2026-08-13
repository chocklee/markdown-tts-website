// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadLegacyDocument, savePosition, loadPosition, clearPosition } from '../local'

const legacy = { id: 'doc-1', title: '测试', content: '# 你好', savedAt: Date.now() }

describe('loadLegacyDocument', () => {
  beforeEach(() => localStorage.clear())

  it('无旧文档时返回 null', () => {
    expect(loadLegacyDocument()).toBeNull()
  })

  it('读取 M1 遗留单文档', () => {
    localStorage.setItem('mtts:doc', JSON.stringify(legacy))
    expect(loadLegacyDocument()).toEqual(legacy)
  })

  it('损坏数据返回 null', () => {
    localStorage.setItem('mtts:doc', 'not-json')
    expect(loadLegacyDocument()).toBeNull()
  })
})

describe('位置记忆', () => {
  beforeEach(() => localStorage.clear())

  it('保存并读取位置', () => {
    savePosition('d1', 's5')
    expect(loadPosition('d1')).toBe('s5')
  })

  it('其他文档的位置不串用', () => {
    savePosition('d1', 's5')
    expect(loadPosition('d2')).toBeNull()
  })

  it('清除位置', () => {
    savePosition('d1', 's5')
    clearPosition()
    expect(loadPosition('d1')).toBeNull()
  })
})
