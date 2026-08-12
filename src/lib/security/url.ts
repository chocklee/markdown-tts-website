export function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim()
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed
  }
  return null
}
