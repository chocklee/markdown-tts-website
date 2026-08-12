import type { ReaderDocument, ReaderSettings } from '@/types/reader'

export function getSpeakableIds(doc: ReaderDocument, settings: ReaderSettings): string[] {
  const blockTypeById = new Map<string, string>()
  for (const block of doc.blocks) {
    for (const sentenceId of block.sentenceIds) {
      blockTypeById.set(sentenceId, block.type)
    }
  }
  return doc.sentenceIds.filter((sentenceId) => {
    const type = blockTypeById.get(sentenceId)
    if (type === 'code' && settings.skipCode) return false
    if (type === 'table' && settings.skipTable) return false
    return true
  })
}

export function getSentenceText(doc: ReaderDocument, sentenceId: string): string {
  const block = doc.blocks.find((b) => b.sentenceIds.includes(sentenceId))
  if (!block) return ''
  const index = block.sentenceIds.indexOf(sentenceId)
  return block.sentenceTexts[index] ?? ''
}
