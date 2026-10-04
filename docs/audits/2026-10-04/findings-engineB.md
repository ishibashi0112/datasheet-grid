# findings-engineB — core(logic / model / engine)監査レポート

## 1. 概要

- 読んだ範囲(全文): `packages/core/src/logic/{geometry, verticalGeometry, rowHeightStore, scrollTargets, scrollHint, autoScrollGeometry, chunkedLoop, columnFlex, columnAutosize, columnReset, autoSizeOnData, gridHeight, rowReorder, detailRow, rowSelection, contextMenuTarget, serverSideCache, serverSideBlocks, serverSideEdits, serverSideQuery, slotProps, slotDom, tooltipGeometry, filterPopoverLayout, panelDragGeometry, datePickerCalendar, gridState, labelRows}.ts`、`model/{gridReducer, gridActions, gridStore, gridSelectors}.ts`、`engine/*.ts` 全 10 本。消費側の確認のため `controllers/{serverSideRowModel, autoHeightMeasurer, viewportSyncController, scrollSyncController, pointerInteractionsController(抜粋), rowDragController(抜粋)}.ts`、`packages/react/src/SpreadsheetGrid.tsx`(配線部分)、`view/GridBodyLayer.tsx`(行 key 部分)、`API_REFERENCE.md` の該当節も参照。対応する `*.test.ts` はケース名を全件確認。
- 検証方法: 一時 vitest(core 2 本 + react 1 本・jsdom)で再現を確認後に削除済み(`git status` に自分のファイルは残っていない)。
- 所見件数: **12 件**(高 1 / 中 3 / 低 8)。うち再現テストで確認したもの 6 件、コードパス追跡のみ 6 件(要確認 2 件を明記)。

## 2. 所見一覧

| ID | 重要度 | 確度 | 1 行要約 | file:line |
| --- | --- | --- | --- | --- |
| B-01 | 高 | 確実(再現) | auto-height のアンカー補正が未装飾 store の prefix を読むため、展開行帯 / ラベル行高の上書きがアンカー行より上にあると、測定 flush のたびに scrollTop がその分だけ上へジャンプする | `controllers/autoHeightMeasurer.ts:126-136`、合成順は `engine/verticalLayout.ts:263-270` |
| B-02 | 中 | 確実(再現) | 列チューザー「全解除」で `orderedColumns[0]` が合成列(行ドラッグハンドル / 展開トグル / 自動グループ列)だと、consumer 列が **全部** 非表示になる(「最後の 1 列は残す」契約の破れ) | `engine/columnCommands.ts:258-281` |
| B-03 | 中 | 確実(再現) | SSRM: 末端の部分ブロックがキャッシュ済みのまま `totalRowCount` が増えると、そのブロック後半の行が LRU 退避 / refresh まで永遠に未ロード(スケルトン)のまま | `controllers/serverSideRowModel.ts:168-199`、`logic/serverSideCache.ts:77-100` |
| B-04 | 中 | 確実(再現) | SSRM: 未ロード行の `getRowKey` が viewIndex(number)を返す契約と数値 `rowKeyGetter` が衝突し、同一描画窓にロード済み行とスケルトン行で React key が重複する(React 警告・行の取り違え) | `controllers/serverSideRowModel.ts:106-109`、`react/src/view/GridBodyLayer.tsx:1008-1011, 1031, 1090` |
| B-05 | 低 | 確実(再現) | `selectCell` / `setActiveCell` / `selectRange` は範囲外 index をクランプせず reducer へ入れる。API_REFERENCE(「範囲外 index は内部でクランプ/無視する」)と不一致 | `engine/gridApi.ts:435-474`、`API_REFERENCE.md:844`、`website/content/docs/api/handle.mdx:23` |
| B-06 | 低 | 確実(コード) | 列リセットの初期スナップショットは最初の `update` で固定されるため、columns を非同期で流し込む(初回 `[]`)消費側では「列のリセット」が恒久的に no-op | `engine/columnCommands.ts:436-446`、`logic/columnReset.ts:37-47, 83-95` |
| B-07 | 低 | 高(再現) | `visible:false` の左固定列が 1 本あるだけで合成列(ハンドル / トグル)が `pinned:'left'` になり、合成列だけの左ペイン(行ヘッダー付き)が出現する | `engine/columnLayout.ts:75, 85, 100` |
| B-08 | 低 | 高(コード・要確認) | 展開行の MAX_BODY_PX gate で帯が抑止されても、セルの `detail.expanded` は `expandedDetailRowKeys` 由来のまま → 約 41.7 万行超では「展開表示なのに帯が出ない」 | `engine/verticalLayout.ts:266-270`、`react/src/SpreadsheetGrid.tsx:3207` |
| B-09 | 低 | 中(要確認) | flex 配分幅が非整数(333.333…)のまま `columnWidths` / 書き戻し後の `column.width` に乗る。サブピクセル幅の累積で 1px の横スクロールバー誤発生の可能性(ブラウザ依存) | `logic/columnFlex.ts:81-93`、`engine/columnCommands.ts:138-144` |
| B-10 | 低 | 確実(コード) | 性能: clientSide で `rows` 参照が変わる(1 セル編集)たびに列フィルター / 数値キー前計算 / ソートが全行で再実行される(1M 行で編集 1 回 = 全行 O(n log n)) | `engine/rowPipeline.ts:153-185, 303-308` |
| B-11 | 低 | 確実(コード) | reducer の `cell/activate` / `edit/stop` / `selection/clear` / `filter/setGlobal` / `filter/setColumn` / `sort/set` が同値でも新 state を返す。列操作後の `discardSelectionState` は常に 3 dispatch → 無選択でも 2〜3 回の余分な通知 | `model/gridReducer.ts:61-66, 221-239, 312-331, 364-369`、`engine/columnCommands.ts:112-116` |
| B-12 | 低 | 高(コード) | `column/resizeStart` の `minWidth: action.minWidth \|\| 60` により `minWidth: 0` 明示列の手動リサイズ下限が 60 になる(autosize / flex は 0 を尊重し規則不一致) | `model/gridReducer.ts:249`、`engine/columnCommands.ts:428` |

## 3. 各所見の詳細

### B-01(高)auto-height アンカー補正と展開行帯 / ラベル行高の合成順

- **再現(最小テスト・削除済み)**: 10 行 × estimate 30 の `buildRowHeightStore` → `base = createAutoHeightRowMetrics(store)` → `decorated = createDetailRowMetrics(base, [{ index: 0, height: 200 }])`(`decorated.rowTop(5) === 350`)。スクロールコンテナ `scrollTop = 350`(= 行 5 先頭、offset 0)、`[data-row-index="7"]` 配下の `[data-autoheight-cell]` を高さ 50 にして `createAutoHeightMeasurer().update({ rowHeightStore: store, rowMetrics: decorated, ... })`。
- **期待**: 変化したのはアンカー行(5)より下の行 7 なので `scrollTop` は 350 のまま。
- **実際**: `scrollTop` が **150** になる(200px 上へジャンプ)。ラベル行高の上書き(`createRowHeightOverrideMetrics(base, [{ index: 0, height: 100 }])`、scrollTop 220)でも 150 へ飛ぶ。
- **原因**: `autoHeightMeasurer.ts:126-134` は anchor 行と offset を **装飾済み** `rowMetrics`(`rowAtContentY` / `rowTop`)で捕捉する一方、再構築後の位置を **未装飾** の `rowHeightStore.prefix[anchorRow]` から読む。展開行帯 / ラベル行高の差分(アンカーより上に積まれた extras)が差し引かれた値へ `el.scrollTop` を同期してしまう。シェルは `SpreadsheetGrid.tsx:1766-1776` で装飾済み `rowMetrics` を渡している。auto-height × 展開行(または `labelRow.height`)でスクロールしながら未測定行を測るたびに発生する。
- **修正の方向性**: `anchorTopAfter` を `args.rowMetrics.rowTop(anchorRow)`(prefix 再構築後に同じ装飾メトリクス経由で読む。デコレータは base の prefix を参照で読むため再構築後の値が出る)にするか、extras の累積を `rowHeightStore.prefix[anchorRow]` に加える。

### B-02(中)列チューザー「全解除」× 合成列

- **再現**: `createColumnCommands` に `columns = [id, name]`、`orderedColumns = [行ドラッグハンドル列, id, name]`(`enableRowDrag` + `onRowsChange` 時の実配線と同形)を渡して `handleColumnChooserHideAll()`。
- **期待**: 視覚順先頭の consumer 列 1 本が残る(`ColumnChooserPanel.tsx:63-65, 428-430` のコメントも「0 列表示は発生しない」と明記)。
- **実際**: `onColumnsChange([{ id, visible:false }, { name, visible:false }])` — consumer 列が **0 本**になる。
- **原因**: `columnCommands.ts:263` の `keepKey = orderedColumns[0]?.key` が合成列キー(`__ssg_row_drag_handle__` / `__ssg_detail_toggle__` / `__ssg_group__`)になり、`columns`(consumer 列)の中に一致する列が無い。
- **修正の方向性**: `keepKey` は `orderedColumns.find((c) => !isSyntheticColumnKey(c.key))` から取る。

### B-03(中)SSRM: 部分末端ブロックの固着

- **再現**: `blockSize 100` / `initialRowCount 150` の `createServerSideRowModel` で `requestRange(100,150)` → block 1(50 行)取得。サーバー件数を 200 に増やし `requestRange(0,50)`(block 0 の結果で `rowCount` が 200 へ更新)→ `requestRange(150,200)`。
- **期待**: 150〜199 が取得される。
- **実際**: `getRows` 呼び出しは `[100,200]`, `[0,100]` の 2 回のみで、`isRowLoaded(160) === false` のまま(スケルトン固着)。
- **原因**: `fetchBlock` は `cache.hasBlock(blockIndex)` で早期 return(`serverSideRowModel.ts:173`)するが、キャッシュは部分長の配列を持っているだけで、新しい `rowCount` に対し不足していることを検知しない(`serverSideCache.ts:77-89` の `getRow` は末端外を `undefined` にするだけ)。API_REFERENCE 1179 行は「外部更新で件数が増減していれば縦スクロール空間が追従する」としており、スクロール空間だけ伸びて行が出ない。
- **修正の方向性**: `fetchBlock` のスキップ条件に「キャッシュ行数 ≥ min(blockSize, rowCount − start)」を加える(部分ブロックは再取得対象)か、`rowCount` 増加時に末端ブロックを無効化する。

### B-04(中)SSRM: スケルトン行の React key 衝突

- **再現(jsdom + `installJsdomLayoutStubs`)**: `blockSize 10` / `initialRowCount 100`、block 0 だけ即時解決(`id = index+1`)、block 1 以降は pending の `dataSource` を `rowKeyGetter={(row) => row.id}` で描画。
- **実際**: `console.error` に `Encountered two children with the same key, '%s'...` が 1 件出る(view 9 のロード済み行 id=10 と、view 10 のスケルトン key=10)。
- **原因**: `serverSideRowModel.ts:106-109` は未ロード行の `getRowKey` を `viewIndex` に倒し、`GridBodyLayer.tsx:1008-1011` はそれを `key` に使う。数値の業務キー(id 昇順ソート等)と view index 空間が重なるとブロック境界で衝突する。React は重複 key の子を落とす / 取り違える可能性があり、警告だけでなく行の差し替えが乱れ得る。`detailRow.ts:151-156` のキャッシュ検証(`getRowKey(cached) === key`)にも同じ衝突余地がある(`getRow` が undefined のため帯は出ず実害は限定的)。
- **修正の方向性**: 未ロード行の key に専用プレフィックス(例: `__ssg_skeleton__:${viewIndex}`)を使うか、`GridBodyLayer` 側でスケルトン key を別名前空間にする。契約の文言(「未ロード行の getRowKey は viewIndex」)も合わせて見直す。

### B-05(低)命令的 API の範囲外 index

- **再現**: `createGridApi` + 2 行のモデルで `handle.selectCell(999, 999)` → `uiState.activeCell = {row:999,col:999}`、`selection.range` も 999。`setActiveCell({ row:-5, col:-5 })` も負値のまま入る。
- **期待(ドキュメント)**: `API_REFERENCE.md:844` / `website/.../handle.mdx:23` は「範囲外 index は内部でクランプ/無視する」。`scrollToRow` / `verticalTargetFor` はクランプしているが選択系はしていない。
- **影響**: オーバーレイは `row >= viewRowCount` で非表示になる(`SpreadsheetGrid.tsx:1802`)ため描画は壊れないが、`exportCsv({scope:'selection'})` は空、キーボード移動で初めて `clamp` される等、挙動がドキュメントと食い違う。
- **修正の方向性**: `gridApi` 側で `viewRowCount − 1` / `orderedColumns.length − 1` へクランプ(負値は 0)するか、ドキュメントを「選択系は呼び出し側責務」に改める。

### B-06(低)列リセットの初期スナップショット

- **成立条件**: 消費側が columns を非同期に決める(初回レンダーで `columns=[]`、後で実列を渡す)。
- **コードパス**: `columnCommands.ts:438-445` は最初の `update` で `initialColumnState = new Map([])` を確定し以後更新しない。`buildResetColumns`(`columnReset.ts:37-47`)はスナップショット外の列を「リセット対象外(extras)」として現状維持 → `changed=false` / `orderChanged=false` → `null`(no-op)。列メニュー「列のリセット」/ パネルフッターが永久に効かない。
- **修正の方向性**: スナップショットは「columns が非空になった最初の update」で取る、または「スナップショットに無い列は consumer 宣言値をそのまま初期値とみなす」。

### B-07(低)非表示の左固定列が合成列を左 pin する

- **再現**: `createColumnResolver` に `[{ key:'id', pinned:'left', visible:false }, { key:'name' }]` + `enableRowDrag`。`orderedColumns[0]` = ハンドル列 `pinned:'left'`。
- **原因**: `columnLayout.ts:75` の `hasLeftPinnedColumn = columns.some(pinned==='left')` が `visible` を見ない。結果、左ペインが合成列だけで生成され、行ヘッダー(#)も左ペインへ移る。
- **修正の方向性**: `columns.some((c) => c.pinned === 'left' && c.visible !== false)`。

### B-08(低・要確認)展開行 gate とトグル表示の不整合

- **コードパス**: `verticalLayout.ts:266-270` は「論理全高 + 帯合計 > MAX_BODY_PX」のとき `detailActive=false` にして帯を出さない(uniform 36px なら約 41.7 万行超)。一方 `SpreadsheetGrid.tsx:3207` の `detail.expanded` と `getExpandedDetailRowKeys()` はキー集合のまま true を返す。大規模 clientSide + detailRow で「開いたのに何も出ない」状態になる。発生条件が特殊なため実機での見え方は要確認。
- **修正の方向性**: gate 外のときはトグルを無効化(`expandable:false`)するか、開発時警告を出す。

### B-09(低・要確認)flex 幅の非整数化

- **コードパス**: `columnFlex.ts:81-93` は端数を最後の列へ寄せて合計一致を保証するが各幅は非整数(1000/3 → 333.333…、333.333…、333.333…4)。`columnCommands.ts:138-144` の pin / 表示切替はこの解決幅を `column.width` へ書き戻すため、以後 pinned 列幅も非整数のまま残る。ブラウザのサブピクセル丸め(LayoutUnit)で `scrollWidth` が `clientWidth` を 1px 上回り横スクロールバーが出る可能性(環境依存のため要確認)。
- **修正の方向性**: 配分結果を整数へ丸め、丸め誤差を最後の列で吸収する。

### B-10(低)1 セル編集で全行再フィルター / 再ソート

- **コードパス**: `rowPipeline.ts:173-185` の `memoColumnFiltered(rows, …)` / `memoSorted(rows, …)` と `memoNumericKeys(rows, …)` は `rows` 参照を依存に持つ。編集 commit は `onRowsChange` で新配列を返す設計のため、1 セル編集ごとに列フィルター O(n)・数値キー前計算 O(n)・ソート O(n log n) が走る(グローバルフィルターの時間分割コントローラも同様に rows 変化で再実行)。1M 行 clientSide では編集 1 回で数百 ms 級の停止が見込まれる。rows が controlled な以上「正しい」挙動だが、性能崖として記録する。
- **修正の方向性**: 編集で変化した source index と、フィルター / ソート対象列への影響有無を判定し、無関係なら order を据え置く差分経路(将来課題)。

### B-11(低)reducer の同値 no-op 欠落

- `cell/activate`(同座標)/ `edit/stop`(既に null)/ `selection/clear`(既に null)/ `filter/setGlobal`(同文字列)/ `filter/setColumn`(同値)/ `sort/set`(同内容)は常に新 state を返す(`gridReducer.ts:61-66, 221-239, 312-331, 364-369`)。`columnCommands.discardSelectionState`(`:112-116`)は列操作のたびに 3 dispatch し、無選択でも `edit/stop` / `selection/clear` / `cell/activate` が各 1 回ずつ購読者へ通知する。実害は余分な再レンダーのみ(無限ループは発生しない: dispatch はイベント起点)。
- **修正の方向性**: 各 case に同値判定を足す(`rowSelect/set` と同じ方針)。

### B-12(低)`minWidth: 0` の扱い

- `gridReducer.ts:249` の `action.minWidth || DEFAULT_MIN_WIDTH` は 0 を 60 に倒す。`columnCommands.ts:428` は `column.minWidth ?? 60` を渡すので、`minWidth: 0` を明示した列だけ手動リサイズ下限が 60、autosize(`columnAutosize.ts:474`)/ flex(`columnFlex.ts:126`)は 0 を尊重 → 規則不一致。`??` へ揃えれば解消。

## 4. 確認したが問題なしだった観点

- **縦ジオメトリ(uniform / scaling)**: 1M 行 × 36px で末尾 `scrollTop = physicalMax` のとき最終行が窓に入り画面 y = viewport − rowHeight に一致、1px 手前でも重複 / 欠落なし(既存 sweep に加え個別確認)。行数 0 / 1 / viewport ぴったりで窓・translateY が正しい。`clientYToRowIndex` / rowDrag の `d = S_phys(1 − sf)` 補正は `windowBaseOffsetPx` と整合。
- **auto-height / デコレータ**: `rowAtContentYFromPrefix` の境界(`y == prefix[i]`、`y >= total`)、`createRowHeightOverrideMetrics`(height 0 を含む)と `createDetailRowMetrics` の `rowTop` / `rowsHeight` / `rowAtContentY` の単調性、合成順(base → ラベル上書き → 展開行)。問題は測定側(B-01)のみ。
- **scrollTargets / gridApi のスクロール**: align 4 種、`maxScrollTop` クランプ、`logicalToPhysicalScrollTop` 経由の往復、`scrollToBottom` の `header + physicalBodyHeight − clientHeight`。
- **横ジオメトリ**: `reorderColumnsByPane` / `splitOrderedColumnsByPane` の logicalIndex 不変、`findLogicalIndexFromPaneOffset` の境界(幅 0 列・右端外)、flex の min/max 反復クランプが必ず収束し合計が利用可能幅に一致。
- **reducer / store**: 全 action の selection ⇔ dragState 整合(update 系は dragState 種別で弾く)、`rowSelect/set` / `group/*` / `detail/*` の同値 no-op、`createGridStore` の no-op 非通知・通知中 unsubscribe 耐性、view スライスの差分通知。行数減少時の activeCell クランプは reducer では行わずオーバーレイ側が範囲外を非表示にする設計(キーボードは `clamp`)。columns 変化時の `columnWidths` 掃除はシェルの `resetColumnWidths` 全置換で担保。
- **rowPipeline**: manualFiltering / manualSorting の空定数差し替え、`getSourceIndex` の範囲外 undefined、ラベル行 / グルーピングの排他。`getRowKey` はカスタム getter で範囲外 throw し得るが、呼び出し側(detailRow / verticalLayout / gridApi / GridBodyLayer)は全て範囲内ガード後に呼んでいる。
- **notifiers**: `onStateChange` の初回非発火・同値非発火・ドラッグ中保留(`decideStateChangeEmit`)、`onFiltersChange` / `onSortChange` の構造比較、`onStateChange` 後付け時の baseline 記録、hover の同値抑止 / controlled 非更新。
- **SSRM キャッシュ / 書き戻し**: LRU(`setBlock` MRU 化・`touchBlocks`)、`updateRow` の COW と recency 不変、`writeId` 世代ガード(古い成功 / 失敗が新しい楽観値を巻き戻さない)、`writeEpoch` による refresh / query 変化またぎの決着無視、`totalRowCount` 減少時の整合(キャッシュ超過分は `rowCount` で自然に無視)。問題は B-03 / B-04 のみ。
- **detailRow の index キャッシュ**: SSRM では `bumpVersion` でブロック到着ごとに rowModel 参照が変わるため `unresolved` が自然に再評価される。`verticalLayout` の `detailIndexCacheRef` を依存に含めないのは reset 時に `expandedKeys` / `rowModel` も同時に変わるため実害なし。
- **全選択トグル × 0 行**: `handleToggleSelectAllRows` 自体は 0 行で exclude(=以後の全行選択)になるが、コーナー押下は `viewRowCount === 0` で早期 return(`SpreadsheetGrid.tsx:2550`)しており UI 経路では到達しない(命令的 `selectAllRows()` は呼び出し側の意図どおり)。
- **createMemo の依存**: `verticalLayout` / `columnLayout` / `rowPipeline` / `filterPopoverCommands` の各 memo 引数は旧 useMemo の deps と一致し、stale はなし。
- **テストカバレッジの空白(所見ではないが手掛かり)**: `logic/geometry.ts` に colocated テストなし(pane 変換 / ヒットテスト / drop slot が結合テスト頼み)、`model/gridReducer.ts` は detail 系のみ、`autoHeightMeasurer.test.ts` に装飾済み rowMetrics のケースなし、`serverSideRowModel.test.ts` に件数増加 × 部分ブロックのケースなし、`columnCommands.test.ts` に合成列入り `orderedColumns` の全解除なし、`gridApi.test.ts` に scaleFactor>1 の scrollToRow / exclude の `getSelectedRowKeys` / SSRM の scope `'raw'` フォールバックなし。