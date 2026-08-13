import { pool } from '@/lib/db/pool'
import type { PoolClient } from 'pg'
import { CONFIG } from '@/lib/config'

export function canDeduct(balance: bigint, amount: bigint): boolean {
  return balance >= amount
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString('base64url')
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    if (!createdAt || !id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

export interface CreditTransactionRow {
  id: string
  amount: string
  kind: string
  description: string
  created_at: string
  ref: string | null
  meta: unknown
}

export interface CreditTransaction {
  id: string
  amount: number
  kind: string
  description: string
  createdAt: string
  ref: string | null
  meta: unknown
}

export function mapTransactionRow(row: CreditTransactionRow): CreditTransaction {
  return {
    id: row.id,
    amount: Number(row.amount),
    kind: row.kind,
    description: row.description,
    createdAt: row.created_at,
    ref: row.ref,
    meta: row.meta,
  }
}

export function pageRows(rows: CreditTransactionRow[], limit: number): {
  items: CreditTransaction[]
  hasMore: boolean
  nextCursor: string | null
} {
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map(mapTransactionRow)
  const last = items[items.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null
  return { items, hasMore, nextCursor }
}

export async function getCreditsBalance(userId: string): Promise<number> {
  const { rows } = await pool.query<{ credits_balance: string }>(
    'SELECT credits_balance FROM users WHERE id = $1',
    [userId],
  )
  return Number(rows[0]?.credits_balance ?? 0)
}

export async function isPurchased(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM credit_transactions WHERE user_id = $1 AND kind = 'purchase' LIMIT 1",
    [userId],
  )
  return (rowCount ?? 0) > 0
}

export async function listTransactions(
  userId: string,
  cursor: { createdAt: string; id: string } | null,
  limit: number,
): Promise<{ items: CreditTransaction[]; nextCursor: string | null }> {
  const params: unknown[] = [userId]
  let where = 'WHERE user_id = $1'
  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where += ' AND (created_at, id) < ($2, $3)'
  }
  params.push(limit + 1)
  const { rows } = await pool.query<CreditTransactionRow>(
    `SELECT id, amount, kind, description, created_at, ref, meta
     FROM credit_transactions ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params,
  )
  const { items, nextCursor } = pageRows(rows, limit)
  return { items, nextCursor }
}

export async function grantSignupBonus(client: PoolClient, userId: string, amount: number): Promise<boolean> {
  const { rowCount } = await client.query(
    'SELECT 1 FROM credit_transactions WHERE user_id = $1 LIMIT 1',
    [userId],
  )
  if (rowCount !== 0) return false
  await client.query(
    "INSERT INTO credit_transactions (user_id, amount, kind, description) VALUES ($1, $2, 'bonus', '注册赠送积分')",
    [userId, amount],
  )
  await client.query('UPDATE users SET credits_balance = credits_balance + $1 WHERE id = $2', [
    amount,
    userId,
  ])
  return true
}

export async function grantSignupBonusIfNew(userId: string, amount: number): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await grantSignupBonus(client, userId, amount)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function creditPurchase(
  userId: string,
  packageId: string,
  credits: number,
  sessionId: string,
  meta: unknown,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta)
       VALUES ($1, $2, 'purchase', $3, $4, $5)
       ON CONFLICT (user_id, ref) WHERE kind = 'purchase' DO NOTHING
       RETURNING id`,
      [userId, credits, sessionId, `购买${packageId}`, JSON.stringify(meta)],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return
    }
    await client.query('UPDATE users SET credits_balance = credits_balance + $1 WHERE id = $2', [
      credits,
      userId,
    ])
    await client.query(
      'UPDATE users SET storage_quota_bytes = GREATEST(storage_quota_bytes, $1) WHERE id = $2',
      [CONFIG.quota.paidBytes, userId],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
