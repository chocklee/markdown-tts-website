import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import './globals.css'
import './moting.css'

export const metadata: Metadata = {
  title: '墨听 — 把 Markdown 变成声音',
  description: '粘贴或上传 Markdown 文件，边看边听 AI 朗读',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex h-dvh flex-col">
        <SessionProvider>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SessionProvider>
      </body>
    </html>
  )
}
