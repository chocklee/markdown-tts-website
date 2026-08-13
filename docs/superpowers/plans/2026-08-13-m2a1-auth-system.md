# M2a-1 认证系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「听 Markdown」加入账号系统：邮箱注册（邮件验证）+ 邮箱密码登录 + Google 一键登录 + 忘记密码重置，会话走 httpOnly Cookie（Auth.js v5）。

**Architecture:** Next.js 15 App Router 服务端能力首次落地。Auth.js v5 + `@auth/pg-adapter` 连接 Neon Postgres（`pg` 驱动）；Credentials 提供者校验邮箱密码（scrypt 哈希），Google 提供者做 OAuth 登录（未配置密钥时自动隐藏）；邮箱验证与密码重置用自建 token 表 + Resend 发信；会话为 JWT（httpOnly Cookie）。纯逻辑（密码哈希、限流）用 Vitest TDD，数据库与邮件流程用真实环境手动验收。

**Tech Stack:** Next.js 15.3 + React 19 + TypeScript、Auth.js v5（next-auth@beta）、@auth/pg-adapter + pg（Neon/Vercel Postgres）、Resend、Vitest 3 + Testing Library

---

## 前置环境准备（执行前需完成）

在开始前，需要以下外部资源；未就绪的部分不影响代码编写，但影响验收：

1. **Neon 数据库**：创建项目，复制 `DATABASE_URL`（`postgres://...`）写入 `.env.local`
2. **Auth.js 密钥**：`openssl rand -base64 32` 生成，写入 `AUTH_SECRET`
3. **Resend**：注册账号取 `RESEND_API_KEY`；未验证域名前发信地址用 `onboarding@resend.dev`
4. **Google OAuth**（可选，可后配）：Google Cloud 建 OAuth 客户端（Web 应用），授权回调填 `http://localhost:3000/api/auth/callback/google`（部署后换成线上域名）；`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` 写入 `.env.local`。未配置时 Google 按钮自动隐藏，其余功能不受影响

`.env.local` 会被 gitignore；提交一个 `.env.example` 作为模板。

---

### Task 1: 依赖、配置常量、数据库连接与迁移脚本

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `src/lib/config.ts`
- Create: `src/lib/db/pool.ts`
- Create: `scripts/migrate.ts`
- Create: `db/migrations/001_auth.sql`
- Modify: `.gitignore`

- [ ] **Step 1: 安装依赖**

```bash
npm install next-auth@beta @auth/pg-adapter pg resend
npm install -D @types/pg tsx fake-indexeddb
```

说明：`next-auth@beta` 即 Auth.js v5；若 beta 标签已下线，改用 `npm install next-auth@5`。装完后 `npx tsc --noEmit` 应无错误（可能需等下一步代码就绪）。

- [ ] **Step 2: 修改 `package.json` scripts**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "tsx scripts/migrate.ts"
  }
}
```

- [ ] **Step 3: 创建 `.env.example`**

```bash
# 数据库（Neon / Vercel Postgres）
DATABASE_URL=postgres://user:pass@host/db
# Auth.js 会话密钥：openssl rand -base64 32
AUTH_SECRET=change-me
# Google OAuth（可选；未配置时 Google 登录自动隐藏）
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
# Resend 邮件
RESEND_API_KEY=
EMAIL_FROM=听 Markdown <onboarding@resend.dev>
# 站外发信链接的站点地址
APP_URL=http://localhost:3000
```

- [ ] **Step 4: 创建 `src/lib/config.ts`**

```ts
export const CONFIG = {
  quota: {
    freeBytes: 50 * 1024 * 1024,
    paidBytes: 500 * 1024 * 1024,
  },
  recycle: {
    retentionDays: 30,
  },
  auth: {
    verificationTtlMs: 24 * 60 * 60 * 1000,
  },
} as const
```

- [ ] **Step 5: 创建 `src/lib/db/pool.ts`**

```ts
import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { mttsPool?: Pool }

export const pool =
  globalForPg.mttsPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

if (process.env.NODE_ENV !== 'production') globalForPg.mttsPool = pool
```

- [ ] **Step 6: 创建 `db/migrations/001_auth.sql`**

```sql
-- Auth.js pg-adapter 标准表 + 自建用户/验证表
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text,
  "email" text NOT NULL UNIQUE,
  "emailVerified" timestamptz,
  "image" text,
  "password_hash" text,
  "storage_quota_bytes" bigint NOT NULL DEFAULT 52428800,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" bigint,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  UNIQUE ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionToken" text NOT NULL UNIQUE,
  "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification_token" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamptz NOT NULL,
  UNIQUE ("identifier", "token")
);

CREATE TABLE IF NOT EXISTS "email_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
```

注：001 已在开发库应用过旧表名，由 002_auth_adapter_fix.sql 修正；新环境按 001+002 顺序执行即可得到正确 schema。

- [ ] **Step 7: 创建 `scripts/migrate.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pool } from '../src/lib/db/pool'

async function main() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  )
  const dir = path.join(process.cwd(), 'db', 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const { rowCount } = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file])
    if (rowCount) continue
    const sql = await readFile(path.join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`applied ${file}`)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }
  console.log('migrations up to date')
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 8: 确认 `.gitignore` 已忽略 `.env*` 但保留 `.env.example`**

`.gitignore` 应包含 `.env*.local` 与 `.env`；`!.env.example` 例外的写法按需调整。执行 `npm run db:migrate`，预期输出 `applied 001_auth.sql` + `migrations up to date`（需 `DATABASE_URL` 已配置；连不上数据库则此步失败，先修复连接再继续）。

- [ ] **Step 9: 提交**

```bash
git add package.json package-lock.json .env.example src/lib/config.ts src/lib/db/pool.ts scripts/migrate.ts db/migrations/001_auth.sql .gitignore
git commit -m "feat(auth): add db pool, migrations, and config"
```

---

### Task 2: 密码哈希工具（TDD）

**Files:**
- Create: `src/lib/auth/password.ts`
- Test: `src/lib/auth/__tests__/password.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/auth/__tests__/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('hashPassword / verifyPassword', () => {
  it('正确密码验证通过', () => {
    const hash = hashPassword('abc12345')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('abc12345', hash)).toBe(true)
  })

  it('错误密码验证失败', () => {
    const hash = hashPassword('abc12345')
    expect(verifyPassword('wrong-pass', hash)).toBe(false)
  })

  it('相同密码每次哈希不同（随机盐）', () => {
    expect(hashPassword('abc12345')).not.toBe(hashPassword('abc12345'))
  })

  it('损坏的存储值直接拒绝', () => {
    expect(verifyPassword('abc12345', 'not-a-hash')).toBe(false)
  })

  it('哈希格式包含成本参数与固定长度', () => {
    expect(hashPassword('abc12345')).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
  })

  it('篡改哈希后验证失败', () => {
    const hash = hashPassword('abc12345')
    const tampered = hash.slice(0, -1) + (hash.endsWith('a') ? 'b' : 'a')
    expect(verifyPassword('abc12345', tampered)).toBe(false)
  })

  it('篡改盐后验证失败', () => {
    const hash = hashPassword('abc12345')
    const parts = hash.split('$')
    parts[4] = parts[4].startsWith('a') ? 'b' + parts[4].slice(1) : 'a' + parts[4].slice(1)
    expect(verifyPassword('abc12345', parts.join('$'))).toBe(false)
  })

  it('盐或哈希长度非法的存储值直接拒绝', () => {
    expect(verifyPassword('abc12345', 'scrypt$16384$8$1$ab$cd')).toBe(false)
    expect(verifyPassword('abc12345', 'scrypt$16384$8$1$' + 'a'.repeat(32) + '$cd')).toBe(false)
  })

  it('成本参数超出安全范围直接拒绝', () => {
    const salt = 'a'.repeat(32)
    const hash = 'b'.repeat(128)
    expect(verifyPassword('abc12345', `scrypt$999$8$1$${salt}$${hash}`)).toBe(false)
    expect(verifyPassword('abc12345', `scrypt$16384$999$1$${salt}$${hash}`)).toBe(false)
  })

  it('范围内但不可执行的参数（N 非 2 的幂）直接拒绝不抛异常', () => {
    const salt = 'a'.repeat(32)
    const hash = 'b'.repeat(128)
    expect(verifyPassword('abc12345', `scrypt$16385$8$1$${salt}$${hash}`)).toBe(false)
  })

  it('超过 Node maxmem 的参数（N=65536）直接拒绝不抛异常', () => {
    const salt = 'a'.repeat(32)
    const hash = 'b'.repeat(128)
    expect(verifyPassword('abc12345', `scrypt$65536$8$1$${salt}$${hash}`)).toBe(false)
  })

  it('非十进制写法参数直接拒绝', () => {
    const salt = 'a'.repeat(32)
    const hash = 'b'.repeat(128)
    expect(verifyPassword('abc12345', `scrypt$0x4000$8$1$${salt}$${hash}`)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/auth/__tests__/password.test.ts`
Expected: FAIL（模块不存在 / 函数未定义）

- [ ] **Step 3: 实现 `src/lib/auth/password.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SCRYPT_N = 16384
export const SCRYPT_R = 8
export const SCRYPT_P = 1
export const SCRYPT_KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString('hex')
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, expectedHex] = parts
  if (!/^[0-9a-f]{32}$/.test(salt)) return false
  if (!/^[0-9a-f]{128}$/.test(expectedHex)) return false
  if (!/^\d+$/.test(n) || !/^\d+$/.test(r) || !/^\d+$/.test(p)) return false
  const costN = Number(n)
  const costR = Number(r)
  const costP = Number(p)
  if (!Number.isInteger(costN) || !Number.isInteger(costR) || !Number.isInteger(costP)) return false
  if (costN < 1024 || costN > 2 ** 24 || costR < 1 || costR > 64 || costP < 1 || costP > 16) return false
  let candidate: Buffer
  try {
    candidate = scryptSync(password, salt, SCRYPT_KEYLEN, { N: costN, r: costR, p: costP })
  } catch {
    return false
  }
  const expected = Buffer.from(expectedHex, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/auth/__tests__/password.test.ts`
Expected: 4 个用例 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth/password.ts src/lib/auth/__tests__/password.test.ts
git commit -m "feat(auth): add scrypt password hashing"
```

---

### Task 3: Auth.js 实例、配置与 API 路由

**Files:**
- Create: `src/types/next-auth.d.ts`
- Create: `src/lib/auth/config.ts`
- Create: `src/lib/auth/server.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: 创建类型增强 `src/types/next-auth.d.ts`**

```ts
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
  }
}
```

- [ ] **Step 2: 创建 `src/lib/auth/config.ts`**

```ts
import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { pool } from '@/lib/db/pool'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

const DUMMY_HASH = hashPassword('timing-equalizer-dummy')

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null
        let user: { id: string; name: string | null; email: string; password_hash: string | null; emailVerified: Date | null } | undefined
        try {
          const { rows } = await pool.query<{
            id: string
            name: string | null
            email: string
            password_hash: string | null
            emailVerified: Date | null
          }>('SELECT id, name, email, password_hash, "emailVerified" FROM users WHERE lower(email) = lower($1)', [email])
          user = rows[0]
        } catch (err) {
          console.error('authorize query failed', err)
          return null
        }
        if (!user || !user.password_hash || !user.emailVerified) {
          verifyPassword(password, DUMMY_HASH)
          return null
        }
        if (!verifyPassword(password, user.password_hash)) return null
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id
      return token
    },
    session({ session, token }) {
      if (typeof token.uid === 'string') session.user.id = token.uid
      return session
    },
  },
} satisfies NextAuthConfig
```

- [ ] **Step 3: 创建 `src/lib/auth/server.ts`**

```ts
import NextAuth from 'next-auth'
import { PostgresAdapter } from '@auth/pg-adapter'
import { authConfig } from '@/lib/auth/config'
import { pool } from '@/lib/db/pool'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool),
})
```

- [ ] **Step 4: 创建 `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from '@/lib/auth/server'

export const runtime = 'nodejs'

export const { GET, POST } = handlers
```

- [ ] **Step 5: 验证类型与构建**

Run: `npx tsc --noEmit && npm run lint`
Expected: 无错误（若 Auth.js 类型对 Session/JWT 增强报冲突，按增强文件已提供的字段调整，不要弱化类型）

- [ ] **Step 6: 提交**

```bash
git add src/types/next-auth.d.ts src/lib/auth/config.ts src/lib/auth/server.ts src/app/api/auth/[...nextauth]/route.ts
git commit -m "feat(auth): add Auth.js v5 instance with credentials and google providers"
```

---

### Task 4: 邮件发送（Resend）与限流工具

**Files:**
- Create: `src/lib/email/send.ts`
- Create: `src/lib/security/rateLimit.ts`
- Test: `src/lib/security/__tests__/rateLimit.test.ts`

- [ ] **Step 1: 写限流失败测试**

`src/lib/security/__tests__/rateLimit.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { isRateLimited, clientIp } from '../rateLimit'

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('第 1~3 次放行，第 4 次拦截', () => {
    const key = 'ip:1'
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(true)
  })

  it('窗口过期后计数重置', () => {
    const key = 'ip:2'
    expect(isRateLimited(key, 1, 60_000)).toBe(false)
    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
    expect(isRateLimited(key, 1, 60_000)).toBe(false)
    expect(isRateLimited(key, 1, 60_000)).toBe(true)
  })

  it('clientIp 解析 x-forwarded-for', () => {
    const req = (value: string | null) =>
      ({ headers: { get: (name: string) => (name === 'x-forwarded-for' ? value : null) } }) as unknown as Request
    expect(clientIp(req('1.2.3.4, 5.6.7.8'))).toBe('1.2.3.4')
    expect(clientIp(req(' 1.2.3.4 '))).toBe('1.2.3.4')
    expect(clientIp(req(null))).toBe('unknown')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/security/__tests__/rateLimit.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/lib/security/rateLimit.ts`**

```ts
const buckets = new Map<string, { count: number; resetAt: number }>()

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 1000) {
    for (const [k, entry] of buckets) {
      if (entry.resetAt < now) buckets.delete(k)
    }
  }
  const entry = buckets.get(key)
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count += 1
  return entry.count > limit
}

// 依赖平台覆盖 X-Forwarded-For（Vercel 行为），取最左值作为客户端 IP
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/security/__tests__/rateLimit.test.ts`
Expected: 2 个用例 PASS

- [ ] **Step 5: 实现 `src/lib/email/send.ts`**

```ts
import { Resend } from 'resend'

let resend: Resend | null = null

function getResend(): Resend {
  if (!resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY 未配置')
    resend = new Resend(key)
  }
  return resend
}

const FROM = process.env.EMAIL_FROM ?? '听 Markdown <onboarding@resend.dev>'

export function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000'
}

const baseHtml = (title: string, bodyHtml: string) => `
<div style="font-family:sans-serif;line-height:1.6;color:#1e293b">
  <h2 style="margin-bottom:8px">${title}</h2>
  <div>${bodyHtml}</div>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">听 Markdown — 把文字变成声音</p>
</div>`

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const result = await getResend().emails.send({ from: FROM, to, subject, html })
  if (result.error) throw new Error(result.error.message)
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`
  await sendEmail(
    email,
    '验证你的邮箱 — 听 Markdown',
    baseHtml(
      '验证你的邮箱',
      `<p>点击下面的链接完成邮箱验证（24 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>如果不是你本人操作，请忽略此邮件。</p>`,
    ),
  )
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await sendEmail(
    email,
    '重置密码 — 听 Markdown',
    baseHtml(
      '重置你的密码',
      `<p>点击下面的链接设置新密码（24 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>如果不是你本人操作，请忽略此邮件。</p>`,
    ),
  )
}
```

- [ ] **Step 6: 提交**

```bash
git add src/lib/email/send.ts src/lib/security/rateLimit.ts src/lib/security/__tests__/rateLimit.test.ts
git commit -m "feat(auth): add resend email sender and rate limiter"
```

---

### Task 5: 注册 API 与重发验证 API

**Files:**
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/resend-verification/route.ts`

- [ ] **Step 1: 创建 `src/app/api/auth/register/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { sendVerificationEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`register:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: '密码过长' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rowCount) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }
    const passwordHash = hashPassword(password)
    await client.query(
      'INSERT INTO users (email, password_hash, storage_quota_bytes) VALUES ($1, $2, $3)',
      [email, passwordHash, CONFIG.quota.freeBytes],
    )
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
    const { rows: tokenRows } = await client.query<{ token: string }>(
      'INSERT INTO email_verifications (email, token, expires_at) VALUES ($1, $2, $3) RETURNING token',
      [email, token, expiresAt],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('register failed', err)
    return NextResponse.json({ error: '注册失败，请稍后再试' }, { status: 500 })
  } finally {
    client.release()
  }

  try {
    const { rows: tokenRows } = await pool.query(
      'SELECT token FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
      [email],
    )
    await sendVerificationEmail(email, tokenRows[0].token)
  } catch (err) {
    console.error('send verification email failed', err)
  }

  return NextResponse.json({ ok: true })
}
```

说明：邮件发送失败不阻塞注册返回（用户可稍后从登录页重发）；已注册邮箱返回 409。

- [ ] **Step 2: 创建 `src/app/api/auth/resend-verification/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { sendVerificationEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`resend:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase() ?? ''

  const { rows } = await pool.query<{ emailVerified: Date | null }>(
    'SELECT "emailVerified" FROM users WHERE email = $1',
    [email],
  )
  if (rows[0] && !rows[0].emailVerified) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
    await pool.query('INSERT INTO email_verifications (email, token, expires_at) VALUES ($1, $2, $3)', [
      email,
      token,
      expiresAt,
    ])
    await sendVerificationEmail(email, token).catch((err) => console.error('resend failed', err))
  }

  // 无论邮箱是否存在都返回成功，避免账号枚举
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 类型与构建检查**

Run: `npx tsc --noEmit && npm run lint`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/app/api/auth/register/route.ts src/app/api/auth/resend-verification/route.ts
git commit -m "feat(auth): add register and resend-verification apis"
```

---

### Task 6: 邮箱验证页

**Files:**
- Create: `src/app/verify-email/page.tsx`

- [ ] **Step 1: 创建 `src/app/verify-email/page.tsx`**

```tsx
import Link from 'next/link'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  let status: 'success' | 'expired' | 'invalid' = 'invalid'

  if (token) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ email: string; expires_at: Date }>(
        'SELECT email, expires_at FROM email_verifications WHERE token = $1',
        [token],
      )
      if (rows.length === 0) {
        status = 'invalid'
      } else if (new Date(rows[0].expires_at).getTime() < Date.now()) {
        status = 'expired'
      } else {
        await client.query('UPDATE users SET "emailVerified" = now() WHERE email = $1', [rows[0].email])
        await client.query('DELETE FROM email_verifications WHERE token = $1', [token])
        status = 'success'
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('verify email failed', err)
    } finally {
      client.release()
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">
        {status === 'success' ? '邮箱验证成功' : status === 'expired' ? '验证链接已过期' : '验证链接无效'}
      </h1>
      <p className="mt-3 text-slate-500">
        {status === 'success'
          ? '现在可以登录你的账号了。'
          : status === 'expired'
            ? '请重新注册，或在登录页点击「重新发送验证邮件」。'
            : '请检查邮件中的链接是否完整，或重新注册。'}
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700"
      >
        去登录
      </Link>
    </main>
  )
}
```

- [ ] **Step 2: 手动验收**

1. 运行 `npm run dev`
2. 用 curl 注册：`curl -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"test@example.com","password":"password123"}'` → `{"ok":true}`
3. 从数据库取 token：`psql "$DATABASE_URL" -c "SELECT token FROM email_verifications ORDER BY created_at DESC LIMIT 1"`
4. 浏览器打开 `http://localhost:3000/verify-email?token=<token>` → 显示「邮箱验证成功」
5. 再次打开同一链接 → 显示「验证链接无效」（一次性）

- [ ] **Step 3: 提交**

```bash
git add src/app/verify-email/page.tsx
git commit -m "feat(auth): add email verification page"
```

---

### Task 7: 登录页、Header 与会话 Provider

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/layout/Header.tsx`
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: 修改 `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { Header } from '@/components/layout/Header'
import './globals.css'

export const metadata: Metadata = {
  title: '听 Markdown — 把文字变成声音',
  description: '粘贴或上传 Markdown 文件，边看边听 AI 朗读',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <SessionProvider>
          <Header />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: 创建 `src/components/layout/Header.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

export function Header() {
  const { data: session, status } = useSession()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold text-slate-800">
          听 Markdown
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {status === 'authenticated' ? (
            <>
              <span className="hidden text-slate-500 sm:inline">{session.user?.email}</span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-slate-600 hover:text-slate-900"
              >
                退出
              </button>
            </>
          ) : (
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              登录 / 注册
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: 创建 `src/app/api/auth/providers/route.ts`**

```ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  })
}
```

- [ ] **Step 4: 创建 `src/app/login/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resendSent, setResendSent] = useState(false)
  const [hasGoogle, setHasGoogle] = useState(false)

  useEffect(() => {
    fetch('/api/auth/providers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setHasGoogle(Boolean(data?.google)))
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await signIn('credentials', { redirect: false, email, password })
    if (res?.error) {
      setError('邮箱或密码错误；未验证的邮箱请先完成邮件验证')
      return
    }
    router.push('/')
    router.refresh()
  }

  async function resend() {
    setError('')
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) setResendSent(true)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-2xl font-bold">登录</h1>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-slate-600">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
            密码
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-blue-600 py-2.5 text-white hover:bg-blue-700">
          登录
        </button>
      </form>

      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-slate-600 hover:text-slate-900">
          忘记密码？
        </Link>
        <span className="mx-2 text-slate-300">|</span>
        <Link href="/register" className="text-slate-600 hover:text-slate-900">
          注册新账号
        </Link>
      </div>

      {error && (
        <button
          type="button"
          onClick={() => void resend()}
          className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          {resendSent ? '已重新发送验证邮件' : '未收到验证邮件？重新发送'}
        </button>
      )}

      {hasGoogle && (
        <button
          type="button"
          onClick={() => void signIn('google', { callbackUrl: '/' })}
          className="mt-3 w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          使用 Google 登录
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 5: 手动验收**

1. 数据库注册一个已验证用户（`psql` 手动 `UPDATE users SET "emailVerified" = now() WHERE email = 'test@example.com'`）
2. 浏览器访问 `/login`，用该邮箱密码登录 → 跳回首页，Header 显示邮箱与「退出」
3. 未验证用户登录 → 显示错误提示 + 「重新发送验证邮件」按钮
4. 未配置 Google 密钥时，登录页不显示 Google 按钮

- [ ] **Step 6: 提交**

```bash
git add src/app/layout.tsx src/components/layout/Header.tsx src/app/login/page.tsx src/app/api/auth/providers/route.ts
git commit -m "feat(auth): add login page, header, and session provider"
```

---

### Task 8: 忘记密码与重置密码

**Files:**
- Create: `src/app/api/auth/forgot-password/route.ts`
- Create: `src/app/api/auth/reset-password/route.ts`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/reset-password/page.tsx`

- [ ] **Step 1: 创建 `src/app/api/auth/forgot-password/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { sendPasswordResetEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase() ?? ''

  const { rows } = await pool.query<{ emailVerified: Date | null }>(
    'SELECT "emailVerified" FROM users WHERE email = $1',
    [email],
  )
  if (rows[0] && rows[0].emailVerified) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
    await pool.query('INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)', [
      email,
      token,
      expiresAt,
    ])
    await sendPasswordResetEmail(email, token).catch((err) => console.error('send reset email failed', err))
  }

  // 无论是否存在都返回成功，避免账号枚举
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 创建 `src/app/api/auth/reset-password/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`reset:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const token = body.token ?? ''
  const password = body.password ?? ''
  if (password.length < 8) {
    return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: '密码过长' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ email: string; expires_at: Date }>(
      'SELECT email, expires_at FROM password_resets WHERE token = $1',
      [token],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: '重置链接无效' }, { status: 400 })
    }
    if (new Date(rows[0].expires_at).getTime() < Date.now()) {
      await client.query('DELETE FROM password_resets WHERE token = $1', [token])
      await client.query('ROLLBACK')
      return NextResponse.json({ error: '重置链接已过期' }, { status: 400 })
    }
    await client.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashPassword(password), rows[0].email])
    await client.query('DELETE FROM password_resets WHERE token = $1', [token])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('reset password failed', err)
    return NextResponse.json({ error: '重置失败，请稍后再试' }, { status: 500 })
  } finally {
    client.release()
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 创建 `src/app/forgot-password/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) setSent(true)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-2xl font-bold">忘记密码</h1>
      {sent ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          如果该邮箱已注册，重置邮件已发送，请查收。
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate-600">
              注册邮箱
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2.5 text-white hover:bg-blue-700">
            发送重置邮件
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-slate-600 hover:text-slate-900">
          返回登录
        </Link>
      </p>
    </main>
  )
}
```

- [ ] **Step 4: 创建 `src/app/reset-password/page.tsx`（完整文件，含 Suspense 边界）**

```tsx
'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (res.ok) {
      setDone(true)
      return
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    setError(data.error ?? '重置失败，请重试')
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-sm px-4 py-20 text-center">
        <p className="text-slate-500">重置链接无效，请重新发起忘记密码。</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-blue-600">
          重新发送
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-2xl font-bold">设置新密码</h1>
      {done ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          密码已更新，<Link href="/login" className="text-blue-600">去登录</Link>
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
              新密码（至少 8 位）
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2.5 text-white hover:bg-blue-700">
            保存新密码
          </button>
        </form>
      )}
    </main>
  )
}

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">加载中…</div>}>
      <ResetPasswordPage />
    </Suspense>
  )
}
```

说明：`useSearchParams` 在 Next 15 构建时需要 Suspense 边界，所以页面主体是内部组件 `ResetPasswordPage`，默认导出 `ResetPasswordPageWrapper` 负责包 `Suspense`。

- [ ] **Step 5: 手动验收**

1. 已注册用户调 `forgot-password` API → 数据库 `password_resets` 出现 token
2. 打开 `/reset-password?token=<token>` → 设置新密码 → 用新密码登录成功
3. 再次使用同一 token → 提示无效（一次性）

- [ ] **Step 6: 提交**

```bash
git add src/app/api/auth/forgot-password/route.ts src/app/api/auth/reset-password/route.ts src/app/forgot-password/page.tsx src/app/reset-password/page.tsx
git commit -m "feat(auth): add forgot and reset password flows"
```

---

### Task 9: 全量验证与验收清单

- [ ] **Step 1: 自动化检查**

Run: `npm run test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 全部通过（测试含既有 82 个 + 新增用例；build 无报错）

- [ ] **Step 2: 端到端验收（Playwright / 手动）**

1. 注册 → 数据库取 token → 验证邮箱 → 登录成功 → Header 显示邮箱
2. 未验证邮箱登录被拒
3. 忘记密码 → 重置 → 新密码登录成功
4. 未配置 Google 密钥时登录页无 Google 按钮
5. 配置 Google 密钥后（若用户已提供）Google 一键登录 → 自动建号且邮箱已验证
6. 刷新页面会话保持（httpOnly Cookie）
7. 退出登录后回到首页，Header 恢复「登录 / 注册」状态（业务接口鉴权由下一计划 M2a-2 的文档 API 覆盖）

- [ ] **Step 3: 推送**

```bash
git push origin master
```

说明：本计划（M2a-1）交付「可注册/登录/重置密码」的完整能力，尚未包含文档库与同步；它们由下一份计划 `2026-08-13-m2a2-library-and-sync.md` 实现。
