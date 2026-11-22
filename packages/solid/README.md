# @ishibashi0112/spreadsheet-grid-solid

A virtualized spreadsheet / data grid for Solid 2.0 (~1M rows, pinned columns, Excel-like editing / selection / clipboard, filters & sorting, client-side and server-side row models). It is the Solid version of [`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid) (React): the same props, column options, imperative handle, CSS and look, built on the same framework-independent core. 日本語は下にあります。

**[Docs & live demo](https://datasheet-grid.vercel.app)** (written for the React version; the props are the same. Solid notes, in Japanese: [Solid で使う](https://datasheet-grid.vercel.app/docs/solid)) · [Try on StackBlitz](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/solid?file=src/App.tsx&terminal=dev) · [GitHub](https://github.com/ishibashi0112/datasheet-grid) · [Changelog](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/solid/CHANGELOG.md)

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

- **`ref` works like Solid's DOM refs.** `let grid!: SpreadsheetGridHandle<Row>` with `ref={grid}`, or `ref={(handle) => (grid = handle)}`, gives you the handle with the same methods (there are no React ref objects). The handle is set before your component's first `createEffect` and `onSettled` run, so you can call it there (for example to restore a saved state or scroll to the bottom).
- **Render functions run only when needed.** `renderCell` runs again when its row, value or column changes, `renderHeader` when its column changes, and the bar renderers when the function changes; not on every update as in React. Positions and states in the context (`rowIndex`, `isActive`, the bar context and so on) are reactive: read them inside JSX and they stay current. Reading them in the function body makes the content re-created whenever they change.
- **Not available:** the natural-language filter (`/ai`, `GridAskBar`).
- Everything else (props, column options, handle methods, callbacks, CSS classes and tokens) is the same as in [`API_REFERENCE.md`](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md) of the React version.

## Solid-specific notes

- **Keep `rows` in a signal.** `onRowsChange` returns a new array on every edit (the same contract as the React version). The rows are replaced as a whole, so, following Solid's own split (a signal for values replaced as a whole, a store for nested data updated piece by piece), keep them in a signal and put the array back with `setRows(next)`. In this version, with `createStore` the rows that come back are a store proxy instead of the array the grid returned, so the undo / redo history is cleared, and Solid prints many development diagnostics (the grid warns once in development when `rows` is a store).
- **Writes apply in a microtask.** After `setRows(...)`, the grid sees the new rows on the next flush. To use a row you just added right away (`getViewRowIndex(key)` then `startEditing(...)`), call `flush()` from `solid-js` first (the React docs use `flushSync` for the same thing). In tests, call `flush()` after changing a signal or firing an event, before looking at the DOM.
- **Tests (Vitest + jsdom).** Add `@solidjs/vite-plugin` to the Vitest config. Without the plugin, put `browser` in `resolve.conditions`, `ssr.resolve.conditions` and `ssr.resolve.externalConditions` (all three). Use the Solid 2 version of `@solidjs/testing-library` (1.0 release candidates) and `installJsdomLayoutStubs` from `@ishibashi0112/spreadsheet-grid-solid/testing` (jsdom has no layout).
- **SSR.** SolidStart supports only Solid 1 at the time of writing. With Solid 2, use Vite's SSR with `@solidjs/vite-plugin` (`ssr: true`), `renderToString` or `renderToStream` with `generateHydrationScript` on the server, and `hydrate` on the client (`@solidjs/router` 2 also needs `createRequestEvent` / `provideRequestEvent` from `@solidjs/web/storage`). The server renders only the grid's frame (headers, pinned columns, placeholders); rows are drawn after hydration, as in the React version.
- **Saving the state in the URL.** Pass the saved state as `initialState` on the first render, save it from `onStateChange`, and apply later changes (back / forward) with `grid.applyState(...)`. Reading signals inside the grid's callbacks is fine; they run outside tracking, like event handlers.
- **Detail rows.** `detailRow.render` runs once when a row opens; it is not called again when the row changes, and `ctx.row` is the current row. Read `ctx.row` inside JSX to follow edits and undo. A field initialized with `createSignal(() => ctx.row.x)` is reset whenever the row changes, so keep unsaved input in a plain signal.
- **Sharing props between grids.** Spread a stable object, or write the props out. Spreading an object that is re-created on every change (`{...gridProps()}`) works, but in development Solid reports `HUGE_FAN_OUT`.
- **Development diagnostics.** In `vite dev`, Solid may print `EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE` naming effects such as `autoHeightMeasurer`, `activeRowFollow`, `edit`, `serverSideRowModel` or `fillHandle`. They come from the grid re-aligning its state after a change (the React version re-renders the same way), are harmless, and do not appear in production builds.

## Rules that are easy to get wrong

- **Import the CSS.** Without `style.css` the grid is unstyled and its scroll area does not work.
- **State is controlled.** Edits come back through `onRowsChange` as a new array; pass that array back to `rows` as-is (re-creating it, e.g. with `map`, clears the undo history).
- **Row keys.** Return a stable key from `rowKeyGetter` (the default is the row index).
- **Height.** Use the `height` prop. A value containing `%` sizes the whole grid including its bars and needs a parent with a definite height; a number sizes the scroll area only. Without `height`, the scroll area is capped at `480px`.
- **Positions are view positions.** `viewRowIndex` / `colIndex` are positions after sorting and filtering. Look them up with `getViewRowIndex(rowKey)` / `getColIndex(columnKey)`.

## Versioning

This package has its own version (0.x), separate from the React version and the core, and depends on the core of exactly one version. Before 1.0, minor releases may include breaking changes; they are listed in the [changelog](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/solid/CHANGELOG.md). TypeScript 5.8 or later is supported (`moduleResolution` `bundler` or `nodenext`, `jsx: "preserve"`, `jsxImportSource: "@solidjs/web"`). A library built on this package that exports inferred types should list this package and the core (the version this package depends on) in `peerDependencies`.

## License

MIT

---

## 日本語

Solid 2.0 向けの仮想化スプレッドシート / データグリッドです(約 100 万行・列固定・Excel ライクな編集 / 選択 / クリップボード・フィルター / ソート・クライアントサイド / サーバーサイド行モデル)。React 版の [`@ishibashi0112/spreadsheet-grid`](https://www.npmjs.com/package/@ishibashi0112/spreadsheet-grid) と同じ props・列の定義・命令的なハンドル・CSS・見た目で、同じフレームワークに依らないコアの上に作っています。

**[ドキュメントとライブデモ](https://datasheet-grid.vercel.app)**(React 版向けに書いていますが、props は同じです。Solid 版だけのことは [Solid で使う](https://datasheet-grid.vercel.app/docs/solid))· [StackBlitz で試す](https://stackblitz.com/fork/github/ishibashi0112/datasheet-grid/tree/main/examples/solid?file=src/App.tsx&terminal=dev) · [GitHub](https://github.com/ishibashi0112/datasheet-grid) · [変更履歴](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/solid/CHANGELOG.md)

`npm install @ishibashi0112/spreadsheet-grid-solid` で入れます(peer は `solid-js` / `@solidjs/web` の `^2.0.0`)。CSS は `import '@ishibashi0112/spreadsheet-grid-solid/style.css'` を 1 回読み込みます。`style.layer.css` とデザインシステムのテーマ(`themes/*.css`)は React 版と同じファイルです。

パッケージは Solid のライブラリの慣例どおり、`solid` 条件で JSX のままのソース(`dist/source/`)を渡し、利用側のバンドラが自分の Solid の設定(DOM / SSR・開発 / 本番)でコンパイルします。Vite では `@solidjs/vite-plugin` 3(Vite 8 以上)を使ってください。SSR(SolidStart など)はこの形が要ります。`solid` 条件の無いツールは DOM 向けにコンパイル済みの `dist/index.js`(ESM だけ)を読みます。Node の中(Vitest と jsdom のテストなど)では `solid` か `browser` の条件で解決してください(`@solidjs/vite-plugin` が付けます)。Node の既定の条件では `@solidjs/web` がサーバー向けのビルドになり、DOM 向けのビルドは「Client-only API called on the server side」で止まります。

使い方は上の Quick start のとおりです(`rows={rows()}` のように signal を呼んで渡し、編集は `onRowsChange` で受け取って signal へ戻す)。ブラウザで動かせるサンプル(編集できる在庫表 10,000 行)は [`examples/solid`](https://github.com/ishibashi0112/datasheet-grid/tree/main/examples/solid) にあります。英語の文言は `@ishibashi0112/spreadsheet-grid-solid/locales/en` の `localeTextEn` を `localeText` に渡します。

対応ブラウザは Chrome / Edge 111 以降、Firefox 121 以降、Safari 16.4 以降です。

### 機能を選んで組み込む

`SpreadsheetGrid` は全機能入りです(初期読み込みの JS が約 162KB gzip。列フィルターのポップオーバーとツールパネルの約 16KB は後から読みます)。`createSpreadsheetGrid` では渡した機能だけを入れたグリッドを作れ、渡さなかった機能はバンドルに入りません(機能なしで約 90KB、プリセット `standardFeatures` で約 117KB)。React 版と違い、機能の部品も同じ入口から import します(`/lite` はありません)。機能の名前と中身は React 版の `API_REFERENCE.md` の「機能を選んで組み込む」のとおりです(部品の名前も同じ)。グリッドはコンポーネントの中ではなく、モジュールの先頭で 1 回だけ作ってください。

### React 版との違い

- **`ref` は Solid の DOM の ref と同じです。** `let grid!: SpreadsheetGridHandle<Row>` と `ref={grid}`、または `ref={(handle) => (grid = handle)}` で、同じメソッドを持つハンドルを受け取れます(React の ref オブジェクトはありません)。ハンドルは利用側の部品の最初の `createEffect` と `onSettled` より前に入るので、そこで呼べます(保存した状態を戻す、末尾へスクロールする など)。
- **描く関数は必要なときだけ呼びます。** `renderCell` は行・値・列が変わったとき、`renderHeader` は列が変わったとき、バーの関数は関数が変わったときに呼び直します(React 版のように更新のたびには呼びません)。文脈の位置と状態(`rowIndex` / `isActive` / バーの文脈など)は読んだときに引くので、JSX の中で読めばその場で追従します。関数の本体で読むと(引数の分割代入も)、それが変わるたびに中身を作り直します(バーの入力欄なら、フォーカスと打ちかけの文字が消えます。変わる値は JSX の中で読んでください)。
- **ありません:** ことばで絞り込み(`/ai` の `GridAskBar`)。
- そのほか(props・列の定義・ハンドルのメソッド・通知・CSS のクラスとトークン)は React 版の [`API_REFERENCE.md`](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md) と同じです。

### Solid で気をつけること

- **`rows` は signal で持つ。** `onRowsChange` は編集のたびに新しい配列を返します(React 版と同じ約束)。行は配列ごと差し替わるので、Solid の使い分け(丸ごと差し替える値は signal、中を少しずつ書き換える入れ子のデータは store)どおり signal で持ち、`setRows(next)` で戻してください。今の版では `createStore` に入れると、戻ってくる rows がグリッドの返した配列ではなく store のプロキシになるので、元に戻す / やり直しの履歴が消え、開発時に Solid の知らせが多く出ます(`rows` が store のときは開発時に 1 回警告します)。
- **書き込みはマイクロタスクで反映されます。** `setRows(...)` の後、グリッドが新しい行を見るのは次の反映のときです。足したばかりの行をすぐ使う(`getViewRowIndex(key)` → `startEditing(...)`)ときは、先に `solid-js` の `flush()` を呼んでください(React 版のドキュメントの `flushSync` と同じ)。テストでも、signal を変えた・イベントを送った後に DOM を見る前に `flush()` を呼びます。
- **テスト(Vitest + jsdom)。** Vitest の設定に `@solidjs/vite-plugin` を入れてください。プラグイン無しなら `browser` を `resolve.conditions` / `ssr.resolve.conditions` / `ssr.resolve.externalConditions` の 3 か所すべてに書きます。`@solidjs/testing-library` は Solid 2 向けの版(1.0 の候補版)を使い、jsdom にはレイアウトが無いので `@ishibashi0112/spreadsheet-grid-solid/testing` の `installJsdomLayoutStubs` を呼びます。
- **SSR。** 今の SolidStart は Solid 1 だけに対応しています。Solid 2 では Vite の SSR と `@solidjs/vite-plugin`(`ssr: true`)で、サーバーは `renderToString` か `renderToStream` と `generateHydrationScript`、クライアントは `hydrate` を使います(`@solidjs/router` 2 は `@solidjs/web/storage` の `createRequestEvent` / `provideRequestEvent` も要ります)。サーバーで描くのはグリッドの骨組み(見出し・固定列・読み込み中の印)だけで、行はハイドレーションの後に描きます(React 版と同じ)。
- **状態を URL に残す。** 保存した状態は最初の描画で `initialState` に渡し、`onStateChange` で保存し、後からの変化(戻る / 進む)は `grid.applyState(...)` で入れます。グリッドの通知の中で signal を読んでかまいません(イベントのハンドラと同じく追跡の外で呼びます)。
- **展開行。** `detailRow.render` は行を開いたときに 1 回呼び、行が変わっても呼び直しません(`ctx.row` が今の行)。編集や元に戻すに追従するには JSX の中で `ctx.row` を読んでください。`createSignal(() => ctx.row.x)` で持った入力欄の値は行が変わるたびに戻るので、保存前の入力はふつうの signal で持ちます。
- **複数のグリッドで props を共有する。** 変わらないオブジェクトを spread するか、props を書き並べてください。変化のたびに作り直すオブジェクトを spread しても(`{...gridProps()}`)動きますが、開発時に Solid が `HUGE_FAN_OUT` を出します。
- **開発時の Solid の知らせ。** `vite dev` では、Solid が `autoHeightMeasurer` / `activeRowFollow` / `edit` / `serverSideRowModel` / `fillHandle` などの effect の名前で `EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE` を出すことがあります。変化の後にグリッドが状態を合わせ直す処理(React 版も同じ描き直しをしている)で、害は無く、本番のビルドでは出ません。

### 間違えやすいルール

- **CSS を読み込む。** `style.css` が無いとスタイルが当たらず、スクロール領域も機能しません。
- **状態は controlled。** 編集結果は `onRowsChange` が新しい配列で返します。受け取った配列をそのまま `rows` へ戻してください(`map` 等で作り直すと undo 履歴が消えます)。
- **行キー。** `rowKeyGetter` で安定したキーを返してください(既定は行 index)。
- **高さ。** `height` prop で指定します。`%` を含む値はバーを含むグリッド全体の高さで、親要素に確定高さが必要です。数値はスクロール領域だけの高さです。`height` 未指定時のスクロール領域は `480px` が上限です。
- **位置は表示の位置。** `viewRowIndex` / `colIndex` は並べ替え・絞り込みの後の表示の位置です。`getViewRowIndex(rowKey)` / `getColIndex(columnKey)` で引いてください。

### バージョンの方針

このパッケージは React 版・コアとは別の版(0.x)で、コアには同じ 1 つの版で依存します。1.0 より前は minor でも壊す変更が入ることがあり、[変更履歴](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/solid/CHANGELOG.md)に書きます。TypeScript は 5.8 以上(`moduleResolution` は `bundler` / `nodenext`、`jsx: "preserve"`・`jsxImportSource: "@solidjs/web"`)です。このパッケージの上に作ったライブラリが推論した型を export するときは、このパッケージと core(このパッケージが依存する版)を `peerDependencies` に入れてください。

## License

MIT