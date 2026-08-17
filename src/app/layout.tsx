import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { I18nProvider } from '@/lib/i18n'
import { getServerLang } from '@/lib/i18n/server'
import { dictionaries, type Lang } from '@/lib/i18n/core'
import './globals.css'
import './moting.css'

export async function generateMetadata(): Promise<Metadata> {
  const lang: Lang = await getServerLang()
  const dict = dictionaries[lang]
  return {
    title: dict['brand.metaTitle'],
    description: dict['brand.metaDesc'],
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getServerLang()
  return (
    <html lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <body className="flex h-dvh flex-col">
        <SessionProvider>
          <I18nProvider>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
