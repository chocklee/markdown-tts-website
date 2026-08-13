import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, mapTransactionRow, canDeduct, pageRows } from '../credits'

describe('encodeCursor / decodeCursor', () => {
  it('往返一致', () => {
    expect(decodeCursor(encodeCursor('2026-08-13T01:02:03.000Z', 'uuid-1'))).toEqual({
      createdAt: '2026-08-13T01:02:03.000Z',
      id: 'uuid-1',
    })
  })

  it('非法游标返回 null', () => {
    expect(decodeCursor('not-valid-%%%')).toBeNull()
    expect(decodeCursor('')).toBeNull()
  })
})

describe('canDeduct', () => {
  it('余额充足允许扣费', () => {
    expect(canDeduct(100n, 30n)).toBe(true)
  })

  it('余额刚好等于扣费额时允许', () => {
    expect(canDeduct(30n, 30n)).toBe(true)
  })

  it('余额不足拒绝', () => {
    expect(canDeduct(20n, 30n)).toBe(false)
  })
})

describe('mapTransactionRow', () => {
  it('把 DB 行映射为 API 对象', () => {
    expect(
      mapTransactionRow({
        id: 't1',
        amount: '100',
        kind: 'purchase',
        description: '购买体验包',
        created_at: '2026-08-13T00:00:00Z',
        ref: 'cs_1',
        meta: { packageId: 'starter' },
      }),
    ).toEqual({
      id: 't1',
      amount: 100,
      kind: 'purchase',
      description: '购买体验包',
      createdAt: '2026-08-13T00:00:00Z',
      ref: 'cs_1',
      meta: { packageId: 'starter' },
    })
  })

  it('null 字段透传', () => {
    expect(
      mapTransactionRow({
        id: 't2',
        amount: '-3',
        kind: 'consumption',
        description: '云端朗读',
        created_at: '2026-08-13T00:00:00Z',
        ref: null,
        meta: null,
      }).ref,
    ).toBeNull()
  })
})

describe('pageRows', () => {
  const row = (id: string, created_at: string) => ({
    id,
    amount: '1',
    kind: 'bonus',
    description: 'd',
    created_at,
    ref: null,
    meta: null,
  })

  it('不足一页时 hasMore 为 false，nextCursor 为 null', () => {
    const { items, hasMore, nextCursor } = pageRows([row('a', '2026-08-13T00:00:00Z')], 20)
    expect(items).toHaveLength(1)
    expect(hasMore).toBe(false)
    expect(nextCursor).toBeNull()
  })

  it('多出一行时截断并生成 nextCursor', () => {
    const rows = [row('a', '2026-08-13T00:00:03Z'), row('b', '2026-08-13T00:00:02Z'), row('c', '2026-08-13T00:00:01Z')]
    const { items, hasMore, nextCursor } = pageRows(rows, 2)
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(hasMore).toBe(true)
    expect(nextCursor).toBeTruthy()
    expect(decodeCursor(nextCursor!)).toEqual({ createdAt: '2026-08-13T00:00:02Z', id: 'b' })
  })
})
