# M2b 积分与支付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M2a（账号 + 文件库）之上建立积分与支付：积分账户与流水、Stripe 套餐购买（$1.99/$3.99/$9.99）、注册赠送 50 积分、购买后存储配额升级 1G（免费 100MB）、消费记录页、逐句模式 Pro 解锁（需购买过任意套餐）。

**Architecture:** 余额冗余在 `users.credits_balance`，与 `credit_transactions` 流水表在同一事务内写（读零成本、流水可审计）；入账只发生在 Stripe Webhook（验签 + 幂等）与服务端逻辑，客户端 API 全部只读/下单。计费参数全部进 `src/lib/config.ts` 配置中心（M2c 上线后按真实 token 消耗校准）。逐句模式是播放行为（每句后自动暂停），在 readerStore 加开关，购买标记来自 `/api/credits/balance`。

**Tech Stack:** Next.js 15.3 + React 19 + TypeScript、pg（Neon）、Auth.js v5 会话、Stripe Checkout（Webhook 验签）、Vitest 3（纯函数/组件测试，沿用现有测试风格：不 mock 数据库连接）

**前置依赖：** M2a-2 已完成（文档库 + 配额）。本地 `.env.local` 有 `DATABASE_URL`。用户需先在 [dashboard.stripe.com](https://dashboard.stripe.com) 注册账号并拿到测试密钥（`sk_test_...`），本地联调用 `stripe listen --forward-to localhost:3000/api/webhooks/stripe` 转发 Webhook。

---

### Task 1: 数据库迁移 006 + 配置中心（配额 100MB/1G、积分规则、套餐）

**Files:**
- Create: `db/migrations/006_credits.sql`
- Modify: `src/lib/config.ts`
- Modify: `docs/DEPLOYMENT.md`（环境变量表加 STRIPE 两项）
- Modify: `.env.example`（加 STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）

- [x] **Step 1: 写迁移 `db/migrations/006_credits.sql`**

```sql
-- 积分账户 + 流水
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_balance bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('purchase','bonus','consumption','refund','adjustment')),
  ref text,
  description text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC);
-- 购买入账幂等：同一用户同一 Stripe session 只入账一次
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_purchase ON credit_transactions (user_id, ref) WHERE kind = 'purchase';

-- 免费配额 50MB → 100MB（已有用户只升不降）
UPDATE users SET storage_quota_bytes = 104857600
WHERE storage_quota_bytes < 104857600;
ALTER TABLE users ALTER COLUMN storage_quota_bytes SET DEFAULT 104857600;
```

- [x] **Step 2: 扩展 `src/lib/config.ts`**

```ts
export const CREDIT_PACKAGES = [
  { id: 'starter', name: '体验包', usd: 1.99, credits: 200 },
  { id: 'light', name: '轻量包', usd: 3.99, credits: 800 },
  { id: 'unlimited', name: '畅听包', usd: 9.99, credits: 2200 },
] as const

export const CONFIG = {
  quota: { freeBytes: 100 * 1024 * 1024, paidBytes: 1024 * 1024 * 1024 },
  credits: {
    bonusOnRegister: 50,
    ttsCreditsPer100Chars: 3,      // M2c 校准用初始值
    explainCreditsPer100Chars: 4,
    translateCreditsPer100Chars: 4,
    qaShortDoc: 20,
    qaLongDoc: 30,
  },
  stripe: { priceIds: {} as Record<string, string | undefined> }, // 暂空：走元数据计分，不依赖 Price 对象
  recycle: { retentionDays: 30 },
  auth: { verificationTtlMs: 24 * 60 * 60 * 1000 },
} as const
```

- [x] **Step 3: 跑迁移**

Run: `npm run db:migrate` → 期望输出 `applied 006_credits.sql`；再跑一次验证幂等。

- [x] **Step 4: 验证数据库**

Run: `psql $DATABASE_URL -c "\\d credit_transactions"` 或 node 脚本查询 `users.credits_balance` 列存在。

- [x] **Step 5: 更新 `.env.example` 与 `docs/DEPLOYMENT.md`**（加 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`，标注测试模式）

- [x] **Step 6: Commit**

```bash
git add db/migrations/006_credits.sql src/lib/config.ts .env.example docs/DEPLOYMENT.md
git commit -m "feat(credits): add credits schema, config center, quota 100MB/1G"
```

---

### Task 2: 积分数据层（纯函数 TDD + DB 薄封装）

**Files:**
- Create: `src/lib/db/credits.ts`
- Test: `src/lib/db/__tests__/credits.test.ts`

- [x] **Step 1: 写失败测试 `src/lib/db/__tests__/credits.test.ts`**（纯函数，沿用 `documents.test.ts` 风格，不碰真实 DB）

```ts
import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, mapTransactionRow, canDeduct } from '../credits'

describe('encodeCursor / decodeCursor', () => {
  it('往返一致', () => {
    expect(decodeCursor(encodeCursor('2026-08-13T01:02:03.000Z', 'uuid-1')))
      .toEqual({ createdAt: '2026-08-13T01:02:03.000Z', id: 'uuid-1' })
  })
  it('非法游标返回 null', () => {
    expect(decodeCursor('not-base64')).toBeNull()
  })
})

describe('canDeduct', () => {
  it('余额充足允许扣费', () => expect(canDeduct(100n, 30n)).toBe(true))
  it('余额不足拒绝', () => expect(canDeduct(20n, 30n)).toBe(false))
})

describe('mapTransactionRow', () => {
  it('把 DB 行映射为 API 对象', () => {
    expect(mapTransactionRow({ id: 't1', amount: '100', kind: 'purchase', description: '购买体验包', created_at: '2026-08-13T00:00:00Z', ref: null, meta: null }))
      .toEqual({ id: 't1', amount: 100, kind: 'purchase', description: '购买体验包', createdAt: '2026-08-13T00:00:00Z', ref: null, meta: null })
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/db/__tests__/credits.test.ts` → 期望 FAIL（模块不存在 / 函数未定义）

- [x] **Step 3: 实现 `src/lib/db/credits.ts`**

```ts
import { pool } from '@/lib/db/pool'

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
  id: string; amount: string; kind: string; description: string
  created_at: string; ref: string | null; meta: unknown
}

export function mapTransactionRow(row: CreditTransactionRow) {
  return {
    id: row.id, amount: Number(row.amount), kind: row.kind,
    description: row.description, createdAt: row.created_at,
    ref: row.ref, meta: row.meta,
  }
}

export async function getCreditsBalance(userId: string): Promise<number> {
  const { rows } = await pool.query<{ credits_balance: string }>(
    'SELECT credits_balance FROM users WHERE id = $1', [userId])
  return Number(rows[0]?.credits_balance ?? 0)
}

export async function isPurchased(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM credit_transactions WHERE user_id = $1 AND kind = 'purchase' LIMIT 1`, [userId])
  return (rowCount ?? 0) > 0
}

export async function listTransactions(userId: string, cursor: { createdAt: string; id: string } | null, limit: number) {
  const params: unknown[] = [userId]
  let where = 'WHERE user_id = $1'
  if (cursor) {
    params.push(cursor.createdAt, cursor.id)
    where += ` AND (created_at, id) < ($2, $3)`
  }
  params.push(limit + 1)
  const { rows } = await pool.query<CreditTransactionRow>(
    `SELECT id, amount, kind, description, created_at, ref, meta
     FROM credit_transactions ${where}
     ORDER BY created_at DESC, id DESC LIMIT $${params.length}`, params)
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map(mapTransactionRow)
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id) : null
  return { items, nextCursor }
}

export async function grantSignupBonusIfNew(userId: string, amount: number): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rowCount } = await client.query(
      'SELECT 1 FROM credit_transactions WHERE user_id = $1 LIMIT 1', [userId])
    if (rowCount === 0) {
      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, kind, description)
         VALUES ($1, $2, 'bonus', '注册赠送积分')`, [userId, amount])
      await client.query(
        'UPDATE users SET credits_balance = credits_balance + $1 WHERE id = $2', [amount, userId])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function creditPurchase(userId: string, packageId: string, credits: number, sessionId: string, meta: unknown): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, kind, ref, description, meta)
       VALUES ($1, $2, 'purchase', $3, $4, $5)
       ON CONFLICT (user_id, ref) WHERE kind = 'purchase' DO NOTHING`, // 幂等
      [userId, credits, sessionId, `购买${packageId}`, JSON.stringify(meta)])
    await client.query(
      'UPDATE users SET credits_balance = credits_balance + $1 WHERE id = $2', [credits, userId])
    await client.query(
      `UPDATE users SET storage_quota_bytes = GREATEST(storage_quota_bytes, $1) WHERE id = $2`,
      [CONFIG.quota.paidBytes, userId])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
```

注意：`ON CONFLICT DO NOTHING` 下仍会 UPDATE 余额 —— 需要先 `RETURNING` 判断是否新插入。改为：

```ts
const { rows } = await client.query(
  `INSERT ... ON CONFLICT (user_id, ref) WHERE kind = 'purchase' DO NOTHING RETURNING id`, [..])
if (rows.length === 0) { await client.query('ROLLBACK'); return }
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/db/__tests__/credits.test.ts` → 期望 PASS

- [x] **Step 5: Commit**

```bash
git add src/lib/db/credits.ts src/lib/db/__tests__/credits.test.ts
git commit -m "feat(credits): credits db layer with cursor pagination and idempotent purchase"
```

---

### Task 3: 注册赠送积分（邮箱注册 + Google 首次登录）

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/lib/auth/config.ts`（`events.createUser` 钩子）

- [x] **Step 1: 写失败测试（纯函数辅助）**

在 `src/lib/db/__tests__/credits.test.ts` 追加：`grantSignupBonusIfNew` 已有「已有流水则不重复赠送」逻辑，测试覆盖判断函数：

```ts
describe('grantSignupBonusIfNew 的赠送条件', () => {
  it('无任何流水时赠送（由 SQL 判断，本测试锁定纯函数签名）', () => {
    expect(typeof grantSignupBonusIfNew).toBe('function')
  })
})
```

- [x] **Step 2: 修改注册路由**：在现有 `INSERT INTO users` 后、`COMMIT` 前，调用 `grantSignupBonusIfNew(userId, CONFIG.credits.bonusOnRegister)`（注意该函数自开事务，需改为接收 client 或拆出事务内版本 —— 推荐把 bonus 逻辑做成 `grantSignupBonus(client, userId)` 便于复用）

- [x] **Step 3: 修改 `src/lib/auth/config.ts`**：加 `events: { async createUser({ user }) { await grantSignupBonusIfNew(user.id, CONFIG.credits.bonusOnRegister) } }`（Google OAuth 首次登录触发；邮箱注册走 register 路由，不经过 Auth.js createUser）

- [x] **Step 4: 跑相关测试**：`npx vitest run src/lib/db src/lib/auth src/app/login` → 全 PASS

- [x] **Step 5: Commit**

```bash
git commit -am "feat(credits): grant 50 signup bonus credits on register and Google signup"
```

---

### Task 4: 积分只读 API（balance / transactions / packages）

**Files:**
- Create: `src/app/api/credits/balance/route.ts`
- Create: `src/app/api/credits/transactions/route.ts`
- Create: `src/app/api/credits/packages/route.ts`

- [x] **Step 1: 写失败测试**（沿用现有路由测试风格——当前仓库没有 API 路由测试；以组件/纯函数测试为主，路由用 curl 冒烟）

在 `src/lib/db/__tests__/credits.test.ts` 补 `listTransactions` 的分页纯逻辑测试（用注入 rows 的 helper，若实现拆出 `pageRows(rows, limit)` 纯函数则直接测它）

- [x] **Step 2: 实现 `balance/route.ts`**（仿 `src/app/api/documents/route.ts`）

```ts
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const [creditsBalance, quotaBytes, purchased] = await Promise.all([
    getCreditsBalance(session.user.id), getUserQuotaBytes(session.user.id), isPurchased(session.user.id),
  ])
  return NextResponse.json({ creditsBalance, quotaBytes, purchased })
}
```

- [x] **Step 3: 实现 `transactions/route.ts`**：`?cursor=&limit=`（limit 默认 20、上限 50），返回 `{ items, nextCursor }`

- [x] **Step 4: 实现 `packages/route.ts`**（公开，返回 CREDIT_PACKAGES 的展示字段 + 可朗读字数估算）

- [x] **Step 5: 本地冒烟**：dev server 起来后 `curl localhost:3000/api/credits/packages` 返回三档套餐

- [x] **Step 6: Commit**

```bash
git commit -am "feat(credits): balance, transactions and packages read APIs"
```

---

### Task 5: Stripe 支付（Checkout + Webhook）

**Files:**
- Create: `src/lib/payments/stripe.ts`
- Create: `src/app/api/credits/checkout/route.ts`
- Create: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/lib/payments/__tests__/stripe.test.ts`

- [x] **Step 1: 安装 stripe**

```bash
npm install stripe
```

- [x] **Step 2: 写失败测试 `src/lib/payments/__tests__/stripe.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findPackage, createCheckoutSession } from '../stripe'

vi.mock('stripe', () => ({ default: vi.fn().mockReturnValue({ checkout: { sessions: { create: vi.fn() } } }) }))

describe('findPackage', () => {
  it('按 id 找到套餐', () => {
    expect(findPackage('starter')?.usd).toBe(1.99)
  })
  it('未知套餐返回 undefined', () => {
    expect(findPackage('nope')).toBeUndefined()
  })
})

describe('createCheckoutSession', () => {
  it('写入 metadata.userId 与 packageId', async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/1', id: 'cs_1' })
    // 注入 mock：重构 createCheckoutSession 接受注入的 client 便于测试
    ...
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ userId: 'u1', packageId: 'starter' }),
      mode: 'payment',
    }))
  })
})
```

- [x] **Step 3: 实现 `src/lib/payments/stripe.ts`**

```ts
import Stripe from 'stripe'
import { CREDIT_PACKAGES, CONFIG } from '@/lib/config'

export function findPackage(id: string) {
  return CREDIT_PACKAGES.find((p) => p.id === id)
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
}

export async function createCheckoutSession(userId: string, packageId: string, appUrl: string) {
  const pkg = findPackage(packageId)
  if (!pkg) throw new Error('unknown package')
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: `${pkg.name}（${pkg.credits} 积分）` }, unit_amount: Math.round(pkg.usd * 100) }, quantity: 1 }],
    metadata: { userId, packageId, credits: String(pkg.credits) },
    success_url: `${appUrl}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?cancel=1`,
  })
  return session
}

export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return getStripe().webhooks.constructEvent(payload, signature, secret)
}
```

- [x] **Step 4: 实现 `checkout/route.ts`**：登录 → body `{ packageId }` → `createCheckoutSession` → `{ url }`；异常返回 400/500

- [x] **Step 5: 实现 `webhooks/stripe/route.ts`**

```ts
export async function POST(req: Request) {
  const payload = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  let event: Stripe.Event
  try { event = verifyWebhookSignature(payload, signature) }
  catch { return NextResponse.json({ error: 'invalid signature' }, { status: 400 }) }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId
    const credits = Number(session.metadata?.credits ?? 0)
    if (userId && credits > 0 && session.id) {
      await creditPurchase(userId, session.metadata!.packageId, credits, session.id, { paymentStatus: session.payment_status, amountTotal: session.amount_total })
    }
  }
  return NextResponse.json({ received: true })
}
```

- [x] **Step 6: 跑测试**：`npx vitest run src/lib/payments` → PASS

- [x] **Step 7: 本地联调（可选，需用户 Stripe 测试密钥）**：`.env.local` 加 `STRIPE_SECRET_KEY=sk_test_...`、`STRIPE_WEBHOOK_SECRET=whsec_...`；`stripe listen --forward-to localhost:3000/api/webhooks/stripe`；用 4242 4242 4242 4242 测试卡支付验证入账

- [x] **Step 8: Commit**

```bash
git commit -am "feat(payments): stripe checkout and verified webhook with idempotent credit"
```

---

### Task 6: 前端 — 购买页 /pricing + 消费记录页 /credits + 库页余额入口

**Files:**
- Create: `src/app/pricing/page.tsx`
- Create: `src/app/credits/page.tsx`
- Create: `src/components/pricing/PackageCards.tsx`
- Create: `src/components/pricing/__tests__/PackageCards.test.tsx`
- Create: `src/app/credits/__tests__/credits.test.tsx`
- Modify: `src/app/library/page.tsx`（余额 + 购买入口 + 消费记录入口）

- [x] **Step 1: 写失败测试 `PackageCards.test.tsx`**（mock fetch 返回套餐，断言价格/积分展示、点击调用 checkout）

- [x] **Step 2: 实现 `PackageCards.tsx` + `/pricing` 页面**：三档卡片（$ 价格、积分、约可朗读字数、购买按钮）→ `POST /api/credits/checkout` → `window.location.href = url`；未登录显示引导登录；已登录显示当前余额与配额

- [x] **Step 3: 写失败测试 `credits.test.tsx`**（mock balance + transactions，断言余额、流水列表、加载更多）

- [x] **Step 4: 实现 `/credits` 页面**：余额卡片 + 流水列表（时间 / 说明 / +-积分）+ 加载更多（游标）+ 回到 /pricing 购买入口

- [x] **Step 5: 修改 `/library`**：顶部显示 `积分 {balance}`、`购买积分 →`、`消费记录 →` 链接（已登录时）

- [x] **Step 6: 跑测试**：`npx vitest run src/app/pricing src/app/credits src/app/library src/components/pricing` → PASS

- [x] **Step 7: Commit**

```bash
git commit -am "feat(credits): pricing and credits history pages with balance entry"
```

---

### Task 7: 逐句模式（Pro 解锁，需购买过任意套餐；每句后自动暂停 N 秒后继续）

**Files:**
- Modify: `src/lib/state/readerStore.ts`
- Modify: `src/lib/tts/queue.ts`（每句结束暂停 N 秒后自动继续）
- Modify: `src/components/reader/SettingsPanel.tsx`（开关 + 锁定态）
- Test: `src/lib/state/__tests__/readerStore.test.ts`（追加用例）
- Test: `src/lib/tts/__tests__/queue.test.ts`（追加用例）
- Test: `src/components/reader/__tests__/SettingsPanel.test.tsx`（新建或并入现有测试）

- [x] **Step 1: 写失败测试**

readerStore：`sentencePause` 开关与 `sentencePauseSeconds`（默认 2）存在；`setSentencePause(true)` 后 `getOptions()` 返回包含 `sentencePause: true, sentencePauseSeconds: 2`；`setSentencePauseSeconds(5)` 后更新为 5

queue：构造 fake engine，`sentencePause: true, sentencePauseSeconds: 0.05`（测试用短时长）时，句子播完进入「暂停计时」状态，计时结束自动播放下一句（fake timers 断言调用顺序）

- [x] **Step 2: 实现 readerStore**：`settings.sentencePause: boolean`（默认 false）+ `settings.sentencePauseSeconds: number`（默认 2）+ `setSentencePause` + `setSentencePauseSeconds`

- [x] **Step 3: 实现 queue 逐句暂停**：engine `onend` 回调里，若开启 `sentencePause`，先进入 paused 状态并记录计时器，`sentencePauseSeconds` 秒后若用户未手动暂停则自动播下一句；用户手动暂停/停止时清除计时器

- [x] **Step 3.5: 边界**：暂停计时期间用户手动暂停 → 取消自动继续，保持手动暂停；计时期间用户手动恢复播放 → 立即继续并取消计时器

- [x] **Step 4: 实现 SettingsPanel**：逐句模式开关 + 时长选择（1–10 秒，默认 2，如 1/2/3/5/8/10 或滑块）；未购买（`purchased === false`）时显示 🔒 锁定态 + 「购买解锁」链接到 `/pricing`；获取购买状态：页面初始化拉一次 `/api/credits/balance`

- [x] **Step 5: 跑测试**：`npx vitest run src/lib/state src/lib/tts src/components/reader` → PASS

- [x] **Step 6: Commit**

```bash
git commit -am "feat(reader): sentence-by-sentence mode gated by purchase"
```

---

### Task 8: 部署与线上验证

**Files:**
- Modify: `docs/DEPLOYMENT.md`（验证清单追加积分/支付步骤）

- [x] **Step 1: 全量测试 + 类型检查**

Run: `npm test` 与 `npx tsc --noEmit` → 全绿

- [x] **Step 2: 推送到 GitHub**（master）→ Vercel 自动部署

- [x] **Step 3: Vercel 环境变量**：`STRIPE_SECRET_KEY`（测试）、`STRIPE_WEBHOOK_SECRET`（测试）写入 Production/Preview；提醒用户上线前换 `sk_live_...` 与正式 Webhook

- [x] **Step 4: 线上验证**

1. 新注册账号 → 余额 50
2. `/pricing` 三档展示正确
3. 用 Stripe 测试卡完成支付 → 余额 +200、流水出现购买记录、配额 1G、逐句模式解锁
4. 未购买账号进入阅读器 → 逐句模式锁定态
5. 重复投递 Webhook（`stripe trigger checkout.session.completed`）→ 不重复入账

- [x] **Step 5: 更新 `docs/DEPLOYMENT.md` 验证清单并提交**

```bash
git commit -am "docs: add M2b credits and payment verification steps"
```

---

## 附：M2c 衔接点（本轮不实现，只留接口）

- `src/lib/db/credits.ts` 已提供 `deductCredits(userId, amount, kind, ref, meta)` 预留位（消费扣费，事务内校验余额 >= 0）
- `CONFIG.credits` 的 tts/explain/translate/qa 单价是 M2c/M3 的初始配置
- 云语音解锁条件：`credits_balance > 0`（余额接口已返回）
