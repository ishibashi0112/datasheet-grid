# @ishibashi0112/spreadsheet-grid-solid

A virtualized spreadsheet / data grid for Solid 2.0 (~1M rows, pinned columns, Excel-like editing / selection / clipboard, filters & sorting, client-side and server-side row models). It is the Solid version of [`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid) (React): the same props, column options, imperative handle, CSS and look, built on the same framework-independent core. 日本語は下にあります。

**[Docs & live demo](https://datasheet-grid.vercel.app)** (written for the React version; the props are the same) · [GitHub](https://github.com/ishibashi0112/datasheet-grid) · [Changelog](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)

## Install

```sh
npm install @ishibashi0112/spreadsheet-grid-solid
```

Peer dependencies: `solid-js` / `@solidjs/web` `^2.0.0`. Supported browsers: Chrome / Edge 111+, Firefox 121+, Safari 16.4+. Import the CSS once:

```ts
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
```

The package follows the Solid convention for libraries: the `solid` export condition points at JSX source (`dist/source/`), which your bundler compiles with your own Solid settings (DOM or SSR, dev or prod). With Vite, use `@solidjs/vite-plugin` 3 (Vite 8 or later). SSR (for example SolidStart) needs this form. Tools without the `solid` condition get the DOM build (`dist/index.js`, ESM only). In Node (for example tests with Vitest and jsdom), resolve with the `solid` or `browser` condition, which `@solidjs/vite-plugin` sets: with Node's default conditions `@solidjs/web` resolves to its server build and the DOM build fails with "Client-only API called on the server side".

`style.layer.css` and the design-system themes (`themes/astryx.css` / `themes/mantine.css` / `themes/heroui.css` / `themes/shadcn.css`) are the same files as in the React version ([installation](https://datasheet-grid.vercel.app/docs/installation), [design systems](https://datasheet-grid.vercel.app/docs/guides/design-systems)).

## Quick start

```tsx
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200, editable: true }]

export function App() {
  const [rows, setRows] = createSignal<Row[]>([{ id: 1, name: 'alpha' }])
  return (
    <div style={{ height: '600px' }}>
      <SpreadsheetGrid
        rows={rows()}
        columns={columns}
        onRowsChange={(next) => setRows(next)}
        rowKeyGetter={(row) => row.id}
        height="100%"
      />
    </div>
  )
}
```

A runnable example (an editable inventory table with 10,000 rows) is in [`examples/solid`](https://github.com/ishibashi0112/datasheet-grid/tree/main/examples/solid).

**English UI:** the grid's own texts default to Japanese. Pass `localeText={localeTextEn}` (`import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'`).

## Picking features

`SpreadsheetGrid` includes every feature (about 162KB gzip of initial JS; the column filter popover and the tool panel, about 16KB, load later). `createSpreadsheetGrid` builds a grid with only the features you pass, and the rest is left out of your bundle (about 90KB with no features, about 117KB with the `standardFeatures` preset). Unlike the React version, the parts come from the main entry (there is no `/lite`).

```tsx
import { createSpreadsheetGrid, standardFeatures, serverSideFeature } from '@ishibashi0112/spreadsheet-grid-solid'

// Create it once at module level, not inside a component.
const Grid = createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } })
```

The feature names and what they enable are listed in the React version's `API_REFERENCE.md` (「機能を選んで組み込む」); the part names are the same.

## Differences from the React version

- **`ref` works like Solid's DOM refs.** `let grid!: SpreadsheetGridHandle<Row>` with `ref={grid}`, or `ref={(handle) => (grid = handle)}`, gives you the handle with the same methods (there are no React ref objects).
- **Render functions run only when needed.** `renderCell` runs again when its row, value or column changes, `renderHeader` when its column changes, and the bar renderers when the function changes; not on every update as in React. Positions and states in the context (`rowIndex`, `isActive`, the bar context and so on) are reactive: read them inside JSX and they stay current. Reading them in the function body makes the content re-created whenever they change.
- **Not available:** the natural-language filter (`/ai`, `GridAskBar`).
- Everything else (props, column options, handle methods, callbacks, CSS classes and tokens) is the same as in [`API_REFERENCE.md`](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md) of the React version.

## Rules that are easy to get wrong

- **Import the CSS.** Without `style.css` the grid is unstyled and its scroll area does not work.
- **State is controlled.** Edits come back through `onRowsChange` as a new array; pass that array back to `rows` as-is (re-creating it, e.g. with `map`, clears the undo history).
- **Row keys.** Return a stable key from `rowKeyGetter` (the default is the row index).
- **Height.** Use the `height` prop. A value containing `%` sizes the whole grid including its bars and needs a parent with a definite height; a number sizes the scroll area only. Without `height`, the scroll area is capped at `480px`.
- **Positions are view positions.** `viewRowIndex` / `colIndex` are positions after sorting and filtering. Look them up with `getViewRowIndex(rowKey)` / `getColIndex(columnKey)`.

## Versioning

This package has its own version (0.x), separate from the React version and the core, and depends on the core of exactly one version. Before 1.0, minor releases may include breaking changes; they are listed in the [changelog](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md). TypeScript 5.8 or later is supported (`moduleResolution` `bundler` or `nodenext`, `jsx: "preserve"`, `jsxImportSource: "@solidjs/web"`). A library built on this package that exports inferred types should list this package and the core (the version this package depends on) in `peerDependencies`.

## License

MIT

---

## 日本語

Solid 2.0 向けの仮想化スプレッドシート / データグリッドです(約 100 万行・列固定・Excel ライクな編集 / 選択 / クリップボード・フィルター / ソート・クライアントサイド / サーバーサイド行モデル)。React 版の [`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid) と同じ props・列の定義・命令的なハンドル・CSS・見た目で、同じフレームワークに依らないコアの上に作っています。

**[ドキュメントとライブデモ](https://datasheet-grid.vercel.app)**(React 版向けに書いていますが、props は同じです)· [GitHub](https://github.com/ishibashi0112/datasheet-grid) · [変更履歴](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)

`npm install @ishibashi0112/spreadsheet-grid-solid` で入れます(peer は `solid-js` / `@solidjs/web` の `^2.0.0`)。CSS は `import '@ishibashi0112/spreadsheet-grid-solid/style.css'` を 1 回読み込みます。`style.layer.css` とデザインシステムのテーマ(`themes/*.css`)は React 版と同じファイルです。

パッケージは Solid のライブラリの慣例どおり、`solid` 条件で JSX のままのソース(`dist/source/`)を渡し、利用側のバンドラが自分の Solid の設定(DOM / SSR・開発 / 本番)でコンパイルします。Vite では `@solidjs/vite-plugin` 3(Vite 8 以上)を使ってください。SSR(SolidStart など)はこの形が要ります。`solid` 条件の無いツールは DOM 向けにコンパイル済みの `dist/index.js`(ESM だけ)を読みます。Node の中(Vitest と jsdom のテストなど)では `solid` か `browser` の条件で解決してください(`@solidjs/vite-plugin` が付けます)。Node の既定の条件では `@solidjs/web` がサーバー向けのビルドになり、DOM 向けのビルドは「Client-only API called on the server side」で止まります。

使い方は上の Quick start のとおりです(`rows={rows()}` のように signal を呼んで渡し、編集は `onRowsChange` で受け取って signal へ戻す)。ブラウザで動かせるサンプル(編集できる在庫表 10,000 行)は [`examples/solid`](https://github.com/ishibashi0112/datasheet-grid/tree/main/examples/solid) にあります。英語の文言は `@ishibashi0112/spreadsheet-grid-solid/locales/en` の `localeTextEn` を `localeText` に渡します。

対応ブラウザは Chrome / Edge 111 以降、Firefox 121 以降、Safari 16.4 以降です。

### 機能を選んで組み込む

`SpreadsheetGrid` は全機能入りです(初期読み込みの JS が約 162KB gzip。列フィルターのポップオーバーとツールパネルの約 16KB は後から読みます)。`createSpreadsheetGrid` では渡した機能だけを入れたグリッドを作れ、渡さなかった機能はバンドルに入りません(機能なしで約 90KB、プリセット `standardFeatures` で約 117KB)。React 版と違い、機能の部品も同じ入口から import します(`/lite` はありません)。機能の名前と中身は React 版の `API_REFERENCE.md` の「機能を選んで組み込む」のとおりです(部品の名前も同じ)。グリッドはコンポーネントの中ではなく、モジュールの先頭で 1 回だけ作ってください。

### React 版との違い

- **`ref` は Solid の DOM の ref と同じです。** `let grid!: SpreadsheetGridHandle<Row>` と `ref={grid}`、または `ref={(handle) => (grid = handle)}` で、同じメソッドを持つハンドルを受け取れます(React の ref オブジェクトはありません)。
- **描く関数は必要なときだけ呼びます。** `renderCell` は行・値・列が変わったとき、`renderHeader` は列が変わったとき、バーの関数は関数が変わったときだけ呼び直します(React 版のように更新のたびには呼びません)。文脈の位置と状態(`rowIndex` / `isActive` / バーの文脈など)は読んだときに引くので、JSX の中で読めば追従します。関数の本体で読むと、それが変わるたびに中身を作り直します。
- **ありません:** ことばで絞り込み(`/ai` の `GridAskBar`)。
- そのほか(props・列の定義・ハンドルのメソッド・通知・CSS のクラスとトークン)は React 版の [`API_REFERENCE.md`](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md) と同じです。

### 間違えやすいルール

- **CSS を読み込む。** `style.css` が無いとスタイルが当たらず、スクロール領域も機能しません。
- **状態は controlled。** 編集結果は `onRowsChange` が新しい配列で返します。受け取った配列をそのまま `rows` へ戻してください(`map` 等で作り直すと undo 履歴が消えます)。
- **行キー。** `rowKeyGetter` で安定したキーを返してください(既定は行 index)。
- **高さ。** `height` prop で指定します。`%` を含む値はバーを含むグリッド全体の高さで、親要素に確定高さが必要です。数値はスクロール領域だけの高さです。`height` 未指定時のスクロール領域は `480px` が上限です。
- **位置は表示の位置。** `viewRowIndex` / `colIndex` は並べ替え・絞り込みの後の表示の位置です。`getViewRowIndex(rowKey)` / `getColIndex(columnKey)` で引いてください。

### バージョンの方針

このパッケージは React 版・コアとは別の版(0.x)で、コアには同じ 1 つの版で依存します。1.0 より前は minor でも壊す変更が入ることがあり、[変更履歴](https://github.com/ishibashi0112/datasheet-grid/blob/main/CHANGELOG.md)に書きます。TypeScript は 5.8 以上(`moduleResolution` は `bundler` / `nodenext`、`jsx: "preserve"`・`jsxImportSource: "@solidjs/web"`)です。このパッケージの上に作ったライブラリが推論した型を export するときは、このパッケージと core(このパッケージが依存する版)を `peerDependencies` に入れてください。

## License

MIT