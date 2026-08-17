'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { STORAGE_KEY, COOKIE_KEY, dictionaries, translate, type Lang } from './core'

interface I18nState {
  lang: Lang
  t: (key: string, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void
  toggle: () => void
}

const I18nContext = createContext<I18nState>({
  lang: 'zh',
  t: (key) => key,
  setLang: () => {},
  toggle: () => {},
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'en' || stored === 'zh') setLangState(stored)
    } catch {
      // 存储不可用时保持默认
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // 忽略
    }
    document.cookie = `${COOKIE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(dictionaries[lang], key, vars), [lang])
  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggle = useCallback(() => setLangState((prev) => (prev === 'zh' ? 'en' : 'zh')), [])

  return <I18nContext.Provider value={{ lang, t, setLang, toggle }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nState {
  return useContext(I18nContext)
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, toggle } = useI18n()
  return (
    <button
      type="button"
      className={`lang-switch ${className}`}
      onClick={toggle}
      aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      {lang === 'zh' ? 'EN' : '中'}
    </button>
  )
}

export function LangSeg({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={`lang-seg ${className}`} role="group" aria-label="Language switch">
      <button
        type="button"
        className={lang === 'zh' ? 'active' : ''}
        onClick={() => setLang('zh')}
        aria-pressed={lang === 'zh'}
      >
        中
      </button>
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
    </div>
  )
}
