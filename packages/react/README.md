# @ishibashi0112/spreadsheet-grid

A virtualized spreadsheet / data grid for React 19 (~1M rows, pinned columns, Excel-like editing / selection / clipboard, filters & sorting, client-side and server-side row models). 日本語は下にあります。

## Install

```sh
npm install @ishibashi0112/spreadsheet-grid
```

Peer dependencies: `react` / `react-dom` `>= 19`. Import the CSS once:

```ts
import '@ishibashi0112/spreadsheet-grid/style.css'
// or, if you use CSS cascade layers (e.g. Tailwind v4): '@ishibashi0112/spreadsheet-grid/style.layer.css'
```

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

## Documentation in this package

Everything below ships inside the npm package, so it is available offline (for example to coding agents reading `node_modules`).

| What | Where |
| --- | --- |
| Full API reference — props, column options, imperative handle (`ref`), recipes (Japanese) | `API_REFERENCE.md` in this package |
| Per-field docs (shown on hover) | JSDoc in the type definitions. Field docs live in `@ishibashi0112/spreadsheet-grid-core/dist/model/gridTypes.core.d.ts` and match the tables in `API_REFERENCE.md` |
| Guides, demos, design notes | [GitHub README](https://github.com/ishibashi0112/datasheet-grid#readme) and the `website/` docs in the repository |

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

### このパッケージに同梱のドキュメント

npm パッケージに同梱されているため、オフライン(`node_modules` を読むコーディングエージェント等)でも参照できます。

| 内容 | 場所 |
| --- | --- |
| API リファレンス全体(props / 列定義 / 命令的 API(`ref`)/ レシピ) | 本パッケージ直下の `API_REFERENCE.md` |
| フィールドごとの説明(ホバーで表示) | 型定義の JSDoc。各フィールドの説明は `@ishibashi0112/spreadsheet-grid-core/dist/model/gridTypes.core.d.ts` にあり、`API_REFERENCE.md` の表と同じ内容 |
| ガイド / デモ / 設計メモ | [GitHub の README](https://github.com/ishibashi0112/datasheet-grid#readme) とリポジトリの `website/` |

### 間違えやすいルール

- **CSS を読み込む。** `style.css` が無いとスタイルが当たらず、スクロール領域も機能しません。
- **状態は controlled。** 編集結果は `onRowsChange` が新しい配列で返します。受け取った配列をそのまま `rows` へ戻してください(`map` 等で作り直すと undo 履歴が消えます)。
- **行キー。** `rowKeyGetter` で安定したキーを返してください(既定は行 index)。
- **`rows` か `dataSource`。** `rows` はクライアントサイド行モデル、`dataSource` を渡すとサーバーサイド行モデルです。両者は排他です。
- **高さ。** ルートの `style.height` ではなく `height` prop で指定します。`%` を含む値(`'100%'`)は**バーを含むグリッド全体**の高さで、親要素に確定高さが必要です。数値は**スクロール領域だけ**の高さです。`height` 未指定時のスクロール領域は `480px`(`maxHeight`)が上限です。
- **命令的 API。** `ref`(React 19 の ref-as-prop。`forwardRef` は不要)で `SpreadsheetGridHandle<T>` を受け取ります。
- **Next.js App Router。** クライアントコンポーネント(`'use client'` のファイル)から描画してください。パッケージ側はディレクティブを付けていません。