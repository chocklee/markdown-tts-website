const BOUNDARY_RE = /(?<=[。！？!?…」』”’.])\s*/

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(BOUNDARY_RE)
    .map((part) => part.trim())
    .filter(Boolean)
}
