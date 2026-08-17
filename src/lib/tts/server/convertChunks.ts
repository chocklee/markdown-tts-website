import { parseDocument } from '@/lib/markdown/parse'

export interface ChunkOptions {
  skipCode: boolean
  skipTable: boolean
  maxChars: number
}

export function splitIntoChunks(content: string, opts: ChunkOptions): string[] {
  const doc = parseDocument(content)
  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current) {
      chunks.push(current)
      current = ''
    }
  }
  for (const block of doc.blocks) {
    if (block.type === 'code' && opts.skipCode) continue
    if (block.type === 'table' && opts.skipTable) continue
    const text = (block.text ?? '').trim()
    if (!text) continue
    const len = Array.from(text).length
    if (len > opts.maxChars) {
      flush()
      const chars = Array.from(text)
      for (let i = 0; i < chars.length; i += opts.maxChars) {
        chunks.push(chars.slice(i, i + opts.maxChars).join(''))
      }
    } else if (Array.from(current).length + len > opts.maxChars) {
      flush()
      current = text
    } else {
      current = current ? `${current}\n${text}` : text
    }
  }
  flush()
  return chunks
}
