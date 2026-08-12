import type { Chapter, ReaderBlock } from '@/types/reader'

export function buildChapters(blocks: ReaderBlock[]): Chapter[] {
  const headingBlocks = blocks.filter((b) => b.type === 'heading' && b.depth <= 3)
  if (headingBlocks.length === 0) return []

  const chapters: Chapter[] = []
  let current: Chapter | null = null

  for (const block of blocks) {
    if (block.type === 'heading' && block.depth <= 3) {
      current = {
        id: `ch-${block.id}`,
        title: block.text,
        headingBlockId: block.id,
        sentenceIds: [...block.sentenceIds],
      }
      chapters.push(current)
    } else if (current && (block.type !== 'heading' || block.depth > 3)) {
      current.sentenceIds.push(...block.sentenceIds)
    }
  }

  const firstHeadingIndex = blocks.findIndex((b) => b === headingBlocks[0])
  const prefix = blocks.slice(0, firstHeadingIndex).flatMap((b) => b.sentenceIds)
  if (prefix.length > 0 && chapters[0]) {
    chapters[0].sentenceIds.push(...prefix)
  }

  return chapters
}
