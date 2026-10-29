---
name: spreadsheet-grid
description: Builds and changes data grids with @ishibashi0112/spreadsheet-grid (SpreadsheetGrid, React 18.3 / 19) - columns, cell editors and validation, filters and sorting, the server-side row model (dataSource), grouping, export, the /lite entry, themes and jsdom tests. Use when code imports @ishibashi0112/spreadsheet-grid, or when the user wants an editable table or spreadsheet-like grid built with it. 表・データグリッド・Excel のように編集できる表を SpreadsheetGrid で作る / 直すときに使う。
license: MIT
---

# SpreadsheetGrid(`@ishibashi0112/spreadsheet-grid`)

React 18.3 / 19 向けの仮想化データグリッドです。新しいライブラリで、AI の学習データにほとんど入っていません。**AG Grid / MUI DataGrid / TanStack Table などの書き方を推測で当てはめないでください。** props とメソッドは、必ず下の資料で名前と型を確かめてから書きます。

## 1. まず資料を開く

- **正本**: `node_modules/@ishibashi0112/spreadsheet-grid/API_REFERENCE.md`(インストールした版の公開 API すべて。日本語)。約 1,800 行あるので全部は読まず、見出しを一覧してから要る節だけ読みます。

  ```sh
  grep -nE "^#{2,3} " node_modules/@ishibashi0112/spreadsheet-grid/API_REFERENCE.md
  ```

- **型の説明**: 主な型(`SpreadsheetGridProps` / `GridColumn` / `SpreadsheetGridHandle` など)のフィールドの説明は、型定義の JSDoc にもあります(API_REFERENCE.md の表と同じ内容。エディタのホバーや定義へ移動で読めます)。
- **ガイドとデモ**: https://datasheet-grid.vercel.app 。AI 向けの目次は https://datasheet-grid.vercel.app/llms.txt です。各ページの URL の末尾に `.md` を付けると、そのページを Markdown で読めます(例: https://datasheet-grid.vercel.app/docs/installation.md )。

## 2. 最小の形

```tsx
import { useState } from 'react'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'

type Row = { id: number; name: string; qty: number }

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number', min: 0, integer: true } },
]

export function Inventory() {
  const [rows, setRows] = useState<Row[]>([{ id: 1, name: 'ボールペン', qty: 12 }])
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

## 3. 間違えやすいこと

- **CSS を読み込む。** `import '@ishibashi0112/spreadsheet-grid/style.css'`。カスケードレイヤーを使う構成(Tailwind v4 など)では `style.layer.css`。無いとスタイルが当たらず、スクロールもしません。
- **状態は controlled。** 編集結果は `onRowsChange` が新しい配列で返します。その配列をそのまま `rows` へ戻します(`map` などで作り直すと undo の履歴が消えます)。
- **行キー。** `rowKeyGetter` で安定したキーを返します(既定は行 index)。
- **列の `width` は型の上で必須。** 伸縮させる列は `flex` も足します。列は既定で編集できます。止めるときは列の `editable: false` か `readOnly`、セルごとなら `canEditCell`、全体ならグリッドの `readOnly`。
- **`rows` か `dataSource`。** `rows` はクライアントサイド、`dataSource` を渡すとサーバーサイド行モデルです。両方は渡しません。
- **高さは `height` prop。** `'100%'` は上下のバーを含む全体の高さで、親に確定した高さが要ります。数値はスクロール領域だけの高さです。`height` も `maxHeight` も指定しないと、スクロール領域は 480px が上限です。ルートの `style.height` では決めません。
- **命令的 API。** `ref` を渡すと `SpreadsheetGridHandle<T>` が入ります(利用側で `forwardRef` は要りません。React 18.3 / 19 のどちらでも同じ)。
- **Next.js App Router。** グリッドは `'use client'` のファイルから描画します。

## 4. 入口の選び方

- `@ishibashi0112/spreadsheet-grid` の `SpreadsheetGrid`: 全部入り(初期 JS 約 112KB gzip)。迷ったらこれ。
- `@ishibashi0112/spreadsheet-grid/lite` の `createSpreadsheetGrid`: 使う機能だけを入れる(機能なしで約 60KB、`standardFeatures` で約 78KB)。モジュールの先頭で 1 回だけ作ります。部品の名前は「キー + `Feature`」です(例: `{ ...standardFeatures, serverSide: serverSideFeature }`)。`standardFeatures` は `filtering` / `columnMenu` / `toolPanel` / `columnAutosize` / `export`。足りない機能は開発時に `console.warn` が名指しします。全部入りと同じアプリで混ぜると共通部分が二重に入るので、どちらかの入口に揃えます。
- `@ishibashi0112/spreadsheet-grid/ai`: `GridAskBar`(ことばで絞り込み。利用者の文から AI がフィルター・並び・検索を入れる)。グリッドの上に置いて `grid` に ref を渡します。AI は利用側の `ask`(自分のサーバー経由。API キーをブラウザに置かない)で呼び、行のデータは送りません。
- `@ishibashi0112/spreadsheet-grid/testing`: jsdom のテストで行と列を描画させる `installJsdomLayoutStubs()`。
- 型は React 版から import します(`GridColumn` / `SpreadsheetGridHandle` など)。コアの `@ishibashi0112/spreadsheet-grid-core` を React のアプリで直接使う必要はありません。コアのサブパス(`@ishibashi0112/spreadsheet-grid-core/internal/…` と旧 `…-core/<dir>/<module>`)は内部の部品で、どの版でも変わるので import しません。

## 5. やりたいこと → API_REFERENCE.md の見出し

| やりたいこと | 見出し |
| --- | --- |
| グリッド全体の設定(高さ・読み取り専用・選択・フィルターの有効化など) | 「SpreadsheetGrid props」 |
| 列の定義(幅・固定・表示・値の読み書き・フィルターの種類) | 「GridColumn props」 |
| セルのエディタ(数値 / 選択肢 / 日付 / チェック / 自作) | 「セルエディタ(editor)」 |
| 入力の検査 | 「バリデーション(validate / validationMode)」 |
| 表示の整形(桁区切りなど) | 「値フォーマッタ(UI 表示)」 |
| フィルターとソートの保存・復元 | 「状態の保存 / 復元」 |
| サーバーから少しずつ読む(SSRM) | 「serverSide モード」「dataSource とパラメータ」「セル編集の書き戻し」 |
| グループと集計、合計行 | 「行グルーピング + 集計」「合計行」 |
| 展開行、見出し行、行のドラッグ | 「展開行(Master/Detail)」「ラベル行」「行ドラッグ並び替え」 |
| CSV / Excel への出力 | 「CSV エクスポート」「Excel / スプレッドシート エクスポート」 |
| スクロール・選択・undo をコードから | 「命令的 API」 |
| 右クリックメニュー、セルのクリックの通知 | 「コンテキストメニュー」「セル操作の通知」 |
| 見た目(クラス・色・デザインシステム) | 「パーツ別スロット」「デザインシステムのテーマ」「スタイリング用の状態クラス」 |
| 文から絞り込み・並べ替え(AI) | 「ことばで絞り込み」 |
| 機能を絞って小さくする | 「機能を選んで組み込む」 |
| jsdom でのテスト | 「テスト支援」 |

## 6. 書き終えたら

- 型チェック(`tsc`)を通します。無い prop は型エラーになるので、`as any` で消さずに資料を確かめます。
- 画面に何も出ないときは、親に高さがあるか、`style.css` を読み込んだかを先に見ます。