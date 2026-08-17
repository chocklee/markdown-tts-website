export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <p className="word">墨听</p>
          <span className="cap">把 Markdown 变成声音</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle ? <p className="auth-sub">{subtitle}</p> : null}
        {children}
      </div>
    </main>
  )
}
