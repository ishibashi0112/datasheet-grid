# @ishibashi0112/spreadsheet-grid

[![npm version](https://img.shields.io/npm/v/@ishibashi0112/spreadsheet-grid.svg)](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A high-performance, virtualized spreadsheet / data grid for **React 19**, written in TypeScript.

高性能な仮想化スプレッドシート／データグリッド（**React 19**・TypeScript 製）。

**English** | [日本語](#日本語)

---

## Features

- Scroll-space virtualization that handles up to ~1,000,000 rows.
- Three-pane pinned columns (left / center / right) via sticky positioning.
- Sorting, per-column filters (`text` / `number` / `date` / `select` / `set` / `custom`), and a global filter.
- In-cell editing and clipboard copy / paste, with range selection and keyboard navigation.
- Optional auto-height rows for wrapped, variable-height content.
- Both **client-side** (`rows`) and **server-side** (`dataSource`, SSRM) row models.
- Themeable with CSS custom properties (`--ssg-*`) and a low-priority `@layer ssg-base`, so your own CSS or Tailwind utilities override the defaults without specificity battles. `className` / `classNames` slots are also provided.
- TypeScript-first, fully controlled API.

## Installation

```sh
npm install @ishibashi0112/spreadsheet-grid
# pnpm add @ishibashi0112/spreadsheet-grid
# yarn add @ishibashi0112/spreadsheet-grid
```

Requires **react** and **react-dom** `>= 19` as peer dependencies (install them in your app if you have not already). `@tanstack/react-virtual` is a regular dependency and is installed automatically.

## Styles

The grid ships its CSS as a separate file. Import it once (for example, in your app entry):

```ts
import '@ishibashi0112/spreadsheet-grid/style.css'
```

The base styles live in `@layer ssg-base`, so any unlayered CSS or Tailwind utilities you write will win over the defaults.

## Quick start

```tsx
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 200, editable: true, filterType: 'text' },
  { key: 'qty',  title: 'Qty',  width: 120, editable: true, filterType: 'number' },
]

export function Example() {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: 'Apple',  qty: 3 },
    { id: 2, name: 'Banana', qty: 5 },
  ])

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
    />
  )
}
```

`rows` and `onRowsChange` make the grid a controlled component. A column needs at least `key` and `width`.

## Server-side mode (SSRM)

Pass a `dataSource` instead of `rows` to switch to server-side mode. The grid keeps the full scroll height for the total row count and fetches only the blocks near the viewport:

```tsx
<SpreadsheetGrid
  columns={columns}
  dataSource={{
    async getRows({ startIndex, endIndex, query, signal }) {
      // Apply `query` (filters / sort) on the server and return only [startIndex, endIndex).
      const { rows, totalRowCount } = await fetchPage({ startIndex, endIndex, query, signal })
      return { rows, totalRowCount }
    },
  }}
/>
```

Sorting, column filters, and the global filter stay enabled and are forwarded to the server through `query`. See the [API reference](./src/components/spreadsheet-grid/API_REFERENCE.md) for the full `getRows` contract, the filter wire format, and `serverSideRefreshToken`.

## Styling & theming

- Override the CSS variables on `.ssg-root` (or scope them via the `className` prop):

  ```css
  .ssg-root {
    --ssg-accent: #16a34a;
    --ssg-radius: 4px;
  }
  ```

- Use the `classNames` prop for per-part class slots, `cellClassName` per column, and `getRowClassName` per row. Because the defaults are in `@layer ssg-base`, your overrides apply without `!important`.

## API reference

The full prop and type reference lives in [`src/components/spreadsheet-grid/API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md).

## License

[MIT](./LICENSE) © 2026 Yuki Sakakibara

---

## 日本語

[English](#ishibashi0112spreadsheet-grid)

**React 19** 製の高性能な仮想化スプレッドシート／データグリッドです。TypeScript で書かれています。

### 特徴

- スクロール空間の仮想化により最大 100 万行規模に対応。
- `position: sticky` による 3 ペイン固定列（左 / 中央 / 右）。
- ソート、列ごとのフィルター（`text` / `number` / `date` / `select` / `set` / `custom`）、グローバルフィルター。
- セル内編集とクリップボードのコピー／貼り付け、範囲選択、キーボード操作。
- 折り返し・可変行高に対応する auto-height 行（任意）。
- **クライアントサイド**（`rows`）と**サーバーサイド**（`dataSource`、SSRM）の両行モデル。
- CSS カスタムプロパティ（`--ssg-*`）と優先度の低い `@layer ssg-base` によるテーマ設定。利用側の通常 CSS や Tailwind ユーティリティが特異度の競合なしに既定を上書きできます。`className` / `classNames` スロットも用意。
- TypeScript ファースト、完全 controlled な API。

### インストール

```sh
npm install @ishibashi0112/spreadsheet-grid
# pnpm add @ishibashi0112/spreadsheet-grid
# yarn add @ishibashi0112/spreadsheet-grid
```

peer 依存として **react** / **react-dom** `>= 19` が必要です（未導入なら利用側で入れてください）。`@tanstack/react-virtual` は通常依存として自動的に入ります。

### スタイル

CSS は別ファイルとして同梱されます。アプリのエントリ等で 1 度だけ import してください:

```ts
import '@ishibashi0112/spreadsheet-grid/style.css'
```

基底スタイルは `@layer ssg-base` にあるため、利用側が書く未レイヤーの CSS や Tailwind ユーティリティが既定に必ず勝ちます。

### クイックスタート

```tsx
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 200, editable: true, filterType: 'text' },
  { key: 'qty',  title: '数量', width: 120, editable: true, filterType: 'number' },
]

export function Example() {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: 'りんご', qty: 3 },
    { id: 2, name: 'バナナ', qty: 5 },
  ])

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
    />
  )
}
```

`rows` と `onRowsChange` でグリッドは controlled になります。列には最低限 `key` と `width` が必要です。

### サーバーサイドモード（SSRM）

`rows` の代わりに `dataSource` を渡すとサーバーサイドモードになります。総行数ぶんのスクロール高さを保ったまま、可視窓に近いブロックだけを取得します:

```tsx
<SpreadsheetGrid
  columns={columns}
  dataSource={{
    async getRows({ startIndex, endIndex, query, signal }) {
      // query(フィルター/ソート)をサーバで適用し、[startIndex, endIndex) のみ返す。
      const { rows, totalRowCount } = await fetchPage({ startIndex, endIndex, query, signal })
      return { rows, totalRowCount }
    },
  }}
/>
```

ソート・列フィルター・グローバルフィルターは有効なまま `query` 経由でサーバへ送られます。`getRows` の契約、フィルターの wire format、`serverSideRefreshToken` の詳細は [API リファレンス](./src/components/spreadsheet-grid/API_REFERENCE.md) を参照してください。

### スタイリング / テーマ

- `.ssg-root` 上で CSS 変数を上書きします（`className` prop でスコープも可能）:

  ```css
  .ssg-root {
    --ssg-accent: #16a34a;
    --ssg-radius: 4px;
  }
  ```

- パーツ別の class は `classNames` prop、列単位は `cellClassName`、行単位は `getRowClassName` で付与できます。既定は `@layer ssg-base` にあるため、上書きに `!important` は不要です。

### API リファレンス

prop と型の完全なリファレンスは [`src/components/spreadsheet-grid/API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md) にあります。

### ライセンス

[MIT](./LICENSE) © 2026 Yuki Sakakibara
