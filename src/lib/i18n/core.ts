import { zh } from './zh'
import { en } from './en'

export type Lang = 'zh' | 'en'
export type Dict = typeof zh

export const STORAGE_KEY = 'mtts_lang'
export const COOKIE_KEY = 'mtts_lang'

export const dictionaries: Record<Lang, Dict> = { zh, en }

export type Vars = Record<string, string | number>

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v))
  }
  return out
}

export function translate(dict: Dict, key: string, vars?: Vars): string {
  const template = dict[key as keyof typeof dict] ?? zh[key as keyof typeof zh] ?? key
  return interpolate(template, vars)
}
