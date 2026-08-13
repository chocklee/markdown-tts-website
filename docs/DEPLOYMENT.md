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

本地开发时把同样的变量填到 `.env.local`（已被 `.gitignore` 忽略，不会提交）。

## 二、数据库迁移

- 迁移脚本：`npm run db:migrate`（读取 `.env.local` 的 `DATABASE_URL`）。
- Vercel 构建**不会**自动跑迁移，需要在本地或任意有连接串的环境手动执行。
- 已应用的迁移：`001_auth.sql`、`002_auth_adapter_fix.sql`、`004_auth_hardening.sql`、`005_documents.sql`。
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

## 六、已知事项

- **国内访问**：`*.vercel.app` 域名在中国大陆网络经常无法连接（部署本身正常）。需要国内稳定访问时，绑定自定义域名或换国内托管。
- **Next.js 版本**：Vercel 会阻止部署存在已知漏洞的 Next.js 版本。本项目最低要求 15.5.23（CVE-2025-66478 修复版），升级用 `npm install next@15.5.23 eslint-config-next@15.5.23`。
- **依赖审计**：部署前建议跑 `npm audit`（当前为 0 漏洞）。
