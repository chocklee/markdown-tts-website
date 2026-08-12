import { remark } from 'remark'
import gfm from 'remark-gfm'
import type { RootContent } from 'mdast'
import { splitSentences } from './sentenceize'
import { flattenInline, groupLeavesIntoSentences, plainText } from './inline'
import { buildChapters } from './chapters'
import type { ReaderBlock, ReaderDocument } from '@/types/reader'

export function hashContent(content: string): string {
  let hash = 5381
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) >>> 0
  }
  return `doc-${hash.toString(36)}`
}

export function parseDocument(markdown: string, fallbackTitle = '未命名文档'): ReaderDocument {
  const tree = remark().use(gfm).parse(markdown)
  let counter = 0
  const nextId = () => `s${++counter}`

  const blocks: ReaderBlock[] = tree.children.map((node, i) => toBlock(node, i, nextId))
  const sentenceIds = blocks.flatMap((b) => b.sentenceIds)

  return {
    id: hashContent(markdown),
    title: extractTitle(tree.children, fallbackTitle),
    blocks,
    sentenceIds,
    chapters: buildChapters(blocks),
  }
}

function sentencesWithIds(text: string, nextId: () => string): string[] {
  return splitSentences(text).map(() => nextId())
}

function toBlock(node: RootContent, index: number, nextId: () => string): ReaderBlock {
  const id = `b${index}`

  switch (node.type) {
    case 'heading': {
      const text = plainText(node)
      const sentences = groupLeavesIntoSentences(flattenInline(node), nextId)
      const sentenceIds = sentences.map((s) => s.id)
      const sentenceTexts = sentences.map((s) => s.parts.map((p) => p.text).join(''))
      return { id, type: 'heading', depth: node.depth, text, sentenceIds, sentenceTexts, node }
    }
    case 'paragraph': {
      const text = plainText(node)
      const sentences = groupLeavesIntoSentences(flattenInline(node), nextId)
      const sentenceIds = sentences.map((s) => s.id)
      const sentenceTexts = sentences.map((s) => s.parts.map((p) => p.text).join(''))
      return { id, type: 'paragraph', depth: 0, text, sentenceIds, sentenceTexts, node }
    }
    case 'list': {
      const text = node.children.map((item) => plainText(item)).join(' ')
      const sentences = node.children.flatMap((item) => groupLeavesIntoSentences(flattenInline(item), nextId))
      const sentenceIds = sentences.map((s) => s.id)
      const sentenceTexts = sentences.map((s) => s.parts.map((p) => p.text).join(''))
      return { id, type: 'list', depth: 0, text, sentenceIds, sentenceTexts, node }
    }
    case 'blockquote': {
      const text = node.children.map((c) => plainText(c)).join(' ')
      const sentences = groupLeavesIntoSentences(flattenInline(node), nextId)
      const sentenceIds = sentences.map((s) => s.id)
      const sentenceTexts = sentences.map((s) => s.parts.map((p) => p.text).join(''))
      return { id, type: 'blockquote', depth: 0, text, sentenceIds, sentenceTexts, node }
    }
    case 'code': {
      const text = node.value
      return { id, type: 'code', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), sentenceTexts: splitSentences(text), node }
    }
    case 'table': {
      const text = node.children
        .map((row) => row.children.map((cell) => plainText(cell)).join('，'))
        .join('。')
      return { id, type: 'table', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), sentenceTexts: splitSentences(text), node }
    }
    case 'thematicBreak':
      return { id, type: 'thematicBreak', depth: 0, text: '', sentenceIds: [], sentenceTexts: [], node }
    case 'html':
      return { id, type: 'html', depth: 0, text: '', sentenceIds: [], sentenceTexts: [], node }
    default: {
      const text = plainText(node as RootContent)
      const sentences = groupLeavesIntoSentences(flattenInline(node), nextId)
      const sentenceIds = sentences.map((s) => s.id)
      const sentenceTexts = sentences.map((s) => s.parts.map((p) => p.text).join(''))
      return { id, type: 'paragraph', depth: 0, text, sentenceIds, sentenceTexts, node }
    }
  }
}

function extractTitle(children: RootContent[], fallback: string): string {
  const heading = children.find((n) => n.type === 'heading' && n.depth === 1) ??
    children.find((n) => n.type === 'heading')
  return heading ? plainText(heading) : fallback
}
