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

The package follows the Solid convention for libraries: the `solid` export condition points at JSX source (`dist/source/`), which your bundler compiles with your own Solid settings (DOM or SSR, dev or prod). With Vite, use `@solidjs/vite-plugin` 3 (Vite 8 or later). SSR needs this form. Tools without the `solid` condition get the DOM build (`dist/index.js`, ESM only). In Node (for example tests with Vitest and jsdom), resolve with the `solid` or `browser` condition, which `@solidjs/vite-plugin` sets: with Node's default conditions `@solidjs/web` resolves to its server build and the DOM build fails with "Client-only API called on the server side".

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

`SpreadsheetGrid` includes every feature (about 166KB gzip of initial JS; the column filter popover and the tool panel, about 16KB, load later). `createSpreadsheetGrid` builds a grid with only the features you pass, and the rest is left out of your bundle (about 94KB with no features, about 121KB with the `standardFeatures` preset). Unlike the React version, the parts come from the main entry (there is no `/lite`).

```tsx
import { createSpreadsheetGrid, standardFeatures, serverSideFeature } from '@ishibashi0112/spreadsheet-grid-solid'

// Create it once at module level, not inside a component.
const Grid = createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } })
```

The feature names and what they enable are listed in the bundled `API_REFERENCE.md` (「機能を選んで組み込む」); the part names are the same as in the React version.

## Differences from the React version

- **`ref` works like Solid's DOM refs.** `let grid!: SpreadsheetGridHandle<Row>` with `ref={grid}`, or `ref={(handle) => (grid = handle)}`, gives you the handle with the same methods (there are no React ref objects). The handle is set before your component's first `createEffect` and `onSettled` run, so you can call it there (for example to restore a saved state or scroll to the bottom). Inside `<Loading>`, the grid is not drawn until the first rows arrive, and methods that change its state do nothing before that (the grid warns once in development): pass the first state as `initialState`, or call the handle from an effect that reads the rows (`createEffect(() => rows().length, …)`). After the grid is removed (hidden with `<Show>` and so on), a handle left in your variable does nothing for methods that change the state (the grid warns once in development), and methods that read return the values from when it was removed (save `grid.getState()` in `onCleanup`; `getScrollPosition()` returns `null` and `isAtBottom()` `false`).
- **Render functions run only when needed.** `renderCell` runs again when its row, value or column changes, `renderHeader` when its column changes, and the bar renderers when the function changes; not on every update as in React. Positions and states in the context (`rowIndex`, `isActive`, the bar context and so on) are reactive: read them inside JSX and they stay current. Reading them in the function body makes the content re-created whenever they change (`derivedSummary` is one value, so reading any of its fields re-creates the bar whenever any summary text changes, such as the active cell's address). Because `renderCell` runs again when its row changes, an input inside a cell that calls `ctx.setValue` on every keystroke loses focus after the first character: keep the text in a signal inside the component and call `setValue` when it is committed (blur / Enter), or use a custom editor. The same goes for signals from outside the grid read in the `renderCell` body: each change re-creates the content of every visible cell, so read them inside JSX (or through a memo per row key).
- **Natural-language filter (`/ai`).** `GridAskBar` and `createGridAsk` (the React version's `useGridAsk`; Solid names it `create…`) come from `@ishibashi0112/spreadsheet-grid-solid/ai` (about 15KB gzip, separate from the grid's bundle). Pass the grid as a function that returns the handle, `grid={() => grid}` (with `let grid!` and `ref={grid}`), or as a signal (`ref={setGrid}` with `grid={grid}`); there are no ref objects. Everything else (your `ask` function, the answer format, `gridAskLocaleTextEn` from `/locales/en`) is the same as the React version ([AI filter guide](https://datasheet-grid.vercel.app/docs/guides/ai-filter)).
- Everything else (props, column options, handle methods, callbacks, CSS classes and tokens) is the same as in the React version. The package ships `API_REFERENCE.md` (0.1.2+; the same document as the React version's, with a note at the top on reading it for Solid; also [on GitHub](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md)).

## Solid-specific notes

- **Keep `rows` in a signal.** `onRowsChange` returns a new array on every edit (the same contract as the React version). The rows are replaced as a whole, so, following Solid's own split (a signal for values replaced as a whole, a store for nested data updated piece by piece), keep them in a signal and put the array back with `setRows(next)`. In this version, with `createStore` the rows that come back are a store proxy instead of the array the grid returned, so the undo / redo history is cleared, and Solid prints many development diagnostics (the grid warns once in development when `rows` is a store).
- **Writes apply in a microtask.** After `setRows(...)`, the grid sees the new rows on the next flush. To use a row you just added right away (`getViewRowIndex(key)` then `startEditing(...)`), call `flush()` from `solid-js` first (the React docs use `flushSync` for the same thing). In tests, call `flush()` after changing a signal or firing an event, before looking at the DOM.
- **Saving with `action`.** You can start an `action` from a grid callback: `onRowsChange={(next) => save(next)}` with `createOptimistic` inside the action, or `setRows(next)` followed by `save(next)`. The grid keeps its own updates out of your action, so the editor closes and the next edit goes to the right row while the save is in flight (like `startTransition` in the React version). Take the save target (a project id and so on) from the rows you receive, not from props that may already point elsewhere. A `refresh()` that fetches the saved rows again replaces `rows` from outside, which clears the undo history (as in the React version).
- **Async rows.** Rows from an async `createMemo` / `createSignal(async)` work inside `<Loading>`: the fallback shows until the first rows arrive. While they are fetched again, the grid keeps the previous rows and stays usable; show the wait with `isPending(() => rows())`. With `<Loading on={...}>` the fallback replaces the grid during the refetch (the grid keeps its state and comes back when the rows arrive); an edit in progress is committed when the grid is replaced, so `onRowsChange` gets the previous rows. A failed refetch reaches your `<Errored>`. Rows read through `createDeferred` show the old values while a save's `refresh()` fetches them again (that is how `createDeferred` works); an async `createMemo` keeps the saved values.
- **Callbacks after drawing.** The callbacks the React version calls from an effect after rendering (`onActiveCellChange`, `onStateChange`, `onFiltersChange`, `onSortChange`, `onExpandedDetailRowKeysChange`, and `onRowSelectionChange` when removing selected rows drops them from the selection) run right after the flush that drew the change, in a microtask, and not after the grid is removed. In tests, `await Promise.resolve()` after `flush()` before checking them.
- **Tests (Vitest + jsdom).** Add `@solidjs/vite-plugin` to the Vitest config. Without the plugin, put `browser` in `resolve.conditions`, `ssr.resolve.conditions` and `ssr.resolve.externalConditions` (all three). Use the Solid 2 version of `@solidjs/testing-library` (1.0 release candidates) and `installJsdomLayoutStubs` from `@ishibashi0112/spreadsheet-grid-solid/testing` (jsdom has no layout).
- **SSR.** SolidStart supports only Solid 1 at the time of writing. With Solid 2, use Vite's SSR with `@solidjs/vite-plugin` (`ssr: true`), `renderToString` or `renderToStream` with `generateHydrationScript` on the server, and `hydrate` on the client (`@solidjs/router` 2 also needs `createRequestEvent` from `@solidjs/web` and `provideRequestEvent` from `@solidjs/web/storage`). The server renders only the grid's frame (headers, the filter and sort labels of the bars); rows, pinned cells, counts and totals are drawn after hydration, so a different time zone or date in the browser (date conditions, `Date` values) cannot leave the server's rows on the page (Solid's hydration does not fix server text that differs on the client; the React version re-renders the mismatch on the client). Run the production server with `NODE_ENV=production` (or set `define: { 'process.env.NODE_ENV': JSON.stringify('production') }` in the SSR build): otherwise the server renders the development build's extra parts and hydration does not pick up the grid.
- **Saving the state in the URL.** Pass the saved state as `initialState` on the first render, save it from `onStateChange`, and apply later changes (back / forward) with `grid.applyState(...)`. Reading signals inside the grid's callbacks is fine; they run outside tracking, like event handlers.
- **Detail rows.** `detailRow.render` runs once when a row opens; it is not called again when the row changes, and `ctx.row` is the current row. Read `ctx.row` inside JSX to follow edits and undo. A field initialized with `createSignal(() => ctx.row.x)` is reset whenever the row changes, so keep unsaved input in a plain signal: `createSignal(untrack(() => ctx.row.x))`. The same goes for custom editors: `ctx.value` and `ctx.row` are reactive, so read them inside JSX, or take the starting value with `untrack(() => ctx.value)` (or `ctx.initialText`); reading them in the component body makes Solid report `STRICT_READ_UNTRACKED` in development.
- **Values from outside the rows.** `getValue` and `valueFormatter` should depend only on the row and the value. If they read a signal from outside, the cells follow it but totals (`aggFunc`) do not; re-create the columns when that signal changes (for example `const columns = createMemo(() => makeColumns(totals()))`).
- **Sharing props between grids.** Spread a stable object, or write the props out. Spreading an object that is re-created on every change (`{...gridProps()}`) works, but in development Solid reports `HUGE_FAN_OUT`.
- **Shadow DOM (Web Components).** Put `style.css` inside the shadow root (a `<style>` or `adoptedStyleSheets`), wrap the grid in an element instead of rendering it directly into the shadow root (popups are drawn inside that element), use an open shadow root, and call the `dispose` that `render()` returns from `disconnectedCallback`. Details: the section 「Shadow DOM の中のグリッド」 of the API reference.
- **Development diagnostics.** In `vite dev`, Solid may print `EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE` naming effects such as `autoHeightMeasurer`, `activeRowFollow`, `edit`, `serverSideRowModel`, `fillHandle` or `clampSelectionToRowCount` (the names are examples). They come from the grid re-aligning its state after a change (the React version re-renders the same way), are harmless, and do not appear in production builds.

## Using with AI coding assistants

This library is new, so AI coding assistants rarely know its API and tend to guess from other grids or from React code. Point them at the docs:

- **Skill.** The package ships an [Agent Skill](https://agentskills.io) at `skills/spreadsheet-grid-solid/SKILL.md` (0.1.2+): a short guide with the Solid rules below and where to look in `API_REFERENCE.md`. Tools that read `SKILL.md` (Claude Code, Cursor, Codex, GitHub Copilot and others) use it once it is in their skills folder. Install it from GitHub with `npx skills add https://github.com/ishibashi0112/datasheet-grid/tree/main/packages/solid/skills/spreadsheet-grid-solid`, or copy the folder from `node_modules` (for Claude Code, into `.claude/skills/`).
- **One line for `AGENTS.md` / `CLAUDE.md`:** "Before writing grid code, read `node_modules/@ishibashi0112/spreadsheet-grid-solid/API_REFERENCE.md` and use only the props and methods it lists."

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

パッケージは Solid のライブラリの慣例どおり、`solid` 条件で JSX のままのソース(`dist/source/`)を渡し、利用側のバンドラが自分の Solid の設定(DOM / SSR・開発 / 本番)でコンパイルします。Vite では `@solidjs/vite-plugin` 3(Vite 8 以上)を使ってください。SSR はこの形が要ります。`solid` 条件の無いツールは DOM 向けにコンパイル済みの `dist/index.js`(ESM だけ)を読みます。Node の中(Vitest と jsdom のテストなど)では `solid` か `browser` の条件で解決してください(`@solidjs/vite-plugin` が付けます)。Node の既定の条件では `@solidjs/web` がサーバー向けのビルドになり、DOM 向けのビルドは「Client-only API called on the server side」で止まります。

使い方は上の Quick start のとおりです(`rows={rows()}` のように signal を呼んで渡し、編集は `onRowsChange` で受け取って signal へ戻す)。ブラウザで動かせるサンプル(編集できる在庫表 10,000 行)は [`examples/solid`](https://github.com/ishibashi0112/datasheet-grid/tree/main/examples/solid) にあります。英語の文言は `@ishibashi0112/spreadsheet-grid-solid/locales/en` の `localeTextEn` を `localeText` に渡します。

対応ブラウザは Chrome / Edge 111 以降、Firefox 121 以降、Safari 16.4 以降です。

### 機能を選んで組み込む

`SpreadsheetGrid` は全機能入りです(初期読み込みの JS が約 166KB gzip。列フィルターのポップオーバーとツールパネルの約 16KB は後から読みます)。`createSpreadsheetGrid` では渡した機能だけを入れたグリッドを作れ、渡さなかった機能はバンドルに入りません(機能なしで約 94KB、プリセット `standardFeatures` で約 121KB)。React 版と違い、機能の部品も同じ入口から import します(`/lite` はありません)。機能の名前と中身は同梱の `API_REFERENCE.md` の「機能を選んで組み込む」のとおりです(部品の名前も React 版と同じ)。グリッドはコンポーネントの中ではなく、モジュールの先頭で 1 回だけ作ってください。

### React 版との違い

- **`ref` は Solid の DOM の ref と同じです。** `let grid!: SpreadsheetGridHandle<Row>` と `ref={grid}`、または `ref={(handle) => (grid = handle)}` で、同じメソッドを持つハンドルを受け取れます(React の ref オブジェクトはありません)。ハンドルは利用側の部品の最初の `createEffect` と `onSettled` より前に入るので、そこで呼べます(保存した状態を戻す、末尾へスクロールする など)。`<Loading>` の中では最初の行が届くまでグリッドを描かず、それまでに呼んだ状態を変えるメソッドは何もしません(開発時に 1 回知らせます)。最初の状態は `initialState` で渡すか、行を読む effect(`createEffect(() => rows().length, …)`)から呼んでください。グリッドを外した後(`<Show>` で隠したときなど)も変数に残ったハンドルは、状態を変えるメソッドは何もせず(開発時に 1 回知らせます)、読むメソッドは外したときの値を返します(`onCleanup` で `grid.getState()` を保存できます。`getScrollPosition()` は `null`、`isAtBottom()` は `false`)。
- **描く関数は必要なときだけ呼びます。** `renderCell` は行・値・列が変わったとき、`renderHeader` は列が変わったとき、バーの関数は関数が変わったときに呼び直します(React 版のように更新のたびには呼びません)。文脈の位置と状態(`rowIndex` / `isActive` / バーの文脈など)は読んだときに引くので、JSX の中で読めばその場で追従します。関数の本体で読むと(引数の分割代入も)、それが変わるたびに中身を作り直します(バーの入力欄なら、フォーカスと打ちかけの文字が消えます。変わる値は JSX の中で読んでください。`derivedSummary` は 1 つの値なので、その中のどれを読んでも、アクティブセルの番地など要約の文字のどれかが変わるたびに作り直します)。`renderCell` は行が変わると呼び直すので、セルの中の入力欄で打つたびに `ctx.setValue` すると、1 文字目で中身が作り直されてフォーカスが外れます。打つ間は部品の中の signal に持ち、確定したとき(blur / Enter)に `setValue` するか、custom のエディタを使ってください。グリッドの外の signal を `renderCell` の本体で読んだときも同じで、変わるたびに見えているすべてのセルの中身を作り直します。JSX の中で読むか、行のキーごとの memo を通してください。
- **ことばで絞り込み(`/ai`)。** `GridAskBar` と `createGridAsk`(React 版の `useGridAsk`。Solid の慣例で `create…` の名前)は `@ishibashi0112/spreadsheet-grid-solid/ai` から import します(約 15KB gzip。グリッドのバンドルとは別)。グリッドはハンドルを返す関数 `grid={() => grid}`(`let grid!` と `ref={grid}`)か signal(`ref={setGrid}` と `grid={grid}`)で渡します(ref オブジェクトはありません)。そのほか(利用側の `ask`・答えの形・`/locales/en` の `gridAskLocaleTextEn`)は React 版と同じです([ことばで絞り込み](https://datasheet-grid.vercel.app/docs/guides/ai-filter))。
- そのほか(props・列の定義・ハンドルのメソッド・通知・CSS のクラスとトークン)は React 版と同じです。パッケージに `API_REFERENCE.md` を同梱しています(0.1.2 から。React 版と同じ文書で、先頭に Solid 版での読み替えがあります。[GitHub](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md) でも読めます)。

### Solid で気をつけること

- **`rows` は signal で持つ。** `onRowsChange` は編集のたびに新しい配列を返します(React 版と同じ約束)。行は配列ごと差し替わるので、Solid の使い分け(丸ごと差し替える値は signal、中を少しずつ書き換える入れ子のデータは store)どおり signal で持ち、`setRows(next)` で戻してください。今の版では `createStore` に入れると、戻ってくる rows がグリッドの返した配列ではなく store のプロキシになるので、元に戻す / やり直しの履歴が消え、開発時に Solid の知らせが多く出ます(`rows` が store のときは開発時に 1 回警告します)。
- **書き込みはマイクロタスクで反映されます。** `setRows(...)` の後、グリッドが新しい行を見るのは次の反映のときです。足したばかりの行をすぐ使う(`getViewRowIndex(key)` → `startEditing(...)`)ときは、先に `solid-js` の `flush()` を呼んでください(React 版のドキュメントの `flushSync` と同じ)。テストでも、signal を変えた・イベントを送った後に DOM を見る前に `flush()` を呼びます。
- **`action` で保存する。** グリッドの通知の中で `action` を始めてかまいません(`onRowsChange={(next) => save(next)}` で action の中で `createOptimistic` に書く、または `setRows(next)` の後に `save(next)`)。グリッドは自分の書き込みを利用者の action に入れないので、保存の間もエディタは閉じ、続けた編集はその行に入ります(React 版の `startTransition` と同じ)。保存先(プロジェクトの ID など)は、先に別の値へ変わっていることがある props ではなく、受け取った行から取ってください。保存した行を `refresh()` で取り直すと、`rows` が外から差し替わるので、元に戻すの履歴は消えます(React 版と同じ)。
- **非同期の行。** 非同期の `createMemo` / `createSignal(async)` の行は `<Loading>` の中で使えます(最初の行が届くまでは fallback)。取り直しの間は前の行のまま操作できるので、待っていることは `isPending(() => rows())` で出してください。`<Loading on={...}>` では取り直しの間 fallback がグリッドに替わります(グリッドの状態は残り、行が届くと戻ります)。替わるときに編集中の値は確定し、`onRowsChange` には前の行が渡ります。取り直しの失敗は利用側の `<Errored>` が受けます。`createDeferred` で読んだ行は、保存の `refresh()` の取り直しの間は元の値を出します(`createDeferred` の意味どおり)。非同期の `createMemo` なら保存した値のままです。
- **描いた後の通知。** React 版が描いた後の effect で呼ぶ通知(`onActiveCellChange` / `onStateChange` / `onFiltersChange` / `onSortChange` / `onExpandedDetailRowKeysChange`、選んだ行を消して選択から外したときの `onRowSelectionChange`)は、その変化を反映し終えた直後(次のマイクロタスク)に呼び、グリッドを外した後には呼びません。テストでは `flush()` の後に `await Promise.resolve()` で 1 回待ってから確かめてください。
- **テスト(Vitest + jsdom)。** Vitest の設定に `@solidjs/vite-plugin` を入れてください。プラグイン無しなら `browser` を `resolve.conditions` / `ssr.resolve.conditions` / `ssr.resolve.externalConditions` の 3 か所すべてに書きます。`@solidjs/testing-library` は Solid 2 向けの版(1.0 の候補版)を使い、jsdom にはレイアウトが無いので `@ishibashi0112/spreadsheet-grid-solid/testing` の `installJsdomLayoutStubs` を呼びます。
- **SSR。** 今の SolidStart は Solid 1 だけに対応しています。Solid 2 では Vite の SSR と `@solidjs/vite-plugin`(`ssr: true`)で、サーバーは `renderToString` か `renderToStream` と `generateHydrationScript`、クライアントは `hydrate` を使います(`@solidjs/router` 2 は `@solidjs/web` の `createRequestEvent` と `@solidjs/web/storage` の `provideRequestEvent` も要ります)。サーバーで描くのはグリッドの骨組み(見出し・上下のバーの絞り込み / 並び替えの表示)だけで、行・固定列のセル・件数・合計はハイドレーションの後に描きます。サーバーとブラウザでタイムゾーンや今日が違っても(日付の条件・Date の値)、サーバーの行がページに残りません(Solid のハイドレーションはクライアントで違う値になった文字を直さないため。React 版は食い違いをクライアントで描き直します)。本番のサーバーは `NODE_ENV=production` で起動してください(または SSR のビルドに `define: { 'process.env.NODE_ENV': JSON.stringify('production') }`)。無いとサーバーが開発用の部品も描き、ハイドレーションがグリッドを引き継げません。
- **状態を URL に残す。** 保存した状態は最初の描画で `initialState` に渡し、`onStateChange` で保存し、後からの変化(戻る / 進む)は `grid.applyState(...)` で入れます。グリッドの通知の中で signal を読んでかまいません(イベントのハンドラと同じく追跡の外で呼びます)。
- **展開行。** `detailRow.render` は行を開いたときに 1 回呼び、行が変わっても呼び直しません(`ctx.row` が今の行)。編集や元に戻すに追従するには JSX の中で `ctx.row` を読んでください。`createSignal(() => ctx.row.x)` で持った入力欄の値は行が変わるたびに戻るので、保存前の入力はふつうの signal で持ちます(`createSignal(untrack(() => ctx.row.x))`)。custom エディタも同じで、`ctx.value` / `ctx.row` は読んだときに引くので JSX の中で読むか、始めの値は `untrack(() => ctx.value)`(または `ctx.initialText`)で取ってください(部品の本体で読むと開発時に Solid が `STRICT_READ_UNTRACKED` を出します)。
- **行の外の値。** `getValue` / `valueFormatter` は行と値だけから決めてください。外の signal を読むと、セルはそれに追従しますが合計(`aggFunc`)は追従しません。その signal が変わったら列を作り直してください(`const columns = createMemo(() => makeColumns(totals()))` など)。
- **複数のグリッドで props を共有する。** 変わらないオブジェクトを spread するか、props を書き並べてください。変化のたびに作り直すオブジェクトを spread しても(`{...gridProps()}`)動きますが、開発時に Solid が `HUGE_FAN_OUT` を出します。
- **Shadow DOM(Web Components)。** `style.css` は Shadow root の中に入れ(`<style>` か `adoptedStyleSheets`)、グリッドは Shadow root の直下に描かずに要素で包み(ポップアップはその要素の中に出ます)、open の Shadow root を使い、`disconnectedCallback` で `render()` が返す `dispose` を呼んでください。詳しくは API リファレンスの「Shadow DOM の中のグリッド」。
- **開発時の Solid の知らせ。** `vite dev` では、Solid が `autoHeightMeasurer` / `activeRowFollow` / `edit` / `serverSideRowModel` / `fillHandle` / `clampSelectionToRowCount` などの effect の名前(名前は例です)で `EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE` を出すことがあります。変化の後にグリッドが状態を合わせ直す処理(React 版も同じ描き直しをしている)で、害は無く、本番のビルドでは出ません。

### AI コーディングツールで使う

このライブラリは新しく、AI コーディングツールはまだ API をほとんど知りません。ほかのグリッドや React のコードから推測しがちなので、資料を渡してください。

- **Skill。** パッケージに [Agent Skill](https://agentskills.io) を同梱しています(`skills/spreadsheet-grid-solid/SKILL.md`。0.1.2 から)。下の Solid の決まりと、`API_REFERENCE.md` のどこを読めばよいかをまとめた短い手順書です。`SKILL.md` を読むツール(Claude Code / Cursor / Codex / GitHub Copilot など)の Skill のフォルダへ置くと使われます。GitHub から `npx skills add https://github.com/ishibashi0112/datasheet-grid/tree/main/packages/solid/skills/spreadsheet-grid-solid` で入れるか、`node_modules` からフォルダを写してください(Claude Code なら `.claude/skills/` へ)。
- **`AGENTS.md` / `CLAUDE.md` に一文。** 「グリッドのコードを書く前に `node_modules/@ishibashi0112/spreadsheet-grid-solid/API_REFERENCE.md` を読み、そこにある props とメソッドだけを使う。」

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