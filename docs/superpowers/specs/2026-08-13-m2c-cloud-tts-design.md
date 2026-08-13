# M2c 云端 AI 语音 — 设计文档

> 日期：2026-08-13
> 状态：待确认
> 范围：M2 子项目 ③ —— 云端 TTS 代理（供应商可插拔）、按字扣积分、音频缓存、客户端播放接入

## 1. 背景与目标

M2b 已完成积分与支付：注册送 50 积分、余额/流水、Stripe 购买、配额 1G、逐句模式。M2c 把朗读从「浏览器本地语音」升级为「云端 AI 音色」：选择云端音色 → 服务端合成音频 → 按朗读字数扣积分 → 播放。供应商做成可插拔，便于后续切换/多供应商。

目标：

- 登录且余额 > 0 的用户可在阅读器选择云端音色（赠送的 50 积分可体验约 1,600 字）
- 按朗读字数扣积分，缓存命中不扣（没有实际成本）
- 供应商可插拔：首个实现 OpenAI `gpt-4o-mini-tts`，接口抽象后可按需加 Azure / ElevenLabs 等
- 播放体验与浏览器语音一致（逐句、暂停、上/下一句、逐句模式都可用）

## 2. 范围

### 2.1 本轮做

- 服务端 TTS 代理：`POST /api/tts/synthesize`（登录 + 余额校验 + 限流）
- 供应商抽象：`TtsProvider` 接口 + OpenAI 实现（`gpt-4o-mini-tts`，支持语速）
- 按字扣积分：事务内扣减、余额不足拒绝、写消费流水（记录供应商/字数/API 成本）
- 音频缓存：`tts_cache` 表（provider + voice + 文本哈希唯一），命中不扣积分，30 天惰性清理
- 客户端 `CloudTtsEngine`：逐句拉取音频播放，实现与浏览器引擎相同的 `TtsEngine` 接口
- 阅读器设置：音色选择（浏览器默认 + 云端音色），余额 ≤ 0 显示锁定态
- 音色列表接口 + 配置中心扩展

### 2.2 本轮不做（YAGNI）

- 讲解 / 多语言 / 文档问答（M3）
- 长文本一次合成与流式（逐句请求已满足需求）
- 多供应商并行与自动降级（先 OpenAI，接口留好）
- 音色试听、按音色差异化定价
- 缓存容量告警与精细化清理（惰性 + 30 天即可）

## 3. 技术方案

### 3.1 供应商抽象（可插拔）

```ts
export interface TtsProvider {
  readonly id: string
  synthesize(input: { text: string; voice: string; rate: number }): Promise<{
    audio: Buffer
    contentType: string
    costUsd: number
  }>
}
```

- 配置 `TTS_PROVIDER=openai`（环境变量），`src/lib/tts/server/providers.ts` 维护注册表
- OpenAI 实现：`gpt-4o-mini-tts`，`voice` 传入音色 id，`speed` 映射语速（0.25–4.0，阅读器语速 0.5–2）
- API 密钥：`OPENAI_API_KEY`（Vercel 环境变量，敏感）
- 成本：每次合成按字符数估算成本写入流水 `meta`（`costUsd = chars × 单价`），用于 M2c 上线后校准定价

### 3.2 按字扣积分

- 字符数 = 去除空白后的 Unicode 码点数（中文按字计）
- 成本 = `ceil(chars × creditsPer100Chars / 100)`（初始 `creditsPer100Chars = 3`，即 100 字 = 3 积分，与 M2b 配置一致）
- 扣费事务：`UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2 AND credits_balance >= $1`，rowCount = 0 → 402 余额不足；同时 INSERT 消费流水（`kind=consumption`，`ref=text_hash`，`meta={provider, voice, chars, costUsd}`）
- 缓存命中 → `creditsCharged = 0`，不写流水
- 单句文本上限 2,000 字符（阅读器按句切分，正常句子远小于此）

### 3.3 音频缓存

```sql
CREATE TABLE IF NOT EXISTS tts_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  voice text NOT NULL,
  text_hash text NOT NULL,      -- sha256(provider|voice|text)
  audio bytea NOT NULL,
  content_type text NOT NULL,
  chars integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tts_cache ON tts_cache (provider, voice, text_hash);
```

- 读取：`SELECT audio ... WHERE provider=$1 AND voice=$2 AND text_hash=$3` → 命中直接返回（不扣积分）
- 写入：每次新合成后 upsert（同一句重复请求只留一份）
- 清理：写入时顺带 `DELETE WHERE created_at < now() - interval '30 days'`（惰性，无需 cron）
- 存储位置：Neon Postgres `bytea`（单句音频通常几 KB–几十 KB，量级可接受）

### 3.4 API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/tts/synthesize` | 登录 + 余额>0 | body `{ text, voice, rate }` → 音频（blob）+ `{ chars, creditsCharged }` |
| GET | `/api/tts/voices` | 公开 | 云端音色列表（id + 名称） |

`/api/tts/synthesize` 流程：
1. 鉴权 + 限流（复用 `isRateLimited`）
2. 校验文本长度、音色合法
3. 查缓存 → 命中返回（`creditsCharged: 0`）
4. 事务：扣积分（不足 402）→ 写流水
5. 调供应商合成 → upsert 缓存 → 返回音频

失败处理：供应商超时/报错 → 500（积分已扣则写 `adjustment` 流水退还，保证不亏用户）

### 3.5 客户端播放

- 新增 `CloudTtsEngine implements TtsEngine`：`speak(text, {rate, volume, onend, onerror})` → POST 合成 → `Audio` 播放 → `ended` → `onend`；`pause/resume/cancel` 映射到 Audio
- 阅读器 `settings.voice`：`'browser'` 或云端音色 id（默认 `'browser'`）
- `readerStore.init` 按 `settings.voice` 选择引擎；切换音色时重建队列（复用 `rebuildSpeakable` 逻辑，需支持换引擎）
- 设置面板：音色下拉（浏览器语音 + 云端音色）；余额 ≤ 0 时云端音色显示锁定态（🔒 + 购买链接），与逐句模式一致
- 云端播放中余额耗尽：下一句请求 402 → 提示「积分不足」，回退浏览器语音或停止

### 3.6 配置中心扩展（`src/lib/config.ts`）

```ts
tts: {
  provider: 'openai',            // TTS_PROVIDER 环境变量覆盖
  creditsPer100Chars: 3,         // 初始值，上线后按真实成本校准
  maxTextChars: 2000,
  cacheTtlDays: 30,
  voices: [
    { id: 'alloy', name: 'Alloy（中性）' },
    { id: 'nova', name: 'Nova（温暖）' },
    { id: 'shimmer', name: 'Shimmer（明亮）' },
    { id: 'echo', name: 'Echo（沉稳）' },
  ],
}
```

## 4. 验收标准

1. 注册新账号（50 积分）→ 阅读器可选云端音色 → 播放正常，余额按字数减少
2. 同一句重复播放 → 第二次不扣积分（缓存命中）
3. 余额不足 → 返回 402，前端提示并回退浏览器语音
4. 未登录 → 云端音色锁定
5. 语速调节对云端音色生效（映射到供应商 speed）
6. 暂停/恢复/上一句/下一句/逐句模式在云端音色下行为正常
7. 供应商合成失败 → 退款流水出现，用户不亏
8. 消费记录页显示「云端朗读」流水（含字数）

## 5. 开放问题

- **OpenAI API Key**：需要你提供 `OPENAI_API_KEY`（或确认用你已有的账号），否则无法联调
- **缓存 30 天惰性清理存 Postgres**：同意这个方案吗？
- **音色范围**：先用 OpenAI `gpt-4o-mini-tts` 的 4 个音色，后续可加
