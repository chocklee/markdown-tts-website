# M1 核心朗读闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建不登录即可用的 Markdown 朗读闭环：粘贴/上传 → 渲染 → 浏览器语音播放 + 句子高亮 + 播放控制（上/下句、上/下章、语速、跳过代码/表格、进度、音量）。

**Architecture:** Next.js 15 App Router 纯前端应用（M1 无后端）。remark 将 Markdown 解析为结构化文档（句子、章节），自定义 React 渲染器输出带 `data-sent` 标记的句子 span；Web Speech API 逐句朗读驱动高亮与滚动；zustand 管理阅读状态；TTS 引擎抽象为接口，便于测试与后续云语音替换。未登录内容存 localStorage，登录后保存到文件库（M2）。

**Tech Stack:** Next.js 15.3 + React 19 + TypeScript、Tailwind CSS 3.4、remark 15 / mdast 4、zustand 5、Vitest 3 + Testing Library（jsdom）

---

### Task 1: 初始化 Next.js + TypeScript + Tailwind + Vitest 工程

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `.eslintrc.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Modify: `.gitignore`

- [ ] **Step 1: 写入工程配置文件**

`package.json`:

```json
{
  "name": "markdown-tts-website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "15.3.3",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "remark": "15.0.1",
    "zustand": "5.0.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.3.0",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "22.13.10",
    "@types/react": "19.1.2",
    "@types/react-dom": "19.1.2",
    "autoprefixer": "10.4.21",
    "eslint": "8.57.1",
    "eslint-config-next": "15.3.3",
    "jsdom": "25.0.1",
    "mdast": "4.0.0",
    "postcss": "8.5.3",
    "tailwindcss": "3.4.17",
    "typescript": "5.8.3",
    "vitest": "3.1.1"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
const nextConfig = {}

export default nextConfig
```

`postcss.config.mjs`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

`.eslintrc.json`:

```json
{
  "extends": ["next/core-web-vitals"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
```

`.gitignore`（追加以下内容到现有文件末尾）：

```gitignore
node_modules/
.next/
out/
*.tsbuildinfo
next-env.d.ts
.eslintcache
```

- [ ] **Step 2: 写入布局与全局样式**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '听 Markdown — 把文字变成声音',
  description: '粘贴或上传 Markdown 文件，边看边听 AI 朗读',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  )
}
```

`src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

mark.current-sentence {
  background: #fde68a;
  border-radius: 2px;
}
```

- [ ] **Step 3: 安装依赖**

Run: `npm install`
Expected: `added N packages`，无 error

- [ ] **Step 4: 验证构建与测试可运行**

Run: `npm run build`
Expected: 构建成功，提示 `Compiled successfully`；`/` 路由已生成

Run: `npx vitest run`
Expected: `No test files found` 或 `0 tests`，进程退出码 0

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts .eslintrc.json vitest.config.ts src/test/setup.ts src/app/layout.tsx src/app/globals.css .gitignore
git commit -m "chore: scaffold Next.js + Tailwind + Vitest project"
```

---

### Task 2: 领域类型与句子切分器（TDD）

**Files:**
- Create: `src/types/reader.ts`
- Create: `src/lib/markdown/sentenceize.ts`
- Test: `src/lib/markdown/__tests__/sentenceize.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/markdown/__tests__/sentenceize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitSentences } from '../sentenceize'

describe('splitSentences', () => {
  it('按中文句末标点切句', () => {
    expect(splitSentences('你好。世界！')).toEqual(['你好。', '世界！'])
  })

  it('按英文句末标点切句', () => {
    expect(splitSentences('Hello. World!')).toEqual(['Hello.', 'World!'])
  })

  it('保留句内逗号', () => {
    expect(splitSentences('你好，世界。')).toEqual(['你好，世界。'])
  })

  it('合并换行为一个空格，不额外切句', () => {
    expect(splitSentences('第一行\n第二行')).toEqual(['第一行 第二行'])
  })

  it('去除空结果并 trim 空白', () => {
    expect(splitSentences('   \n  ')).toEqual([])
    expect(splitSentences('  你好。  世界！ ')).toEqual(['你好。', '世界！'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/markdown/__tests__/sentenceize.test.ts`
Expected: FAIL，报 `Cannot find module '../sentenceize'`

- [ ] **Step 3: 写入类型定义**

`src/types/reader.ts`:

```ts
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
}

export const defaultSettings: ReaderSettings = {
  rate: 1,
  volume: 1,
  skipCode: true,
  skipTable: true,
}
```

- [ ] **Step 4: 写入实现**

`src/lib/markdown/sentenceize.ts`:

```ts
const BOUNDARY_RE = /(?<=[。！？!?…」』”’])\s*/

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(BOUNDARY_RE)
    .map((part) => part.trim())
    .filter(Boolean)
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/lib/markdown/__tests__/sentenceize.test.ts`
Expected: 5 个测试全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/types/reader.ts src/lib/markdown/sentenceize.ts src/lib/markdown/__tests__/sentenceize.test.ts
git commit -m "feat: add reader types and sentence splitter"
```

---

### Task 3: 章节提取（TDD）

**Files:**
- Create: `src/lib/markdown/chapters.ts`
- Test: `src/lib/markdown/__tests__/chapters.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/markdown/__tests__/chapters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildChapters } from '../chapters'
import type { ReaderBlock } from '@/types/reader'

function block(id: string, type: ReaderBlock['type'], sentenceIds: string[], depth = 0): ReaderBlock {
  return {
    id,
    type,
    depth,
    text: '',
    sentenceIds,
    node: { type: 'paragraph' } as ReaderBlock['node'],
  }
}

describe('buildChapters', () => {
  it('没有标题时返回空数组', () => {
    const blocks = [block('b0', 'paragraph', ['s1', 's2'])]
    expect(buildChapters(blocks)).toEqual([])
  })

  it('h1-h3 标题建立章节，h4 不建立', () => {
    const blocks = [
      block('b0', 'heading', ['s1'], 1),
      block('b1', 'paragraph', ['s2']),
      block('b2', 'heading', ['s3'], 2),
      block('b3', 'heading', ['s4'], 4),
    ]
    const chapters = buildChapters(blocks)
    expect(chapters.map((c) => c.title)).toEqual(['', ''])
    expect(chapters[0].sentenceIds).toEqual(['s1', 's2'])
    expect(chapters[1].sentenceIds).toEqual(['s3'])
  })

  it('第一个标题之前的句子归入第一章', () => {
    const blocks = [
      block('b0', 'paragraph', ['s1']),
      block('b1', 'heading', ['s2'], 1),
      block('b2', 'paragraph', ['s3']),
    ]
    const chapters = buildChapters(blocks)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].sentenceIds).toEqual(['s2', 's3', 's1'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/markdown/__tests__/chapters.test.ts`
Expected: FAIL，报 `Cannot find module '../chapters'`

- [ ] **Step 3: 写入实现**

`src/lib/markdown/chapters.ts`:

```ts
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
    } else if (current) {
      current.sentenceIds.push(...block.sentenceIds)
    }
  }

  const firstHeadingIndex = blocks.findIndex((b) => b === headingBlocks[0])
  const prefix = blocks.slice(0, firstHeadingIndex).flatMap((b) => b.sentenceIds)
  if (prefix.length > 0 && chapters[0]) {
    chapters[0].sentenceIds.unshift(...prefix)
  }

  return chapters
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/markdown/__tests__/chapters.test.ts`
Expected: 3 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/markdown/chapters.ts src/lib/markdown/__tests__/chapters.test.ts
git commit -m "feat: extract chapters from heading blocks"
```

---

### Task 4: Markdown 解析为结构化文档 + 行内渲染数据（TDD）

**Files:**
- Create: `src/lib/markdown/inline.ts`
- Create: `src/lib/markdown/parse.ts`
- Test: `src/lib/markdown/__tests__/inline.test.ts`
- Test: `src/lib/markdown/__tests__/parse.test.ts`

- [ ] **Step 1: 写失败测试（inline）**

`src/lib/markdown/__tests__/inline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { remark } from 'remark'
import type { Root, RootContent } from 'mdast'
import { flattenInline, groupLeavesIntoSentences } from '../inline'

function inlineNode(md: string): RootContent {
  const tree = remark().parse(md) as Root
  const paragraph = tree.children.find((n) => n.type === 'paragraph')
  if (!paragraph || paragraph.type !== 'paragraph') throw new Error('need paragraph')
  return paragraph.children[0]
}

describe('flattenInline', () => {
  it('提取纯文本', () => {
    expect(flattenInline(inlineNode('你好'))).toEqual([{ text: '你好' }])
  })

  it('保留加粗与斜体标记', () => {
    const leaves = flattenInline(inlineNode('**重点**和*斜体*'))
    expect(leaves).toEqual([
      { text: '重点', bold: true },
      { text: '和' },
      { text: '斜体', italic: true },
    ])
  })

  it('链接保留 href，图片用 alt 作为文本', () => {
    const leaves = flattenInline(inlineNode('[链接](https://a.b) ![图](https://c.d/x.png)'))
    expect(leaves).toEqual([
      { text: '链接', href: 'https://a.b' },
      { text: '图', href: 'https://c.d/x.png' },
    ])
  })
})

describe('groupLeavesIntoSentences', () => {
  it('把叶子按句子分组并分配 id', () => {
    const leaves = [{ text: '你好，' }, { text: '世界。' }]
    let n = 0
    const sentences = groupLeavesIntoSentences(leaves, () => `s${++n}`)
    expect(sentences).toEqual([
      {
        id: 's1',
        parts: [
          { text: '你好，' },
          { text: '世界。' },
        ],
      },
    ])
  })

  it('跨加粗边界的句子只分配一个 id', () => {
    const leaves = [
      { text: '这是', bold: true },
      { text: '一句话。' },
    ]
    let n = 0
    const sentences = groupLeavesIntoSentences(leaves, () => `s${++n}`)
    expect(sentences).toHaveLength(1)
    expect(sentences[0].id).toBe('s1')
    expect(sentences[0].parts).toHaveLength(2)
  })

  it('句末标点处切分句子', () => {
    const leaves = [{ text: '第一句。第二句！' }]
    let n = 0
    const sentences = groupLeavesIntoSentences(leaves, () => `s${++n}`)
    expect(sentences.map((s) => s.id)).toEqual(['s1', 's2'])
  })
})
```

- [ ] **Step 2: 运行确认失败（inline）**

Run: `npx vitest run src/lib/markdown/__tests__/inline.test.ts`
Expected: FAIL，报 `Cannot find module '../inline'`

- [ ] **Step 3: 写入 inline 实现**

`src/lib/markdown/inline.ts`:

```ts
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

const END_RE = /[。！？!?…」』”’]$/

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
```

- [ ] **Step 4: 运行确认通过（inline）**

Run: `npx vitest run src/lib/markdown/__tests__/inline.test.ts`
Expected: 6 个测试全部 PASS

- [ ] **Step 5: 写失败测试（parse）**

`src/lib/markdown/__tests__/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseDocument, hashContent } from '../parse'

const SAMPLE = `# 如何高效学习

今天想聊聊学习方法。很多人以为学习靠天赋。

## 方法一：番茄钟

使用番茄钟可以提高专注度。

\`\`\`js
const focus = 25
\`\`\`

| 技巧 | 效果 |
| --- | --- |
| 番茄钟 | 好 |

> 引用一句名言。结束。
`

describe('parseDocument', () => {
  it('提取第一个 h1 作为标题', () => {
    const doc = parseDocument(SAMPLE)
    expect(doc.title).toBe('如何高效学习')
  })

  it('按顺序生成句子 id', () => {
    const doc = parseDocument(SAMPLE)
    expect(doc.sentenceIds[0]).toBe('s1')
    expect(doc.sentenceIds).toHaveLength(6)
  })

  it('代码块与表格块类型正确', () => {
    const doc = parseDocument(SAMPLE)
    const code = doc.blocks.find((b) => b.type === 'code')
    const table = doc.blocks.find((b) => b.type === 'table')
    expect(code?.text).toBe('const focus = 25')
    expect(table?.text).toBe('技巧，效果。番茄钟，好')
  })

  it('根据 h1/h2 生成章节', () => {
    const doc = parseDocument(SAMPLE)
    expect(doc.chapters.map((c) => c.title)).toEqual(['如何高效学习', '方法一：番茄钟'])
  })

  it('相同内容生成相同 id', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abd'))
  })

  it('无标题时使用兜底标题', () => {
    const doc = parseDocument('只有一段文字。', '我的笔记')
    expect(doc.title).toBe('我的笔记')
  })
})
```

- [ ] **Step 6: 运行确认失败（parse）**

Run: `npx vitest run src/lib/markdown/__tests__/parse.test.ts`
Expected: FAIL，报 `Cannot find module '../parse'`

- [ ] **Step 7: 写入 parse 实现**

`src/lib/markdown/parse.ts`:

```ts
import { remark } from 'remark'
import type { RootContent } from 'mdast'
import { splitSentences } from './sentenceize'
import { plainText } from './inline'
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
  const tree = remark().parse(markdown)
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
      return { id, type: 'heading', depth: node.depth, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
    case 'paragraph': {
      const text = plainText(node)
      return { id, type: 'paragraph', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
    case 'list': {
      const text = node.children.map((item) => plainText(item)).join(' ')
      return { id, type: 'list', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
    case 'blockquote': {
      const text = node.children.map((c) => plainText(c)).join(' ')
      return { id, type: 'blockquote', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
    case 'code': {
      const text = node.value
      return { id, type: 'code', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
    case 'table': {
      const text = node.children
        .map((row) => row.children.map((cell) => plainText(cell)).join('，'))
        .join('。')
      return { id, type: 'table', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
    case 'thematicBreak':
      return { id, type: 'thematicBreak', depth: 0, text: '', sentenceIds: [], node }
    case 'html':
      return { id, type: 'html', depth: 0, text: '', sentenceIds: [], node }
    default: {
      const text = plainText(node as RootContent)
      return { id, type: 'paragraph', depth: 0, text, sentenceIds: sentencesWithIds(text, nextId), node }
    }
  }
}

function extractTitle(children: RootContent[], fallback: string): string {
  const heading = children.find((n) => n.type === 'heading' && n.depth === 1) ??
    children.find((n) => n.type === 'heading')
  return heading ? plainText(heading) : fallback
}
```

- [ ] **Step 8: 运行确认通过（parse）**

Run: `npx vitest run src/lib/markdown/__tests__/parse.test.ts`
Expected: 6 个测试全部 PASS

- [ ] **Step 9: 提交**

```bash
git add src/lib/markdown/inline.ts src/lib/markdown/parse.ts src/lib/markdown/__tests__/inline.test.ts src/lib/markdown/__tests__/parse.test.ts
git commit -m "feat: parse markdown into structured document"
```

---

### Task 5: TTS 引擎抽象与播放队列（TDD）

**Files:**
- Create: `src/lib/tts/engine.ts`
- Create: `src/lib/tts/queue.ts`
- Test: `src/lib/tts/__tests__/queue.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/tts/__tests__/queue.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { SpeechQueue } from '../queue'
import type { TtsEngine } from '../engine'

class FakeEngine implements TtsEngine {
  speakCalls: { text: string; rate: number; volume: number; onend: () => void }[] = []
  paused = false
  cancelled = false

  speak(text: string, opts: { rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }): void {
    this.speakCalls.push({ text, rate: opts.rate, volume: opts.volume, onend: opts.onend })
  }
  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  cancel(): void { this.cancelled = true }
  get isSpeaking(): boolean { return false }
}

function setup(texts: string[]) {
  const engine = new FakeEngine()
  const onIndex = vi.fn()
  const onEnd = vi.fn()
  const onError = vi.fn()
  const options = { rate: 1, volume: 1 }
  const queue = new SpeechQueue(engine, texts, () => options, { onIndex, onEnd, onError })
  return { engine, queue, onIndex, onEnd, onError, options }
}

describe('SpeechQueue', () => {
  it('从指定位置开始逐句播放并回调索引', () => {
    const { engine, queue, onIndex } = setup(['a。', 'b。', 'c。'])
    queue.playFrom(1)
    expect(onIndex).toHaveBeenCalledWith(1)
    expect(engine.speakCalls[0].text).toBe('b。')

    engine.speakCalls[0].onend()
    expect(onIndex).toHaveBeenCalledWith(2)
    expect(engine.speakCalls[1].text).toBe('c。')
  })

  it('播完最后一句触发 onEnd', () => {
    const { engine, queue, onEnd } = setup(['a。'])
    queue.playFrom(0)
    engine.speakCalls[0].onend()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('pause 后 resume 继续当前句，不重新开始', () => {
    const { engine, queue } = setup(['a。', 'b。'])
    queue.playFrom(0)
    queue.pause()
    expect(engine.paused).toBe(true)
    queue.resume()
    expect(engine.paused).toBe(false)
    expect(engine.speakCalls).toHaveLength(1)
  })

  it('stop 取消当前朗读', () => {
    const { engine, queue } = setup(['a。'])
    queue.playFrom(0)
    queue.stop()
    expect(engine.cancelled).toBe(true)
  })

  it('朗读时读取最新 rate/volume', () => {
    const { engine, queue, options } = setup(['a。'])
    options.rate = 1.5
    options.volume = 0.5
    queue.playFrom(0)
    expect(engine.speakCalls[0].rate).toBe(1.5)
    expect(engine.speakCalls[0].volume).toBe(0.5)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/tts/__tests__/queue.test.ts`
Expected: FAIL，报 `Cannot find module '../queue'`

- [ ] **Step 3: 写入引擎接口与浏览器实现**

`src/lib/tts/engine.ts`:

```ts
export interface SpeakOptions {
  rate: number
  volume: number
  onend: () => void
  onerror: (error: unknown) => void
}

export interface TtsEngine {
  speak(text: string, options: SpeakOptions): void
  pause(): void
  resume(): void
  cancel(): void
  readonly isSpeaking: boolean
}

export class BrowserTtsEngine implements TtsEngine {
  private synth: SpeechSynthesis | null = null
  private current: SpeechSynthesisUtterance | null = null

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis
    }
  }

  speak(text: string, options: SpeakOptions): void {
    if (!this.synth) {
      options.onerror(new Error('当前浏览器不支持语音朗读'))
      return
    }
    this.synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = options.rate
    utterance.volume = options.volume
    utterance.onend = () => options.onend()
    utterance.onerror = () => options.onerror(new Error('语音合成失败'))
    this.current = utterance
    this.synth.speak(utterance)
  }

  pause(): void {
    this.synth?.pause()
  }

  resume(): void {
    this.synth?.resume()
  }

  cancel(): void {
    this.synth?.cancel()
  }

  get isSpeaking(): boolean {
    return this.synth?.speaking ?? false
  }
}
```

- [ ] **Step 4: 写入播放队列实现**

`src/lib/tts/queue.ts`:

```ts
import type { TtsEngine } from './engine'

export interface SpeechCallbacks {
  onIndex: (index: number) => void
  onEnd: () => void
  onError: (message: string) => void
}

export class SpeechQueue {
  private engine: TtsEngine
  private texts: string[]
  private getOptions: () => { rate: number; volume: number }
  private callbacks: SpeechCallbacks
  private index = 0
  private state: 'idle' | 'playing' | 'paused' = 'idle'

  constructor(
    engine: TtsEngine,
    texts: string[],
    getOptions: () => { rate: number; volume: number },
    callbacks: SpeechCallbacks,
  ) {
    this.engine = engine
    this.texts = texts
    this.getOptions = getOptions
    this.callbacks = callbacks
  }

  get currentIndex(): number {
    return this.index
  }

  isIdle(): boolean {
    return this.state === 'idle'
  }

  playFrom(startIndex: number): void {
    this.engine.cancel()
    this.index = startIndex
    this.state = 'playing'
    this.speakCurrent()
  }

  resumeOrStart(startIndex: number): void {
    if (this.state === 'paused') {
      this.engine.resume()
      this.state = 'playing'
      return
    }
    this.playFrom(startIndex)
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.engine.pause()
    this.state = 'paused'
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.engine.resume()
    this.state = 'playing'
  }

  stop(): void {
    this.engine.cancel()
    this.state = 'idle'
  }

  private speakCurrent(): void {
    if (this.index >= this.texts.length) {
      this.state = 'idle'
      this.callbacks.onEnd()
      return
    }
    this.callbacks.onIndex(this.index)
    const { rate, volume } = this.getOptions()
    this.engine.speak(this.texts[this.index], {
      rate,
      volume,
      onend: () => {
        this.index += 1
        this.speakCurrent()
      },
      onerror: (error) => {
        this.state = 'idle'
        this.callbacks.onError(error instanceof Error ? error.message : String(error))
      },
    })
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/lib/tts/__tests__/queue.test.ts`
Expected: 5 个测试全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/lib/tts/engine.ts src/lib/tts/queue.ts src/lib/tts/__tests__/queue.test.ts
git commit -m "feat: add TTS engine abstraction and speech queue"
```

---

### Task 6: 可朗读句子选择器与阅读状态 store（TDD）

**Files:**
- Create: `src/lib/state/selectors.ts`
- Create: `src/lib/state/readerStore.ts`
- Test: `src/lib/state/__tests__/selectors.test.ts`
- Test: `src/lib/state/__tests__/readerStore.test.ts`（`// @vitest-environment jsdom`）

- [ ] **Step 1: 写失败测试（selectors）**

`src/lib/state/__tests__/selectors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getSpeakableIds, getSentenceText } from '../selectors'
import { parseDocument } from '@/lib/markdown/parse'
import { defaultSettings } from '@/types/reader'

const DOC = parseDocument(`# 标题

正文一。正文二。

\`\`\`js
const a = 1
\`\`\`

| 列 | 值 |
| --- | --- |
| a | b |

结尾。
`)

describe('getSpeakableIds', () => {
  it('默认跳过代码块与表格', () => {
    const ids = getSpeakableIds(DOC, defaultSettings)
    expect(ids).toEqual(['s1', 's2', 's3', 's7'])
  })

  it('关闭跳过时包含代码块与表格', () => {
    const ids = getSpeakableIds(DOC, { ...defaultSettings, skipCode: false, skipTable: false })
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7'])
  })
})

describe('getSentenceText', () => {
  it('返回指定句子的文本', () => {
    expect(getSentenceText(DOC, 's2')).toBe('正文一。')
    expect(getSentenceText(DOC, 's4')).toBe('const a = 1')
  })
})
```

- [ ] **Step 2: 运行确认失败（selectors）**

Run: `npx vitest run src/lib/state/__tests__/selectors.test.ts`
Expected: FAIL，报 `Cannot find module '../selectors'`

- [ ] **Step 3: 写入 selectors 实现**

`src/lib/state/selectors.ts`:

```ts
import type { ReaderDocument, ReaderSettings } from '@/types/reader'
import { splitSentences } from '@/lib/markdown/sentenceize'

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
  const parts = splitSentences(block.text)
  const index = block.sentenceIds.indexOf(sentenceId)
  return parts[index] ?? block.text
}
```

- [ ] **Step 4: 运行确认通过（selectors）**

Run: `npx vitest run src/lib/state/__tests__/selectors.test.ts`
Expected: 3 个测试全部 PASS

- [ ] **Step 5: 写失败测试（store）**

`src/lib/state/__tests__/readerStore.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useReaderStore } from '../readerStore'
import { parseDocument } from '@/lib/markdown/parse'
import type { TtsEngine } from '@/lib/tts/engine'

class FakeEngine implements TtsEngine {
  speakCalls: { text: string; onend: () => void }[] = []
  speak(text: string, opts: { rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }): void {
    this.speakCalls.push({ text, onend: opts.onend })
  }
  pause(): void {}
  resume(): void {}
  cancel(): void {}
  get isSpeaking(): boolean { return false }
}

const DOC = parseDocument(`# 第一章

你好。世界！

## 第二章

继续。`)

function freshStore() {
  useReaderStore.setState({
    document: null,
    settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
    speakableIds: [],
    currentIndex: 0,
    isPlaying: false,
    queue: null,
  })
  const engine = new FakeEngine()
  useReaderStore.getState().init(DOC, engine)
  return { engine, store: useReaderStore.getState() }
}

describe('readerStore', () => {
  beforeEach(() => {
    freshStore()
  })

  it('init 后生成可朗读句子列表', () => {
    const state = useReaderStore.getState()
    expect(state.speakableIds).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(state.currentIndex).toBe(0)
  })

  it('togglePlay 从当前句开始朗读', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    expect(engine.speakCalls[0].text).toBe('第一章')
    expect(useReaderStore.getState().isPlaying).toBe(true)
  })

  it('句子朗读结束自动推进到下一句', () => {
    const { engine } = freshStore()
    useReaderStore.getState().togglePlay()
    engine.speakCalls[0].onend()
    expect(useReaderStore.getState().currentIndex).toBe(1)
    expect(engine.speakCalls[1].text).toBe('你好。')
  })

  it('nextSentence / prevSentence 移动播放位置', () => {
    const { engine } = freshStore()
    useReaderStore.getState().seekTo('s3')
    expect(useReaderStore.getState().currentIndex).toBe(2)
    useReaderStore.getState().nextSentence()
    expect(useReaderStore.getState().currentIndex).toBe(3)
    expect(engine.speakCalls[0].text).toBe('继续。')
    useReaderStore.getState().prevSentence()
    expect(useReaderStore.getState().currentIndex).toBe(2)
    expect(engine.speakCalls[1].text).toBe('世界！')
  })

  it('nextChapter / prevChapter 按章节跳转', () => {
    useReaderStore.getState().nextChapter()
    expect(useReaderStore.getState().currentIndex).toBe(3)
    useReaderStore.getState().prevChapter()
    expect(useReaderStore.getState().currentIndex).toBe(0)
  })

  it('toggleSkipCode 重建可朗读列表并保持当前句', () => {
    const doc = parseDocument('# 标题\n正文。\n\n```js\nconst a = 1\n```\n结尾。')
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    useReaderStore.getState().init(doc, new FakeEngine())
    useReaderStore.getState().seekTo('s2')
    useReaderStore.getState().toggleSkipCode()
    const state = useReaderStore.getState()
    expect(state.speakableIds).toEqual(['s1', 's2', 's3', 's4'])
    expect(state.currentIndex).toBe(1)
  })

  it('restoreIndex 设置位置但不播放', () => {
    const { engine } = freshStore()
    useReaderStore.getState().restoreIndex('s4')
    expect(useReaderStore.getState().currentIndex).toBe(3)
    expect(engine.speakCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 6: 运行确认失败（store）**

Run: `npx vitest run src/lib/state/__tests__/readerStore.test.ts`
Expected: FAIL，报 `Cannot find module '../readerStore'`

- [ ] **Step 7: 写入 store 实现**

`src/lib/state/readerStore.ts`:

```ts
import { create } from 'zustand'
import type { ReaderDocument, ReaderSettings } from '@/types/reader'
import { defaultSettings } from '@/types/reader'
import { getSentenceText, getSpeakableIds } from './selectors'
import { BrowserTtsEngine, type TtsEngine } from '@/lib/tts/engine'
import { SpeechQueue } from '@/lib/tts/queue'

interface ReaderState {
  document: ReaderDocument | null
  settings: ReaderSettings
  speakableIds: string[]
  currentIndex: number
  isPlaying: boolean
  queue: SpeechQueue | null
  engine: TtsEngine | null
  rebuildSpeakable: () => void
  init: (document: ReaderDocument, engine?: TtsEngine) => void
  togglePlay: () => void
  stop: () => void
  nextSentence: () => void
  prevSentence: () => void
  nextChapter: () => void
  prevChapter: () => void
  seekTo: (sentenceId: string) => void
  restoreIndex: (sentenceId: string) => void
  setRate: (rate: number) => void
  setVolume: (volume: number) => void
  toggleSkipCode: () => void
  toggleSkipTable: () => void
}

function buildQueue(
  engine: TtsEngine,
  document: ReaderDocument,
  getOptions: () => { rate: number; volume: number },
  onIndex: (i: number) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): SpeechQueue {
  const ids = getSpeakableIds(document, useReaderStore.getState().settings)
  const texts = ids.map((sentenceId) => getSentenceText(document, sentenceId))
  return new SpeechQueue(
    engine,
    texts,
    getOptions,
    { onIndex, onEnd, onError },
  )
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  document: null,
  settings: { ...defaultSettings },
  speakableIds: [],
  currentIndex: 0,
  isPlaying: false,
  queue: null,
  engine: null,

  init: (document, engine) => {
    const engineInstance = engine ?? (typeof window !== 'undefined' ? new BrowserTtsEngine() : null)
    if (!engineInstance) return

    get().queue?.stop()
    const settings = get().settings
    const speakableIds = getSpeakableIds(document, settings)
    const queue = buildQueue(
      engineInstance,
      document,
      () => ({ rate: get().settings.rate, volume: get().settings.volume }),
      (i) => set({ currentIndex: i }),
      () => set({ isPlaying: false }),
      (message) => {
        console.error(message)
        set({ isPlaying: false })
      },
    )
    set({ document, engine: engineInstance, queue, speakableIds, currentIndex: 0, isPlaying: false })
  },

  togglePlay: () => {
    const { queue, isPlaying, speakableIds, currentIndex } = get()
    if (!queue || speakableIds.length === 0) return
    if (isPlaying) {
      queue.pause()
      set({ isPlaying: false })
      return
    }
    if (queue.isIdle() && currentIndex >= speakableIds.length - 1) {
      queue.playFrom(0)
    } else {
      queue.resumeOrStart(currentIndex)
    }
    set({ isPlaying: true })
  },

  stop: () => {
    get().queue?.stop()
    set({ isPlaying: false })
  },

  nextSentence: () => {
    const { speakableIds, currentIndex, queue } = get()
    const next = Math.min(currentIndex + 1, speakableIds.length - 1)
    if (!queue || next === currentIndex) return
    queue.playFrom(next)
    set({ isPlaying: true })
  },

  prevSentence: () => {
    const { currentIndex, queue } = get()
    const prev = Math.max(currentIndex - 1, 0)
    if (!queue || prev === currentIndex) return
    queue.playFrom(prev)
    set({ isPlaying: true })
  },

  nextChapter: () => {
    const { document, speakableIds, currentIndex, queue } = get()
    if (!document || !queue) return
    const currentId = speakableIds[currentIndex]
    const chapterIndex = document.chapters.findIndex((c) => c.sentenceIds.includes(currentId))
    if (chapterIndex < 0) return
    const next = document.chapters[chapterIndex + 1]
    if (!next) return
    const target = next.sentenceIds.find((sentenceId) => speakableIds.includes(sentenceId))
    if (!target) return
    queue.playFrom(speakableIds.indexOf(target))
    set({ isPlaying: true })
  },

  prevChapter: () => {
    const { document, speakableIds, currentIndex, queue } = get()
    if (!document || !queue) return
    const currentId = speakableIds[currentIndex]
    const chapterIndex = document.chapters.findIndex((c) => c.sentenceIds.includes(currentId))
    const prev = document.chapters[chapterIndex > 0 ? chapterIndex - 1 : 0]
    if (!prev) return
    const target = prev.sentenceIds.find((sentenceId) => speakableIds.includes(sentenceId))
    if (!target) return
    const targetIndex = speakableIds.indexOf(target)
    if (targetIndex === currentIndex) return
    queue.playFrom(targetIndex)
    set({ isPlaying: true })
  },

  seekTo: (sentenceId) => {
    const { speakableIds, queue } = get()
    const target = speakableIds.indexOf(sentenceId)
    if (target < 0 || !queue) return
    queue.playFrom(target)
    set({ isPlaying: true })
  },

  restoreIndex: (sentenceId) => {
    const target = get().speakableIds.indexOf(sentenceId)
    if (target >= 0) set({ currentIndex: target })
  },

  setRate: (rate) => {
    set((s) => ({ settings: { ...s.settings, rate } }))
    if (get().isPlaying) {
      const { queue, currentIndex } = get()
      queue?.playFrom(currentIndex)
    }
  },

  setVolume: (volume) => {
    set((s) => ({ settings: { ...s.settings, volume } }))
    if (get().isPlaying) {
      const { queue, currentIndex } = get()
      queue?.playFrom(currentIndex)
    }
  },

  toggleSkipCode: () => {
    set((s) => ({ settings: { ...s.settings, skipCode: !s.settings.skipCode } }))
    get().rebuildSpeakable()
  },

  toggleSkipTable: () => {
    set((s) => ({ settings: { ...s.settings, skipTable: !s.settings.skipTable } }))
    get().rebuildSpeakable()
  },

  rebuildSpeakable: () => {
    const { document, engine, speakableIds, currentIndex, settings, queue } = get()
    if (!document || !engine) return
    const currentId = speakableIds[currentIndex]
    queue?.stop()
    const newIds = getSpeakableIds(document, settings)
    const newQueue = buildQueue(
      engine,
      document,
      () => ({ rate: get().settings.rate, volume: get().settings.volume }),
      (i) => set({ currentIndex: i }),
      () => set({ isPlaying: false }),
      (message) => {
        console.error(message)
        set({ isPlaying: false })
      },
    )
    const newIndex = currentId ? Math.max(newIds.indexOf(currentId), 0) : 0
    set({ queue: newQueue, speakableIds: newIds, currentIndex: newIndex, isPlaying: false })
  },
}))
```

- [ ] **Step 8: 运行确认通过**

Run: `npx vitest run src/lib/state/__tests__/readerStore.test.ts src/lib/state/__tests__/selectors.test.ts`
Expected: 9 个测试全部 PASS

- [ ] **Step 9: 提交**

```bash
git add src/lib/state/selectors.ts src/lib/state/readerStore.ts src/lib/state/__tests__/selectors.test.ts src/lib/state/__tests__/readerStore.test.ts
git commit -m "feat: add reader store with playback and chapter navigation"
```

---

### Task 7: 本地存储与首页（粘贴/上传）（TDD）

**Files:**
- Create: `src/lib/storage/local.ts`
- Create: `src/components/home/InputSection.tsx`
- Create: `src/app/page.tsx`
- Test: `src/lib/storage/__tests__/local.test.ts`（`// @vitest-environment jsdom`）
- Test: `src/components/home/__tests__/InputSection.test.tsx`（`// @vitest-environment jsdom`）

- [ ] **Step 1: 写失败测试（storage）**

`src/lib/storage/__tests__/local.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadDocument, loadPosition, saveDocument, savePosition } from '../local'

describe('local storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存并读取文档', () => {
    saveDocument({ id: 'doc-1', title: '笔记', content: '# hi', savedAt: 1 })
    expect(loadDocument()).toEqual({ id: 'doc-1', title: '笔记', content: '# hi', savedAt: 1 })
  })

  it('无文档时返回 null', () => {
    expect(loadDocument()).toBeNull()
  })

  it('保存并读取位置（仅匹配同一文档）', () => {
    savePosition('doc-1', 's3')
    expect(loadPosition('doc-1')).toBe('s3')
    expect(loadPosition('doc-2')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败（storage）**

Run: `npx vitest run src/lib/storage/__tests__/local.test.ts`
Expected: FAIL，报 `Cannot find module '../local'`

- [ ] **Step 3: 写入 storage 实现**

`src/lib/storage/local.ts`:

```ts
export interface StoredDocument {
  id: string
  title: string
  content: string
  savedAt: number
}

const DOC_KEY = 'mtts:doc'
const POS_KEY = 'mtts:pos'

export function saveDocument(doc: StoredDocument): void {
  localStorage.setItem(DOC_KEY, JSON.stringify(doc))
}

export function loadDocument(): StoredDocument | null {
  const raw = localStorage.getItem(DOC_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredDocument
  } catch {
    return null
  }
}

export function savePosition(docId: string, sentenceId: string): void {
  localStorage.setItem(POS_KEY, JSON.stringify({ docId, sentenceId }))
}

export function loadPosition(docId: string): string | null {
  const raw = localStorage.getItem(POS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { docId: string; sentenceId: string }
    return parsed.docId === docId ? parsed.sentenceId : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 运行确认通过（storage）**

Run: `npx vitest run src/lib/storage/__tests__/local.test.ts`
Expected: 3 个测试全部 PASS

- [ ] **Step 5: 写失败测试（InputSection）**

`src/components/home/__tests__/InputSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))

import InputSection from '../InputSection'

describe('InputSection', () => {
  it('粘贴内容后点击开始收听，保存文档并跳转阅读器', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    await user.type(screen.getByLabelText('Markdown 内容'), '# 我的笔记\n\n你好。')
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(localStorage.getItem('mtts:doc')).toContain('"title":"我的笔记"')
    expect(pushMock).toHaveBeenCalledWith('/reader')
  })

  it('内容为空时提示错误', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(screen.getByText('请粘贴内容或选择文件')).toBeInTheDocument()
  })

  it('超过 5MB 的文件提示错误', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    const bigFile = new File(['x'], 'big.md', { type: 'text/markdown' })
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, bigFile)
    expect(screen.getByText('文件超过 5MB 上限')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: 运行确认失败（InputSection）**

Run: `npx vitest run src/components/home/__tests__/InputSection.test.tsx`
Expected: FAIL，报 `Cannot find module '../InputSection'`

- [ ] **Step 7: 写入 InputSection 实现**

`src/components/home/InputSection.tsx`:

```tsx
'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hashContent, parseDocument } from '@/lib/markdown/parse'
import { saveDocument } from '@/lib/storage/local'

const MAX_SIZE = 5 * 1024 * 1024

export default function InputSection() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > MAX_SIZE) {
      setError('文件超过 5MB 上限')
      return
    }
    if (!/\.md$/i.test(file.name) && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      setError('请选择 .md 文件')
      return
    }
    setFileName(file.name.replace(/\.md$/i, ''))
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file, 'utf-8')
  }

  function start() {
    const content = text.trim()
    if (!content) {
      setError('请粘贴内容或选择文件')
      return
    }
    const doc = parseDocument(content, fileName || '未命名文档')
    saveDocument({ id: doc.id, title: doc.title, content, savedAt: Date.now() })
    router.push('/reader')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">听 Markdown</h1>
      <p className="mt-2 text-center text-slate-500">粘贴或上传 Markdown 文件，边看边听 AI 朗读</p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <textarea
          aria-label="Markdown 内容"
          className="min-h-64 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
          placeholder="在这里粘贴 Markdown 内容，或点击下方按钮上传 .md 文件（≤5MB）"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            onClick={() => fileRef.current?.click()}
          >
            上传 .md 文件
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={start}
          >
            开始收听
          </button>
        </div>
        {fileName && <p className="mt-2 text-xs text-slate-400">文件：{fileName}.md</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
```

`src/app/page.tsx`:

```tsx
import InputSection from '@/components/home/InputSection'

export default function HomePage() {
  return <InputSection />
}
```

- [ ] **Step 8: 运行确认通过（InputSection）**

Run: `npx vitest run src/components/home/__tests__/InputSection.test.tsx`
Expected: 3 个测试全部 PASS

- [ ] **Step 9: 提交**

```bash
git add src/lib/storage/local.ts src/components/home/InputSection.tsx src/app/page.tsx src/lib/storage/__tests__/local.test.ts src/components/home/__tests__/InputSection.test.tsx
git commit -m "feat: add home page with paste and file upload"
```

---

### Task 8: 阅读器页面（三栏布局 + 大纲 + 正文渲染 + 高亮）（TDD）

**Files:**
- Create: `src/lib/security/url.ts`
- Create: `src/components/reader/ContentView.tsx`
- Create: `src/components/reader/OutlinePanel.tsx`
- Create: `src/components/reader/ReaderLayout.tsx`
- Create: `src/app/reader/page.tsx`
- Test: `src/lib/security/__tests__/url.test.ts`
- Test: `src/components/reader/__tests__/ContentView.test.tsx`（`// @vitest-environment jsdom`）
- Test: `src/components/reader/__tests__/OutlinePanel.test.tsx`（`// @vitest-environment jsdom`）

- [ ] **Step 1: 写失败测试（url sanitize）**

`src/lib/security/__tests__/url.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sanitizeUrl } from '../url'

describe('sanitizeUrl', () => {
  it('放行 http/https/mailto 与锚点', () => {
    expect(sanitizeUrl('https://a.b')).toBe('https://a.b')
    expect(sanitizeUrl('http://a.b')).toBe('http://a.b')
    expect(sanitizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
    expect(sanitizeUrl('#anchor')).toBe('#anchor')
  })

  it('拒绝 javascript: 协议', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败（url）**

Run: `npx vitest run src/lib/security/__tests__/url.test.ts`
Expected: FAIL，报 `Cannot find module '../url'`

- [ ] **Step 3: 写入 url 实现**

`src/lib/security/url.ts`:

```ts
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
```

- [ ] **Step 4: 运行确认通过（url）**

Run: `npx vitest run src/lib/security/__tests__/url.test.ts`
Expected: 2 个测试全部 PASS

- [ ] **Step 5: 写失败测试（ContentView）**

`src/components/reader/__tests__/ContentView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContentView } from '../ContentView'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'

const DOC = parseDocument(`# 如何高效学习

今天想聊聊**学习方法**。很多人以为学习靠天赋。

## 方法

\`\`\`js
const a = 1
\`\`\`

| 技巧 | 效果 |
| --- | --- |
| 番茄钟 | 好 |
`)

function renderWithStore(currentIndex: number) {
  useReaderStore.setState({
    document: DOC,
    settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
    speakableIds: DOC.sentenceIds,
    currentIndex,
    isPlaying: true,
    queue: null,
    engine: null,
  })
  render(<ContentView document={DOC} />)
}

describe('ContentView', () => {
  it('渲染标题、段落、代码块与表格', () => {
    renderWithStore(0)
    expect(screen.getByText('如何高效学习')).toBeInTheDocument()
    expect(screen.getByText('const a = 1')).toBeInTheDocument()
    expect(screen.getByText('番茄钟')).toBeInTheDocument()
  })

  it('句子带 data-sent 标记', () => {
    renderWithStore(0)
    const mark = document.querySelector('mark[data-sent="s2"]')
    expect(mark).not.toBeNull()
    expect(mark?.textContent).toBe('今天想聊聊学习方法。')
  })

  it('当前句高亮，其他句不高亮', () => {
    renderWithStore(1)
    expect(document.querySelector('mark[data-sent="s2"]')?.className).toContain('current-sentence')
    expect(document.querySelector('mark[data-sent="s3"]')?.className).not.toContain('current-sentence')
  })

  it('跳过代码块时显示占位提示', () => {
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    render(<ContentView document={DOC} />)
    expect(screen.getByText('已跳过代码块，可在朗读设置中开启')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: 运行确认失败（ContentView）**

Run: `npx vitest run src/components/reader/__tests__/ContentView.test.tsx`
Expected: FAIL，报 `Cannot find module '../ContentView'`

- [ ] **Step 7: 写入 ContentView 实现**

`src/components/reader/ContentView.tsx`:

```tsx
'use client'
import { useEffect, useRef } from 'react'
import type { RootContent } from 'mdast'
import type { ReaderBlock, ReaderDocument } from '@/types/reader'
import { flattenInline, groupLeavesIntoSentences, type StyledLeaf } from '@/lib/markdown/inline'
import { plainText } from '@/lib/markdown/inline'
import { sanitizeUrl } from '@/lib/security/url'
import { useReaderStore } from '@/lib/state/readerStore'

function InlineParts({ parts }: { parts: StyledLeaf[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.href) {
          const safe = sanitizeUrl(part.href)
          if (safe) {
            return (
              <a key={i} href={safe} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {part.text}
              </a>
            )
          }
        }
        let content: React.ReactNode = part.text
        if (part.code) content = <code className="rounded bg-slate-100 px-1">{content}</code>
        if (part.italic) content = <em>{content}</em>
        if (part.bold) content = <strong>{content}</strong>
        return <span key={i}>{content}</span>
      })}
    </>
  )
}

function BlockContent({
  block,
  activeSentenceId,
  skipCode,
  skipTable,
}: {
  block: ReaderBlock
  activeSentenceId: string | null
  skipCode: boolean
  skipTable: boolean
}) {
  let idIndex = 0
  const consumeId = () => {
    const id = block.sentenceIds[idIndex]
    idIndex += 1
    return id
  }

  const renderInline = (node: RootContent) => {
    const sentences = groupLeavesIntoSentences(flattenInline(node), consumeId)
    return sentences.map((sentence) => (
      <mark
        key={sentence.id}
        data-sent={sentence.id}
        className={sentence.id === activeSentenceId ? 'current-sentence' : 'bg-transparent'}
      >
        <InlineParts parts={sentence.parts} />
      </mark>
    ))
  }

  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.min(Math.max(block.depth, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      const sizes: Record<string, string> = {
        h1: 'mt-8 mb-4 text-3xl font-bold',
        h2: 'mt-8 mb-3 text-2xl font-bold',
        h3: 'mt-6 mb-2 text-xl font-semibold',
      }
      return (
        <Tag id={`block-${block.id}`} className={sizes[Tag] ?? 'mt-6 mb-2 text-lg font-semibold'}>
          {renderInline(block.node)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p className="my-3 leading-8">{renderInline(block.node)}</p>
    case 'list': {
      const node = block.node
      const ordered = node.type === 'list' ? node.ordered : false
      const items = node.type === 'list' ? node.children : []
      const ListTag = ordered ? 'ol' : 'ul'
      return (
        <ListTag className={`my-3 space-y-1 ${ordered ? 'list-decimal' : 'list-disc'} pl-6`}>
          {items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ListTag>
      )
    }
    case 'blockquote':
      return <blockquote className="my-3 border-l-4 border-slate-300 pl-4 text-slate-600">{renderInline(block.node)}</blockquote>
    case 'code':
      if (skipCode) {
        return <p className="my-3 rounded bg-slate-100 p-3 text-sm text-slate-400">已跳过代码块，可在朗读设置中开启</p>
      }
      return (
        <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
          <code>{block.text}</code>
        </pre>
      )
    case 'table': {
      const node = block.node
      if (node.type !== 'table') return null
      if (skipTable) {
        return <p className="my-3 rounded bg-slate-100 p-3 text-sm text-slate-400">已跳过表格，可在朗读设置中开启</p>
      }
      return (
        <div className="my-3 overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>
              {node.children.map((row, i) => (
                <tr key={i}>
                  {row.children.map((cell, j) => (
                    <td key={j} className={`border border-slate-300 px-3 py-1 ${i === 0 ? 'bg-slate-100 font-medium' : ''}`}>
                      {plainText(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'thematicBreak':
      return <hr className="my-6 border-slate-200" />
    default:
      return null
  }
}

export function ContentView({ document }: { document: ReaderDocument }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeSentenceId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
  const skipCode = useReaderStore((s) => s.settings.skipCode)
  const skipTable = useReaderStore((s) => s.settings.skipTable)

  useEffect(() => {
    if (!activeSentenceId) return
    const el = containerRef.current?.querySelector(`[data-sent="${CSS.escape(activeSentenceId)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeSentenceId])

  return (
    <div ref={containerRef}>
      {document.blocks.map((block) => (
        <BlockContent
          key={block.id}
          block={block}
          activeSentenceId={activeSentenceId}
          skipCode={skipCode}
          skipTable={skipTable}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 8: 写失败测试（OutlinePanel）**

`src/components/reader/__tests__/OutlinePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutlinePanel } from '../OutlinePanel'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'

const DOC = parseDocument('# 第一章\n你好。\n\n## 第二章\n继续。')

describe('OutlinePanel', () => {
  it('渲染章节标题并高亮当前章节', () => {
    useReaderStore.setState({
      document: DOC,
      settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
      speakableIds: DOC.sentenceIds,
      currentIndex: 2,
      isPlaying: false,
      queue: null,
      engine: null,
    })
    render(<OutlinePanel document={DOC} />)
    expect(screen.getByText('第一章')).toBeInTheDocument()
    expect(screen.getByText('第二章')).toBeInTheDocument()
    expect(screen.getByText('第二章').className).toContain('bg-blue-50')
  })

  it('点击章节跳转到该章节第一句', async () => {
    const seekTo = vi.spyOn(useReaderStore.getState(), 'seekTo')
    useReaderStore.setState({
      document: DOC,
      settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
      speakableIds: DOC.sentenceIds,
      currentIndex: 0,
      isPlaying: false,
      queue: null,
      engine: null,
    })
    const user = userEvent.setup()
    render(<OutlinePanel document={DOC} />)
    await user.click(screen.getByText('第二章'))
    expect(seekTo).toHaveBeenCalledWith('s3')
  })
})
```

- [ ] **Step 9: 运行确认失败（OutlinePanel）**

Run: `npx vitest run src/components/reader/__tests__/OutlinePanel.test.tsx`
Expected: FAIL，报 `Cannot find module '../OutlinePanel'`

- [ ] **Step 10: 写入 OutlinePanel 实现**

`src/components/reader/OutlinePanel.tsx`:

```tsx
'use client'
import type { ReaderDocument } from '@/types/reader'
import { useReaderStore } from '@/lib/state/readerStore'

export function OutlinePanel({ document }: { document: ReaderDocument }) {
  const currentId = useReaderStore((s) => s.speakableIds[s.currentIndex] ?? null)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const seekTo = useReaderStore((s) => s.seekTo)

  if (document.chapters.length === 0) {
    return <p className="text-sm text-slate-400">本文没有标题，无法生成大纲</p>
  }

  return (
    <nav aria-label="大纲">
      <h2 className="mb-2 text-sm font-semibold text-slate-500">大纲</h2>
      <ul className="space-y-1">
        {document.chapters.map((chapter) => {
          const firstId = chapter.sentenceIds.find((id) => speakableIds.includes(id))
          const active = currentId !== null && chapter.sentenceIds.includes(currentId)
          return (
            <li key={chapter.id}>
              <button
                type="button"
                className={`w-full truncate rounded px-2 py-1 text-left text-sm ${
                  active ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => {
                  if (firstId) seekTo(firstId)
                }}
              >
                {chapter.title || '（无标题）'}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 11: 运行确认通过（ContentView + OutlinePanel）**

Run: `npx vitest run src/components/reader/__tests__/ContentView.test.tsx src/components/reader/__tests__/OutlinePanel.test.tsx`
Expected: 6 个测试全部 PASS

- [ ] **Step 12: 提交**

```bash
git add src/lib/security/url.ts src/components/reader/ContentView.tsx src/components/reader/OutlinePanel.tsx src/lib/security/__tests__/url.test.ts src/components/reader/__tests__/ContentView.test.tsx src/components/reader/__tests__/OutlinePanel.test.tsx
git commit -m "feat: add reader content view with outline and sentence highlight"
```
---

### Task 9: 播放条与朗读设置面板（TDD）

**Files:**
- Create: `src/components/reader/PlaybackBar.tsx`
- Create: `src/components/reader/SettingsPanel.tsx`
- Test: `src/components/reader/__tests__/PlaybackBar.test.tsx`（`// @vitest-environment jsdom`）
- Test: `src/components/reader/__tests__/SettingsPanel.test.tsx`（`// @vitest-environment jsdom`）

- [ ] **Step 1: 写失败测试（PlaybackBar）**

`src/components/reader/__tests__/PlaybackBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaybackBar } from '../PlaybackBar'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'

const DOC = parseDocument('# 第一章\n你好。\n\n## 第二章\n继续。')

function seedState(overrides: Partial<ReturnType<typeof useReaderStore.getState>> = {}) {
  useReaderStore.setState({
    document: DOC,
    settings: { rate: 1, volume: 1, skipCode: true, skipTable: true },
    speakableIds: DOC.sentenceIds,
    currentIndex: 0,
    isPlaying: false,
    queue: null,
    engine: null,
    ...overrides,
  })
}

describe('PlaybackBar', () => {
  it('点击下一句调用 nextSentence', async () => {
    const nextSentence = vi.spyOn(useReaderStore.getState(), 'nextSentence')
    seedState()
    const user = userEvent.setup()
    render(<PlaybackBar />)
    await user.click(screen.getByLabelText('下一句'))
    expect(nextSentence).toHaveBeenCalled()
  })

  it('点击播放/暂停切换 togglePlay', async () => {
    const togglePlay = vi.spyOn(useReaderStore.getState(), 'togglePlay')
    seedState()
    const user = userEvent.setup()
    render(<PlaybackBar />)
    await user.click(screen.getByLabelText('播放'))
    expect(togglePlay).toHaveBeenCalled()
  })

  it('有章节时上一章/下一章可用，显示进度', () => {
    seedState({ currentIndex: 2 })
    render(<PlaybackBar />)
    expect(screen.getByLabelText('上一章')).toBeEnabled()
    expect(screen.getByLabelText('下一章')).toBeEnabled()
    expect(screen.getByText('3 / 4 句')).toBeInTheDocument()
  })

  it('无章节时上一章/下一章禁用', () => {
    seedState({ document: parseDocument('只有一段。') })
    render(<PlaybackBar />)
    expect(screen.getByLabelText('上一章')).toBeDisabled()
    expect(screen.getByLabelText('下一章')).toBeDisabled()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/reader/__tests__/PlaybackBar.test.tsx`
Expected: FAIL，报 `Cannot find module '../PlaybackBar'`

- [ ] **Step 3: 写入 PlaybackBar 实现**

`src/components/reader/PlaybackBar.tsx`:

```tsx
'use client'
import { useReaderStore } from '@/lib/state/readerStore'

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

export function PlaybackBar() {
  const isPlaying = useReaderStore((s) => s.isPlaying)
  const currentIndex = useReaderStore((s) => s.currentIndex)
  const speakableIds = useReaderStore((s) => s.speakableIds)
  const settings = useReaderStore((s) => s.settings)
  const hasChapters = useReaderStore((s) => (s.document?.chapters.length ?? 0) > 0)
  const togglePlay = useReaderStore((s) => s.togglePlay)
  const nextSentence = useReaderStore((s) => s.nextSentence)
  const prevSentence = useReaderStore((s) => s.prevSentence)
  const nextChapter = useReaderStore((s) => s.nextChapter)
  const prevChapter = useReaderStore((s) => s.prevChapter)
  const seekTo = useReaderStore((s) => s.seekTo)
  const setRate = useReaderStore((s) => s.setRate)

  const total = speakableIds.length

  return (
    <div className="border-t border-slate-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevSentence}
            disabled={total === 0}
            aria-label="上一句"
            className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={total === 0}
            aria-label={isPlaying ? '暂停' : '播放'}
            className="rounded-full bg-blue-600 p-3 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            onClick={nextSentence}
            disabled={total === 0}
            aria-label="下一句"
            className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            ⏭
          </button>
          <span className="ml-2 flex items-center border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={prevChapter}
              disabled={!hasChapters}
              aria-label="上一章"
              className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ⏪
            </button>
            <button
              type="button"
              onClick={nextChapter}
              disabled={!hasChapters}
              aria-label="下一章"
              className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ⏩
            </button>
          </span>
        </div>

        <div className="flex flex-1 items-center gap-3 px-4">
          <span className="text-xs text-slate-500">{total === 0 ? '—' : `${currentIndex + 1} / ${total} 句`}</span>
          <input
            type="range"
            min={0}
            max={Math.max(total - 1, 0)}
            value={currentIndex}
            onChange={(e) => {
              const id = speakableIds[Number(e.target.value)]
              if (id) seekTo(id)
            }}
            aria-label="进度"
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">
            语速
            <select
              value={settings.rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="ml-1 rounded border border-slate-300 px-1 py-0.5 text-sm"
              aria-label="语速"
            >
              {RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {formatRate(rate)}x
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过（PlaybackBar）**

Run: `npx vitest run src/components/reader/__tests__/PlaybackBar.test.tsx`
Expected: 4 个测试全部 PASS

- [ ] **Step 5: 写失败测试（SettingsPanel）**

`src/components/reader/__tests__/SettingsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPanel } from '../SettingsPanel'
import { useReaderStore } from '@/lib/state/readerStore'

describe('SettingsPanel', () => {
  it('切换跳过代码块开关调用 toggleSkipCode', async () => {
    const toggleSkipCode = vi.spyOn(useReaderStore.getState(), 'toggleSkipCode')
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    const user = userEvent.setup()
    render(<SettingsPanel onClose={() => {}} />)
    await user.click(screen.getByLabelText('跳过代码块'))
    expect(toggleSkipCode).toHaveBeenCalled()
  })

  it('拖动语速滑杆调用 setRate', async () => {
    const setRate = vi.spyOn(useReaderStore.getState(), 'setRate')
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    render(<SettingsPanel onClose={() => {}} />)
    const slider = screen.getByLabelText('语速调节')
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect(setRate).toHaveBeenCalledWith(1.5)
  })
})
```

- [ ] **Step 6: 运行确认失败（SettingsPanel）**

Run: `npx vitest run src/components/reader/__tests__/SettingsPanel.test.tsx`
Expected: FAIL，报 `Cannot find module '../SettingsPanel'`

- [ ] **Step 7: 写入 SettingsPanel 实现**

`src/components/reader/SettingsPanel.tsx`:

```tsx
'use client'
import { useReaderStore } from '@/lib/state/readerStore'

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useReaderStore((s) => s.settings)
  const setRate = useReaderStore((s) => s.setRate)
  const setVolume = useReaderStore((s) => s.setVolume)
  const toggleSkipCode = useReaderStore((s) => s.toggleSkipCode)
  const toggleSkipTable = useReaderStore((s) => s.toggleSkipTable)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">朗读设置</h2>
        <button type="button" onClick={onClose} aria-label="关闭" className="text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>

      <label className="block text-sm text-slate-600">
        语速：{formatRate(settings.rate)}x
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.25}
          value={settings.rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="语速调节"
          className="mt-1 w-full"
        />
      </label>

      <label className="mt-4 block text-sm text-slate-600">
        音量：{Math.round(settings.volume * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="音量调节"
          className="mt-1 w-full"
        />
      </label>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.skipCode} onChange={toggleSkipCode} />
          跳过代码块
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.skipTable} onChange={toggleSkipTable} />
          跳过表格
        </label>
      </div>

      <p className="mt-6 text-xs text-slate-400">切换语速或跳过选项后，从当前句重新播放</p>
    </div>
  )
}
```


- [ ] **Step 8: 运行确认通过（SettingsPanel）**

Run: `npx vitest run src/components/reader/__tests__/SettingsPanel.test.tsx`
Expected: 2 个测试全部 PASS

- [ ] **Step 9: 全量测试 + 构建**

Run: `npx vitest run`
Expected: 全部测试 PASS（约 40 个）

Run: `npm run build`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 10: 提交**

```bash
git add src/components/reader/PlaybackBar.tsx src/components/reader/SettingsPanel.tsx src/components/reader/__tests__/PlaybackBar.test.tsx src/components/reader/__tests__/SettingsPanel.test.tsx
git commit -m "feat: add playback bar and settings panel"
```

---

### Task 10: 阅读器页面组装、位置记忆与最终验证

**Files:**
- Create: `src/components/reader/ReaderLayout.tsx`
- Create: `src/app/reader/page.tsx`
- Modify: `src/lib/storage/local.ts`

- [ ] **Step 1: 写入 ReaderLayout 与阅读器页面（基础版）**

`src/components/reader/ReaderLayout.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { ReaderDocument } from '@/types/reader'
import { OutlinePanel } from './OutlinePanel'
import { ContentView } from './ContentView'
import { SettingsPanel } from './SettingsPanel'
import { PlaybackBar } from './PlaybackBar'

export function ReaderLayout({ document }: { document: ReaderDocument }) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <OutlinePanel document={document} />
        </aside>
        <main className="relative flex-1 overflow-y-auto">
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50"
              onClick={() => setShowSettings((v) => !v)}
            >
              ⚙️ 朗读设置
            </button>
          </div>
          <div className="mx-auto max-w-3xl px-8 py-10">
            <ContentView document={document} />
          </div>
          {showSettings && (
            <div className="absolute inset-y-0 right-0 w-80 overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-lg">
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </div>
          )}
        </main>
      </div>
      <PlaybackBar />
    </div>
  )
}
```

`src/app/reader/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { loadDocument } from '@/lib/storage/local'
import { useReaderStore } from '@/lib/state/readerStore'
import { ReaderLayout } from '@/components/reader/ReaderLayout'
import type { ReaderDocument } from '@/types/reader'

export default function ReaderPage() {
  const router = useRouter()
  const [doc, setDoc] = useState<ReaderDocument | null>(null)

  useEffect(() => {
    const stored = loadDocument()
    if (!stored) {
      router.replace('/')
      return
    }
    setDoc(parseDocument(stored.content, stored.title))
  }, [router])

  useEffect(() => {
    if (!doc) return
    useReaderStore.getState().init(doc)
  }, [doc])

  if (!doc) {
    return <div className="p-10 text-center text-slate-400">加载中…</div>
  }

  return <ReaderLayout document={doc} />
}
```

- [ ] **Step 2: storage 增加 clearPosition**

`src/lib/storage/local.ts` 末尾追加：

```ts
export function clearPosition(): void {
  localStorage.removeItem(POS_KEY)
}
```

- [ ] **Step 3: 阅读器页恢复并保存朗读位置**

将 `src/app/reader/page.tsx` 整体替换为：

将 `src/app/reader/page.tsx` 整体替换为：

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { loadDocument, loadPosition, savePosition } from '@/lib/storage/local'
import { useReaderStore } from '@/lib/state/readerStore'
import { ReaderLayout } from '@/components/reader/ReaderLayout'
import type { ReaderDocument } from '@/types/reader'

export default function ReaderPage() {
  const router = useRouter()
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const init = useReaderStore((s) => s.init)
  const document = useReaderStore((s) => s.document)

  useEffect(() => {
    const stored = loadDocument()
    if (!stored) {
      router.replace('/')
      return
    }
    setDoc(parseDocument(stored.content, stored.title))
  }, [router])

  useEffect(() => {
    if (!doc || document?.id === doc.id) return
    init(doc)
    const position = loadPosition(doc.id)
    if (position) {
      useReaderStore.getState().restoreIndex(position)
    }
  }, [doc, document?.id, init])

  useEffect(() => {
    if (!doc) return
    const unsubscribe = useReaderStore.subscribe((state) => {
      const id = state.speakableIds[state.currentIndex]
      if (id && state.document?.id === doc.id) {
        savePosition(doc.id, id)
      }
    })
    return unsubscribe
  }, [doc])

  if (!doc) {
    return <div className="p-10 text-center text-slate-400">加载中…</div>
  }

  return <ReaderLayout document={doc} />
}
```
- [ ] **Step 4: 全量测试、lint 与构建**

Run: `npx vitest run`
Expected: 全部 PASS

Run: `npm run lint`
Expected: 无 error（warning 可接受）

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 5: 手动验收清单**

Run: `npm run dev`，浏览器打开 `http://localhost:3000`，逐项验证：

- [ ] 粘贴带标题/段落/列表/代码块/表格/引用的 Markdown，点击「开始收听」进入阅读器
- [ ] 标题生成左侧大纲，点击可跳转；无标题文章显示提示
- [ ] 播放：逐句朗读，当前句黄色高亮并自动滚动到可见区域
- [ ] 上一句/下一句、上一章/下一章（无标题时禁用）工作正常
- [ ] 拖动进度条跳转句子
- [ ] 语速 0.5x–2x 生效；音量滑杆生效
- [ ] 关闭「跳过代码块/表格」后，代码与表格文本被朗读
- [ ] 上传 `.md` 文件（UTF-8）内容正确载入；非 md 文件与 >5MB 文件提示错误
- [ ] 刷新页面后从上次位置恢复（不自动播放）
- [ ] 清除 localStorage 后直接访问 `/reader` 会跳回首页

- [ ] **Step 6: 提交**

```bash
git add src/components/reader/ReaderLayout.tsx src/app/reader/page.tsx src/lib/storage/local.ts
git commit -m "feat: assemble reader page with position memory"
```

---

## 完成后

- 推送：`git push origin master`
- 交付标准：不登录即可完成「粘贴/上传 → 朗读 → 高亮跟随 → 播放控制」全流程（M1 验收标准）
- 后续里程碑：M2（云语音 + 积分 + 登录）单独编写实施计划
