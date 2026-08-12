const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);/i

export function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim()
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('#') ||
    DATA_IMAGE_RE.test(trimmed)
  ) {
    return trimmed
  }
  return null
}
