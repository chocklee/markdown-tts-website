# M2c 云端 AI 语音 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M2b 积分体系之上提供云端 AI 音色：可插拔 TTS 供应商（首个 OpenAI gpt-4o-mini-tts）、按字扣积分、音频缓存（命中不扣）、阅读器音色选择与播放接入。

**Architecture:** 服务端代理统一入口 `POST /api/tts/synthesize`：鉴权/限流 → 查 `tts_cache`（provider+voice+text_hash 唯一，命中不扣）→ 事务内按字符数扣积分（不足 402）→ 调供应商合成 → upsert 缓存 → 返回音频。供应商实现 `TtsProvider` 接口，按 `TTS_PROVIDER` 环境变量注册。客户端新增 `CloudTtsEngine`（与 BrowserTtsEngine 同一接口），readerStore 按 `settings.voice` 选择引擎并支持运行时切换。

**Tech Stack:** Next.js 15.3 API Routes、pg（Neon，bytea 缓存）、OpenAI 音频 API（fetch 直连，不引 SDK）、Vitest 3（纯函数/引擎测试 mock fetch 与 Audio）

**前置依赖：** M2b 已完成（积分余额、流水、creditPurchase/deduct 基础）。联调需要 `OPENAI_API_KEY`（环境变量），未提供前代码先行。

---

### Task 1: 迁移 007（tts_cache）+ 配置中心

**Files:**
- Create: `db/migrations/007_tts_cache.sql`
- Modify: `src/lib/config.ts`

- [ ] **Step 1: 写迁移**（tts_cache 表 + 唯一索引，见设计文档 3.3）
- [ ] **Step 2: 扩展 CONFIG.tts**（provider、creditsPer100Chars=3、maxTextChars=2000、cacheTtlDays=30、voices 4 个音色）
- [ ] **Step 3: `npm run db:migrate`** → `applied 007_tts_cache.sql`
- [ ] **Step 4: Commit** `feat(tts): tts cache schema and config center`

### Task 2: 计费纯函数（TDD）

**Files:**
- Create: `src/lib/tts/server/cost.ts`
- Test: `src/lib/tts/server/__tests__/cost.test.ts`

- [ ] **Step 1: 写失败测试**：`countChars`（去空白 Unicode 码点）、`calcCredits`（ceil 进位，如 1 字=1 积分? 需定义：`ceil(chars*3/100)`，1 字 → 1，34 字 → 2，100 字 → 3）、`textHash`（sha256 稳定输出）
- [ ] **Step 2: 实现并跑绿**：`npx vitest run src/lib/tts/server`
- [ ] **Step 3: Commit** `feat(tts): credit cost pure functions`

### Task 3: 积分扣减/退款（credits.ts 扩展）

**Files:**
- Modify: `src/lib/db/credits.ts`

- [ ] **Step 1: 实现 `deductCredits(userId, amount, ref, meta)`**：事务内 `UPDATE ... SET credits_balance = credits_balance - $1 WHERE id=$2 AND credits_balance >= $1`，rowCount=0 → 返回 false；成功则写消费流水（kind=consumption）
- [ ] **Step 2: 实现 `refundCredits(userId, amount, ref, meta)`**：写 adjustment 流水 + 加回余额
- [ ] **Step 3: `npm test` 全绿 + tsc**
- [ ] **Step 4: Commit** `feat(credits): deduct and refund credits with balance guard`

### Task 4: 供应商抽象 + OpenAI 实现

**Files:**
- Create: `src/lib/tts/server/provider.ts`
- Create: `src/lib/tts/server/openai.ts`
- Test: `src/lib/tts/server/__tests__/openai.test.ts`

- [ ] **Step 1: 写失败测试**：mock fetch，断言请求 URL/body（model、voice、speed、input）与响应解析（audio Buffer、contentType、costUsd）
- [ ] **Step 2: 实现 `TtsProvider` 接口 + `getProvider()` + OpenAI 实现**（`https://api.openai.com/v1/audio/speech`，POST JSON，`gpt-4o-mini-tts`，speed 映射 rate*1.0 限制 0.25–4.0）
- [ ] **Step 3: 跑绿 + tsc**
- [ ] **Step 4: Commit** `feat(tts): pluggable tts provider with openai gpt-4o-mini-tts`

### Task 5: 缓存与合成 API

**Files:**
- Create: `src/lib/db/tts.ts`（getCachedAudio / upsertCachedAudio / cleanupExpiredCache）
- Create: `src/app/api/tts/synthesize/route.ts`
- Create: `src/app/api/tts/voices/route.ts`

- [ ] **Step 1: 实现 tts db 层**（查/写缓存 + 惰性清理）
- [ ] **Step 2: 实现 `/api/tts/voices`**（公开，返回音色列表）
- [ ] **Step 3: 实现 `/api/tts/synthesize`**：auth → 限流 → 校验（text ≤ 2000、voice 合法、rate 范围）→ 缓存命中返回（creditsCharged=0）→ `deductCredits`（false → 402）→ 合成 → upsert 缓存 → 返回 `{ audio: base64, contentType, chars, creditsCharged }`；合成失败 → `refundCredits` + 500
- [ ] **Step 4: 冒烟**：`curl /api/tts/voices` 返回 4 音色；未登录 synthesize → 401
- [ ] **Step 5: Commit** `feat(tts): synthesize api with cache and credit deduction`

### Task 6: 客户端 CloudTtsEngine

**Files:**
- Create: `src/lib/tts/cloud.ts`
- Test: `src/lib/tts/__tests__/cloud.test.ts`

- [ ] **Step 1: 写失败测试**：mock fetch（返回 audio blob）+ mock Audio：speak → fetch + play → ended → onend；pause/resume/cancel；402 → onerror「积分不足」
- [ ] **Step 2: 实现 `CloudTtsEngine implements TtsEngine`**（base64 → Blob → objectURL → Audio）
- [ ] **Step 3: 跑绿**
- [ ] **Step 4: Commit** `feat(tts): cloud tts engine for reader playback`

### Task 7: 阅读器音色选择与切换

**Files:**
- Modify: `src/types/reader.ts`（settings.voice，默认 'browser'）
- Modify: `src/lib/state/readerStore.ts`（setVoice + 按 voice 建引擎 + 切换时重建）
- Modify: `src/components/reader/SettingsPanel.tsx`（音色下拉 + 余额锁定态）
- Modify: `src/app/reader/page.tsx` 或 ReaderClient（init 传 voice）
- Test: `src/lib/state/__tests__/readerStore.test.ts`、`src/components/reader/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: 写失败测试**：setVoice('nova') 后 settings.voice 更新、queue 重建为 CloudTtsEngine；SettingsPanel 余额 ≤ 0 显示锁定、> 0 可切换
- [ ] **Step 2: 实现 store**：init/rebuild 时 `voice === 'browser' ? BrowserTtsEngine : CloudTtsEngine`
- [ ] **Step 3: 实现 SettingsPanel**：音色下拉（浏览器 + 4 云端音色）
- [ ] **Step 4: 跑绿 + tsc**
- [ ] **Step 5: Commit** `feat(reader): voice selection with cloud tts engine switching`

### Task 8: 部署与验证

**Files:**
- Modify: `docs/DEPLOYMENT.md`（TTS 验证清单 + OPENAI_API_KEY 环境变量）

- [ ] **Step 1: 全量 `npm test` + tsc**
- [ ] **Step 2: push → Vercel 自动部署**
- [ ] **Step 3: 用户提供 `OPENAI_API_KEY` 后写入 Vercel + 本地，E2E：** 新账号 50 积分 → 云端音色播放 → 余额按字数减少 → 同句重放不扣 → 消费记录出现流水 → 余额耗尽 402 回退浏览器语音
- [ ] **Step 4: 更新 DEPLOYMENT.md 并提交**
