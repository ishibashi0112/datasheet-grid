# SpreadsheetGrid 公開 API リファレンス

> このファイルは `model/gridTypes.ts`(`SpreadsheetGridProps<T>` / `GridColumn<T>` 他)と
> `SpreadsheetGrid.tsx`(既定値の分割代入)から手で起こした公開 API のスナップショットです。
> **型を変更したら本ファイルも同期してください。** 将来 `index.ts` バレル整備時に props メタデータを
> single source of truth 化し、dev 実行時パネル + 自動生成へ移行する想定です(現状は手動同期)。

最終更新: C1-7 完了時点。

## SpreadsheetGrid props (`SpreadsheetGridProps<T>`)

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `rows` | `T[]` | — | clientSide モードの行データ。`dataSource` を指定した場合は無視され serverSide モードになる(両者は排他)。 |
| `columns` | `GridColumn<T>[]` | (required) | 列定義の配列。 |
| `onRowsChange` | `(nextRows: T[]) => void` | — | 行が変化したとき呼ばれる(rows を controlled にする)。 |
| `dataSource` | `ServerSideDataSource<T>` | — | serverSide(SSRM)モードのデータ供給口。指定すると可視窓近傍のブロックだけを `getRows` で都度取得し、`rows` 系の clientSide パイプラインをバイパスする。 |
| `onColumnsChange` | `(nextColumns: GridColumn<T>[]) => void` | — | 列が変化したとき呼ばれる。列メニューの固定切替はこれが指定されている場合のみ反映。 |
| `rowKeyGetter` | `(row: T, index: number) => GridRowKey` | index ベース | 安定した行キーを返す。 |
| `createRow` | `() => T` | — | 行追加時に使う新規行ファクトリ。 |
| `createOverflowColumn` | `(columnIndex: number) => GridColumn<T>` | — | 列追加時に使う列ファクトリ。 |
| `rowHeight` | `number` | `36` | uniform 行の行高(px)。 |
| `autoHeight` | `boolean` | `false` | auto-height 行モードを有効化。 |
| `estimateRowHeight` | `number` | `rowHeight` | 未測定行の推定行高(px)。 |
| `headerHeight` | `number` | `40` | ヘッダー行の高さ(px)。 |
| `rowHeaderWidth` | `number` | `56` | 行番号列の幅(px)。 |
| `readOnly` | `boolean` | `false` | グリッド全体の編集を無効化。 |
| `canEditCell` | `(rowIndex, colIndex, row, column) => boolean` | — | セル単位の編集可否ゲート。 |
| `enableRangeSelection` | `boolean` | `true` | 複数セル範囲選択。 |
| `enableGlobalFilter` | `boolean` | `true` | グローバルフィルター入力。 |
| `enableColumnFilter` | `boolean` | `true` | 列ごとのフィルター。 |
| `enableSorting` | `boolean` | `true` | ヘッダークリックでのソート。 |
| `enableColumnMenu` | `boolean` | `true` | 列メニュー(⋮ + ヘッダー右クリック)。 |
| `noMatchingRowsText` | `string` | `'一致する行がありません'` | フィルター結果 0 行時のオーバーレイ文言。 |
| `noRowsText` | `string` | `'表示する行がありません'` | rows が 0 件のときの文言。 |
| `renderTopBar` | `(ctx: SpreadsheetGridSlotContext<T>) => ReactNode` | 内蔵トップバー | 上部バーの差し替え。 |
| `renderBottomBar` | `(ctx: SpreadsheetGridSlotContext<T>) => ReactNode` | 非表示 | 下部バーの差し替え。 |
| `className` | `string` | — | ルート要素の class。 |

## GridColumn props (`GridColumn<T>`)

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | (required) | 列の一意キー。 |
| `title` | `string` | — | ヘッダーの表示ラベル。 |
| `width` | `number` | (required) | 列幅(px)。 |
| `minWidth` | `number` | — | リサイズ時の下限幅。 |
| `maxWidth` | `number` | — | リサイズ時の上限幅。 |
| `autoHeight` | `boolean` | — | この列が auto-height 行の高さを駆動(グリッドの `autoHeight` 有効時のみ)。 |
| `visible` | `boolean` | — | 列の表示/非表示。 |
| `editable` | `boolean` | — | この列の編集を許可。 |
| `readOnly` | `boolean` | — | この列を読み取り専用にする。 |
| `pinned` | `'left' \| 'right'` | undefined = 中央スクロール | 列固定の方向。 |
| `getValue` | `(row: T) => unknown` | `row[key]` | 値アクセサ。 |
| `setValue` | `(row: T, value: unknown) => T` | — | 値ライター(新しい行を返す)。 |
| `renderCell` | `(ctx: CellRenderContext<T>) => ReactNode` | プレーン `<span>` | カスタムセル描画。 |
| `renderHeader` | `(ctx: HeaderRenderContext<T>) => ReactNode` | — | カスタムヘッダー描画。 |
| `filterType` | `'text' \| 'number' \| 'date' \| 'select' \| 'set' \| 'custom'` | — | フィルター UI の種別。 |
| `filterOptions` | `GridSelectFilterOption[]` | rows から自動収集 | select / set の候補。 |
| `filterFn` | `(row: T, filterValue: unknown) => boolean` | — | カスタムフィルター述語。 |
| `parseClipboardValue` | `(raw: string, row: T) => unknown` | — | 貼り付け時のパーサ。 |
| `formatClipboardValue` | `(value: unknown, row: T) => string` | — | コピー時のフォーマッタ。 |

## serverSide モード(SSRM / DS-4 ②)

`dataSource` を渡すと serverSide モードになり、総行数ぶんの縦スクロール空間を保ったまま、可視窓に近いブロックだけを `getRows` で取得する(取得範囲を定数で縛りメモリを有界化)。未ロード行はスケルトン行として描画され、到着後に実データへ差し替わる。

- **stage ①(現状・読み取り専用)**: フィルター(グローバル / 列)・ソート・編集 UI は無効化される。`getRows` の `query` は空で、サーバ側でのフィルター/ソート実行は stage ② で配線予定。`onRowsChange` は不要(read-only)。
- **`initialRowCount`**: 初回 fetch 前から正しい総高さ/スクロールバーを出したい場合に渡す(未指定時は最初の `getRows` 結果が返るまで件数 0)。
- **`blockSize`(既定 100)/ `maxCachedBlocks`(既定 64)**: 1 ブロックの行数とクライアント側 LRU 上限。超過分は画面外の古いブロックから退避する。
- **利用者契約**: `getRows` は渡された `[startIndex, endIndex)`(view 空間・end 排他)を尊重し、全件を返さないこと。`signal` が abort されたら速やかに reject すること。

## 補助型(props で参照される shape)

- `GridRowKey = string | number`
- `GridColumnPinned = 'left' | 'right'`
- `GridSelectFilterOption = { label: string; value: string }`
- `CellRenderContext<T> = { row, rowIndex, colIndex, value, column, isActive, isSelected, isEditing, readOnly, setValue }`
- `HeaderRenderContext<T> = { colIndex, width, column, filterValue?, isFiltered? }`
- `SpreadsheetGridSlotContext<T> = { rows, filteredRows, columns, visibleColumns, globalFilterText, columnFilterValues, sortState, setGlobalFilterText, activeCell, selection, derivedSummary }`
  - `derivedSummary` は `SpreadsheetGridDerivedSummary`(行/列/フィルター/ソートの summary 文字列・選択統計などを内包)。helper を import せずトップ/ボトムバーで使える。

## ライブラリ化の宿題(現状把握)

- 〔解消〕**no-op props**: `enableClipboard` / `enableColumnResize` を型から削除(常時 ON 固定の挙動は不変)。将来「無効化」が必要になれば配線つきで非破壊追加する。
- **imperative API(ref ハンドル)なし**: `forwardRef` / `useImperativeHandle` 未使用。外部から「特定セルへスクロール」「選択クリア」等を命令的に呼ぶ口がない(状態は全て controlled)。
- 〔解消〕**公開バレル(`index.ts`)**: 入口を `index.ts` に集約し、`SpreadsheetGrid`(named)と公開型群(serverSide 型・`RowModel` 含む)を再エクスポート。`default export` は廃止。
- **テーマ/スタイリング API**: 公開されるのは `className`(ルート1個)のみ。パーツ単位のクラスや CSS トークンは未提供。