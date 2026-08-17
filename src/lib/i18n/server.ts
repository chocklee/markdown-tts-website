import { cookies } from 'next/headers'
import { dictionaries, translate, COOKIE_KEY, type Lang } from './core'

export async function getServerLang(): Promise<Lang> {
  try {
    const store = await cookies()
    const raw = store.get(COOKIE_KEY)?.value
    return raw === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export async function serverT(key: string, vars?: Record<string, string | number>): Promise<string> {
  return translate(dictionaries[await getServerLang()], key, vars)
}
