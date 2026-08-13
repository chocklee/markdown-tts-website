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
