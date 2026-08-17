'use client'
import { useI18n } from '@/lib/i18n'

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <p className="word">墨听</p>
          <span className="cap">{t('brand.tagline')}</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle ? <p className="auth-sub">{subtitle}</p> : null}
        {children}
      </div>
    </main>
  )
}
