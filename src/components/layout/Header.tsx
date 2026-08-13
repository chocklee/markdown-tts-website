'use client'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

export function Header() {
  const { data: session, status } = useSession()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold text-slate-800">
          听 Markdown
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {status === 'authenticated' ? (
            <>
              <span className="hidden text-slate-500 sm:inline">{session.user?.email}</span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-slate-600 hover:text-slate-900"
              >
                退出
              </button>
            </>
          ) : (
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              登录 / 注册
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
