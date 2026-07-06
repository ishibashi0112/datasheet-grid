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
| `rowHeight` | `number` | density 依存(standard: `36`) | uniform 行の行高(px)。未指定時は density プリセット(compact: `28` / comfortable: `44`)から解決。明示指定が常に優先(THEME-2)。 |
| `autoHeight` | `boolean` | `false` | auto-height 行モードを有効化。 |
| `estimateRowHeight` | `number` | `rowHeight` | 未測定行の推定行高(px)。 |
| `headerHeight` | `number` | density 依存(standard: `40`) | ヘッダー行の高さ(px)。未指定時は density プリセット(compact: `32` / comfortable: `48`)から解決。明示指定が常に優先(THEME-2)。 |
| `density` | `'compact' \| 'standard' \| 'comfortable'` | `'standard'` | 密度プリセット(THEME-2)。rowHeight / headerHeight の既定値と寸法トークン(セル横 padding / バー padding / アイコンボタン寸法 / セル文字の相対拡縮)を一括切替。`'standard'` は従来と同値。個別調整はトークン(`--ssg-cell-pad-x` 等)の上書きで可能。popover / menu 等のポータルは対象外。 |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | カラーテーマ(TH-DK-2)。`'dark'` でダークプリセット(`.ssg-theme-dark` のトークン一括上書き。Mantine dark 系パレット)をグリッド本体・全ポータル(popover / menu / panel)・ドラッグゴースト・ツールチップへ適用。`'auto'` は `prefers-color-scheme` へ追従(Mantine / HeroUI 等クラスベース dark 運用では、利用側カラースキームの解決値を `'light' \| 'dark'` で渡す使い方を推奨)。個別の色調整はトークン(`--ssg-*`)の上書きで可能。 |
| `rowHeaderWidth` | `number` | `56` | 行番号列の幅(px)。 |
| `height` | `number \| string` | `—` | スクロールコンテナの明示高さ。`'100%'` で親要素に追従（親要素が確定高さを持つ前提。祖先まで高さが確定している／flex 子なら `min-height: 0` が必要）。`number` は px。未指定時は `maxHeight` のクリップ挙動になる。 |
| `maxHeight` | `number \| string` | `—`（既定 480px） | スクロールコンテナの高さ上限。`height`・`maxHeight` が**共に未指定のときのみ**既定の 480px が効く（従来挙動）。`height` と併用すると「明示高さ＋上限」。 |
| `readOnly` | `boolean` | `false` | グリッド全体の編集を無効化。 |
| `dimReadOnlyCells` | `boolean` | `false` | readonly セルの組み込み淡色表示(背景 + 文字色)を有効化(THEME-3)。`false` でもセマンティッククラス `.ssg-body-cell--readonly` は常時付与され、利用側 CSS のフックに使える。 |
| `canEditCell` | `(rowIndex, colIndex, row, column) => boolean` | — | セル単位の編集可否ゲート。 |
| `enableRangeSelection` | `boolean` | `true` | 複数セル範囲選択。 |
| `enableRowSelection` | `boolean` | `false` | チェックボックス行選択の有効化(マスタースイッチ)。`true` で行ヘッダ(行NO)ガターが行選択のヒット領域になり、Excel 風のガター起点セル範囲選択は off(ボディ側セルのドラッグ範囲選択は不変)。判定は O(1)・全選択は除外集合でキーを列挙しない(1M 行でも一定コスト)。 |
| `rowSelectionMode` | `'single' \| 'multiple'` | `'multiple'` | 単一/複数の選択モード。single は常に 1 行。multiple はクリックでトグル、shift+クリック/ガタードラッグで範囲選択。 |
| `enableSelectAllRows` | `boolean` | `enableRowSelection && multiple` | ヘッダ左上コーナーの全選択チェック(tri-state: none/some/all)の有効化。 |
| `rowSelection` | `RowSelectionModel` | — | **controlled** の行選択記述子。`{ type:'include', rowKeys }`=これらを選択 / `{ type:'exclude', rowKeys }`=全選択のうち除外。全選択をキー列挙せず表現できる。指定時は controlled(内部 state を使わない)。 |
| `selectedRowKeys` | `GridRowKey[]` | — | controlled 簡易版(`{ type:'include', rowKeys }` の糖衣)。`rowSelection` と併用時は `rowSelection` を優先。全選択(exclude)は表現不可。 |
| `onRowSelectionChange` | `(model: RowSelectionModel) => void` | — | 行選択変化の通知(controlled/uncontrolled いずれでも発火)。 |
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
| `globalFilterPlaceholder` | `string` | `'グローバルフィルター'` | 既定トップバーのグローバルフィルター入力の placeholder。`renderTopBar` 未指定時のみ有効。 |
| `globalFilterIcon` | `ReactNode` | 組み込み検索アイコン | 既定トップバーのグローバルフィルター入力の左アイコン。`renderTopBar` 未指定時のみ有効。`undefined`=組み込みの検索(虫眼鏡)アイコン / `null`(など falsy)=アイコン無し / 任意 `ReactNode`=差し替え。クリアボタンは入力枠の内側右に `×` で表示され、入力が空のときは出ない。 |
| `showBottomBar` | `boolean` | `true` | 下部バー(ステータスバー)の表示有無。`false` で `renderBottomBar` に関わらず一切描画しない(表示のマスタースイッチ。矛盾指定時は `renderBottomBar` より優先)。 |
| `showBottomBarCounts` | `boolean` | `true` | 既定ボトムバーの Rows / Columns 件数 chips(左側)の表示有無。`renderBottomBar` 未指定時のみ有効。右側の Active / Selection / 選択統計 / Cols は対象外。 |
| `showFilterChipBar` | `boolean` | `false` | フィルターチップバー(適用中の列フィルターをトップバー直下にチップで常時表示)の表示有無(opt-in)。有効フィルター 0 件時はバーごと非表示(空バーは出さない)。`showTopBar` とは独立。チップ本体クリックで対象列へジャンプしてフィルター popover を開き、× で個別クリア、「すべてクリア」は列フィルターのみ対象(グローバルフィルターは対象外)。 |
| `renderTopBar` | `(ctx: SpreadsheetGridSlotContext<T>) => ReactNode` | 内蔵トップバー | 上部バーの差し替え。未指定時は内蔵トップバー(summary chips + フィルター入力。内訳は `showTopBarSummary` / `showTopBarFilter` で制御。フィルター入力は `enableGlobalFilter=true` が前提)。`showTopBar=false` 時は本指定に関わらず描画されない。 |
| `renderBottomBar` | `(ctx: SpreadsheetGridSlotContext<T>) => ReactNode` | 内蔵ボトムバー | 下部バーの差し替え。未指定時は内蔵ステータスバー。`showBottomBar=false` 時は本指定に関わらず描画されない。 |
| `className` | `string` | — | ルート要素の class。 |
| `classNames` | `GridClassNames` | — | パーツ別の追加 class スロット。現状 `root` / `iconButton` / `bodyCell` / `bodyRow` が配線済み(他は順次)。基底 class は未レイヤー・特異度 (0,1,0)(THEME-1)。確実な上書きは連結セレクタ(例: `.ssg-root.my-theme`)を推奨。Tailwind v4 は `style.layer.css` も利用可。 |
| `getRowClassName` | `(row: T, rowIndex: number) => string \| undefined` | — | 行ごとの追加 class。行コンテナ + 各データセルに付与され、Tailwind 等での行ハイライトに使える。行ヘッダー「#」セルは現状対象外。 |
| `onStateChange` | `(state: GridState) => void` | — | 永続スライス(手動リサイズ幅 / フィルター / ソート)が**実際に変化したとき**に最新 `GridState` を渡して呼ばれる。保存タイミングの signal(例: localStorage 自動保存)。発火規約は「状態の保存 / 復元」節を参照。 |
| `enableContextMenu` | `boolean` | `false` | コンテキストメニュー機能の有効化(マスタースイッチ)。他機能の `enable*` と同じく**既定 OFF**。`false` のあいだは `getContextMenuItems` を渡しても発火せず、右クリックはブラウザ標準メニューのまま。現状はまだ機能 / UI に改善余地があるため既定 OFF で提供する(利用側で明示 opt-in)。 |
| `getContextMenuItems` | `(params: GridContextMenuParams<T>) => GridContextMenuItem[]` | — | セル/行の**完全カスタム**コンテキストメニュー。右クリック時のみ呼ばれ、返した項目でメニューを描画する(ライブラリは固定の既定項目を持たない)。opt-in は `enableContextMenu={true}` かつ本コールバックの指定の両方。**未指定、または `[]` を返したときはブラウザ標準の右クリックメニューへフォールスルー**(空パネルは出さない)。SSRM 未ロード行では開かない。ヘッダー右クリックは列メニュー(`enableColumnMenu`)が担当し、本メニューはボディ(セル / 行NO ガター)専用。詳細は「コンテキストメニュー」節を参照。 |
| `onContextMenuOpen` | `(params: GridContextMenuParams<T>) => void` | — | コンテキストメニューが実際に開いた直後の通知(項目が 1 件以上あり表示された場合のみ)。

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
| 適用中の列フィルターをチップで常時表示 | `showFilterChipBar`(既定 OFF) |
| フィルター機能ごと無効 + summary は残す | `enableGlobalFilter={false}` |
| 完全に自前のバー | `renderTopBar={(ctx) => …}` |

`showTopBarSummary` と `showTopBarFilter`(実効は `showTopBarFilter && enableGlobalFilter`)がともに `false` の場合、既定トップバーは描画されない(空バーを出さない)。

ボトムバーは Rows / Columns 件数のみ `showBottomBarCounts` で出し分けできる(右側の Active / Selection / 選択統計 / Cols は対象外)。それ以外の内訳を変えたい場合は `renderBottomBar` を使う。

### コンテキストメニュー(`enableContextMenu` / `getContextMenuItems`)

セル / 行の右クリックで開く**完全カスタム**メニュー。**既定は OFF**(`enableContextMenu={false}`)で、他機能の `enable*` と同じくマスタースイッチで有効化する(現状はまだ機能 / UI に改善余地があるため既定 OFF)。ライブラリは固定項目を一切持たず、`getContextMenuItems` が返した項目配列だけを描画する。用意されるのは「窓」(パネル外装 + 右クリック座標配置 + 開閉 / Escape / 外側クリック / スクロール close)だけで、中身(ラベル / アイコン / `onSelect`)はすべて利用側が渡す。列メニューと同じ `.ssg-menu-panel` / `.ssg-menu-item` 外装を再利用する。

**opt-in と標準メニューへのフォールスルー**

- `enableContextMenu` 未設定 / `false`(既定)→ ブラウザ標準の右クリックメニュー(`getContextMenuItems` を渡していても発火しない)。
- `enableContextMenu={true}` かつ `getContextMenuItems` が項目を返した → その項目が並んだメニューを右クリック座標に表示。
- `enableContextMenu={true}` でも `getContextMenuItems` 未指定 / `[]` を返した(対象で項目なし)→ ブラウザ標準メニュー(**空パネルは浮かせない**)。

**対象と挙動**

- **ヘッダー右クリックは対象外**(列メニュー `enableColumnMenu` が担当)。本メニューはボディの **データセル**と **行NO ガター**専用。
- **SSRM 未ロード行**(まだ取得できていない行)の上では開かない(標準メニューになる)。
- uncontrolled のみ。右クリックしても**セル選択は変化しない**(対象セル/行の情報は `params` で受け取る)。
- close 契機: 項目選択 / 外側クリック / Escape / スクロール。項目間のキーボード移動(矢印キー)は持たない。

**`GridContextMenuParams<T>`**(コールバック引数)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `target` | `GridContextMenuTarget<T>` | 右クリック対象。`{ type:'cell', rowIndex, colIndex, rowKey, row, column, value }` か `{ type:'rowHeader', rowIndex, rowKey, row }`(行NO ガター)。`rowIndex` はビュー行 index、`colIndex` は論理列 index(視覚順 左→中央→右 = `handle.selectCell` と同一空間)。 |
| `clientX` / `clientY` | `number` | 右クリックのビューポート座標(メニュー配置に使用済み。分岐の判断材料にも)。 |
| `selection` | `GridSelection` | 現在のセル範囲選択。チェックボックス行選択は `handle.getRowSelection()` で別途取得。 |
| `activeCell` | `CellCoord \| null` | 現在のアクティブセル。 |
| `isTargetSelected` | `boolean` | 対象(cell はそのセル / rowHeader はその行)が `selection` に含まれるか。「選択範囲への操作」か「単一対象への操作」かを分岐する簡便値。 |

**`GridContextMenuItem`**(判別共用体)

- **action(既定)**: `{ kind?: 'action'; id?; label: ReactNode; icon?: ReactNode; disabled?; danger?; onSelect: () => void }` — クリックで `onSelect` 実行後に自動で閉じる。`icon` 省略時も左 14px 枠が空スペーサになりラベル左端が揃う。`danger` は削除など危険操作の赤系強調(Mantine の `color="red"` 相当)。
- **label(見出し)**: `{ kind: 'label'; id?; label: ReactNode }` — 非インタラクティブなセクション見出し(Mantine の `Menu.Label` 相当)。項目群のグルーピング表示に使う。
- **separator**: `{ kind: 'separator'; id? }` — 区切り線(Mantine の `Menu.Divider` 相当)。
- **custom(レンダラ / エスケープハッチ)**: `{ kind: 'custom'; id?; render: (ctx: { close: () => void }) => ReactNode }` — パネル内に任意 JSX を差し込む。`close()` で任意タイミングに閉じられる。

`id` は React key 用(省略時は配列 index)。項目は非ジェネリック: 行データは `getContextMenuItems` 内で `params` を通じてクロージャに閉じ込める。

**例**

```tsx
<SpreadsheetGrid
  // …
  enableContextMenu // 既定 false。機能を使うにはこのマスタースイッチが必要
  getContextMenuItems={(params) => {
    const items: GridContextMenuItem[] = [];
    items.push({ kind: 'label', label: '操作' }); // セクション見出し
    if (params.target.type === 'cell') {
      const value = params.target.value; // narrowing はローカルへ退避してから onSelect で使う
      items.push({
        label: '値をコピー',
        icon: '📋',
        onSelect: () => navigator.clipboard?.writeText(String(value ?? '')),
      });
    }
    items.push({ kind: 'separator' });
    items.push({
      label: 'この行を削除',
      danger: true, // 赤系強調
      onSelect: () => deleteRow(params.target.rowKey),
    });
    items.push({ kind: 'separator' });
    items.push({
      label: '選択範囲を CSV 出力',
      disabled: !params.isTargetSelected,
      onSelect: () => gridRef.current?.downloadCsv('selection.csv', { scope: 'selection' }),
    });
    items.push({
      kind: 'custom',
      render: ({ close }) => (
        <div style={{ padding: '6px 8px' }}>
          行 {params.target.rowIndex}
          <button type="button" onClick={close}>閉じる</button>
        </div>
      ),
    });
    return items; // [] を返すと標準メニューへフォールスルー
  }}
  onContextMenuOpen={(params) => console.log('opened at', params.target)}
/>
```

**レシピ: 右クリックからフィルター管理パネルを開く**

適用中フィルターの一覧 / 編集 / クリアを行うフィルター管理パネル(列メニュー「フィルターを管理…」と同じもの)は、ハンドルの `openFilterManager()` で任意の場所から開ける。コンテキストメニューに載せる場合:

```tsx
const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);

<SpreadsheetGrid
  ref={gridRef}
  enableContextMenu
  getContextMenuItems={() => [
    {
      label: 'フィルターを管理…',
      onSelect: () => gridRef.current?.openFilterManager(),
    },
  ]}
/>;
```

## GridColumn props (`GridColumn<T>`)

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | (required) | 列の一意キー。 |
| `title` | `string` | — | ヘッダーの表示ラベル。 |
| `width` | `number` | (required) | 列幅(px)。 |
| `minWidth` | `number` | — | リサイズ時の下限幅。flex 配分時の下限クランプにも使用(flex 列で未指定なら内部既定 50px)。 |
| `maxWidth` | `number` | — | 上限幅。**未指定なら上限なし**(autoSize は内容にぴったり合わせ、手動リサイズも自由に広げられます。既定の上限は設けません)。指定すると autoSize / 手動リサイズ / flex 配分の上限クランプに使われます。 |
| `flex` | `number` | — | center 列(非 pinned)の伸縮比。余り幅(コンテナ幅 − 行ヘッダー − pinned 合計 − `width` 固定列の合計)を flex 比で配分し `minWidth`/`maxWidth` でクランプ。コンテナ追従でリアクティブに伸縮。手動リサイズで固定 px へ変化(`columns` 変化まで固定 → 以後 flex 復帰)。pinned 列では無視。詳細は下記「flex と autoSize」節。 |
| `resizable` | `boolean` | グリッドの `enableColumnResize` を継承 | この列の手動リサイズ可否。`false` でヘッダーのリサイズハンドルを非表示。リサイズハンドルの**ダブルクリック**でその列を内容幅へ autoSize(`false` 時はハンドルが無いため不可。列メニューからの autoSize は引き続き可能)。 |
| `suppressAutoSize` | `boolean` | `false` | `true` で autoSize の対象外(列メニュー / 境界ダブルクリック / すべての列の自動調整すべてでスキップ)。consumer 指定の `width` を維持(固定幅優先)。テキストで測れないカスタムUI列や固定で見せたい列向けの per-column opt-in。 |
| `estimateCellWidth` | `(row, column) => number` | — | autoSize の幅見積もり。指定列は「セル内容の content 幅(px・セルの padding/border を除く)」をこの関数から得て、**全行の最大 + セル枠**で確定します(テキスト/候補/実 DOM 計測を使わず、React mount もしません)。テキスト長が実描画幅と相関しない renderCell カスタムUI列(横並びバッジ等)向けの opt-in。返す値は `renderCell` の実描画幅と一致させること。 |
| `autoHeight` | `boolean` | — | この列が auto-height 行の高さを駆動(グリッドの `autoHeight` 有効時のみ)。**autoSize の対象外**(折り返し前提のため。下記「flex と autoSize」の制約を参照)。 |
| `visible` | `boolean` | — | 列の表示/非表示。 |
| `editable` | `boolean` | — | この列の編集を許可。 |
| `readOnly` | `boolean` | — | この列を読み取り専用にする。 |
| `pinned` | `'left' \| 'right'` | undefined = 中央スクロール | 列固定の方向。 |
| `getValue` | `(row: T) => unknown` | `row[key]` | 値アクセサ。 |
| `setValue` | `(row: T, value: unknown) => T` | — | 値ライター(新しい行を返す)。 |
| `renderCell` | `(ctx: CellRenderContext<T>) => ReactNode` | プレーン `<span>` | カスタムセル描画。 |
| `align` | `'left' \| 'center' \| 'right'` | `'left'` | セル内容の水平寄せ(UI 表示のみ・元の値は不変)。セル表示と編集 input に反映。 |
| `valueFormatter` | `(params: CellValueFormatterParams<T>) => string` | — | セル表示値の整形(UI 表示のみ)。`renderCell` 未指定の既定セルが返り値を表示。組み込み `numberFormatter` 等を渡せる。元の値/編集/コピー/ソート/フィルターには影響しない。 |
| `cellClassName` | `string \| ((ctx: CellStyleContext<T>) => string \| undefined)` | — | セルへ付与する追加 class(条件付きスタイル)。関数版は値 / 状態に応じて class を返せる。基底 `.ssg-body-cell` は未レイヤー・特異度 (0,1,0)。確実な上書きは `.ssg-body-cell.my-class` の連結を推奨。 |
| `renderHeader` | `(ctx: HeaderRenderContext<T>) => ReactNode` | — | カスタムヘッダー描画。 |
| `filterType` | `'text' \| 'number' \| 'date' \| 'select' \| 'set' \| 'custom'` | — | フィルター UI の種別。 |
| `filterOptions` | `GridSelectFilterOption[]` | rows から自動収集 | select / set の候補。 |
| `filterFn` | `(row: T, filterValue: unknown) => boolean` | — | カスタムフィルター述語。 |
| `parseClipboardValue` | `(raw: string, row: T) => unknown` | — | 貼り付け時のパーサ。 |
| `formatClipboardValue` | `(value: unknown, row: T) => string` | — | コピー時のフォーマッタ。 |

### 値フォーマッタ(UI 表示)

`valueFormatter` はセルの**表示文字列だけ**を変えます(元の値・編集・コピー・ソート・フィルターは生値のまま)。組み込みファクタは `logic/valueFormatters.ts` に集約し、バレルから公開します。利用側も同じ契約(`CellValueFormatter<T>`)で自作でき、将来パターン(日付/％/通貨等)はファクタ追加 + バレル公開で拡張できます。

- `numberFormatter(options?)` — 数値を 3 桁区切りで整形。既定は**元の精度を保持**(小数桁を勝手に丸めない)。`minimumFractionDigits` / `maximumFractionDigits` で固定桁、`useGrouping: false` で区切り無効、`locale` 指定可。`null` / `undefined` / `''` は `emptyText`(既定 `''`)、数値化できない値は原値の文字列をそのまま表示。

使用例:

```ts
import { numberFormatter } from '@ishibashi0112/spreadsheet-grid';

const columns = [
  { key: 'amount', title: '金額', width: 140, align: 'right', valueFormatter: numberFormatter() },
];
```

### flex と autoSize(列幅の決め方)

列幅を「グリッドに決めさせる」方法は 2 つあり、**決め方が異なる別概念**です。列ごとに使い分けでき、混在も可能です。どちらを使うべきか迷ったら下表で選びます。

| | flex(`column.flex`) | autoSize(列メニュー / 境界ダブルクリック) |
| --- | --- | --- |
| 何に合わせる | **コンテナの余り幅**(中身は見ない) | **セルの中身の長さ**(コンテナは見ない) |
| 反応性 | コンテナのリサイズに**追従してリアクティブに伸縮** | 実行時の内容で**固定 px を一度だけ算出**(以後自動追従しない) |
| 起動 | 列定義の `flex` を指定(= 宣言的) | 列メニュー「この列の幅を自動調整 / すべての列の幅を自動調整」、またはヘッダー境界(リサイズハンドル)の**ダブルクリック**でその列だけ(= 操作) |
| 適用範囲 | center 列(非 pinned)のみ | 任意の列 |
| 典型用途 | テーブルを横いっぱいに使う / 余白を特定列に吸わせる | 中身が切れないようにする |

- **flex** — `flex` を持つ center 列が「利用可能幅(コンテナ幅 − 行ヘッダー − pinned 合計 − `width` 固定列の合計)」を `flex` 比で分け合い、`minWidth`/`maxWidth` でクランプされます。固定列合計が利用可能幅を超えると flex 列は最小幅(`minWidth`、未指定時は内部既定 50px)まで潰れ、超過分は横スクロールになります。pinned 列では無視されます。
- **autoSize** — セルの中身に合わせて固定 px を一度だけ算出します(コンテナ幅は見ません)。算出時点の内容で幅が確定し、その後コンテナや内容が変わっても自動では追従しません。起動は列メニューのほか、ヘッダー境界(リサイズハンドル)の**ダブルクリック**でもその列を内容幅へ合わせられます(リサイズ可能な列のみ。AG Grid の境界ダブルクリック相当)。\
  計測は 2 段方式です。**Phase 1** で全表示行を canvas で概算して列ごとの最長候補を絞り、**Phase 2** で候補だけを grid root 配下の隠しセルで**実 DOM 実測**します。これにより**全行を見つつ**(画面外の最長値も反映)、**`valueFormatter` の整形結果・letter-spacing・padding まで実描画どおりに反映**され、はみ出しません。`suppressAutoSize: true` の列は計測対象から外れ `width` を維持します。\
  renderCell で独自 DOM(バッジ等)を描く列は、テキストでは幅が出ないため `estimateCellWidth` を指定します。指定列は Phase 1/2 のテキスト計測を使わず、**`estimateCellWidth(row)` が返す content 幅の全行 running-max + セル枠**で確定します(consumer 申告を信頼。mount なし)。\
  **制約 — `autoHeight: true` の列は autoSize の対象外です**(列メニュー / 境界ダブルクリック / すべての列の自動調整すべてでスキップし、`width` を維持)。autoHeight 列は「幅を固定して長文を**折り返す**」のが本来の挙動ですが、autoSize の計測は**単一行**で行うため、autoHeight 列を測ると折り返したい長文を1行幅にし、**極端に横長になる**ためです(列幅に既定の上限は無いため、長文ぶんだけ際限なく広がります)。長文列は autoHeight(折り返し)か、`maxWidth` 付きの固定幅(切り詰め)で運用してください。

flex 列を**手動リサイズ**すると、その列はドラッグした幅で**固定 px**に変わります(以後その列は flex 対象外)。固定は `columns` prop が変化する(pin 切替 / 表示切替 / 並べ替え / 親による差し替え)まで維持され、変化後は再び flex に復帰します(手動幅を恒久固定する仕様ではありません)。

## 命令的 API(ref ハンドル / `SpreadsheetGridHandle<T>`)

状態(列幅・可視・sort・filter 等)は controlled のまま、**prop では表現しづらい一発操作**だけを ref ハンドルで提供する。React 19 の **ref-as-prop**(`forwardRef` 不使用)で受け取る。

```tsx
import { useRef } from 'react';
import {
  SpreadsheetGrid,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';

const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
<SpreadsheetGrid<Row> ref={gridRef} columns={cols} rows={rows} />;
// gridRef.current?.scrollToRow(5000, { align: 'center' });
// const csv = gridRef.current?.exportCsv({ scope: 'selection' });
```

`viewRowIndex` / `colIndex` は**ビュー座標**(フィルター/ソート適用後の表示 index。`colIndex` は固定列を含む視覚順 = 左→中央→右)。範囲外 index は内部でクランプ/無視する。

### スクロール

| メソッド | 説明 |
| --- | --- |
| `scrollToRow(viewRowIndex, { align? })` | 指定行を可視域へ。`align`(既定 `'auto'`): `'auto'`(最小スクロール) / `'start'` / `'center'` / `'end'`。 |
| `scrollToCell(viewRowIndex, colIndex, { align? })` | 指定セルを縦横とも可視域へ。固定列(左右ピン)は常に可視のため横スクロールしない。 |
| `scrollToTop()` / `scrollToBottom()` | 先頭 / 末尾へ。 |
| `getVisibleRowRange()` | 現在描画中の行ウィンドウ `{ startIndex, endIndex }`(end 排他)。空は `null`。 |

### 選択 / アクティブセル

| メソッド | 説明 |
| --- | --- |
| `getActiveCell()` | 現在のアクティブセル `{ row, col }`(なければ `null`)。 |
| `setActiveCell(cell \| null, { scrollIntoView? })` | アクティブセル設定(`null` で解除)。`scrollIntoView` で可視化も行う。 |
| `getSelection()` | 現在の選択状態(`GridSelection`)。 |
| `selectCell(viewRowIndex, colIndex, { scrollIntoView? })` | 単一セル選択(クリック相当)。 |
| `selectRange(range, { scrollIntoView? })` | セル範囲選択(ドラッグ相当)。アンカーは `range.start`。 |
| `clearSelection()` | 選択解除。 |
| `getSelectedRows()` | 選択に交差する行(distinct)を返す。serverSide はロード済み行のみ。 |

> 注: `getSelectedRows()` は**セル範囲選択**に交差する行です。下の**チェックボックス行選択**(`enableRowSelection`)とは別レイヤーで、そちらは `getSelectedRowKeys()` / `getSelectedRowData()` を使います。

### 行選択(チェックボックス選択)

`enableRowSelection` を有効にしたチェックボックス行選択の状態を操作します(`getSelectedRows()`=セル範囲由来とは別物)。記述子は `RowSelectionModel = { type: 'include'; rowKeys } | { type: 'exclude'; rowKeys }`(exclude=全選択のうち除外。全選択をキー列挙せず表現)。

| メソッド | 説明 |
| --- | --- |
| `getRowSelection()` | 現在の行選択記述子(`RowSelectionModel`)。 |
| `setRowSelection(model)` | 行選択記述子を設定。controlled 時は `onRowSelectionChange` 経由で親へ委譲(内部 state は書かない)。 |
| `getSelectedRowKeys()` | 選択中の行キー配列。`include` はそのまま O(選択数)、`exclude` は現在の全行から除外を差し引いて列挙(O(行数))。serverSide はロード済みキーのみ。 |
| `getSelectedRowData()` | 選択中の行データ。行の探索が要るため O(行数)。キーで足りるなら `getSelectedRowKeys()` を推奨。serverSide はロード済み行のみ。 |
| `getSelectedRowCount()` | 選択件数。`exclude` は 総行数 − 除外数 で一定コスト。 |
| `isRowSelected(rowKey)` | 指定キーが選択中かを O(1) 判定。 |
| `selectAllRows()` | 全行を選択(exclude モード=キーを列挙しない)。 |
| `clearRowSelection()` | 行選択をすべて解除。 |

**操作(有効時)**: 行ヘッダ(行NO)ガター全体が選択のヒット領域。multiple はクリックでトグル・shift+クリック/ガタードラッグで範囲、single は常に 1 行。ヘッダ左上コーナーは tri-state の全選択チェック(`enableSelectAllRows`)。参照性能維持のため判定は Set の O(1)、全選択は除外集合でキーを materialize しません。

**controlled**: `rowSelection`(記述子)または `selectedRowKeys`(include 糖衣)を渡すと controlled。`onRowSelectionChange` で変化を受け、親が prop を更新して反映します。

### CSV エクスポート

| メソッド | 説明 |
| --- | --- |
| `exportCsv(options?)` | CSV 文字列を返す(純粋・副作用なし)。 |
| `downloadCsv(filename?, options?)` | `exportCsv` の結果を `.csv` としてダウンロード(`filename` 既定 `'export.csv'`、`bom` 既定 `true`)。 |

`CsvExportOptions`: `scope`(下表)、`includeHeaders`(既定 `true`)、`delimiter`(既定 `','`。`'\t'` で TSV)、`bom`(`exportCsv` は既定 `false` / `downloadCsv` は既定 `true` = Excel 互換)。値整形はコピー(クリップボード)と同じ規則(`formatClipboardValue` があればそれ、無ければ `String(value ?? '')`)。RFC 4180 のクォート、行区切りは CRLF。

**scope 対応表**(`exportCsv` / `downloadCsv` / `getExportData` 共通):

| scope | 意味 | スクロール位置 |
| --- | --- | --- |
| `'view'`(**既定**) | ビュー行全体(フィルター/ソート/列可視・固定順を反映) | 非依存 |
| `'raw'` | 全ソース行(`rows` 配列順)。**フィルターもソートも無視**(列は可視列・固定順に従う) | 非依存 |
| `'rendered'` | 仮想化ウィンドウ(いま**描画中**の行のみ・オーバースキャン込み) | **依存** |
| `'selection'` | 現在の選択範囲(セル/行/列)。選択なしは空 | — |
| `'all'` | **@deprecated** `'view'` のエイリアス(挙動同一) | 非依存 |
| `'visible'` | **@deprecated** `'rendered'` のエイリアス(挙動同一)。「フィルターで見えている行」では**ない**点に注意 | **依存** |

serverSide(SSRM)の注意: `'view'` は未ロード行をスキップ(= ロード済みビュー行のみ)。`'raw'` はソース行配列を持たないため `'view'` 相当へフォールバックし `console.warn` を出す。**全件エクスポートはサーバ側での実施を推奨**。

### Excel / スプレッドシート エクスポート(getExportData)

| メソッド | 説明 |
| --- | --- |
| `getExportData(options?)` | 列メタ + 2 次元セルの、シリアライズ非依存な整形済みデータを返す(純粋・副作用なし)。 |

`GridExportOptions`: `scope`(既定 `'view'`。上記 **scope 対応表**と同一規則を共有)。

戻り値 `GridExportData`:

```ts
type GridExportData = {
  columns: { key: string; title: string }[];   // 視覚順(selection では選択列のみ)
  rows: { value: unknown; text: string }[][];   // scope の行レンジ(SSRM 未ロード行はスキップ)
};
```

各セルは生値 `value`(`getCellValue`)と文字列 `text`(CSV と同じ規則 = `formatClipboardValue ?? String(value ?? '')`)の双方を持つ。`value` があることで型付きセル(数値/日付のまま)+ Excel 側の数値書式へ流せる。`columns.key` はオブジェクト系ライブラリ向け、`title` はヘッダー表示向け。

**方針**: 本ライブラリは xlsx ライブラリを**同梱しない**(バンドル肥大・ライブラリ選定の押し付けを避ける)。グリッドは「現在の表」を整形済みデータで渡す**導線**に徹し、`.xlsx` / `.ods` 等の生成は consumer が任意のライブラリで行う。**マルチシートは consumer 側で本メソッドを scope 別 / グリッド別に呼び出して組み立てる**(グリッドは「1 表」を返すプリミティブ)。

#### レシピ: hucre(zero-dep・~14KB gzip・ESM/edge)

```ts
import { writeXlsx } from 'hucre/xlsx';

const { columns, rows } = gridRef.current!.getExportData({ scope: 'view' });
const buffer = await writeXlsx({
  sheets: [
    {
      name: 'Sheet1',
      columns: columns.map((c) => ({ header: c.title, key: c.key })),
      // 生値 value を型付きセルとして書く(数値/日付はそのまま)。
      data: rows.map((r) =>
        Object.fromEntries(r.map((cell, i) => [columns[i].key, cell.value])),
      ),
    },
  ],
});
// buffer(Uint8Array)を Blob 化してダウンロード。
```

#### レシピ: ExcelJS

```ts
import ExcelJS from 'exceljs';

const { columns, rows } = gridRef.current!.getExportData({ scope: 'view' });
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Sheet1');
ws.addRow(columns.map((c) => c.title)); // ヘッダー
for (const r of rows) ws.addRow(r.map((cell) => cell.value)); // 型付きセル
const buffer = await wb.xlsx.writeBuffer();
```

#### レシピ: マルチシート

scope 違い(または複数グリッド)を複数シートに:

```ts
import { writeXlsx } from 'hucre/xlsx';
import type { GridExportData } from '@ishibashi0112/spreadsheet-grid';

const toSheet = (name: string, d: GridExportData) => ({
  name,
  columns: d.columns.map((c) => ({ header: c.title, key: c.key })),
  data: d.rows.map((r) =>
    Object.fromEntries(r.map((cell, i) => [d.columns[i].key, cell.value])),
  ),
});

const buffer = await writeXlsx({
  sheets: [
    toSheet('View', gridRef.current!.getExportData({ scope: 'view' })),
    toSheet('Selection', gridRef.current!.getExportData({ scope: 'selection' })),
  ],
});
```

1 グリッドをカテゴリ列で分割して N シートにする場合は、`getExportData({ scope: 'view' })` の戻りを「分割キー列の `value`」で group して各 group を `toSheet` 化する(列 index は `columns.findIndex((c) => c.key === '...')` で解決)。

### UI パネル

| メソッド | 説明 |
| --- | --- |
| `openFilterManager()` | フィルター管理パネル(適用中の列フィルターの一覧 / 該当列へジャンプして編集 / 個別・全クリア / 追加)を開く。`enableColumnFilter=false` のときは何もしない。列メニューの「フィルターを管理…」/ 既定トップバーの **Filters chip クリック**(`enableColumnFilter=true` 時にクリック可能)と同じパネル。 |
| `closeFilterManager()` | フィルター管理パネルを閉じる(開いていなければ何もしない)。 |

### ツールチップ(TT-1)

グリッド内・ポータル内の操作ヒント / 切り詰めテキスト全文表示は、`title` 属性ではなく**カスタムツールチップ**(`.ssg-tooltip`・body 直下シングルトン)で表示される。表示対象は `data-ssg-tooltip="文言"` 属性で、window の pointerover / focusin 委譲で拾うため、**利用側が自前の要素(カスタムセル / renderHeader 等)へ同属性を付けても同じ見た目のツールチップが出る**。配色は `--ssg-tooltip-bg / --ssg-tooltip-text / --ssg-tooltip-shadow` トークンで調整可能。公開 props / ハンドルの追加はなし。

### 状態の保存 / 復元

| メソッド | 説明 |
| --- | --- |
| `getState()` | 永続化対象(手動リサイズ幅 / フィルター / ソート)のスナップショット `GridState` を返す(純粋・副作用なし)。新規オブジェクトなのでそのまま `JSON.stringify` して保存できる。 |
| `applyState(state)` | `getState()` の値(または互換な部分形)を適用する。外部入力は内部で防御的に正規化され、幅 reset / フィルター一括 / ソート set の 3 dispatch(1 イベント = 1 再レンダー)で反映。clientSide / serverSide 双方に効く(SSRM は `filters`/`sort` 変化がクエリへ載り再取得)。 |

`GridState`: `{ version, columnWidths, filters, sort }`。`version` はマイグレーション用(現行 `1`)。対象は reducer 内の永続スライスのみで、列の可視/順序/ピン/flex は `columns` prop 側(consumer 所有)のため**含めない**。`activeCell` / `selection` などの一時 UI も含めない。`columnWidths` は手動リサイズした列のみを含む(flex 列はエントリを持たない規約)。`custom` フィルターの `value`(`unknown`)は深いコピーをしないため、シリアライズ可能性は consumer 責務。`applyState` は壊れた/部分的な入力にも耐える(非数値の幅・`kind` 無しの列フィルター・不正な `direction` は捨てる)が、列フィルター値の `kind` 中身までは検証しないため `getState` 出力の往復を前提とする。

```ts
// 保存(任意の永続先へ)。
const state = gridRef.current?.getState();
localStorage.setItem('grid-state', JSON.stringify(state));

// 復元。
const saved = localStorage.getItem('grid-state');
if (saved) gridRef.current?.applyState(JSON.parse(saved));
```

#### 変更通知 `onStateChange`

`onStateChange?: (state: GridState) => void`(prop)は、永続スライスが**実際に変化したとき**だけ最新 `GridState` を渡して呼ばれる。保存タイミングの signal として使える(`getState()` を別途叩く必要がない)。発火規約:

- **ドラッグ中は保留**: 列リサイズ / 範囲選択のドラッグ中は確定前のため発火しない。確定(ドラッグ終了)後に 1 回だけ評価する。これにより列リサイズの毎フレーム更新では発火せず、**確定幅で 1 回だけ**通知される。
- **初回マウントでは発火しない**: 初期状態は通知対象外(復元は `applyState` 側の責務)。
- **同値では発火しない**: 前回通知と構造等価(永続スライスが不変)なら発火しない。`activeCell` / `selection` などの一時 UI 変化では発火しない。
- **`applyState` も「状態変化」として発火する**: 復元直後に同値を 1 回保存し直す可能性がある(冪等なので実害はない。避けたい場合は consumer 側で直前値と比較してスキップ)。
- インライン関数を毎レンダー渡してよい(内部で latest-ref 経由で読むため、関数の参照変化では再評価しない)。

```ts
// 自動保存(変化時)+ マウント時復元。
const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);

useEffect(() => {
  const saved = localStorage.getItem('grid-state');
  if (saved) gridRef.current?.applyState(JSON.parse(saved));
}, []);

<SpreadsheetGrid
  ref={gridRef}
  columns={columns}
  rows={rows}
  onStateChange={(state) =>
    localStorage.setItem('grid-state', JSON.stringify(state))
  }
/>
```

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

サーバ側のデータが外部で更新された場合など、**クエリは変えずにサーバの最新を取り直したい**ときは `serverSideRefreshToken`(`number`)を増やす。controlled な設計に合わせた軽量な signal。serverSide の取り直しは命令的ハンドル(`SpreadsheetGridHandle`)ではなくこの token で行う(本バッチではハンドルに serverSide refresh を含めていない)。

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
- `SpreadsheetGridSlotContext<T> = { rows, filteredRows, columns, visibleColumns, globalFilterText, columnFilterValues, sortState, setGlobalFilterText, activeCell, selection, derivedSummary, globalFilterStatus, globalFilterProgress }`
  - `derivedSummary` は `SpreadsheetGridDerivedSummary`(行/列/フィルター/ソートの summary 文字列・選択統計などを内包)。helper を import せずトップ/ボトムバーで使える。
  - `globalFilterStatus: GlobalFilterStatus`(`'idle' | 'filtering' | 'ready'`)/ `globalFilterProgress: number`(0..1)。グローバルテキストフィルタは行数が大きい(しきい値 50,000 行・条件は `rows.length > 50000`)とき、入力を主スレッドを塞がず時間分割で適用する。適用中は `status='filtering'`・`progress` が進捗(0..1)になる。空/無効は `'idle'`、確定は `'ready'`(progress=1)。50,000 行以下は同期適用のため即 `'ready'`(`'filtering'` を経由しない)。**ローディング表示はグリッドが本体に重ねる組み込み overlay(autosize の計測中 overlay と同じ作法)で行うため、トップバーやカスタム UI 側で扱う必要は通常ない。** この 2 値は、入力の無効化や独自インジケータなどカスタム UI を出したい場合の参照用に公開している。serverSide では基本 `'idle'` / `'ready'`(取得中表示は行スケルトンが担当)。

## ライブラリ化の宿題(現状把握)

- 〔解消〕**no-op props**: `enableClipboard` / `enableColumnResize` を型から削除(常時 ON 固定の挙動は不変)。将来「無効化」が必要になれば配線つきで非破壊追加する。
- 〔追加済み〕**imperative API(ref ハンドル)**: `SpreadsheetGridProps.ref` で `SpreadsheetGridHandle<T>` を受け取り、スクロール / 選択操作 / CSV / エクスポートデータ(`getExportData`)/ 状態の保存・復元を命令的に呼べる(React 19 ref-as-prop、`forwardRef` 不使用)。詳細は「命令的 API」節。列状態のシリアライズ(`getState` / `applyState`)・変更通知 `onStateChange` prop は追加済み(対象は reducer 内の永続スライス = 手動リサイズ幅 / フィルター / ソート)。列の可視/順序/ピン/flex の状態化は `columns` prop 側で consumer 所有のため未対応(将来 columns 抽出/適用を入れるなら別途合意)。
- 〔解消〕**公開バレル(`index.ts`)**: 入口を `index.ts` に集約し、`SpreadsheetGrid`(named)と公開型群(serverSide 型・`RowModel` 含む)を再エクスポート。`default export` は廃止。
- **テーマ/スタイリング API**: 公開されるのは `className`(ルート1個)のみ。パーツ単位のクラスや CSS トークンは未提供。