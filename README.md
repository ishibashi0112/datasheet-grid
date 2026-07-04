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
- External height control via `height` / `maxHeight` (e.g. `height="100%"` to follow the parent's height).
- Both **client-side** (`rows`) and **server-side** (`dataSource`, SSRM) row models.
- Themeable with CSS custom properties (`--ssg-*`) and a low-priority `@layer ssg-base`, so your own CSS or Tailwind utilities override the defaults without specificity battles. `className` / `classNames` slots are also provided.
- Toggle the top / bottom bars and their parts via props — whole bars (`showTopBar` / `showBottomBar`), the default top bar's summary chips and global-filter input, and the Rows/Columns counts in each bar.
- Built-in CSV export (`downloadCsv` / `exportCsv`), plus a library-agnostic `getExportData()` for Excel / XLSX / ODS — feed the shaped data (filter/sort/visible-order aware) to your own writer such as [hucre](https://github.com/productdevbook/hucre), ExcelJS, or SheetJS. No spreadsheet library is bundled; multi-sheet is composed on your side. See [`API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md).
- Export scopes: `'view'` (default — every filtered/sorted view row, scroll-independent), `'raw'` (every source row, ignoring filter & sort), `'rendered'` (only the rows currently rendered by virtualization — scroll-dependent), `'selection'`. Legacy `'all'` / `'visible'` keep working as deprecated aliases of `'view'` / `'rendered'`.
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

## Sizing

By default the grid caps its height at `480px` (`max-height`) and scrolls when the content is taller. Pass `height` to take explicit control — use `height="100%"` to follow the parent's height, or a pixel value:

```tsx
<div style={{ height: 600, minHeight: 0 }}>
  <SpreadsheetGrid rows={rows} columns={columns} height="100%" />
</div>
```

For `height="100%"` to work, the parent must have a resolved height (its ancestors are sized, and a flex child needs `min-height: 0`). This is standard CSS the library can't resolve for you. `maxHeight` sets an upper bound and can be combined with `height` (explicit height, capped at `maxHeight`).

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
- `height` / `maxHeight` によるスクロールコンテナ高さの外部制御（`height="100%"` で親要素の高さに追従）。
- **クライアントサイド**（`rows`）と**サーバーサイド**（`dataSource`、SSRM）の両行モデル。
- CSS カスタムプロパティ（`--ssg-*`）と優先度の低い `@layer ssg-base` によるテーマ設定。利用側の通常 CSS や Tailwind ユーティリティが特異度の競合なしに既定を上書きできます。`className` / `classNames` スロットも用意。
- トップ / ボトムバーとその構成要素（バー全体〔`showTopBar` / `showBottomBar`〕、既定トップバーの summary chips・グローバルフィルター入力、各バーの Rows/Columns 件数）を props で表示制御。
- CSV エクスポート（`downloadCsv` / `exportCsv`）を内蔵。Excel / XLSX / ODS はライブラリ非依存の `getExportData()` で、整形済みデータ（フィルター/ソート/可視列順を反映）を [hucre](https://github.com/productdevbook/hucre) / ExcelJS / SheetJS など任意の writer へ流す方式。xlsx ライブラリは同梱せず、マルチシートは利用側で合成。詳細は [`API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md)。
- エクスポート scope: `'view'`（既定＝フィルター/ソート後の全ビュー行。スクロール位置に非依存）/ `'raw'`（フィルター/ソート無視の全ソース行）/ `'rendered'`（描画中の行のみ＝スクロール位置に依存）/ `'selection'`（選択範囲）。旧 `'all'` / `'visible'` は `'view'` / `'rendered'` の deprecated エイリアスとして従来どおり動作。
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

### サイズ（高さ）

既定ではグリッドの高さは `480px`（`max-height`）で頭打ちになり、中身がそれより高いとスクロールします。`height` を渡すと高さを明示制御できます。`height="100%"` で親要素の高さに追従、`number` で px 指定です:

```tsx
<div style={{ height: 600, minHeight: 0 }}>
  <SpreadsheetGrid rows={rows} columns={columns} height="100%" />
</div>
```

`height="100%"` を効かせるには、**親要素が確定高さを持つ**必要があります（祖先まで高さが確定している／flex 子なら `min-height: 0` が必要）。これは CSS の一般則のため本ライブラリ側では解決できません。`maxHeight` は高さの上限で、`height` と併用できます（明示高さ＋上限）。

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