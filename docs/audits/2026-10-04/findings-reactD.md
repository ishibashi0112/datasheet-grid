# findings-reactD — React シェル / エディタ / hooks / 公開バレルの監査

## 1. 概要

- 読んだ範囲(全文): `packages/react/src/SpreadsheetGrid.tsx`(4,591 行)、`CellEditorLayer.tsx` / `ActiveCellOverlay.tsx` / `SelectionOverlay.tsx`、`editors/*.tsx` + `editorKeyBindings.ts`、`hooks/useGridStore.ts` / `useVirtualizerCore.ts` / `useGridBarContext.ts` / `useResolvedGridSlots.ts` / `useResolvedGridTheme.ts` / `useController.ts`(他 hooks は配線確認のみ)、`model/gridTypes.ts`、`index.ts`、結合テスト 20 本のケース名と主要 4 本の本文。
- 挙動確認のため core 側も参照: `controllers/editController.ts` / `keyboardController.ts` / `pointerInteractionsController.ts` / `clipboardController.ts`(handlePaste 周辺)/ `scrollSyncController.ts` / `autoHeightMeasurer.ts` / `debouncedValueStore.ts` / `historyController.ts`、`engine/gridApi.ts` / `columnLayout.ts` / `createGridEngine.ts` / `notifiers.ts`、`model/gridReducer.ts` / `gridStore.ts`、`view/GridBodyLayer.tsx`(readonly クラス / canEditCell 呼び出し箇所)。
- 検証: 一時テスト 3 ファイル(13 ケース)を作成し実行。再現したものは「確実」、コードパスのみのものは「高 / 中」。一時ファイルは削除済み(`git status --short` 空)。
- 所見: **12 件**(高 2 / 中 4 / 低 6)。

## 2. 所見一覧

| ID | 重要度 | 確度 | 要約 | file:line |
| --- | --- | --- | --- | --- |
| RD-1 | 高 | 確実 | 編集中に行順 / 列構成が変わると、確定値が「同じ index に来た別の行 / 別の列」へ書き込まれる(editingCell が view index のまま再解決されない) | `core/src/controllers/editController.ts:123-162`, `react/src/SpreadsheetGrid.tsx:1797-1850`, `react/src/CellEditorLayer.tsx:113-121` |
| RD-2 | 高 | 確実 | エディタ input への貼り付け(Ctrl+V)がシェルの `onPaste` に捕まり、input への貼り付けが `preventDefault` で阻止された上に rows へ直接書き込まれる(確定時にドラフトが上書き) | `react/src/SpreadsheetGrid.tsx:3850`, `core/src/controllers/clipboardController.ts:153-183` |
| RD-3 | 中 | 確実 | 編集中に編集行が消える(rows 差し替え / 行数減)とエディタ DOM だけ消え `editingCell` が残り、キーボード操作が全滅・ドラフト消失(ダブルクリックまでロック) | `react/src/SpreadsheetGrid.tsx:1801-1811, 1846-1850`, `core/src/controllers/keyboardController.ts:139-141` |
| RD-4 | 中 | 確実 | `canEditCell(rowIndex, …)` の `rowIndex` が経路で空間が違う(表示 / 編集開始 / SSRM = view index、clientSide の貼り付け / Delete クリア = source index)。ソート・フィルター中に同じセルの可否判定が食い違う | `react/src/SpreadsheetGrid.tsx:2097-2104, 2178-2184`, `core/src/controllers/clipboardController.ts:295-296`, `react/src/view/GridBodyLayer.tsx:290-296`, `API_REFERENCE.md:41` |
| RD-5 | 中 | 確実 | `columns` prop の参照が変わるたびに手動リサイズ幅 / `applyState` の幅が既定幅へ全置換される(インライン `columns={[...]}` の利用側では編集のたびにリセット、`onStateChange` も既定幅で発火し保存状態を上書き) | `react/src/SpreadsheetGrid.tsx:926-940`, `core/src/model/gridReducer.ts:306-310` |
| RD-6 | 中 | 高 | `readOnly` が「グリッド全体の編集を無効化」になっていない: ①編集中に `readOnly=true` へ切り替わっても Enter / blur で書き込まれる ②`renderCell` の `setValue` は `readOnly` / `canEditCell` を見ずに書き込む | `core/src/controllers/editController.ts:102-169`, `react/src/SpreadsheetGrid.tsx:3231-3259`, `API_REFERENCE.md:39` |
| RD-7 | 低 | 確実 | `CellEditorLayer` のセッション再マウントは rect の null→非 null のみ検知。非 null→別セルの非 null では前セルのドラフトが残る(フォーカスを持たない custom エディタ中に別セルをダブルクリックすると到達) | `react/src/CellEditorLayer.tsx:113-121`, `react/src/SpreadsheetGrid.tsx:2341-2372` |
| RD-8 | 低 | 確実 | serverSide では `noMatchingRowsText` が表示されない(`rows.length === 0` 判定のため常に `noRowsText`)。また `rows` と `dataSource` 併用時に clientSide パイプライン(グローバルフィルター / 候補収集 / inferFilterType)が rows に対して空走する | `react/src/SpreadsheetGrid.tsx:4458-4460, 1022-1033, 3051-3055` |
| RD-9 | 低 | 確実 | 印字キーで select エディタを開いたとき、その 1 文字がタイプアヘッドに使われず捨てられる(doc「印字キーはその 1 文字を初期値に」と不一致) | `react/src/CellEditorLayer.tsx:191-211`, `react/src/editors/SelectCellEditor.tsx:173-192` |
| RD-10 | 低 | 確実 | a11y: ラベル行(通常 / sticky 複製)だけ `role="row"` を持ち、親に `grid` / `rowgroup` が無い孤立 role。データ行 / セル / ヘッダーには role・`aria-sort` が無く、シェル(`tabIndex=0`)にも role / aria-label が無い。行選択 / checkbox 列の `role="checkbox"` はフォーカス不能 | `react/src/view/GridBodyLabelRow.tsx:68`, `react/src/view/GridStickyLabelLayer.tsx:66`, `react/src/SpreadsheetGrid.tsx:3835-3853`, `react/src/editors/CheckboxCell.tsx:24-27` |
| RD-11 | 低 | 高 | `setActiveCell` / `selectCell` の `scrollIntoView` オプションに関わらず、中央ペインのアクティブセルは座標変化で常に可視化スクロールされる(doc は「`scrollIntoView` で可視化も行う」) | `core/src/controllers/viewportSyncController.ts:159-182`, `core/src/engine/gridApi.ts:435-460`, `API_REFERENCE.md:864-866` |
| RD-12 | 低 | 確実 | 公開バレルの軽微な過不足: `onUndoRedoStateChange` の引数型 `UndoRedoState` が未公開(doc はインライン `{ canUndo, canRedo }` 表記)。それ以外の API_REFERENCE 記載型はすべて公開済み | `react/src/index.ts`, `core/src/model/gridTypes.core.ts` |

## 3. 各所見の詳細

### RD-1(高 / 確実)編集中に行順 / 列構成が変わると別の行 / 列へ書き込む

- 再現(一時テスト T1 / T1b で確認):
  1. `setActiveCell({row:0,col:0})` → 印字キーで編集開始(view 0 = 行 `a`)→ ドラフト `EDITED`。
  2. 編集中に `applyState({ sort: name desc })`(外部からの状態復元 / 他 UI のソート)→ view 0 は行 `c` になる。エディタは開いたまま(rect は view index 0 に残る)、ドラフトも残る。
  3. Enter → `onRowsChange` の変更行は **`c`**(本来 `a`)。`next[2].name === 'EDITED'`、`a` は不変。
  4. 列版: col 1(qty)を編集中に `columns` で name 列を `visible:false` に → Enter で **memo 列**に書き込まれる。
- 原因: `editingCell` は `{ row, col }` の view / 論理 index のみで、`commitEdit` が確定時点の `rowModel.getSourceIndex(editingCell.row)` / `visibleColumns[editingCell.col]` で再解決する(editController.ts:135-139)。行の同一性(rowKey)や列の同一性(key)を保持していないため、確定までの間に order / orderedColumns が変わると別対象へ書く。`CellEditorLayer` も rect が非 null のままなのでセッションを再マウントせず、ドラフトを維持したまま別セルへ確定する。
- 成立条件: 編集中に非対話的に rows / columns / sort / filter が変わるケース(ポーリング・サーバープッシュによる rows 差し替え、他コンポーネントからの `applyState`、SSRM の `refreshServerSide` / `serverSideRefreshToken` で同 index に別行が来る等)。対話的トリガー(ヘッダークリック等)は pointerdown のフォーカス移動で先に blur 確定するため通常は到達しない。
- 修正の方向性: 編集セッションに rowKey / columnKey を保持し、確定時に `rowKey → 現在の view index` / `columnKey → 現在の論理 index` を再解決(見つからなければ cancel)。または rows / order / orderedColumns が変わった時点で編集を cancel(or commit)する。

### RD-2(高 / 確実)エディタ input への貼り付けがグリッド貼り付けに化ける

- 再現(T3): 編集開始 → `fireEvent.paste(input, { clipboardData: 'PASTED' })` → `fireEvent` が `false`(= `preventDefault` 済み = input のネイティブ貼り付けが抑止)、`onRowsChange` が 1 回呼ばれ `rows[0].name === 'PASTED'`、エディタは残りドラフトは `x` のまま。続く Enter / blur で `x` が `PASTED` を上書きする(undo 履歴にも 1 段積まれる)。
- 原因: `.ssg-shell` の `onPaste={handlePaste}`(SpreadsheetGrid.tsx:3850)に、エディタ input(シェル内)からの paste がバブルする。`handlePaste`(clipboardController.ts:153-183)は `readOnly` / 書き込み口 / `activeCell` しか見ず、`uiState.editingCell` や `event.target`(input / textarea / contenteditable)を判定しない。キーボード側は `shouldIgnoreGridKeydown(target)` + `editingCell` ガードがあるのに貼り付けだけ無い。`renderCell` / `renderHeader` 内の利用側 input(シェル内)でも同じ事故になる(展開行カードだけは `GridDetailLayer` が stopPropagation 済み)。
- 修正の方向性: `handlePaste` の先頭で `editingCell` 中、または target がフォーム要素配下なら早期 return(キーボードと同じガード)。

### RD-3(中 / 確実)編集行が消えると editingCell が固着しキーボードが全滅

- 再現(T2): 最終行(view 2)を編集中、親が `rows` を 2 件へ差し替え → `.ssg-cell-editor-input` が消える(`activeCellPlacement` が `row >= viewRowCount` で null)。`onRowsChange` は呼ばれず(commit も cancel も走らない = ドラフト消失)。その後 ArrowUp / Enter / 印字キー / Escape がすべて無視される(`getActiveCell()` は `{row:2}` のまま)。復帰はセルのダブルクリック(`startEdit` で editingCell が置き換わる)のみ。
- 原因: input が描画されなくなっても `uiState.editingCell` は残り、`keyboardController.handleKeyDown` が `editingCell` 非 null で早期 return(keyboardController.ts:139-141)。フォーカス中要素の DOM 除去では blur が発火しないため `commitEdit` / `cancelEdit` も走らない。同じく列が消えた場合(`editingColumn` undefined / 列 extent null)も同状態になる。SSRM でも行数減(refresh)で同じ。
- 修正の方向性: editingCell に対応する行 / 列が解決できなくなったとき(`editorSession === null` or rect null)に `stopEdit` を dispatch する(RD-1 の rowKey 化と合わせる)。

### RD-4(中 / 確実)`canEditCell` の rowIndex 空間が経路で不一致

- 再現(T4): name desc ソート後、view 0(行 `c`, source index 2)に対して、編集開始(印字キー)では `canEditCell(0, 0, c, col)`、同じセルへの貼り付けでは `canEditCell(2, 0, c, col)`。
- 原因: 表示(GridBodyLayer.tsx:290-296)/ 編集開始(SpreadsheetGrid.tsx:2178-2184, keyboardController.ts:238-246)/ SSRM 系(clearCells / clipboard の SSRM 分岐)は view index、clientSide の貼り付け(clipboardController.ts:295-296)と Delete クリア(SpreadsheetGrid.tsx:2097-2104, clearCells.ts:149)は source index を渡す。API_REFERENCE は `canEditCell: (rowIndex, colIndex, row, column)` で空間を規定していない。`rowIndex` を使う利用側(例: 先頭 N 行ロック / `rows[rowIndex]` 参照)はソート・フィルター中に「表示は編集可なのに貼り付けだけ弾かれる(逆も)」になる。
- 修正の方向性: 1 つの空間に統一(`CellStyleContext` と同様に view index + `sourceRowIndex` / `rowKey` を追加引数で渡すのが互換的)、API_REFERENCE に明記。

### RD-5(中 / 確実)`columns` の参照変化で列幅が全置換される

- 再現(一時テスト): `columns` をインラインで書く Harness。`applyState({ columnWidths: { name: 300 } })` → `getState().columnWidths === { name: 300 }`。親を再レンダー(同内容・別参照の columns)→ `{ name: 160, note: 200 }` へ戻る。
- 原因: `useEffect([visibleColumns])`(SpreadsheetGrid.tsx:926-940)が `visibleColumns` の参照変化のたびに `resetColumnWidths(column.width 由来)` を dispatch(フル置換)。`visibleColumns` は `columns` の参照に連動する(columnLayout.ts の createMemo は Object.is)。利用側が `columns` を useMemo せずに渡すと、`onRowsChange → setRows` の再レンダーごと(= 編集のたび)に手動リサイズ幅 / autosize 幅 / applyState 幅が消え、`onStateChange` が既定幅で発火して「自動保存」レシピの保存値を上書きする。`enableRowDrag` / `detailRow` の有無切替でも同じ。
- 補足: API_REFERENCE は flex 列の「手動幅は `columns` 変化まで」を書くが、非 flex 列の手動幅 / `applyState` 幅も同じ扱いになること、`columns` の参照安定が前提であることは未記載。
- 修正の方向性: 列構成(key / width / flex / pinned / visible の内容)が実際に変わったときだけリセットする(署名比較)、または既存エントリをキーで保全するマージに変える。少なくとも API_REFERENCE に「`columns` は参照安定(useMemo / 外部定義)で渡すこと」を明記。

### RD-6(中 / 高)`readOnly` が編集を完全には止めない

- 再現: T5 = 編集中に `readOnly=true` へ → Enter で `onRowsChange` が呼ばれる。T7 = `readOnly` グリッドで `renderCell` の `setValue('BTN')` → `onRowsChange` が呼ばれる(ctx.readOnly は true で渡っている)。
- 原因: `commitEdit`(editController.ts:102-169)は開始時のゲートに依存し確定時に `isCellEditable` を再評価しない。`renderCellContent` の `setValue`(SpreadsheetGrid.tsx:3231-3259)は `decideCellWrite`(validation)だけで `readOnly` / `canEditCell` を見ない。undo は `readOnly` で無効化されるため、readOnly 中の setValue 書き込みは undo 不能。
- 修正の方向性: `commitEdit` と `setValue` で `isCellEditable({ readOnly, canEditCell }, …)` を再評価(NG なら cancel / no-op)。少なくとも API_REFERENCE の `readOnly` 説明に `setValue` が対象外である旨を明記。

### RD-7(低 / 確実)CellEditorLayer の別セル遷移でドラフトが残る

- 再現(T6・単体): rect A(`initialValue='a'`)→ 変更 `draft-of-A` → rect B(`initialValue='b'`)へ rerender → input の value は `draft-of-A` のまま(`sessionId` は null→非 null でしか進まない: CellEditorLayer.tsx:116-121)。
- 到達条件: `startEdit` が `stopEdit` を挟まずに連続する経路 = 編集中にエディタがフォーカスを持っていない状態で別セルをダブルクリック(`handleCellDoubleClickWithController` は editingCell を見ず `startEditWithValue` を呼ぶ)。組み込みエディタは pointerdown の `focus()` で先に blur 確定するため、主に「フォーカス管理をしない custom エディタ」と RD-3 の固着状態からの復帰時に起きる。
- 修正の方向性: セッション key を `editingCell` の座標(or rowKey + columnKey)から導出する。

### RD-8(低 / 確実)serverSide の空状態文言と rows 併用時の空走

- `isBodyEmpty` の文言分岐(SpreadsheetGrid.tsx:4458-4460)は `rows.length === 0` を見るため、serverSide(rows は常に `EMPTY_ROWS`)でフィルター結果が 0 件でも `noRowsText` が出る(API_REFERENCE 70 行目「フィルター結果 0 行時」と不一致)。
- `rows` と `dataSource` を両方渡した場合(doc は「無視」)、`useGlobalFilteredOrder` / `resolveOrder` / 候補収集 / `inferColumnFilterType` は rows に対して動く(表示には使われないが大規模 rows なら無駄なコスト)。
- 修正の方向性: serverSide では `serverSide.rowCount === 0 && クエリ空` で分岐、`rows` は `isServerSide ? EMPTY_ROWS : rowsProp` に正規化。

### RD-9(低 / 確実)select エディタ開始キーの取りこぼし

- `CellEditorLayer` は select に `initialValue`(印字キー)を渡さず(CellEditorLayer.tsx:199-211)、`SelectCellEditor` のタイプアヘッドは keydown のみ(SelectCellEditor.tsx:173-192)。「a」で開始しても「a」で始まる候補へジャンプしない。date も同様に無視するが、こちらはコード上明示の設計(型 date 入力に文字は入れられない)。
- 修正の方向性: select へ `initialText` を渡し、マウント時に `typeaheadJump` を 1 回適用。

### RD-10(低 / 確実)a11y の基本欠落 / role の矛盾

- `GridBodyLabelRow` / `GridStickyLabelLayer` の帯だけ `role="row"`(それぞれ 68 / 66 行)。親に `role="grid"` / `"rowgroup"` が無く、データ行には role が無いため、支援技術には「表の外に行だけがある」構造に見える。
- シェル(`tabIndex=0` の `div`、SpreadsheetGrid.tsx:3835-3853)に role / aria-label / aria-activedescendant が無く、フォーカスしても何のウィジェットか伝わらない。ソート中の列ヘッダーに `aria-sort` が無い。行選択ガター / checkbox 列の `role="checkbox"`(CheckboxCell.tsx:24-27、GridBodyLayer.tsx:234)はフォーカス不能(Space での操作はグリッド側ショートカット依存)。
- 修正の方向性: 最低限 シェルに `role="grid"` + `aria-rowcount/colcount`、行に `role="row"`、セルに `role="gridcell"`、ヘッダーに `role="columnheader"` + `aria-sort`。ラベル行は `aria-rowindex` 付きの row のまま親 grid の中に置く。

### RD-11(低 / 高)`scrollIntoView` オプションが実質無視される

- `viewportSyncController`(159-182 行)は `activeCell` の座標が変わると `activeCellRect`(中央ペインのみ)を常に可視化スクロールする。`setActiveCell(cell)` / `selectCell(...)` を `scrollIntoView` 無しで呼んでも中央列ならスクロールし、`scrollIntoView: true` は固定列(rect null)でも縦スクロールするという差分しか無い。API_REFERENCE(864-866 行)の記述とずれる。※controllersC の範囲と重なるため詳細検証は委ねる。
- 修正の方向性: 命令的 API 由来の activeCell 変化では viewportSync の自動可視化を抑止する(API 側が明示的に `scrollToCellInternal` を呼ぶ)か、doc を「常に可視化される」へ修正。

### RD-12(低 / 確実)公開バレルの過不足

- `gridTypes.core.ts` の `export type` と `index.ts` を突き合わせた結果、未公開は `CellRenderState` / `CellSelectionDragState` / `ColumnResizeDragState` / `ColumnSelectionDragState` / `GridResolvedSlot(s)` / `GridUiState` / `RowSelectionDragState` / `RowSelectionState` / `SelectAllState` / `UndoRedoState` のみ。内部型が大半だが `UndoRedoState`(`onUndoRedoStateChange` の引数)は利用側が型注釈に使いたくなる公開寄りの型。API_REFERENCE に名前で登場する型はすべて公開済み。

## 4. 確認したが問題なしだった観点

- **SSR**: `renderToString`(node 環境、`document` 無し)で `theme='auto'` / `height='100%'` / 行選択 / detailRow / labelRow / scrollHint を付けても throw しない(一時テストで確認)。`useSyncExternalStore` は全箇所で `getServerSnapshot` を渡しており、`useLayoutEffect` 直書き 2 箇所(2895 / 2985 行)は React 19 では SSR 警告対象外。
- **useSyncExternalStore の getSnapshot**: `gridStore.getState / getViewState`、`debouncedValueStore` / `autoHeightMeasurer` / `serverSideRowModel` の snapshot はいずれも値ストアの参照をそのまま返し、毎回新オブジェクトは返さない(無限ループなし)。
- **useImperativeHandle**: `[gridApi]` 固定で `gridApi.handle` を返し、最新値は `useControllerLifecycle(gridApi, …)`(先に宣言されたレイアウト effect)で update 済み。親 `useEffect` からの `applyState` は子の `resetColumnWidths` effect より後に走り、StrictMode の再実行でも親 effect が再適用するため整合。
- **StrictMode 二重マウント**: `scrollSync` / `pointerInteractions` / `tooltip`(refCount)は dispose → 再 update で再 attach され、`onScroll` が届くことを確認。`autoHeightMeasurer` は dispose 後の同一 args で早期 return する構造だが、jsdom でも実機でも初回計測の version/nonce 変化で再計測が走り観測が復活するため実害は確認できず(要確認レベルで留める)。
- **unmount 後の非同期**: `editController` の rAF は `gridRootRef.current?.focus()` と store dispatch のみ(購読解除済みで無害)、`gridApi.scrollToCellInternal` は要素 null で return、`jumpToColumnFilter` の rAF リトライは `gridRootRef.current` ガード + 上限 8 回。`scrollSync` は detach で rAF をキャンセル。
- **IME**: 組み込みエディタ 4 種 + select の keydown は `nativeEvent.isComposing` で Enter / Escape / Tab を無視、グリッド側の Ctrl+Z/Y も同様(既存テストあり)。
- **編集系の他経路**: Enter / Tab / Shift+Tab / Escape / blur / reject+blur フォールバック / `editorEnterMove` の rAF 時点クランプ / custom の `commit(value, direction)` / select の候補クリック(popover の pointerdown を preventDefault して blur=cancel を先行させない)/ number の min/max/step / date の正規化 / checkbox の直接トグルと readOnly・`canEditCell` ゲートは既存テスト + コードで整合。クリックアウトは pointerdown の `focus()` 経由で blur 確定になり、スクロール中は編集を維持(AG Grid と同方針)。
- **選択 / アクティブセル**: 行数減時の矢印移動は clamp、Ctrl+A の 2 回目は解除、Shift+矢印はセル選択の `range.start` をアンカー、Tab は論理 index(視覚順)で非表示列を自然に跨ぐ。ラベル行は ↑↓ で読み飛ばし、グループ行は Enter / Space で開閉。
- **props 相互作用**: `readOnly + enableRowDrag`(並び替えは許可・doc どおり)、`labelRow + rowGroup`(警告 + ラベル行非表示)、`manualFiltering + SSRM`(SSRM では manual は無視)、`height % + maxHeight` / `autoHeight + autoSize` / `showTopBar false + renderTopBar`(いずれも実装 = doc)。
- **CSS 状態クラス**: API_REFERENCE「スタイリング用の状態クラス」の 11 クラスはすべて実装に存在し、`.ssg-body-cell--readonly` の付与条件「範囲選択に入っていないとき・dimReadOnlyCells と独立」も `GridBodyLayer.tsx:349` と一致。row-drag 節の `.ssg-row-drag-handle--disabled` / `[data-ssg-row-dragging]` / `.ssg-row-drop-indicator` も存在。
- **既存結合テストのカバレッジの穴(今回の所見に対応)**: 編集中の rows / columns / sort 変化(RD-1, RD-3)、エディタ内 paste(RD-2)、ソート中の `canEditCell` 引数(RD-4)、`columns` 参照変化後の列幅(RD-5)、readOnly 切替中の確定 / setValue(RD-6)、SSRM の空状態文言(RD-8)、SSR(renderToString)はいずれも未カバーだった。