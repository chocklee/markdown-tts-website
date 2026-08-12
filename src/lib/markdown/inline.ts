import type { RootContent } from 'mdast'
import { splitSentences } from './sentenceize'

export interface StyledLeaf {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  href?: string
}

export function flattenInline(node: RootContent): StyledLeaf[] {
  switch (node.type) {
    case 'text':
      return [{ text: node.value }]
    case 'inlineCode':
      return [{ text: node.value, code: true }]
    case 'emphasis':
      return node.children.flatMap((c) => flattenInline(c).map((l) => ({ ...l, italic: true })))
    case 'strong':
      return node.children.flatMap((c) => flattenInline(c).map((l) => ({ ...l, bold: true })))
    case 'link':
      return node.children.flatMap((c) => flattenInline(c).map((l) => ({ ...l, href: node.url })))
    case 'heading':
      return node.children.flatMap((c) => flattenInline(c))
    case 'tableCell':
      return node.children.flatMap((c) => flattenInline(c))
    case 'listItem':
    case 'paragraph':
    case 'blockquote':
      return node.children.flatMap((c) => flattenInline(c))
    case 'image':
      return [{ text: node.alt ?? '', href: node.url }]
    default:
      return []
  }
}

export function plainText(node: RootContent): string {
  return flattenInline(node)
    .map((l) => l.text)
    .join('')
}

export interface SentenceWithParts {
  id: string
  parts: StyledLeaf[]
}

const END_RE = /[。！？!?…」』”’.]$/

export function groupLeavesIntoSentences(
  leaves: StyledLeaf[],
  nextId: () => string,
): SentenceWithParts[] {
  const sentences: SentenceWithParts[] = []
  let current: SentenceWithParts | null = null

  for (const leaf of leaves) {
    for (const piece of splitSentences(leaf.text)) {
      const part: StyledLeaf = { ...leaf, text: piece }
      if (!current) current = { id: nextId(), parts: [] }
      current.parts.push(part)
      if (END_RE.test(piece)) {
        sentences.push(current)
        current = null
      }
    }
  }

  if (current) sentences.push(current)
  return sentences
}
