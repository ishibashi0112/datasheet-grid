# SpreadsheetGrid 公開 API リファレンス

> このファイルは `model/gridTypes.ts`(`SpreadsheetGridProps<T>` / `GridColumn<T>` 他)と
> `SpreadsheetGrid.tsx`(既定値の分割代入)から手で起こした公開 API のスナップショットです。
> **型を変更したら本ファイルも同期してください。** 将来 `index.ts` バレル整備時に props メタデータを
> single source of truth 化し、dev 実行時パネル + 自動生成へ移行する想定です(現状は手動同期)。

最終更新: スクロールコンテナ高さの外部制御(`height` / `maxHeight` props)追加時点。

## SpreadsheetGrid props (`SpreadsheetGridProps<T>`)

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `rows` | `T[]` | — | clientSide モードの行データ。`dataSource` を指定した場合は無視され serverSide モードになる(両者は排他)。 |
| `columns` | `GridColumn<T>[]` | (required) | 列定義の配列。 |
| `onRowsChange` | `(nextRows: T[]) => void` | — | 行が変化したとき呼ばれる(rows を controlled にする)。 |
| `dataSource` | `ServerSideDataSource<T>` | — | serverSide(SSRM)モードのデータ供給口。指定すると可視窓近傍のブロックだけを `getRows` で都度取得し、`rows` 系の clientSide パイプラインをバイパスする。 |
| `serverSideRefreshToken` | `number` | — | serverSide のソフトリフレッシュ用トークン。値を増やすと、クエリ(フィルター/ソート/グローバル)を変えずにキャッシュを破棄して現在の可視レンジをサーバから取り直す。スクロール位置は保持し、件数は到着ブロックの `totalRowCount` で追従する(clientSide では無視)。 |
| `onColumnsChange` | `(nextColumns: GridColumn<T>[]) => void` | — | 列が変化したとき呼ばれる。列メニューの固定切替はこれが指定されている場合のみ反映。 |
| `rowKeyGetter` | `(row: T, index: number) => GridRowKey` | index ベース | 安定した行キーを返す。 |
| `createRow` | `() => T` | — | 行追加時に使う新規行ファクトリ。 |
| `createOverflowColumn` | `(columnIndex: number) => GridColumn<T>` | — | 列追加時に使う列ファクトリ。 |
| `rowHeight` | `number` | `36` | uniform 行の行高(px)。 |
| `autoHeight` | `boolean` | `false` | auto-height 行モードを有効化。 |
| `estimateRowHeight` | `number` | `rowHeight` | 未測定行の推定行高(px)。 |
| `headerHeight` | `number` | `40` | ヘッダー行の高さ(px)。 |
| `rowHeaderWidth` | `number` | `56` | 行番号列の幅(px)。 |
| `height` | `number \| string` | `—` | スクロールコンテナの明示高さ。`'100%'` で親要素に追従（親要素が確定高さを持つ前提。祖先まで高さが確定している／flex 子なら `min-height: 0` が必要）。`number` は px。未指定時は `maxHeight` のクリップ挙動になる。 |
| `maxHeight` | `number \| string` | `—`（既定 480px） | スクロールコンテナの高さ上限。`height`・`maxHeight` が**共に未指定のときのみ**既定の 480px が効く（従来挙動）。`height` と併用すると「明示高さ＋上限」。 |
| `readOnly` | `boolean` | `false` | グリッド全体の編集を無効化。 |
| `canEditCell` | `(rowIndex, colIndex, row, column) => boolean` | — | セル単位の編集可否ゲート。 |
| `enableRangeSelection` | `boolean` | `true` | 複数セル範囲選択。 |
| `enableGlobalFilter` | `boolean` | `true` | グローバルフィルター**機能**の有効化。`false` で機能が無効になり、既定トップバーのフィルター入力欄も出ない(summary は `showTopBarSummary` に従う。トップバー自体を消すには `showTopBar=false`)。 |
| `enableColumnFilter` | `boolean` | `true` | 列ごとのフィルター。 |
| `enableSorting` | `boolean` | `true` | ヘッダークリックでのソート。 |
| `enableColumnResize` | `boolean` | `true` | 列幅の手動リサイズ可否のグリッド既定。各列 `resizable` 未指定時に継承(`column.resizable ?? enableColumnResize`)。 |
| `enableColumnMenu` | `boolean` | `true` | 列メニュー(⋮ + ヘッダー右クリック)。 |
| `enableRowHover` | `boolean` | `true` | 行ホバー時に行全体を薄くハイライト。 |
| `enableColumnHeaderHover` | `boolean` | `true` | 列ヘッダーのホバー時にヘッダーセルを薄くハイライト。 |
| `noMatchingRowsText` | `string` | `'一致する行がありません'` | フィルター結果 0 行時のオーバーレイ文言。 |
| `noRowsText` | `string` | `'表示する行がありません'` | rows が 0 件のときの文言。 |
| `showTopBar` | `boolean` | `true` | 上部バー(ツールバー)の表示有無。`false` で `renderTopBar` / `enableGlobalFilter` に関わらず一切描画しない(表示のマスタースイッチ。矛盾指定時は `renderTopBar` より優先)。 |
| `showTopBarSummary` | `boolean` | `true` | 既定トップバーの summary chips(件数/フィルター/ソート)の表示有無。`renderTopBar` 未指定時のみ有効。これと `showTopBarFilter` がともに非表示なら既定トップバーは描画されない(空バーを出さない)。 |
| `showTopBarCounts` | `boolean` | `true` | 既定トップバーの Rows / Columns 件数 chips の表示有無。`showTopBarSummary=true`(かつ `renderTopBar` 未指定)のときのみ有効。Filter / Sort chips は対象外。 |
| `showTopBarFilter` | `boolean` | `true` | 既定トップバーのグローバルフィルター入力欄の表示有無。`renderTopBar` 未指定時のみ有効。`enableGlobalFilter=false` のときは本値に関わらず非表示。 |
| `showBottomBar` | `boolean` | `true` | 下部バー(ステータスバー)の表示有無。`false` で `renderBottomBar` に関わらず一切描画しない(表示のマスタースイッチ。矛盾指定時は `renderBottomBar` より優先)。 |
| `showBottomBarCounts` | `boolean` | `true` | 既定ボトムバーの Rows / Columns 件数 chips(左側)の表示有無。`renderBottomBar` 未指定時のみ有効。右側の Active / Selection / 選択統計 / Cols は対象外。 |
| `renderTopBar` | `(ctx: SpreadsheetGridSlotContext<T>) => ReactNode` | 内蔵トップバー | 上部バーの差し替え。未指定時は内蔵トップバー(summary chips + フィルター入力。内訳は `showTopBarSummary` / `showTopBarFilter` で制御。フィルター入力は `enableGlobalFilter=true` が前提)。`showTopBar=false` 時は本指定に関わらず描画されない。 |
| `renderBottomBar` | `(ctx: SpreadsheetGridSlotContext<T>) => ReactNode` | 内蔵ボトムバー | 下部バーの差し替え。未指定時は内蔵ステータスバー。`showBottomBar=false` 時は本指定に関わらず描画されない。 |
| `className` | `string` | — | ルート要素の class。 |
| `classNames` | `GridClassNames` | — | パーツ別の追加 class スロット。現状 `root` / `iconButton` / `bodyCell` / `bodyRow` が配線済み(他は順次)。基底 class は `@layer ssg-base` のため Tailwind 等の未レイヤー上書きが効く。 |
| `getRowClassName` | `(row: T, rowIndex: number) => string \| undefined` | — | 行ごとの追加 class。行コンテナ + 各データセルに付与され、Tailwind 等での行ハイライトに使える。行ヘッダー「#」セルは現状対象外。 |

### バーの表示制御(top / bottom)

トップ / ボトムバーは次の優先順で解決される。

- **`showTopBar` / `showBottomBar`(マスタースイッチ)**: `false` ならそのバーは一切描画されない(`render*` / `enable*` より優先)。
- **`renderTopBar` / `renderBottomBar`(カスタム)**: 指定時はそのまま描画。トップバーの内訳 props(`showTopBarSummary` / `showTopBarFilter`)はカスタム側が中身を決めるため関与しない。
- **既定バー**: `render*` 未指定時のフォールバック。

既定トップバーは **summary chips(左)** と **グローバルフィルター入力(右)** の 2 パートからなり、独立に出し分けできる。

| やりたいこと | 設定 |
| --- | --- |
| バーごと消す | `showTopBar={false}` |
| summary だけ(フィルター入力なし) | `showTopBarFilter={false}` |
| フィルター入力だけ(summary なし) | `showTopBarSummary={false}` |
| トップの Rows/Columns 件数だけ消す | `showTopBarCounts={false}` |
| ボトムの Rows/Columns 件数だけ消す | `showBottomBarCounts={false}` |
| フィルター機能ごと無効 + summary は残す | `enableGlobalFilter={false}` |
| 完全に自前のバー | `renderTopBar={(ctx) => …}` |

`showTopBarSummary` と `showTopBarFilter`(実効は `showTopBarFilter && enableGlobalFilter`)がともに `false` の場合、既定トップバーは描画されない(空バーを出さない)。

ボトムバーは Rows / Columns 件数のみ `showBottomBarCounts` で出し分けできる(右側の Active / Selection / 選択統計 / Cols は対象外)。それ以外の内訳を変えたい場合は `renderBottomBar` を使う。

## GridColumn props (`GridColumn<T>`)

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | (required) | 列の一意キー。 |
| `title` | `string` | — | ヘッダーの表示ラベル。 |
| `width` | `number` | (required) | 列幅(px)。 |
| `minWidth` | `number` | — | リサイズ時の下限幅。 |
| `maxWidth` | `number` | — | リサイズ時の上限幅。 |
| `resizable` | `boolean` | グリッドの `enableColumnResize` を継承 | この列の手動リサイズ可否。`false` でヘッダーのリサイズハンドルを非表示。 |
| `autoHeight` | `boolean` | — | この列が auto-height 行の高さを駆動(グリッドの `autoHeight` 有効時のみ)。 |
| `visible` | `boolean` | — | 列の表示/非表示。 |
| `editable` | `boolean` | — | この列の編集を許可。 |
| `readOnly` | `boolean` | — | この列を読み取り専用にする。 |
| `pinned` | `'left' \| 'right'` | undefined = 中央スクロール | 列固定の方向。 |
| `getValue` | `(row: T) => unknown` | `row[key]` | 値アクセサ。 |
| `setValue` | `(row: T, value: unknown) => T` | — | 値ライター(新しい行を返す)。 |
| `renderCell` | `(ctx: CellRenderContext<T>) => ReactNode` | プレーン `<span>` | カスタムセル描画。 |
| `cellClassName` | `string \| ((ctx: CellStyleContext<T>) => string \| undefined)` | — | セルへ付与する追加 class(条件付きスタイル)。関数版は値 / 状態に応じて class を返せる。基底 `.ssg-body-cell` は `@layer` のため上書きが効く。 |
| `renderHeader` | `(ctx: HeaderRenderContext<T>) => ReactNode` | — | カスタムヘッダー描画。 |
| `filterType` | `'text' \| 'number' \| 'date' \| 'select' \| 'set' \| 'custom'` | — | フィルター UI の種別。 |
| `filterOptions` | `GridSelectFilterOption[]` | rows から自動収集 | select / set の候補。 |
| `filterFn` | `(row: T, filterValue: unknown) => boolean` | — | カスタムフィルター述語。 |
| `parseClipboardValue` | `(raw: string, row: T) => unknown` | — | 貼り付け時のパーサ。 |
| `formatClipboardValue` | `(value: unknown, row: T) => string` | — | コピー時のフォーマッタ。 |

## serverSide モード(SSRM / DS-4 ②)

`dataSource` を渡すと serverSide モードになり、総行数ぶんの縦スクロール空間を保ったまま、可視窓に近いブロックだけを `getRows` で取得する(取得範囲を定数で縛りメモリを有界化)。未ロード行はスケルトン行として描画され、到着後に実データへ差し替わる。`rows`(clientSide)と `dataSource`(serverSide)は排他。

### query 配線(stage ②)

clientSide の操作状態(グローバルフィルター・列フィルター・ソート)を `ServerSideQuery` に組み立て、`getRows` の `params.query` として送出する(フィルター/ソートの実行はサーバへ委ねる)。

- **`ServerSideQuery`**: `{ globalText?: string; columnFilters?: Record<string, ColumnFilterValue>; sort?: GridSortState }`。全フィールドが空のときは `{}` を渡す。
- **列フィルターの wire format**: `ColumnFilterValue` は `kind` を持つ discriminated union で、**そのまま**送出される(サーバはこの記述子を解釈して WHERE を組む)。`kind` 別の shape:
  - `{ kind: 'set'; mode?: 'include' | 'exclude'; values: string[] }` — `values` は常に小さい側のみ保持する(全候補が多いとき `mode: 'exclude'` で非選択側を送る)。サーバは `mode` に応じて IN / NOT IN を組む。
  - `{ kind: 'number'; raw: string; parsed }` — `parsed` が `range` / `comparison` / `null`(=`raw` で部分一致)。
  - `{ kind: 'text'; value }` / `{ kind: 'date'; value }` / `{ kind: 'select'; value }`
  - `{ kind: 'custom'; value }` — `column.filterFn` 利用列の自由形値(サーバ解釈は利用側責務)。
  - アクティブなフィルターのみ送出される。キーは安定 queryKey のため昇順整列される。
- **debounce**: query(filter/sort)の変更は約 300ms 静止後に一度だけ送出する(キーストロークごとの再フェッチを合体)。入力欄の表示自体は即時反映される。
- **scroll-reset**: query が変わると結果セットが総入れ替えされるため、スクロールは先頭に戻る。
- **enable\* フラグ**: serverSide でも `enableSorting` / `enableColumnFilter` / `enableGlobalFilter`(いずれも既定 true)が有効。サーバ非対応の操作を塞ぎたい場合に false にする。

### set / select フィルターの候補(SSRM)

set / select の候補集合はクライアントが供給する必要がある。**clientSide** は `rows` 全件から自動収集できるが、**serverSide** はクライアントが全件を持たないため自動収集できず候補が空になる。

- **低カーディナリティ列**(状態・区分など): 列定義に `filterOptions` を静的指定する(serverSide でも set として機能する)。
- **高カーディナリティ列**(品番・ID など): そもそも set 不適。`filterType: 'text'`(部分一致)や `number` 範囲を使う。
- `filterOptions` 未指定の set/select 列を serverSide で開くと、候補リストに「候補が未指定」である旨が表示される(バグではなく設定不足)。サーバから候補を非同期供給する仕組みは将来の拡張(別 stage)。

### dataSource とパラメータ

- **`initialRowCount`**: 初回 fetch 前から正しい総高さ/スクロールバーを出したい場合に渡す(未指定時は最初の `getRows` 結果が返るまで件数 0)。**mount 時に一度だけ読まれる**(下記 remount 契約を参照)。
- **`blockSize`(既定 100)/ `maxCachedBlocks`(既定 64)**: 1 ブロックの行数とクライアント側 LRU 上限。超過分は画面外の古いブロックから退避する。
- **`getRows(params)` 契約**: `params` は `{ startIndex, endIndex, query, signal }`。渡された `[startIndex, endIndex)`(view 空間・end 排他)を尊重し全件を返さないこと。`query` 適用後の**フィルター後総件数**を `result.totalRowCount` で返すこと(縦スクロール空間がこれに追従する)。`signal` が abort されたら速やかに reject すること。
- **`result`**: `{ rows: T[]; totalRowCount: number }`。`rows` は要求レンジ内の存在ぶん(末端では要求幅より短くてよい)。

### サーバ最新の取り直し(`serverSideRefreshToken`)

サーバ側のデータが外部で更新された場合など、**クエリは変えずにサーバの最新を取り直したい**ときは `serverSideRefreshToken`(`number`)を増やす。controlled な設計に合わせた軽量な signal で、`forwardRef` の命令的 API は持たない。

- **`queryKey` 変化との違い**: フィルター/ソート/グローバルフィルターの変更は結果セットの総入れ替えなので**先頭へスクロールリセット**してキャッシュを全破棄し block 0 から取り直す。一方 `serverSideRefreshToken` は**スクロール位置を保持**したままキャッシュを破棄し、**現在の可視レンジ**を即時(debounce なし)取り直す。
- **件数**: リフレッシュ時に件数はリセットせず、到着ブロックの `totalRowCount` で更新する。外部更新で件数が増減していれば縦スクロール空間が追従する。
- **挙動メモ**: 取り直し中は対象行が一瞬スケルトン表示になる(purge → 再取得)。`refreshToken` は単調増加で運用する(値が変わったときだけ取り直す)。初回 mount では発火しない。
- **用途**: 外部での編集/追加削除(mutation)後の反映トリガーとして使う想定。mutation 自体のサーバ書き戻し契約は別途必要(本グリッドの `onRowsChange` は clientSide 前提)。

### clientSide ↔ serverSide の切替(remount 契約)

`initialRowCount` と内部の行数 state は mount 時に確定する。そのため **実行時にモードを切り替える場合は `key` を変えてグリッドを再マウントすること**(clientSide で mount 後に `dataSource` を後付けしても件数が初期化されない)。serverSide で直接 mount する通常利用ではこの限りではない。

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
- **imperative API(ref ハンドル)なし**: `forwardRef` / `useImperativeHandle` 未使用。外部から「特定セルへスクロール」「選択クリア」等を命令的に呼ぶ口がない(状態は全て controlled)。〔一部解消〕serverSide の「クエリ不変での最新取り直し」は `serverSideRefreshToken`(controlled な token prop)で可能。それ以外の命令操作は未提供。
- 〔解消〕**公開バレル(`index.ts`)**: 入口を `index.ts` に集約し、`SpreadsheetGrid`(named)と公開型群(serverSide 型・`RowModel` 含む)を再エクスポート。`default export` は廃止。
- **テーマ/スタイリング API**: 公開されるのは `className`(ルート1個)のみ。パーツ単位のクラスや CSS トークンは未提供。