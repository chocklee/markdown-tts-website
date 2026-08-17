# 部署清单（Vercel）

项目通过 GitHub 集成部署到 Vercel：push 到 `master` 会自动触发部署。
构建与部署失败时，日志最后一行会给出原因（如 `Vulnerable version of Next.js detected` 表示 Next.js 版本存在已知漏洞，需升级）。

## 一、环境变量（Vercel 项目 → Settings → Environment Variables）

| 变量 | 必填 | 获取方式 |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon 控制台的连接串（Pooled 连接，`postgresql://...?sslmode=require`） |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` 生成 |
| `APP_URL` | ✅ | 线上域名，如 `https://你的域名` |
| `CRON_SECRET` | ✅ | `openssl rand -base64 32` 生成；回收站每日清理接口鉴权用 |
| `RESEND_API_KEY` | ✅ | [resend.com](https://resend.com) → API Keys，格式 `re_...` |
| `EMAIL_FROM` | 上线前 | 如 `听 Markdown <noreply@你的域名>`；不配则用 Resend 测试发件人，邮件只投递到 Resend 注册邮箱 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 可选 | Google Cloud Console 创建 OAuth Client，配置后才显示 Google 登录按钮 |
| `STRIPE_SECRET_KEY` | 支付上线前 | Stripe 密钥；测试用 `sk_test_...`，上线切 `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | 支付上线前 | Stripe Webhook 签名密钥 `whsec_...`；本地联调用 `stripe listen --forward-to localhost:3000/api/webhooks/stripe` |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_LIGHT` / `STRIPE_PRICE_UNLIMITED` | 包月订阅 | 三个包月套餐的 Stripe Price ID；用 `npm run stripe:plans`（`tsx --env-file-if-exists=.env.local scripts/setup-stripe-plans.ts`）自动创建并打印 |
| `OPENAI_API_KEY` | 云语音 | [platform.openai.com](https://platform.openai.com) → API Keys；不配置则阅读器只有浏览器语音，云端音色合成返回错误 |
| `TTS_PROVIDER` | 可选 | 云端语音供应商，默认 `openai`；切换豆包时填 `doubao` |
| `DOUBAO_API_KEY` | 豆包语音 | 火山引擎语音技术控制台 → API Key 管理 创建（`X-Api-Key`，非方舟 `ark-` 密钥）；配合 `TTS_PROVIDER=doubao` 使用 |

本地开发时把同样的变量填到 `.env.local`（已被 `.gitignore` 忽略，不会提交）。

## 二、数据库迁移

- 迁移脚本：`npm run db:migrate`（读取 `.env.local` 的 `DATABASE_URL`）。
- Vercel 构建**不会**自动跑迁移，需要在本地或任意有连接串的环境手动执行。
- 已应用的迁移：`001_auth.sql`、`002_auth_adapter_fix.sql`、`004_auth_hardening.sql`、`005_documents.sql`、`006_credits.sql`、`007_tts_cache.sql`、`008_tts_cache_rate.sql`、`009_subscriptions.sql`。
- 新迁移文件放在 `db/migrations/`，命名保持递增序号。

## 三、Resend 域名验证（正式发信前）

1. Resend 控制台 → **Domains → Add Domain**，输入你的域名。
2. 在域名服务商控制台添加提示的 DNS 记录（SPF、DKIM 等）。
3. 等待验证通过后，把 Vercel 的 `EMAIL_FROM` 改为 `听 Markdown <noreply@你的域名>`。

测试阶段（不配域名）：邮件从 `onboarding@resend.dev` 发出，**只会投递到你注册 Resend 时的邮箱**。

## 四、回收站清理（cron）

- `vercel.json` 已配置每日 03:00 UTC 调用 `/api/cron/cleanup-trash`。
- Vercel 会以 `Authorization: Bearer <CRON_SECRET>` 调用，因此 `CRON_SECRET` 必须与上表一致。
- 除 cron 外，文件列表接口也有惰性清理：过期回收站文档在拉取时自动清除。

## 五、上线后验证清单

1. `https://你的域名/` 打开首页，粘贴 Markdown → 开始收听。
2. 注册一个新邮箱 → 收到验证邮件 → 点击链接 → 登录成功并跳转到 `/library`。
3. `/library` 显示本机文档 + 登录后自动同步到云端（配额显示 `已用 X / 50.0 MB`）。
4. 换一台设备登录同一账号 → 文档自动下载。
5. 删除 → 进回收站（两端）→ 恢复 → 彻底删除（两端消失）。
6. 回收站过期清理可手动验证：把数据库里某行 `delete_expires_at` 改成过去时间，刷新 `/library` 后该行被清除。

## 五·B、M2b 积分与支付验证清单

1. 注册新账号 → `/api/credits/balance` 返回 `creditsBalance: 50`（注册赠送）
2. Google 首次登录新邮箱 → 同样获得 50 积分（`events.createUser` 钩子）
3. 首页/我的页展示三档包月套餐（$1.99 / $3.99 / $9.99 每月）
4. Stripe 测试模式订阅（4242 4242 4242 4242 测试卡）→ 回到首页 `?success=1`，余额变为套餐额度、`/credits` 出现「订阅…本月积分」流水、配额变为 1G、显示下次续费日期
5. Stripe Webhook 需开启事件：`checkout.session.completed`、`invoice.paid`、`customer.subscription.deleted`
6. 到期清零验证：手动触发 `customer.subscription.deleted` 后，余额为 0、配额回到 100MB，流水出现「订阅到期，积分清零」
5. Webhook 重复投递（`stripe trigger checkout.session.completed` 或重放事件）→ 不重复入账（幂等）
6. 未购买账号打开阅读器设置 → 逐句模式显示锁定态；购买后显示开关与暂停时长（1–10 秒）
7. 逐句模式开启后播放：每句播完暂停 N 秒自动继续；手动暂停时停止自动继续
8. 本地联调 Webhook：`stripe listen --forward-to localhost:3000/api/webhooks/stripe`

## 五·C、M2c 云端 AI 语音验证清单

1. 注册新账号 → `/api/credits/balance` 返回 `creditsBalance: 50`
2. 阅读器设置 → 音色下拉显示「浏览器语音」+ 4 个云端音色（Alloy / Nova / Shimmer / Echo）
3. 选择云端音色播放 → 逐句请求 `/api/tts/synthesize`，余额按字数减少（100 字 = 3 积分）
4. 同一句重放 → 命中缓存不扣积分（返回 `creditsCharged: 0`）
5. `/credits` 消费流水出现 tts 合成记录
6. 余额耗尽后播放 → 提示「积分不足，请购买积分」并停止；切回浏览器语音可继续
7. 未配置 `OPENAI_API_KEY` 时：`/api/tts/voices` 仍返回音色列表，但合成返回 500，不影响浏览器语音
8. 音色切换在播放中生效：切换后从当前句重新开始（停止旧引擎、重建队列）

## 六、已知事项

- **国内访问**：`*.vercel.app` 域名在中国大陆网络经常无法连接（部署本身正常）。需要国内稳定访问时，绑定自定义域名或换国内托管。
- **Next.js 版本**：Vercel 会阻止部署存在已知漏洞的 Next.js 版本。本项目最低要求 15.5.23（CVE-2025-66478 修复版），升级用 `npm install next@15.5.23 eslint-config-next@15.5.23`。
- **依赖审计**：部署前建议跑 `npm audit`（当前为 0 漏洞）。
- **Stripe 上线**：测试密钥 `sk_test_...` 换 `sk_live_...`；Webhook 端点需在 Stripe 后台配置为 `https://你的域名/api/webhooks/stripe`，事件选 `checkout.session.completed`。
