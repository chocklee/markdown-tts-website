import type { RootContent } from 'mdast'

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'code'
  | 'table'
  | 'thematicBreak'
  | 'html'
  | 'image'

export interface ReaderBlock {
  id: string
  type: BlockType
  depth: number
  text: string
  sentenceIds: string[]
  sentenceTexts: string[]
  node: RootContent
}

export interface Chapter {
  id: string
  title: string
  headingBlockId: string
  sentenceIds: string[]
}

export interface ReaderDocument {
  id: string
  title: string
  blocks: ReaderBlock[]
  sentenceIds: string[]
  chapters: Chapter[]
}

export interface ReaderSettings {
  rate: number
  volume: number
  skipCode: boolean
  skipTable: boolean
  sentencePause: boolean
  sentencePauseSeconds: number
}

export const defaultSettings: ReaderSettings = {
  rate: 1,
  volume: 1,
  skipCode: true,
  skipTable: true,
  sentencePause: false,
  sentencePauseSeconds: 2,
}
