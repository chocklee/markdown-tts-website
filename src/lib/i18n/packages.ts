import type { Dict } from './core'

const PKG_KEYS: Record<string, keyof Dict> = {
  starter: 'pkg.starter',
  light: 'pkg.light',
  unlimited: 'pkg.unlimited',
  体验包: 'pkg.starter',
  轻量包: 'pkg.light',
  畅听包: 'pkg.unlimited',
}

export function pkgKey(idOrName: string): keyof Dict | null {
  return PKG_KEYS[idOrName] ?? null
}

export function pkgName(
  t: (key: string, vars?: Record<string, string | number>) => string,
  idOrName: string,
): string {
  const key = pkgKey(idOrName)
  return key ? t(key) : idOrName
}
