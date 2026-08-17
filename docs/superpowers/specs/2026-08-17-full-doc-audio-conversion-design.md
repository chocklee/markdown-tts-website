# 一键完整转换设计（Full-Document Audio Conversion）

日期：2026-08-17
状态：已确认（用户批准方案 A：服务端转换）

## 背景与目标

当前云端朗读是逐句调用 `/api/tts/synthesize` 生成音频再播放（单次上限 2000 字），句与句之间存在等待模型返回的空隙。

目标：把整篇文档一键转换为一条完整音频（MP3），支持：

- 下载完整音频文件；
- 阅读器中无缝播放（整篇进度、无逐句高亮）；
- 未转换的文档保持现有逐句播放模式。

## 产品规则（已与用户确认）

1. 入口：文库文档菜单 + 阅读器工具栏，两处都有「转成音频」。
2. 播放：已转换且朗读设置（音色/语速/跳过代码/跳过表格）与转换时一致 → 默认无缝播放，显示整篇进度、不显示逐句高亮；不一致 → 自动回退逐句模式；重新转换后恢复无缝。
3. 存储：音频存云端（服务端），计入存储配额；提供下载功能。
4. 计费：Pro 专属（需有效订阅）；按字数与云端朗读同价扣积分；同一篇文档同一设置只扣一次（转换后播放/下载不再扣）。
5. 进度：入口处显示百分比，转换完成后 toast 提示。
6. 设置联动：改设置后回退逐句模式，重新转换覆盖旧音频。

## 数据模型

`db/migrations/010_converted_audio.sql`：

```sql
CREATE TABLE IF NOT EXISTS converted_audios (
  user_id text NOT NULL,
  doc_id text NOT NULL,
  voice text NOT NULL,
  rate numeric NOT NULL,
  skip_code boolean NOT NULL,
  skip_table boolean NOT NULL,
  chars integer NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',  -- pending | converting | done | failed
  progress real NOT NULL DEFAULT 0,        -- 0..1
  audio bytea,
  content_type text NOT NULL DEFAULT 'audio/mpeg',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, doc_id)
);
```

- 每篇文档一份转换结果，重新转换覆盖。
- 配额使用量 = 文档（未删除）文件大小 + 转换音频大小；超出配额 → 转换失败并退还积分。

## API 设计

### POST /api/tts/convert

请求体：`{ docId, voice, rate, skipCode, skipTable }`

流程：

1. 校验登录（401）。
2. 校验有效订阅（403 `server.proRequired`）。
3. 校验文档归属（404）。
4. 计算积分（同云端朗读：`calcCredits(chars, creditsPer100Chars)`），以 `convert:{docId}:{voice}:{rate}:{skipCode}:{skipTable}` 为 ref 预扣；余额不足 → 402。
5. 已存在同设置且 `status=done` 的记录 → 直接返回，不重复扣积分。
6. 创建/更新记录为 `pending`（progress=0），返回 `{ docId, status: 'pending' }`。

### GET /api/tts/convert?docId=

轮询式推进：每次调用处理一批（≤8 块）合成，更新 `progress` 与 `status`，返回 `{ status, progress, sizeBytes, error }`。

- 块切分：按段落切分（按设置过滤代码块/表格），单块 ≤ `CONFIG.tts.maxTextChars`（2000 字）。
- 每块调用 provider.synthesize，MP3 字节直接拼接（MP3 frame 可拼接）。
- 全部完成 → `status=done`，写入 `audio` 与 `size_bytes`。
- 任一块失败 → `status=failed`，记录 error，退还积分（以同一 ref）。
- 配额检查：完成后若 文档占用 + 音频大小 > 配额 → 删除音频、`status=failed`、退还积分、返回配额错误。

### GET /api/tts/convert/[docId]/audio

- 校验登录与归属（404）。
- 未完成 → 404。
- 返回 `audio/*` 字节，支持 `Range`（播放器拖动进度）；`?download=1` 时加 `Content-Disposition: attachment` 用于下载。

## 前端交互

### 文库页（LibraryView）

- 文档操作菜单加「转成音频」。
- 点击 → POST 创建任务 → 每 2 秒 GET 轮询，菜单项/按钮显示百分比 → 完成 toast。
- 已有转换结果时菜单显示「下载音频」；行内提供下载入口。

### 阅读器（ReaderLayout / ReaderClient / PlaybackBar）

- 工具栏加「转成音频」按钮，同轮询进度逻辑。
- 进入阅读器时 GET 检查：若该文档已转换且设置一致 → 默认无缝播放。
- 无缝播放：`<audio src="/api/tts/convert/[docId]/audio">`，播放条显示整篇进度（audio.currentTime/duration），可拖动，隐藏逐句高亮与上一句/下一句，保留播放/暂停、章节标题；提供下载按钮。
- 设置（音色/语速/跳过）变化 → 检测到与转换设置不一致 → 自动回退逐句模式；重新转换后恢复。
- 保留现有「逐句模式」开关，可手动切回逐句。

## 计费与配额

- 预扣：POST 时按 `convert:{...}` ref 扣积分；缓存命中（done 且同设置）不扣。
- 退还：转换失败或配额不足时按同一 ref 退还。
- 配额：`getUserQuotaBytes` 之外增加音频占用统计；音频超额返回明确错误（文案提示可清理音频或升级配额）。

## 国际化

新增 zh/en key（前缀 `convert.`）：

- 按钮：`convert.start`（转成音频）、`convert.download`（下载音频）、`convert.reconvert`（重新转换）。
- 进度：`convert.progress`（转换中 {p}%）、`convert.done`（转换完成）、`convert.failed`（转换失败，请重试）。
- 错误：`convert.proRequired`（Pro 专属，需订阅后使用）、`convert.noCredits`、`convert.quotaExceeded`、`convert.notFound` 等。
- 阅读器无缝模式文案：`reader.seamless`（整篇播放）等。

## 安全与边界

- 所有接口校验登录 + 文档/音频归属（user_id 匹配）。
- 音频字节只存服务端，客户端不持有转换产物（播放/下载走流）。
- 并发轮询安全：GET 推进批次时以单行更新 + `status IN ('pending','converting')` 条件防重入；同批块重复合成可接受（幂等以 ref 扣积分兜底）。

## 非目标

- 不做转换历史/任务列表页面（进度只展示在入口处）。
- 不做音频编辑/多版本管理（每文档一份，重新转换覆盖）。
- 不改变逐句模式的现有行为与计费。

## 验证

- 单元测试：块切分、积分预扣/退还（ref 幂等）、配额超限、权限校验、进度推进。
- 集成：手动验证文库/阅读器入口转换 → 轮询进度 → 无缝播放（拖动）→ 下载 → 改设置回退逐句 → 重新转换。
