import { pool } from '@/lib/db/pool'
import type { PoolClient } from 'pg'
import { CREDIT_PACKAGES, CONFIG } from '@/lib/config'

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

export async function deductCredits(
  userId: string,
  amount: number,
  ref: string,
  meta: unknown,
  description = '云端朗读',
): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rowCount } = await client.query(
      'UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2 AND credits_balance >= $1',
      [amount, userId],
    )
    if (rowCount === 0) {
      await client.query('ROLLBACK')
      return false
    }
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta)
       VALUES ($1, $2, 'consumption', $3, $4, $5)`,
      [userId, -amount, ref, description, JSON.stringify(meta)],
    )
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function refundCredits(
  userId: string,
  amount: number,
  ref: string,
  meta: unknown,
  description = '合成失败退还积分',
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // 单行认领：把一条匹配的 consumption 扣费行标记为 refund（amount 存负数）
    // FOR UPDATE SKIP LOCKED 保证并发退款各认领不同行；每笔扣费恰好退一次
    const { rowCount } = await client.query<{ id: string }>(
      `UPDATE credit_transactions
       SET kind = 'refund'
       WHERE id = (
         SELECT id FROM credit_transactions
         WHERE user_id = $1 AND ref = $2 AND kind = 'consumption' AND amount = $3
         ORDER BY created_at, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      [userId, ref, -amount],
    )
    if (!rowCount) {
      await client.query('ROLLBACK')
      return
    }
    // 审计行：消费记录里同时可见扣费（改 kind 后的 refund 行）与退款（adjustment 行）
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta)
       VALUES ($1, $2, 'adjustment', $3, $4, $5)`,
      [userId, amount, ref, description, JSON.stringify(meta)],
    )
    await client.query('UPDATE users SET credits_balance = credits_balance + $1 WHERE id = $2', [
      amount,
      userId,
    ])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export interface SubscriptionInfo {
  planId: string | null
  status: string
  periodEnd: string | null
}

export async function getSubscription(userId: string): Promise<SubscriptionInfo> {
  const { rows } = await pool.query<{
    subscription_plan_id: string | null
    subscription_status: string
    subscription_period_end: string | null
  }>(
    'SELECT subscription_plan_id, subscription_status, subscription_period_end FROM users WHERE id = $1',
    [userId],
  )
  return {
    planId: rows[0]?.subscription_plan_id ?? null,
    status: rows[0]?.subscription_status ?? 'none',
    periodEnd: rows[0]?.subscription_period_end ?? null,
  }
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM users WHERE id = $1 AND subscription_status = 'active'",
    [userId],
  )
  return (rowCount ?? 0) > 0
}

export async function getActiveStripeSubscriptionId(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ stripe_subscription_id: string | null }>(
    "SELECT stripe_subscription_id FROM users WHERE id = $1 AND subscription_status = 'active'",
    [userId],
  )
  return rows[0]?.stripe_subscription_id ?? null
}

export async function recordSubscriptionCustomer(
  userId: string,
  customerId: string,
  subscriptionId: string,
): Promise<void> {
  await pool.query(
    'UPDATE users SET stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3',
    [customerId, subscriptionId, userId],
  )
}

export async function subscriptionGrant(
  userId: string,
  planId: string,
  credits: number,
  subscriptionId: string,
  customerId: string | null,
  periodEndIso: string,
  meta: unknown,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ credits_balance: string }>(
      'SELECT credits_balance FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    )
    const currentBalance = Number(rows[0]?.credits_balance ?? 0)
    if (currentBalance > 0) {
      await client.query(
        "INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta) VALUES ($1, $2, 'subscription_reset', $3, '上期积分到期清零', $4)",
        [userId, -currentBalance, subscriptionId, JSON.stringify(meta)],
      )
    }
    await client.query(
      "INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta) VALUES ($1, $2, 'subscription_grant', $3, $4, $5)",
      [userId, credits, subscriptionId, `订阅${findPackageName(planId)} · 本月积分`, JSON.stringify(meta)],
    )
    await client.query(
      `UPDATE users SET
         credits_balance = $1,
         storage_quota_bytes = GREATEST(storage_quota_bytes, $2),
         stripe_subscription_id = $3,
         subscription_plan_id = $4,
         subscription_status = 'active',
         subscription_period_end = $5
       WHERE id = $6`,
      [credits, CONFIG.quota.paidBytes, subscriptionId, planId, periodEndIso, userId],
    )
    if (customerId) {
      await client.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function subscriptionExpired(
  userId: string,
  subscriptionId: string,
  meta: unknown,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ credits_balance: string; stripe_subscription_id: string | null }>(
      'SELECT credits_balance, stripe_subscription_id FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    )
    if (!rows[0] || rows[0].stripe_subscription_id !== subscriptionId) {
      await client.query('ROLLBACK')
      return
    }
    const currentBalance = Number(rows[0].credits_balance ?? 0)
    if (currentBalance > 0) {
      await client.query(
        "INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta) VALUES ($1, $2, 'subscription_reset', $3, '订阅到期，积分清零', $4)",
        [userId, -currentBalance, subscriptionId, JSON.stringify(meta)],
      )
    }
    await client.query(
      `UPDATE users SET
         credits_balance = 0,
         storage_quota_bytes = $1,
         stripe_subscription_id = NULL,
         subscription_plan_id = NULL,
         subscription_status = 'none',
         subscription_period_end = NULL
       WHERE id = $2`,
      [CONFIG.quota.freeBytes, userId],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

function findPackageName(planId: string): string {
  return CREDIT_PACKAGES.find((p) => p.id === planId)?.name ?? planId
}
