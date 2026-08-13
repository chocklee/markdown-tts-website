import { describe, it, expect } from 'vitest'
import { validateUpsertBody } from '../validateUpsert'

const DOC_ID = '11111111-1111-4111-8111-111111111111'

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    docId: DOC_ID,
    title: '测试标题',
    content: '# 你好',
    contentHash: 'abc123',
    fileSizeBytes: 10.9,
    updatedAt: 1700000000000.7,
    deletedAt: null,
    deleteExpiresAt: null,
    ...overrides,
  }
}

describe('validateUpsertBody', () => {
  it('合法请求体返回 ok，数值向下取整、标题原样保留', () => {
    const result = validateUpsertBody(validBody(), DOC_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      docId: DOC_ID,
      title: '测试标题',
      content: '# 你好',
      contentHash: 'abc123',
      fileSizeBytes: 10,
      updatedAt: 1700000000000,
      deletedAt: null,
      deleteExpiresAt: null,
    })
  })

  it('docId 不匹配返回 400', () => {
    const result = validateUpsertBody(validBody(), '22222222-2222-4222-8222-222222222222')
    expect(result).toEqual({ ok: false, status: 400, error: 'docId 不匹配' })
  })

  it('null、数组或非对象请求体返回 400', () => {
    expect(validateUpsertBody(null, DOC_ID)).toEqual({ ok: false, status: 400, error: '请求格式错误' })
    expect(validateUpsertBody([], DOC_ID)).toEqual({ ok: false, status: 400, error: '请求格式错误' })
    expect(validateUpsertBody('text', DOC_ID)).toEqual({ ok: false, status: 400, error: '请求格式错误' })
  })

  it('字段缺失或类型错误返回 400 字段缺失', () => {
    expect(validateUpsertBody(validBody({ title: 123 }), DOC_ID)).toEqual({ ok: false, status: 400, error: '字段缺失' })
    expect(validateUpsertBody(validBody({ content: undefined }), DOC_ID)).toEqual({
      ok: false,
      status: 400,
      error: '字段缺失',
    })
    expect(validateUpsertBody(validBody({ contentHash: 1 }), DOC_ID)).toEqual({ ok: false, status: 400, error: '字段缺失' })
    expect(validateUpsertBody(validBody({ fileSizeBytes: '10' }), DOC_ID)).toEqual({
      ok: false,
      status: 400,
      error: '字段缺失',
    })
    expect(validateUpsertBody(validBody({ updatedAt: null }), DOC_ID)).toEqual({ ok: false, status: 400, error: '字段缺失' })
  })

  it('空 contentHash 返回 400', () => {
    expect(validateUpsertBody(validBody({ contentHash: '' }), DOC_ID)).toEqual({ ok: false, status: 400, error: '字段缺失' })
  })

  it('fileSizeBytes 为 NaN、updatedAt 为 Infinity 或负数返回 400', () => {
    expect(validateUpsertBody(validBody({ fileSizeBytes: NaN }), DOC_ID)).toEqual({
      ok: false,
      status: 400,
      error: '字段缺失',
    })
    expect(validateUpsertBody(validBody({ updatedAt: Infinity }), DOC_ID)).toEqual({
      ok: false,
      status: 400,
      error: '字段缺失',
    })
    expect(validateUpsertBody(validBody({ updatedAt: -1 }), DOC_ID)).toEqual({ ok: false, status: 400, error: '字段缺失' })
  })

  it('内容按 UTF-8 字节数超过 5MB 上限返回 400', () => {
    const body = validBody({ content: '你'.repeat(2 * 1024 * 1024) })
    expect(validateUpsertBody(body, DOC_ID)).toEqual({ ok: false, status: 400, error: '文件超过 5MB 上限' })
  })

  it('内容恰好等于 5MB 字节上限或未超过时通过', () => {
    const atCap = validateUpsertBody(validBody({ content: 'a'.repeat(5 * 1024 * 1024) }), DOC_ID)
    expect(atCap.ok).toBe(true)
    const underCap = validateUpsertBody(validBody({ content: '你'.repeat(1024 * 1024) }), DOC_ID)
    expect(underCap.ok).toBe(true)
  })

  it('deletedAt/deleteExpiresAt 为字符串或 NaN 返回 400，null 与有限数字通过', () => {
    expect(validateUpsertBody(validBody({ deletedAt: '2024-01-01' }), DOC_ID)).toEqual({
      ok: false,
      status: 400,
      error: '字段缺失',
    })
    expect(validateUpsertBody(validBody({ deletedAt: NaN }), DOC_ID)).toEqual({ ok: false, status: 400, error: '字段缺失' })
    expect(validateUpsertBody(validBody({ deleteExpiresAt: 'x' }), DOC_ID)).toEqual({
      ok: false,
      status: 400,
      error: '字段缺失',
    })
    expect(validateUpsertBody(validBody({ deletedAt: null, deleteExpiresAt: null }), DOC_ID).ok).toBe(true)
    const withNumbers = validateUpsertBody(
      validBody({ deletedAt: 1700000000000, deleteExpiresAt: 1700000000000 }),
      DOC_ID,
    )
    expect(withNumbers.ok).toBe(true)
    if (withNumbers.ok) {
      expect(withNumbers.value.deletedAt).toBe(1700000000000)
      expect(withNumbers.value.deleteExpiresAt).toBe(1700000000000)
    }
  })

  it('标题按 200 个码点截断且不拆散代理对', () => {
    const title = '😀'.repeat(120) + 'x'.repeat(200)
    const result = validateUpsertBody(validBody({ title }), DOC_ID)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const truncated = result.value.title
    expect(Array.from(truncated).length).toBeLessThanOrEqual(200)
    expect(Array.from(truncated).join('')).toBe(truncated)
    expect(truncated).toBe('😀'.repeat(120) + 'x'.repeat(80))
  })
})
