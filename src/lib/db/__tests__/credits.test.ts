import { describe, it, expect, vi } from 'vitest'
import { pool } from '@/lib/db/pool'
import { encodeCursor, decodeCursor, mapTransactionRow, canDeduct, pageRows, refundCredits } from '../credits'

vi.mock('@/lib/db/pool', () => ({ pool: { connect: vi.fn() } }))

function mockClient() {
  const client = { query: vi.fn(), release: vi.fn() }
  vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

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

describe('refundCredits', () => {
  it('认领单条 consumption 行、写 adjustment 审计行后才加余额', async () => {
    const client = mockClient()
    vi.mocked(client.query)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }], rowCount: 1 } as never) // 认领 UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // INSERT adjustment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // UPDATE credits_balance
    await refundCredits('u1', 3, 'ref-1', { docId: 'd' }, '合成失败退还积分')
    const calls = vi.mocked(client.query).mock.calls as [string, unknown[]?][]
    const claim = calls.find(([sql]) => typeof sql === 'string' && sql.includes('FOR UPDATE SKIP LOCKED'))
    expect(claim).toBeTruthy()
    expect(claim?.[0]).toContain("kind = 'consumption'")
    expect(claim?.[0]).toContain('LIMIT 1')
    expect(claim?.[0]).toContain('ORDER BY created_at, id')
    expect(claim?.[1]).toEqual(['u1', 'ref-1', -3])
    const audit = calls.find(([sql]) => typeof sql === 'string' && sql.includes("'adjustment'"))
    expect(audit?.[1]).toEqual(['u1', 3, 'ref-1', '合成失败退还积分', JSON.stringify({ docId: 'd' })])
    const upd = calls.find(([sql]) => typeof sql === 'string' && sql.includes('UPDATE users SET credits_balance'))
    expect(upd?.[1]).toEqual([3, 'u1'])
    expect(calls.some(([sql]) => sql === 'COMMIT')).toBe(true)
    expect(client.release).toHaveBeenCalled()
  })

  it('无匹配 consumption 行时 ROLLBACK 且不写审计行不加余额', async () => {
    const client = mockClient()
    vi.mocked(client.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // 认领落空
    await refundCredits('u1', 3, 'ref-1', { docId: 'd' }, '合成失败退还积分')
    const calls = vi.mocked(client.query).mock.calls as [string, unknown[]?][]
    expect(calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true)
    expect(calls.some(([sql]) => typeof sql === 'string' && sql.includes("'adjustment'"))).toBe(false)
    expect(calls.some(([sql]) => typeof sql === 'string' && sql.includes('UPDATE users SET credits_balance'))).toBe(false)
    expect(calls.some(([sql]) => sql === 'COMMIT')).toBe(false)
  })

  it('同 ref+amount 多笔扣费时只认领一行（LIMIT 1）', async () => {
    const client = mockClient()
    vi.mocked(client.query).mockResolvedValueOnce({ rows: [{ id: 'tx-1' }], rowCount: 1 } as never)
    await refundCredits('u1', 3, 'ref-1', { docId: 'd' }, '合成失败退还积分')
    const claim = vi.mocked(client.query).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FOR UPDATE SKIP LOCKED'),
    ) as [string, unknown[]]
    expect(claim[0]).toContain('LIMIT 1')
    expect(claim[0]).toContain('ORDER BY created_at, id')
    expect(claim[0]).toContain("kind = 'consumption'")
    expect(claim[1]).toEqual(['u1', 'ref-1', -3])
  })
})
