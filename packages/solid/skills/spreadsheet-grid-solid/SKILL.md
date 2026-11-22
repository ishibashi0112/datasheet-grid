---
name: spreadsheet-grid-solid
description: Builds and changes data grids with @ishibashi0112/spreadsheet-grid-solid (SpreadsheetGrid for Solid 2.0) - columns, cell editors and validation, filters and sorting, the server-side row model (dataSource), grouping, export, createSpreadsheetGrid with feature parts, themes, jsdom tests and SSR. Use when code imports @ishibashi0112/spreadsheet-grid-solid, or when the user wants an editable table or spreadsheet-like grid in a Solid app. Solid で表・データグリッド・Excel のように編集できる表を SpreadsheetGrid で作る / 直すときに使う。
license: MIT
---

# SpreadsheetGrid の Solid 版(`@ishibashi0112/spreadsheet-grid-solid`)

Solid 2.0 向けの仮想化データグリッドです。React 版(`@ishibashi0112/spreadsheet-grid`)と同じ props・列の定義・命令的なハンドル・CSS で、新しいライブラリなので AI の学習データにほとんど入っていません。**AG Grid / TanStack Table などの書き方や、React 版の React の書き方(`useState` / `useRef`)を推測で当てはめないでください。** props とメソッドは、必ず下の資料で名前と型を確かめてから書きます。

## 1. まず資料を開く

- **正本**: `node_modules/@ishibashi0112/spreadsheet-grid-solid/API_REFERENCE.md`(インストールした版の公開 API すべて。日本語)。React 版と同じ文書で、先頭に Solid 版での読み替えがあります。約 2,900 行あるので全部は読まず、見出しを一覧してから要る節だけ読みます。

  ```sh
  grep -nE "^#{2,3} " node_modules/@ishibashi0112/spreadsheet-grid-solid/API_REFERENCE.md
  ```

- **Solid 版だけのこと**: `node_modules/@ishibashi0112/spreadsheet-grid-solid/README.md` の「Differences from the React version」「Solid-specific notes」(日本語は「React 版との違い」「Solid で気をつけること」)。ドキュメントサイトでは https://datasheet-grid.vercel.app/docs/solid 。
- **型の説明**: 主な型(`SpreadsheetGridProps` / `GridColumn` / `SpreadsheetGridHandle` など)のフィールドの説明は、型定義の JSDoc にもあります。
- **ガイドとデモ**: https://datasheet-grid.vercel.app 。AI 向けの目次は https://datasheet-grid.vercel.app/llms.txt です(ガイドのコードは React 版で書いてあり、Solid のタブがあるページもあります)。

## 2. 最小の形

```tsx
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'

type Row = { id: number; name: string; qty: number }

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number', min: 0, integer: true } },
]

export function Inventory() {
  const [rows, setRows] = createSignal<Row[]>([{ id: 1, name: 'ボールペン', qty: 12 }])
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

## 3. 間違えやすいこと

- **CSS を読み込む。** `import '@ishibashi0112/spreadsheet-grid-solid/style.css'`。無いとスタイルが当たらず、スクロールもしません。Tailwind v4 で `classNames` などにユーティリティを渡して既定の見た目を変えるときは、`style.css` では効きません(未レイヤーのグリッドの CSS が勝つ)。`@ishibashi0112/spreadsheet-grid-solid/style.layer.css` にして、それより先に読ませる CSS で `@layer theme, base, ssg-base, components, utilities;` とレイヤー順を宣言します(宣言しないと Preflight に罫線やボタンが崩されます)。
- **バンドラ。** Vite では `@solidjs/vite-plugin` 3(Vite 8 以上)を使います。パッケージは `solid` 条件で JSX のままのソースを渡します。
- **`rows` は signal で持つ。** 編集結果は `onRowsChange` が新しい配列で返します。その配列をそのまま `setRows(next)` で戻し、`rows={rows()}` で渡します(`map` などで作り直すと undo の履歴が消えます)。`createStore` に入れると履歴が消え、開発時に警告が出ます。
- **書き込みはマイクロタスクで反映される。** `setRows(...)` の直後にハンドルで足した行を使う(`getViewRowIndex(key)` → `startEditing(...)`)ときは、先に `solid-js` の `flush()` を呼びます。
- **ハンドルは Solid の ref。** `let grid!: SpreadsheetGridHandle<Row>` と `ref={grid}`(または `ref={(handle) => (grid = handle)}`)。React の ref オブジェクト(`.current`)はありません。最初の状態は `initialState` で渡します。
- **描く関数の本体で値を読まない。** `renderCell` などの文脈の値(`ctx.rowIndex` / `ctx.isActive` など)は JSX の中で読みます。本体で読むと、変わるたびに中身を作り直します(入力欄のフォーカスが外れる)。custom エディタの始めの値は `untrack(() => ctx.value)` か `ctx.initialText` で取ります。
- **行キー。** `rowKeyGetter` で安定したキーを返します(既定は行 index)。
- **列の `width` は型の上で必須。** 伸縮させる列は `flex` も足します。列は既定で編集できます。止めるときは列の `editable: false` か `readOnly`、セルごとなら `canEditCell`、全体ならグリッドの `readOnly`。
- **`rows` か `dataSource`。** `rows` はクライアントサイド、`dataSource` を渡すとサーバーサイド行モデルです。両方は渡しません。
- **高さは `height` prop。** `'100%'` は上下のバーを含む全体の高さで、親に確定した高さが要ります。数値はスクロール領域だけの高さです。指定しないと、スクロール領域は 480px が上限です。
- **位置は表示の位置。** `selectCell` などの `viewRowIndex` / `colIndex` は並べ替え・絞り込みの後の表示の位置で、`colIndex` はライブラリが足す列(行ドラッグのハンドル列など)も数えます。`getViewRowIndex(rowKey)` / `getColIndex(columnKey)` で引きます。
- **改行を含む値の列は `editor: { type: 'text', multiline: true }`。** 既定の 1 行の入力欄はブラウザが改行を消すので、直して確定すると改行が無くなります。
- **行のクラスは行と各セルの両方に付く。** `getRowClassName` の class と style は行・「#」セル・各セルに付きます。行を薄くするなら class を返して `.ssg-body-row.<class> { opacity: 0.5 }` と書きます(style で `opacity` を書くと 2 回掛かります)。
- **テスト(Vitest + jsdom)。** Vitest にも `@solidjs/vite-plugin` を入れ、`/testing` の `installJsdomLayoutStubs()` を呼びます。signal を変えた・イベントを送った後は、DOM を見る前に `flush()` を呼びます(React 版の `act()` の代わり)。
- **SSR。** SolidStart は Solid 1 だけなので、Vite の SSR と `@solidjs/vite-plugin`(`ssr: true`)で `renderToString` / `hydrate` を使います。サーバーはグリッドの骨組みだけを描き、行はハイドレーションの後に描きます。本番のサーバーは `NODE_ENV=production` で動かします(README の「SSR」)。
- **UI の言語。** 既定は日本語です。英語は `@ishibashi0112/spreadsheet-grid-solid/locales/en` の `localeTextEn` を `localeText` に渡します。

## 4. 入口の選び方

- `@ishibashi0112/spreadsheet-grid-solid` の `SpreadsheetGrid`: 全部入り。迷ったらこれ。
- 同じ入口の `createSpreadsheetGrid`: 使う機能だけを入れる(React 版と違い `/lite` はなく、機能の部品も本体の入口から import します)。モジュールの先頭で 1 回だけ作ります。部品の名前は「キー + `Feature`」です(例: `{ ...standardFeatures, serverSide: serverSideFeature }`)。足りない機能は開発時に `console.warn` が名指しします。
- `@ishibashi0112/spreadsheet-grid-solid/locales/en`: 英語の文言 `localeTextEn`。
- `@ishibashi0112/spreadsheet-grid-solid/testing`: jsdom のテストで行と列を描画させる `installJsdomLayoutStubs()`。
- ことばで絞り込み(React 版の `/ai`)はありません。型は Solid 版から import します。コアの `@ishibashi0112/spreadsheet-grid-core` を直接使う必要はありません(`…-core/internal/…` は内部の部品で、どの版でも変わるので import しません)。

## 5. やりたいこと → API_REFERENCE.md の見出し

| やりたいこと | 見出し |
| --- | --- |
| グリッド全体の設定(高さ・読み取り専用・選択・フィルターの有効化など) | 「SpreadsheetGrid props」 |
| 列の定義(幅・固定・表示・値の読み書き・フィルターの種類) | 「GridColumn props」 |
| セルのエディタ(数値 / 選択肢 / 日付 / チェック / 自作) | 「セルエディタ(editor)」 |
| 入力の検査 | 「バリデーション(validate / validationMode)」 |
| 表示の整形(桁区切りなど) | 「値フォーマッタ(UI 表示)」 |
| 値はコード、画面は表示名の列 | 「値と表示名が別の列」 |
| フィルターとソートの保存・復元 | 「状態の保存 / 復元」 |
| サーバーから少しずつ読む(SSRM) | 「serverSide モード」「dataSource とパラメータ」「セル編集の書き戻し」 |
| グループと集計、合計行、固定行 | 「行グルーピング + 集計」「合計行」「固定行」 |
| 展開行、見出し行、行のドラッグ | 「展開行(Master/Detail)」「ラベル行」「行ドラッグ並び替え」 |
| CSV / Excel への出力 | 「CSV エクスポート」「Excel / スプレッドシート エクスポート」 |
| スクロール・選択・undo をコードから | 「命令的 API」 |
| 右クリックメニュー、セルのクリックの通知 | 「コンテキストメニュー」「セル操作の通知」 |
| 見た目(クラス・色・デザインシステム) | 「パーツ別スロット」「デザインシステムのテーマ」「スタイリング用の状態クラス」 |
| ダイアログの中に置く | 「ダイアログの中のグリッド」 |
| 英語の UI・文言を変える | 「文言(`localeText`)と英語」 |
| 機能を絞って小さくする | 「機能を選んで組み込む」 |
| jsdom でのテスト | 「テスト支援」 |

## 6. 書き終えたら

- 型チェック(`tsc`)を通します。無い prop は型エラーになるので、`as any` で消さずに資料を確かめます。
- 画面に何も出ないときは、親に高さがあるか、`style.css` を読み込んだか、`rows={rows()}` と signal を呼んで渡しているかを先に見ます。