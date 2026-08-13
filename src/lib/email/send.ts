import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY ?? '')
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

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: '验证你的邮箱 — 听 Markdown',
    html: baseHtml(
      '验证你的邮箱',
      `<p>点击下面的链接完成邮箱验证（24 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>如果不是你本人操作，请忽略此邮件。</p>`,
    ),
  })
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: '重置密码 — 听 Markdown',
    html: baseHtml(
      '重置你的密码',
      `<p>点击下面的链接设置新密码（24 小时内有效）：</p><p><a href="${link}">${link}</a></p><p>如果不是你本人操作，请忽略此邮件。</p>`,
    ),
  })
}
