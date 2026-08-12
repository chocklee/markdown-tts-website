export const BOUNDARY_RE = /(?<=[。！？!?…」』”’.])\s*/
export const ONLY_PUNCT_RE = /^[。！？!?…」』”’.,，、;；:：]+$/

export function splitSentences(text: string): string[] {
  const parts: string[] = []
  for (const part of text
    .replace(/\s+/g, ' ')
    .trim()
    .split(BOUNDARY_RE)
    .map((p) => p.trim())) {
    if (!part) continue
    if (ONLY_PUNCT_RE.test(part) && parts.length > 0) {
      parts[parts.length - 1] += part
    } else {
      parts.push(part)
    }
  }
  return parts
}
