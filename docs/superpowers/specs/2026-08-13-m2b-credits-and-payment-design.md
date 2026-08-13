# M2b 积分与支付 — 设计文档

> 日期：2026-08-13
> 状态：已确认
> 范围：M2 子项目 ② —— 积分账户、套餐购买（Stripe）、消费记录、存储配额升级、逐句模式 Pro 解锁

## 1. 背景与目标

M2a（账号 + 文件库）已完成：注册/登录（邮箱 + Google）、文档库与同步、回收站、存储配额。M2b 在其之上建立付费体系，为 M2c 云端 AI 语音（按字扣积分）和 M3 Pro AI 功能（讲解、翻译、问答）打好计费基础。

目标：

- 用户可购买积分（国际用户，美元标价），余额实时可见
- 云端语音按用量扣积分，消费记录可查（M2c 接入扣费）
- 购买过积分 → 存储配额升级到 1G
- 逐句模式对购买过任意套餐的用户解锁（Pro 功能，不额外扣积分）
- 所有计费参数（模型单价、售价系数、套餐、赠送）集中可调，方便 M2c 上线后用真实消耗校准

## 2. 范围

### 2.1 本轮做

- 积分账户：余额、流水（充值 / 赠送 / 消费 / 退款）、消费记录页
- 套餐购买：Stripe Checkout（$1.99 / $3.99 / $9.99 三档），支付成功回调自动到账
- 配额升级：购买过积分 → `storage_quota_bytes` 升级为 1G（永久）
- 逐句模式 Pro 解锁：购买过任意套餐即可用（属 Pro 功能但不额外扣积分）；每句播完后自动暂停 N 秒（N 用户可设），暂停结束自动继续播放
- 配置中心扩展：套餐、积分单价、赠送额度、配额数值
- 免费/付费配额更新：免费 100MB（原设计 50MB，按用户确认上调）

### 2.2 本轮不做（YAGNI）

- 云语音 TTS 代理与按字扣积分执行（M2c）
- 讲解 / 多语言 / 文档问答（M3）
- 国内支付（支付宝 / 微信，M5，需企业资质）
- 积分过期、退款自助流程、发票、订阅制
- 积分余额变动实时推送（页面轮询即可）

## 3. 核心概念

- **积分**：统一虚拟货币，人民币区与美元区共用同一积分池；只在服务端记账，客户端展示
- **Pro 功能**：需登录 + 已购买过任意套餐（`purchased` 标记）。云语音 / 讲解 / 多语言 / 问答按规则扣积分；逐句模式不扣积分（播放行为增强），但同样要求已购买过
- **逐句模式**：每句播完自动暂停，暂停时长由用户在设置里选择（默认 2 秒，可调范围 1–10 秒），计时结束自动继续下一句；用户手动暂停时优先遵守手动状态
- **云语音试用**：余额 > 0 即可选云端音色（注册赠送的 50 积分可用于体验，约 1,600 字）
- **存储配额**：免费 100MB；**购买过任意套餐即永久升级 1G**（与积分余额是否花完无关）
- **消费记录**：服务端 `credit_transactions` 流水，页面只读展示，支持分页

## 4. 数据模型

### 4.1 `users` 表（修改）

```sql
ALTER TABLE users ADD COLUMN credits_balance bigint NOT NULL DEFAULT 0;
-- 免费配额默认值由 52428800 改为 104857600（已有用户由迁移 UPDATE 一次）
```

余额是冗余字段，与流水表在事务内保持一致（读余额零成本，避免每次 SUM）。

### 4.2 `credit_transactions` 表（新建）

```sql
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,              -- 正数入账、负数扣费；单位：积分
  kind text NOT NULL,                  -- purchase | bonus | consumption | refund | adjustment
  ref text,                            -- 关联单号：Stripe session / 订单号 / M2c 消费流水号
  description text NOT NULL,           -- 展示文案：如「购买体验包」「云端朗读 -3」
  meta jsonb,                          -- 结构化明细：套餐、供应商、模型、字数、API 成本等
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC);
```

余额与流水的一致性：`UPDATE users SET credits_balance = credits_balance + $1 WHERE id = $2` 与流水 INSERT 在同一数据库事务内；消费扣费在事务内检查余额 >= 0，不足则回滚（`CHECK (credits_balance >= 0)` 兜底）。

### 4.3 `credit_packages` 配置（配置中心，非数据库）

| 套餐 | 美元 | 积分 | 说明 |
|---|---|---|---|
| 体验包 | $1.99 | 200 | 拉新尝鲜（Stripe 手续费占比高，接受） |
| 轻量包 | $3.99 | 800 | 8 万字左右 |
| 畅听包 | $9.99 | 2,200 | 含 10% 赠送 |

## 5. 积分与计费规则（M2b 落库的配置，供 M2c 使用）

> 用户已确认：积分与字数的对应关系需要按实际模型 token 消耗校准（M2c 上线后校准）；以下为初始值。

| 功能 | 计费规则 | 备注 |
|---|---|---|
| 云语音朗读 | 100 字 = 3 积分 | M2c 执行扣费 |
| 讲解模式 | 改写后 100 字 = 4 积分 | M3 |
| 多语言收听 | 翻译后 100 字 = 4 积分 | M3 |
| 文档问答 | 20–30 积分/次，按文档长度分级 | M3 |
| 音频缓存命中 | 不扣积分 | 没有实际成本 |

- 注册赠送：50 积分（已确认，作为云语音体验钩子；未购买前仍只能用浏览器语音，直到用完赠送积分）
- 积分有效期：永不过期（已确认）
- 汇率：美元直接标定，不做实时换算；大幅波动时手动调价

## 6. 支付流程（Stripe Checkout）

1. 登录用户在「积分购买页」选择套餐 → 前端请求 `POST /api/credits/checkout`（body: `packageId`）
2. 服务端校验登录 + 套餐存在 → 创建 Stripe Checkout Session（`mode=payment`，`success_url` / `cancel_url` 带 session_id），返回 `url`，前端跳转
3. Stripe 支付成功 → Webhook `checkout.session.completed`（`/api/webhooks/stripe`，验签 `STRIPE_WEBHOOK_SECRET`）
4. Webhook 处理（幂等）：`session.metadata.userId + session.id` 唯一 → 事务内 ① 查订单是否已入账（幂等键）② 插入 `credit_transactions`（kind=purchase）③ 加余额 ④ 升级 `storage_quota_bytes` 到 1G（若低于）
5. 前端回到 `success_url` 后调用 `GET /api/credits/balance` 刷新余额

安全要点：

- Webhook 必须验签；`STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 走 Vercel 环境变量（敏感）
- 到账以 Webhook 为准，不信任前端回调
- 幂等：`ref = checkout_session_id`，`credit_transactions` 加 `UNIQUE (user_id, ref)`（kind=purchase 时）
- 创建 session 前校验用户是否已购买过（不限制重复购买）
- 测试模式 `STRIPE_SECRET_KEY` 用 `sk_test_...`，上线切换 `sk_live_...`

## 7. API 设计

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/credits/balance` | 登录 | 返回 `{ creditsBalance, quotaBytes, purchased }` |
| GET | `/api/credits/transactions?cursor=&limit=` | 登录 | 消费记录，分页（游标 = created_at + id） |
| POST | `/api/credits/checkout` | 登录 | body `{ packageId }` → `{ url }` 跳 Stripe |
| POST | `/api/webhooks/stripe` | 验签 | 支付成功入账 |
| GET | `/api/credits/packages` | 公开 | 套餐列表（首页/购买页展示） |

余额变更只发生在 Webhook 与服务端消费（M2c），客户端 API 全部只读/下单。

## 8. 前端页面

- **积分购买页 `/pricing`**：三档套餐卡片（价格 + 积分 + 可朗读字数）、Stripe 支付按钮、当前余额展示、配额说明（购买后 1G）
- **个人中心 / 消费记录**：挂在文件库页（`/library`）或独立 `/credits` 页面：余额、购买入口、流水列表（时间 / 说明 / 增减）
- **首页**：功能亮点区加入口；播放条显示余额（M1 底部播放条已规划「积分余额」展示位）
- **登录页/注册页**：不新增；未登录用户看得到 Pro 功能标识，点击时引导登录

## 9. 配置中心（`src/lib/config.ts` 扩展）

```ts
credits: {
  bonusOnRegister: 50,           // 已确认
  packages: [{ id: 'starter', usd: 1.99, credits: 200 }, ...],
  tts: { creditsPer100Chars: 3 },  // 初始值，M2c 校准
  explain: { creditsPer100Chars: 4 },
  translate: { creditsPer100Chars: 4 },
  qa: { shortDoc: 20, longDoc: 30 },
},
quota: { freeBytes: 100MB, paidBytes: 1GB },  // 已确认上调
```

所有页面展示价格从配置读取，避免硬编码。

## 10. 防亏损机制

- 每笔消费在 `meta` 记录真实 API 成本（供应商 + 模型 + 用量 + 金额），M2c 消费时写入
- M2c 上线后跑真实消费日志校准一次定价（原设计 5.4）
- 消费扣费事务内校验余额，余额不足拒绝（HTTP 402 或 409）

## 11. 验收标准

1. 注册新账号 → 余额按配置显示（赠送额度待定）
2. 购买页三档套餐展示正确，价格与配置一致
3. Stripe 测试卡支付 → Webhook 入账 → 余额增加、流水出现「购买体验包」、配额变为 1G
4. 未登录访问购买页 → 引导登录；未登录不能下单
5. 消费记录页分页正确，只显示本人流水
6. 逐句模式：购买过任意套餐的用户可用，未购买/未登录用户不可用（播放器接入）
7. 免费配额显示 100MB（已有用户迁移后生效）
8. Webhook 重复投递不重复入账（幂等测试）

## 12. 已确认决策（2026-08-13）

- 注册赠送 **50 积分**（云语音体验钩子）
- 积分**永不过期**
- 购买任意套餐后配额升级 **1G 永久有效**（余额花完不降）
- 逐句模式解锁条件：**购买过任意套餐**（未购买用户看到锁定态并引导到购买页）
- 逐句模式暂停时长：**用户可设**（默认 2 秒，1–10 秒），暂停后自动继续播放
