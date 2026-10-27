# @ishibashi0112/spreadsheet-grid

A virtualized spreadsheet / data grid for React 19 (~1M rows, pinned columns, Excel-like editing / selection / clipboard, filters & sorting, client-side and server-side row models). 日本語は下にあります。

**[Docs & live demo](https://datasheet-grid.vercel.app)** · [Playground](https://datasheet-grid.vercel.app/playground) · [Try on StackBlitz](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/basic?file=src/App.tsx&terminal=dev) · [GitHub](https://github.com/ishibashi0112/datasheet-grid) · [Changelog](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)

## Install

```sh
npm install @ishibashi0112/spreadsheet-grid
```

Peer dependencies: `react` / `react-dom` `>= 19`. Import the CSS once:

```ts
import '@ishibashi0112/spreadsheet-grid/style.css'
// or, if you use CSS cascade layers (e.g. Tailwind v4): '@ishibashi0112/spreadsheet-grid/style.layer.css'
```

Using Astryx, Mantine, HeroUI v3 or shadcn/ui? Also import its theme after `style.css` (`themes/astryx.css` / `themes/mantine.css` / `themes/heroui.css` / `themes/shadcn.css`) so the grid follows your design system's colors and light / dark ([guide](https://datasheet-grid.vercel.app/docs/guides/design-systems)).

## Quick start

```tsx
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200, editable: true }]

export function App() {
  const [rows, setRows] = useState<Row[]>([{ id: 1, name: 'alpha' }])
  return (
    <div style={{ height: 600 }}>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height="100%"
      />
    </div>
  )
}
```

More runnable examples (server-side row model, Astryx) are in [`examples/`](https://github.com/ishibashi0112/datasheet-grid/tree/main/examples); each opens in StackBlitz.

## Smaller bundles: `/lite` (0.54.0+)

`SpreadsheetGrid` includes every feature (about 112KB gzip of initial JS). The `/lite` entry builds a grid with only the features you pass; the rest is left out of your bundle (about 60KB with no features, about 78KB with the `standardFeatures` preset).

```tsx
import { createSpreadsheetGrid, standardFeatures, serverSideFeature } from '@ishibashi0112/spreadsheet-grid/lite'
import '@ishibashi0112/spreadsheet-grid/style.css'

// Create it once at module level, not inside a component.
const Grid = createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } })
```

Props, the `ref` handle and types are the same as `SpreadsheetGrid`. Props of features you did not pass do nothing; in development a `console.warn` names the feature to add. The feature list and sizes are in `API_REFERENCE.md` (「機能を選んで組み込む」).

## Natural-language filtering: `/ai` (0.57.0+)

`GridAskBar` from the `/ai` entry turns a sentence ("Tokyo items with 10 or fewer in stock, most expensive first") into the grid's filters, sort, global search and column visibility. The grid never calls an AI: your `ask` function forwards the request to your own server, which calls any model with structured output. Row data is never sent, and every answer is validated, shown as chips and undoable. It is a separate entry (about 10.1KB gzip). Server code for Claude, OpenAI, Gemini and the Vercel AI SDK (AI Gateway) is in the [guide](https://datasheet-grid.vercel.app/docs/guides/ai-filter); the API is in `API_REFERENCE.md` (「ことばで絞り込み」).

```tsx
import { GridAskBar } from '@ishibashi0112/spreadsheet-grid/ai'

<GridAskBar grid={gridRef} columns={columns} ask={ask} />
```

## Documentation in this package

Everything below ships inside the npm package, so it is available offline (for example to coding agents reading `node_modules`).

| What | Where |
| --- | --- |
| Full API reference — props, column options, imperative handle (`ref`), recipes (Japanese) | `API_REFERENCE.md` in this package |
| Per-field docs (shown on hover) | JSDoc in the type definitions. Field docs live in `@ishibashi0112/spreadsheet-grid-core/dist/model/gridTypes.core.d.ts` and match the tables in `API_REFERENCE.md` |
| Guides with live demos (Japanese), playground, theme builder | [datasheet-grid.vercel.app](https://datasheet-grid.vercel.app) |
| Design notes, changelog | [GitHub README](https://github.com/ishibashi0112/datasheet-grid#readme) / [CHANGELOG.md](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md) |

## Using with AI coding assistants

This library is new, so AI coding assistants rarely know its API and tend to guess from other grids. Point them at the docs:

- **Skill.** The package ships an [Agent Skill](https://agentskills.io) at `skills/spreadsheet-grid/SKILL.md` (0.57.0+): a short guide with the rules below and where to look in `API_REFERENCE.md`. Tools that read `SKILL.md` (Claude Code, Cursor, Codex, GitHub Copilot and others) use it once it is in their skills folder. Install it from GitHub with `npx skills add https://github.com/ishibashi0112/datasheet-grid/tree/main/packages/react/skills/spreadsheet-grid`, or copy the folder from `node_modules` (for Claude Code, into `.claude/skills/`).
- **One line for `AGENTS.md` / `CLAUDE.md`:** "Before writing grid code, read `node_modules/@ishibashi0112/spreadsheet-grid/API_REFERENCE.md` and use only the props and methods it lists."
- **Docs for LLMs:** [llms.txt](https://datasheet-grid.vercel.app/llms.txt) lists every docs page (add `.md` to a page URL to get its Markdown), and [llms-full.txt](https://datasheet-grid.vercel.app/llms-full.txt) has all pages in one (large) file. Each docs page also has "Copy Markdown" and "Open" (in ChatGPT / Claude / Cursor).

## Rules that are easy to get wrong

- **Import the CSS.** Without `style.css` the grid is unstyled and its scroll area does not work.
- **State is controlled.** Edits come back through `onRowsChange` as a new array; pass that array back to `rows` as-is (re-creating it, e.g. with `map`, clears the undo history).
- **Row keys.** Return a stable key from `rowKeyGetter` (the default is the row index).
- **`rows` or `dataSource`.** `rows` is the client-side row model; `dataSource` switches to the server-side row model. They are mutually exclusive.
- **Height.** Use the `height` prop, not `style.height` on the root. A value containing `%` (`'100%'`) sizes the **whole grid including its bars** and needs a parent with a definite height; a number sizes the **scroll area only**. Without `height`, the scroll area is capped at `480px` (`maxHeight`).
- **Imperative API.** Pass `ref` (React 19 ref-as-prop, no `forwardRef`) to get a `SpreadsheetGridHandle<T>`.
- **Next.js App Router.** Render the grid from a Client Component (a file with `'use client'`); the package does not add the directive.

## License

MIT

---

## 日本語

React 19 向けの仮想化スプレッドシート / データグリッドです(約 100 万行・列固定・Excel ライクな編集 / 選択 / クリップボード・フィルター / ソート・クライアントサイド / サーバーサイド行モデル)。

**[ドキュメントとライブデモ](https://datasheet-grid.vercel.app)** · [プレイグラウンド](https://datasheet-grid.vercel.app/playground) · [StackBlitz で試す](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/basic?file=src/App.tsx&terminal=dev) · [GitHub](https://github.com/ishibashi0112/datasheet-grid) · [変更履歴](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)

Astryx / Mantine / HeroUI v3 / shadcn/ui の中で使うときは、`style.css` の後にそれぞれのテーマ(`themes/astryx.css` / `themes/mantine.css` / `themes/heroui.css` / `themes/shadcn.css`)を読み込むと、配色がデザインシステムのテーマとライト / ダークに揃います([ガイド](https://datasheet-grid.vercel.app/docs/guides/design-systems))。

ブラウザで動かせるサンプル(編集できる在庫表 / サーバーサイド行モデル / Astryx)は [`examples/`](https://github.com/ishibashi0112/datasheet-grid/tree/main/examples) にあり、どれも StackBlitz で開けます。

### バンドルを小さくする: `/lite`(0.54.0 から)

`SpreadsheetGrid` は全機能入りです(初期読み込みの JS が約 112KB gzip)。`/lite` の入口では、渡した機能だけを入れたグリッドを作れます。渡さなかった機能はバンドルに入りません(機能なしで約 60KB、プリセット `standardFeatures` で約 78KB)。

```tsx
import { createSpreadsheetGrid, standardFeatures, serverSideFeature } from '@ishibashi0112/spreadsheet-grid/lite'
import '@ishibashi0112/spreadsheet-grid/style.css'

// コンポーネントの中ではなく、モジュールの先頭で 1 回だけ作る
const Grid = createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } })
```

props・`ref` ハンドル・型は `SpreadsheetGrid` と同じです。渡していない機能の prop は何もせず、開発時は足すべき機能を `console.warn` で知らせます。機能の一覧とサイズは `API_REFERENCE.md` の「機能を選んで組み込む」にあります。

### ことばで絞り込み: `/ai`(0.57.0 から)

`/ai` の入口の `GridAskBar` は、「東京の在庫が 10 個以下を高い順に」のような文から、グリッドのフィルター・並び・グローバル検索・列の表示を AI に入れさせます。グリッドは AI を呼びません。利用側の `ask` が自分のサーバーへ頼みを送り、サーバーが好きな AI を構造化出力で呼びます。行のデータは送らず、答えはすべて検査してチップで見せ、元に戻せます。別の入口です(約 10.1KB gzip)。Claude・OpenAI・Gemini・Vercel AI SDK(AI Gateway)のサーバー側のコードは[ガイド](https://datasheet-grid.vercel.app/docs/guides/ai-filter)に、API は `API_REFERENCE.md` の「ことばで絞り込み」にあります。

```tsx
import { GridAskBar } from '@ishibashi0112/spreadsheet-grid/ai'

<GridAskBar grid={gridRef} columns={columns} ask={ask} />
```

### このパッケージに同梱のドキュメント

npm パッケージに同梱されているため、オフライン(`node_modules` を読むコーディングエージェント等)でも参照できます。

| 内容 | 場所 |
| --- | --- |
| API リファレンス全体(props / 列定義 / 命令的 API(`ref`)/ レシピ) | 本パッケージ直下の `API_REFERENCE.md` |
| フィールドごとの説明(ホバーで表示) | 型定義の JSDoc。各フィールドの説明は `@ishibashi0112/spreadsheet-grid-core/dist/model/gridTypes.core.d.ts` にあり、`API_REFERENCE.md` の表と同じ内容 |
| ライブデモ付きのガイド / プレイグラウンド / テーマビルダー | [datasheet-grid.vercel.app](https://datasheet-grid.vercel.app) |
| 設計メモ / 変更履歴 | [GitHub の README](https://github.com/ishibashi0112/datasheet-grid#readme) / [CHANGELOG.md](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md) |

### AI アシスタントで使うとき

このライブラリは新しく、AI コーディングツールはまだ API をほとんど知りません。ほかのグリッドの書き方で推測しがちなので、資料を渡してください。

- **Skill。** パッケージに [Agent Skill](https://agentskills.io) を同梱しています(`skills/spreadsheet-grid/SKILL.md`。0.57.0 から)。下の間違えやすいルールと、`API_REFERENCE.md` のどこを読めばよいかをまとめた短い手順書です。`SKILL.md` を読むツール(Claude Code / Cursor / Codex / GitHub Copilot など)の Skill のフォルダへ置くと使われます。GitHub から `npx skills add https://github.com/ishibashi0112/datasheet-grid/tree/main/packages/react/skills/spreadsheet-grid` で入れるか、`node_modules` からフォルダを写してください(Claude Code なら `.claude/skills/` へ)。
- **`AGENTS.md` / `CLAUDE.md` に一文。** 「グリッドのコードを書く前に `node_modules/@ishibashi0112/spreadsheet-grid/API_REFERENCE.md` を読み、そこにある props とメソッドだけを使う。」
- **AI 向けの資料。** [llms.txt](https://datasheet-grid.vercel.app/llms.txt) はドキュメントの全ページの目次(ページの URL の末尾に `.md` を付けると Markdown で読めます)、[llms-full.txt](https://datasheet-grid.vercel.app/llms-full.txt) は全ページを 1 つにまとめたもの(大きい)です。ドキュメントの各ページの上にも「Copy Markdown」と「Open」(ChatGPT / Claude / Cursor で開く)があります。

### 間違えやすいルール

- **CSS を読み込む。** `style.css` が無いとスタイルが当たらず、スクロール領域も機能しません。
- **状態は controlled。** 編集結果は `onRowsChange` が新しい配列で返します。受け取った配列をそのまま `rows` へ戻してください(`map` 等で作り直すと undo 履歴が消えます)。
- **行キー。** `rowKeyGetter` で安定したキーを返してください(既定は行 index)。
- **`rows` か `dataSource`。** `rows` はクライアントサイド行モデル、`dataSource` を渡すとサーバーサイド行モデルです。両者は排他です。
- **高さ。** ルートの `style.height` ではなく `height` prop で指定します。`%` を含む値(`'100%'`)は**バーを含むグリッド全体**の高さで、親要素に確定高さが必要です。数値は**スクロール領域だけ**の高さです。`height` 未指定時のスクロール領域は `480px`(`maxHeight`)が上限です。
- **命令的 API。** `ref`(React 19 の ref-as-prop。`forwardRef` は不要)で `SpreadsheetGridHandle<T>` を受け取ります。
- **Next.js App Router。** クライアントコンポーネント(`'use client'` のファイル)から描画してください。パッケージ側はディレクティブを付けていません。