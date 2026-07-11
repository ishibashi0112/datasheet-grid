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
- Auto-fit column widths to content on data load — `autoSizeColumns="onMount"` (once, on first data) or `"onDataChange"` (every time `rows` changes, e.g. after a form submit). Same engine as the column menu's "Autosize All Columns"; opt individual columns out with `suppressAutoSize`.
- Full-text tooltip on truncated cells — `showCellOverflowTooltip` shows the full value on hover, but only when the cell is actually clipped (…).
- Japanese-aware line wrapping — per-column `wordBreak` / `lineBreak`, including `wordBreak: 'auto-phrase'` for phrase-based breaks on Chromium (BudouX). Cross-browser BudouX recipe in the API reference.
- External height control via `height` / `maxHeight` (e.g. `height="100%"` to follow the parent's height).
- Both **client-side** (`rows`) and **server-side** (`dataSource`, SSRM) row models.
- Themeable with CSS custom properties (`--ssg-*`, defined at zero specificity so your overrides always win). Base styles are plain unlayered CSS with single-class specificity, so they survive CSS resets such as Tailwind Preflight; a cascade-layers variant (`style.layer.css`) is also shipped. `className` / `classNames` slots are provided.
- Styled tooltips out of the box — action hints and truncated-text previews use a custom dark-chip tooltip (no browser-default `title` look). Add `data-ssg-tooltip="text"` to your own elements (custom cells, headers) to get the same tooltip; colors are themeable via `--ssg-tooltip-*` tokens.
- Built-in dark theme — `theme="light" | "dark" | "auto"` switches the grid, every popover / panel / menu, the drag ghost and tooltips through a single token preset. `"auto"` follows `prefers-color-scheme`; with class-based dark frameworks (Mantine / HeroUI / Tailwind) pass your resolved color scheme instead.
- Toggle the top / bottom bars and their parts via props — whole bars (`showTopBar` / `showBottomBar`), the default top bar's summary chips and global-filter input, and the Rows/Columns counts in each bar.
- Filter management panel — review every active column filter in one place (jump to the column & edit, clear one / all, add new), opened from the column menu, the default top bar's clickable Filters chip, or `openFilterManager()` on the imperative handle. An optional filter chip bar (`showFilterChipBar`) keeps active filters visible right below the top bar.
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

The base styles are plain (unlayered) CSS scoped to `.ssg-*` classes, and all design tokens are defined at zero specificity (`:where(.ssg-root)`), so your token overrides always win regardless of import order.

### Using with Tailwind CSS / HeroUI / Mantine

- **Tailwind CSS v3 (and HeroUI on v3)** — works out of the box. Preflight cannot break the grid: its element/universal resets lose to the grid's class selectors by specificity.
- **Tailwind CSS v4 (and HeroUI on v4)** — works out of the box. If you additionally want Tailwind utilities to override grid defaults without the `!` modifier, put the grid CSS into a cascade layer below `utilities`:

  ```css
  @import 'tailwindcss';
  @import '@ishibashi0112/spreadsheet-grid/style.css' layer(components);
  ```

  Alternatively, use the pre-layered variant `style.layer.css` (everything wrapped in `@layer ssg-base`) and declare the layer order yourself:

  ```css
  @layer theme, base, ssg-base, components, utilities;
  @import 'tailwindcss';
  @import '@ishibashi0112/spreadsheet-grid/style.layer.css';
  ```

- **Mantine** — works out of the box (no class-name or reset conflicts; grid popovers use `z-index: 1000`, above Mantine's default modal z-index).

To override a grid default reliably in plain CSS, chain your class with the grid's base class so it wins by specificity, independent of import order:

```css
.ssg-body-cell.my-warn-cell {
  background-color: #fff7ed;
}
```

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

### Auto-height rows

Variable row height needs **two switches, both required**: the grid prop `autoHeight` (the master switch, default `false`) **and** at least one column with `autoHeight: true` (that column wraps and drives the row height). A cell grows only when `grid autoHeight && column.autoHeight` are both true. Auto-height is active only up to **50,000 rows**; beyond that it falls back to uniform `rowHeight`. `estimateRowHeight` is the placeholder for off-screen (not-yet-measured) rows — not a cap. See [`API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md) for details.

```tsx
<SpreadsheetGrid
  rows={rows}
  columns={[{ key: 'note', title: 'Note', width: 320, autoHeight: true }]}
  autoHeight   // master switch — without it, the column's autoHeight is ignored
/>
```

### Auto-sizing columns

Set `autoSizeColumns` to fit column widths to their content when data arrives — no imperative calls or effects needed on your side:

```tsx
// Refit every time a new result set replaces `rows` (e.g. after a form submit).
<SpreadsheetGrid rows={rows} columns={columns} autoSizeColumns="onDataChange" />
```

`'onMount'` fits once on first data; `'onDataChange'` refits whenever the `rows` reference changes; `false` (default) does nothing. It reuses the same measurement as the column menu's "Autosize All Columns", so per-column opt-outs apply: columns with `suppressAutoSize: true` (and `autoHeight: true` columns) keep their `width`. The trigger only reacts to `rows` — filtering, sorting and column reordering do **not** refit — and it writes to internal widths without calling `onColumnsChange`, so it coexists with controlled `columns`. Server-side (`dataSource`) is not supported. See [`API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md) for details.

### Density

Set `density` to switch the overall sizing with one prop — `'compact' | 'standard' | 'comfortable'` (default `'standard'`, identical to previous versions):

```tsx
<SpreadsheetGrid rows={rows} columns={columns} density="compact" />
```

The preset drives the default `rowHeight` / `headerHeight` (compact: 28/32, standard: 36/40, comfortable: 44/48 — explicit props always win) and switches sizing tokens (cell horizontal padding, bar padding, icon-button size, relative cell font scale) via a root modifier class. Individual tokens (e.g. `--ssg-cell-pad-x`) can still be overridden for fine-tuning. Popovers/menus are not affected.

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

- Use the `classNames` prop for per-part class slots, `cellClassName` per column, and `getRowClassName` per row. Token overrides always apply (tokens are defined at zero specificity). For property overrides, chain with the base class (e.g. `.ssg-body-cell.my-class`) to win regardless of import order — see the Styles section above.

### Dark theme

Pass `theme` to switch the whole surface — the grid itself, every popover / panel / menu (they are portalled to `document.body` and carry the theme class themselves), the column drag ghost and tooltips:

```tsx
<SpreadsheetGrid theme="dark" columns={columns} rows={rows} />
```

- `"light"` (default) / `"dark"` — explicit. `"auto"` follows the OS / browser `prefers-color-scheme` and updates live.
- `color-scheme` is set accordingly, so native scrollbars and `<select>` controls follow the theme too.
- The dark preset only redefines color tokens (`.ssg-theme-dark`); sizing tokens (radius, paddings) are theme-independent.

**With Mantine / HeroUI / Tailwind (class-based dark):** the page's actual theme may not match `prefers-color-scheme`, so pass your resolved color scheme instead of `"auto"`:

```tsx
// Mantine
import { useComputedColorScheme } from '@mantine/core';
const colorScheme = useComputedColorScheme('light'); // 'light' | 'dark'
<SpreadsheetGrid theme={colorScheme} ... />

// HeroUI / Tailwind (next-themes)
import { useTheme } from 'next-themes';
const { resolvedTheme } = useTheme();
<SpreadsheetGrid theme={resolvedTheme === 'dark' ? 'dark' : 'light'} ... />
```

**Customizing dark colors:** override tokens under `.ssg-theme-dark` — the class is present on the grid root and on every portal root, so one rule covers all surfaces:

```css
.ssg-theme-dark {
  --ssg-cell-bg: #0d0d0f;
  --ssg-panel-bg: #1b1c20;
}
```

Note: a plain `.ssg-root { --ssg-* }` override wins over **both** themes (theme presets are defined at zero specificity). To target light only, scope it with `.ssg-root:not(.ssg-theme-dark)`.

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
- データ投入時に列幅を内容へ自動フィット — `autoSizeColumns="onMount"`（初回にデータが載った一度きり）/ `"onDataChange"`（`rows` が変わるたび。フォーム送信結果の差し替え等）。列メニュー「すべての列の幅を自動調整」と同一エンジンで、列個別の除外は `suppressAutoSize`。
- 省略（…）セルの全文ツールチップ — `showCellOverflowTooltip` でホバー時に全文表示（実際にクリップされているセルのみ）。
- 日本語対応の折り返し — 列ごとの `wordBreak` / `lineBreak`。`wordBreak: 'auto-phrase'` で Chromium（Chrome / Edge）の文節折り返し（BudouX）。クロスブラウザの BudouX レシピは API リファレンス参照。
- `height` / `maxHeight` によるスクロールコンテナ高さの外部制御（`height="100%"` で親要素の高さに追従）。
- **クライアントサイド**（`rows`）と**サーバーサイド**（`dataSource`、SSRM）の両行モデル。
- CSS カスタムプロパティ（`--ssg-*`。特異度 0 で定義され、利用側の上書きが常に勝ちます）によるテーマ設定。基底スタイルは未レイヤーの単一クラス特異度で、Tailwind Preflight などの CSS リセットに壊されません。カスケードレイヤー版（`style.layer.css`）も同梱。`className` / `classNames` スロットも用意。
- スタイル付きツールチップを標準装備 — 操作ヒントや切り詰めテキストの全文表示は、ブラウザ標準の `title` ではなくダークチップのカスタムツールチップで表示。利用側の要素(カスタムセルやヘッダー)にも `data-ssg-tooltip="文言"` を付けるだけで同じ見た目になります。配色は `--ssg-tooltip-*` トークンで調整可。
- ダークテーマを標準装備 — `theme="light" | "dark" | "auto"` で、グリッド本体・全ポップオーバー / パネル / メニュー・ドラッグゴースト・ツールチップをトークンプリセット 1 つで一括切替。`"auto"` は `prefers-color-scheme` に追従(Mantine / HeroUI / Tailwind のクラスベース dark 運用では、解決済みのカラースキームを渡す使い方を推奨)。
- トップ / ボトムバーとその構成要素（バー全体〔`showTopBar` / `showBottomBar`〕、既定トップバーの summary chips・グローバルフィルター入力、各バーの Rows/Columns 件数）を props で表示制御。
- フィルター管理パネル — 適用中の列フィルターを 1 箇所で確認・操作（該当列へジャンプして編集 / 個別・全クリア / 追加）。列メニュー、既定トップバーの Filters chip クリック、ハンドルの `openFilterManager()` から開けます。トップバー直下に常時表示するフィルターチップバー（`showFilterChipBar`）もオプションで利用可。
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

基底スタイルは `.ssg-*` クラスにスコープした未レイヤーの素の CSS で、デザイントークンはすべて特異度 0（`:where(.ssg-root)`）で定義されています。トークンの上書きは読み込み順に依らず必ず勝ちます。

#### Tailwind CSS / HeroUI / Mantine との共存

- **Tailwind CSS v3（HeroUI の v3 世代）** — そのままで動作します。preflight（要素 / `*` セレクタのリセット）は本グリッドのクラスセレクタに特異度で負けるため、グリッドを壊せません。
- **Tailwind CSS v4（HeroUI の v4 世代）** — そのままで動作します。さらに Tailwind ユーティリティで `!` 修飾子なしにグリッド既定を上書きしたい場合は、グリッド CSS を `utilities` より下のレイヤーへ入れてください:

  ```css
  @import 'tailwindcss';
  @import '@ishibashi0112/spreadsheet-grid/style.css' layer(components);
  ```

  もしくは全体を `@layer ssg-base` に包んだ `style.layer.css` を使い、レイヤー順を自分で宣言します:

  ```css
  @layer theme, base, ssg-base, components, utilities;
  @import 'tailwindcss';
  @import '@ishibashi0112/spreadsheet-grid/style.layer.css';
  ```

- **Mantine** — そのままで動作します（クラス名・リセットの衝突なし。グリッドの popover は `z-index: 1000` で Mantine の既定モーダルより前面）。

素の CSS でグリッド既定を確実に上書きするには、基底クラスと連結して特異度で勝たせてください（読み込み順に依存しません）:

```css
.ssg-body-cell.my-warn-cell {
  background-color: #fff7ed;
}
```

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

#### 可変行高（auto-height）

行高を可変にするには**2つのスイッチが両方必要**です。グリッド props の `autoHeight`（大本のスイッチ・既定 `false`）と、**少なくとも1列に `column.autoHeight: true`**（その列が折り返して行高を駆動）。セルが可変になるのは「グリッド `autoHeight` && 列 `autoHeight`」が両方 true のときだけです。有効なのは **50,000 行以内**で、超えると uniform 行高（`rowHeight`）へフォールバックします。`estimateRowHeight` は画面外（未測定）行の推定値で、上限ではありません。詳細は [`API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md)。

```tsx
<SpreadsheetGrid
  rows={rows}
  columns={[{ key: 'note', title: '備考', width: 320, autoHeight: true }]}
  autoHeight   // 大本のスイッチ（これが無いと列側 autoHeight は無視される）
/>
```

#### 列幅の自動調整（autoSizeColumns）

`autoSizeColumns` を渡すと、データ投入時に列幅を内容へ自動フィットします（利用側でトークンや effect は不要）:

```tsx
// フォーム送信結果などで rows を丸ごと差し替えるたびに合わせ直す。
<SpreadsheetGrid rows={rows} columns={columns} autoSizeColumns="onDataChange" />
```

`'onMount'` は初回にデータが載った一度きり、`'onDataChange'` は `rows`（参照）が変わるたび、`false`（既定）は無効です。計測は列メニュー「すべての列の幅を自動調整」と同一エンジンのため、列個別の除外がそのまま効きます — `suppressAutoSize: true` の列（および `autoHeight: true` の列）は `width` を維持します。発火 signal は `rows` のみで、フィルター / ソート / 列並べ替えでは**再フィットしません**。フィット幅は内部の列幅 state に反映され `onColumnsChange` を呼ばないため、controlled な `columns` とも競合しません。serverSide（`dataSource`）では無効です。詳細は [`API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md)。

#### 密度（density）

`density` プロップ 1 つで全体のサイズ感を切り替えられます — `'compact' | 'standard' | 'comfortable'`（既定 `'standard'` = 従来と同値）:

```tsx
<SpreadsheetGrid rows={rows} columns={columns} density="compact" />
```

プリセットは `rowHeight` / `headerHeight` の既定値（compact: 28/32・standard: 36/40・comfortable: 44/48。明示 prop が常に優先）と、寸法トークン（セル横 padding・バー padding・アイコンボタン寸法・セル文字の相対拡縮）を root 修飾子経由で一括切替します。個別の微調整はトークン（例: `--ssg-cell-pad-x`）の上書きで可能です。popover / メニューは対象外です。

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

- パーツ別の class は `classNames` prop、列単位は `cellClassName`、行単位は `getRowClassName` で付与できます。トークン上書きは常に効きます（特異度 0 で定義）。プロパティ上書きは基底クラスとの連結（例: `.ssg-body-cell.my-class`）で読み込み順に依らず確実になります — 上記「スタイル」参照。

#### ダークテーマ

`theme` を渡すだけで全サーフェス — グリッド本体・全ポップオーバー / パネル / メニュー(`document.body` 直下のポータルですが、自身がテーマクラスを保持します)・列ドラッグゴースト・ツールチップ — が一括で切り替わります:

```tsx
<SpreadsheetGrid theme="dark" columns={columns} rows={rows} />
```

- `"light"`(既定)/ `"dark"` は明示指定。`"auto"` は OS / ブラウザの `prefers-color-scheme` に追従し、設定変更にもライブで反応します。
- `color-scheme` も併せて切り替わるため、ネイティブのスクロールバーや `<select>` もテーマに揃います。
- ダークプリセットが上書きするのは色トークンのみ(`.ssg-theme-dark`)。寸法トークン(radius / padding 等)はテーマ非依存です。

**Mantine / HeroUI / Tailwind(クラスベース dark)との連動:** ページの実テーマと `prefers-color-scheme` は一致しないことがあるため、`"auto"` ではなく利用側カラースキームの解決値を渡してください:

```tsx
// Mantine
import { useComputedColorScheme } from '@mantine/core';
const colorScheme = useComputedColorScheme('light'); // 'light' | 'dark'
<SpreadsheetGrid theme={colorScheme} ... />

// HeroUI / Tailwind(next-themes)
import { useTheme } from 'next-themes';
const { resolvedTheme } = useTheme();
<SpreadsheetGrid theme={resolvedTheme === 'dark' ? 'dark' : 'light'} ... />
```

**ダーク時の色調整:** `.ssg-theme-dark` 配下でトークンを上書きします。このクラスはグリッド root と全ポータル root に付与されるため、1 ルールで全サーフェスに効きます:

```css
.ssg-theme-dark {
  --ssg-cell-bg: #0d0d0f;
  --ssg-panel-bg: #1b1c20;
}
```

注意: 素の `.ssg-root { --ssg-* }` 上書きは**両テーマ**に勝ちます(テーマプリセットは特異度 0 で定義)。ライトのみを対象にしたい場合は `.ssg-root:not(.ssg-theme-dark)` でスコープしてください。

### API リファレンス

prop と型の完全なリファレンスは [`src/components/spreadsheet-grid/API_REFERENCE.md`](./src/components/spreadsheet-grid/API_REFERENCE.md) にあります。

### ライセンス

[MIT](./LICENSE) © 2026 Yuki Sakakibara