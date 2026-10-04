# findings-viewE — view 層 / styles.css / emit-layer-css 監査

## 1. 概要

読んだ範囲(全文): `packages/react/src/view/*.tsx`(18 コンポーネント)と `view/gridBarHelpers.ts`、`packages/react/src/styles.css`(3,187 行)、`packages/react/scripts/emit-layer-css.mjs`、`packages/react/dist/style.css` / `dist/style.layer.css`、view 配下の `*.test.tsx` / `gridBarHelpers.test.ts`(テスト名ベースで網羅範囲を確認)。加えて挙動確認のため `SpreadsheetGrid.tsx` の描画部(3 ペイン配線 / popover・パネル配線 / renderCellContent / label・sticky 配線)、`core/logic/slotProps.ts` / `filtering.ts(toDateKey)` / `datePickerCalendar.ts` / `dateFilterTree.ts` / `filterPopoverLayout.ts` / `labelRows.ts(resolveStickyLabel)` / `verticalGeometry.ts(windowBaseOffsetPx)` / `engine/verticalLayout.ts` / `engine/rowPipeline.ts` / `controllers/serverSideRowModel.ts(getRowKey)` を参照した。

一時テスト `packages/react/src/zz_audit_viewE_a11y.test.tsx`(5 件、全 pass = 所見を再現)で V-01 / V-02 / V-03 / V-04 / V-06 を実機確認し、終了前に削除済み(自分の作業ファイルは `git status --short` に残っていない。残っている `zz_audit_reactD_*.test.tsx` 3 件は別エージェント reactD のもの)。

所見件数: 16 件(高 0 / 中 5 / 低 11)。うち「要確認」付き 3 件。

## 2. 所見一覧

| ID | 重要度 | 確度 | 要約 | file:line |
| --- | --- | --- | --- | --- |
| V-01 | 中 | 確実 | SSRM 未ロード行(skeleton)の React key = viewIndex が、ロード済み行の数値 rowKey(1 始まり id 等)と衝突し、重複 key 警告 + 実行の再マウント churn | `view/GridBodyLayer.tsx:1008,1031,1090` / `core/controllers/serverSideRowModel.ts:106-109` |
| V-02 | 中 | 確実 | フィルター popover の「適用 / クリア / 閉じる」「条件・値の個別クリア」「プリセットチップ」「日付ツリー展開トグル」が pointerdown 専用で click に反応せず、キーボード / 支援技術で操作不能 | `view/ColumnFilterPopover.tsx:1586-1647, 1160-1197, 756-767, 913-927` |
| V-03 | 中 | 確実 | FilterDateField の全ボタン(カレンダー開閉 / 前後 / タイトル / 日・月・年セル / 戻る / 今日 / クリア)が pointerdown 専用 → キーボードでカレンダーを開けない | `view/FilterDateField.tsx:226-236, 266-291, 312-325, 334-349, 355-370, 377-398` |
| V-04 | 中 | 確実 | scrollHint カスタムスクロールバーのドラッグが `pointercancel` / `lostpointercapture` で終了せず固着(以後のホバー移動で scrollTop が書き換わり、ジャンププレビューも抑止されたまま) | `view/GridScrollHint.tsx:288-318, 409-413` |
| V-05 | 中 | 高 | ARIA 構造の欠落: grid / row / gridcell / columnheader / aria-sort / aria-rowindex が無い一方、ラベル行だけ `role="row"` が付き親 grid の無い orphan row になる。行ヘッダー / コーナーの `role="checkbox"` にアクセシブル名と tabIndex が無い | `view/GridBodyLabelRow.tsx:106` / `view/GridStickyLabelLayer.tsx:227` / `view/GridHeaderRow.tsx:224-233, 331-362` / `view/GridBodyLayer.tsx:234-235` |
| V-06 | 低 | 確実 | `toDateKey` が存在しない日付(`2026-02-30` / `2026/4/31`)を受理し、FilterDateField が赤枠にせず確定する(equals 条件は永久不一致・カレンダーに選択日が出ない) | `core/logic/filtering.ts:205-216` / `view/FilterDateField.tsx:82-90` |
| V-07 | 低 | 確実 | 公開契約「連結 `.ssg-body-cell.my-class`(0,2,0)で上書き可」に反する (0,3,0) ルールにより、チェック選択行で `.ssg-body-cell--invalid` の背景と利用側セル背景が透明化される | `styles.css:2554-2556`(vs `:838-840`, API_REFERENCE 1304-1315) |
| V-08 | 低 | 高(要確認) | `.ssg-label-row { contain: layout style }` は後方の `.ssg-body-row { contain: layout style paint }`(同特異度・後勝ち)に無効化され、コメントの意図(paint containment を外す)が実現していない。dist でも同順 | `styles.css:451-455` vs `:2540-2546`(dist offset 8253 < 41851) |
| V-09 | 低 | 高 | ヘッダーの ⋮ ボタン / grip を載せる `.ssg-header-actions` は非 hover で opacity:0 + pointer-events:none、`:focus-within` の表示ルールが無いため Tab フォーカス中のボタンが不可視 | `styles.css:2583-2601` / `view/GridHeaderRow.tsx:439-481` |
| V-10 | 低 | 高 | ネイティブバー運用時のトラック帯判定が `offsetWidth - clientWidth = 0`(macOS オーバーレイバー)環境で右端 18px のセル領域を「トラック上」とみなし、セルホバーでジャンプライン / ルーラーが出る | `view/GridScrollHint.tsx:137-145` |
| V-11 | 低 | 高 | scrollHint の「行 N / 総行数」が view index 基準(ラベル行 / グループ行を数える)で、行ヘッダー番号(ラベル行を飛ばす)・バーの件数(データ行のみ)と食い違う | `view/GridScrollHint.tsx:230, 366, 387-389` vs `view/GridBodyLayer.tsx:1097` |
| V-12 | 低 | 高 | ステータスバーの A1 ラベル / 選択ラベルが合成列(行ドラッグハンドル / 展開トグル / 自動グループ列)込みの論理 index で列文字を出すため、合成列有効時は先頭データ列が "B" / "C" 表記になる | `view/gridBarHelpers.ts:290-295, 321-323, 332-334` |
| V-13 | 低 | 中(要確認) | GridDetailLayer は `virtualRow.start - baseOffset` だが `virtualRow.start` は既に `windowBaseOffsetPx` 減算済み → 二重減算。現状は detailActive 時 baseOffset=0 のため休眠 | `view/GridDetailLayer.tsx:363` vs `core/logic/verticalGeometry.ts:450-454` |
| V-14 | 低 | 高 | 細かな a11y: グローバルフィルター input に aria-label 無し(placeholder のみ)/ コンテキストメニューの区切りに `role="separator"` 無し / ToolPanel の tablist に aria-controls・tabpanel 無し | `view/DefaultGridTopBar.tsx:354-360` / `view/CellContextMenuPopover.tsx:86-93` / `view/ToolPanel.tsx:153-182` |
| V-15 | 低 | 確実 | ColumnMenuPopover「列のリセット」項目だけ `slots.menuItem` の className / style を付けていない(classNames.menuItem 指定時に 1 項目だけ見た目が揃わない) | `view/ColumnMenuPopover.tsx:546-549`(他項目は `:245-246` 等) |
| V-16 | 低 | 中(要確認) | `renderHeader` 使用時もヘッダーセル本体の pointerdown が列範囲選択を開始するため、カスタムヘッダー内のボタン操作で列選択が同時に走る(stopPropagation が必要だが API_REFERENCE に記述なし) | `view/GridHeaderRow.tsx:334, 378-385` / API_REFERENCE 313 |

## 3. 各所見の詳細

### V-01 SSRM skeleton の React key 衝突(中 / 確実)

- 再現(一時テストで確認): `isServerSide` の `GridBodyLayer` に、view 0 = ロード済み `{ id: 1 }`(rowKeyGetter = `row.id`)/ view 1 = 未ロード、を持つ rowModel(`getRowKey` は `controllers/serverSideRowModel.ts:106-109` と同じく未ロード時 `viewIndex` を返す)を渡して render → `console.error("Encountered two children with the same key ...")`。
- 成立条件: `rowKeyGetter` が数値 id(DB の 1 始まり id が典型)を返す SSRM。ロード済みブロック末尾の行 id = 直後の未ロード行の viewIndex となり、ブロック境界ごとに毎回発生する(開発時は console.error が連続出力)。文字列 key でも `'10'` のような数字文字列なら同様。
- 原因: `GridBodyLayer.tsx:1008` の skeleton key `String(rowModel.getRowKey(rowIndex) ?? rowIndex)` と `:1031/1090` のロード済み key `String(rowKey)` が同じ名前空間。
- 実害: React は重複 key の子を正しく対応付けられず、片方の fiber を破棄 → ロード済み行(GridBodyRow)が skeleton と共存する間、毎レンダーで再マウントされる(renderCell 内のローカル state / フォーカス喪失、DOM churn)。
- 修正方向: skeleton の key に接頭辞(例 `__ssg_skeleton_${rowIndex}`)を付ける。または serverSideRowModel の未ロード `getRowKey` 契約を明示的な sentinel 型へ。

### V-02 フィルター popover のボタンがキーボードで操作できない(中 / 確実)

- 再現(一時テスト): text フィルターの popover を render し、`fireEvent.click(適用)` / `click(クリア)` → `onApply` / `onClear` とも未呼び出し。`pointerDown(適用)` のみで発火。
- 原因: `ColumnFilterPopover.tsx:1586-1647`(フッター)/ `:1160-1197`(条件・値の個別クリア)/ `:756-767`(プリセットチップ)/ `:913-927`(dateSet ツリー展開トグル)が `onPointerDown`(+ preventDefault)だけで、`onClick` を持たない。`onKeyDown` は stopPropagation のみ。ブラウザの Enter / Space 起動と支援技術のアクティベーションは `click` として配送されるため届かない。
- 期待: Tab でフッターへ移動し Enter / Space で適用 / クリアできる(数値 / テキスト条件の入力欄は Enter で適用できるため、ボタンだけが取り残されている)。
- 修正方向: 発火を `onClick` へ統一し、`onPointerDown` は `preventDefault()`(入力フォーカス維持)だけにする。再試行ボタン(`:1117-1135`)は Enter / Space を自前処理しているので同じ形でも可。

### V-03 FilterDateField のカレンダーがキーボードで開けない(中 / 確実)

- 再現(一時テスト): `click(カレンダーを開く)` → `.ssg-dp-panel` が出ない。`pointerDown` でのみ開く。開いた後も「今日」の `click` で確定しない。
- 原因: `FilterDateField.tsx:161-166` の `pressHandler` が pointerdown 専用で、全ボタン(`:226-236, 266-291, 312-325, 334-349, 355-370, 377-398`)がこれを使う。
- 実害: API_REFERENCE 370 / website filter-sort.mdx 79 は自由入力で代替可能とするが、カレンダー UI 自体はキーボード・支援技術から到達不能。
- 修正方向: V-02 と同じく `onClick` 発火 + pointerdown は preventDefault のみ。

### V-04 scrollHint ガタードラッグの固着(中 / 確実)

- 再現(一時テスト): ガターへ `pointerdown` → `pointercancel` → ボタン非押下の `pointermove` で `scrollTop` が書き換わり、`.ssg-scroll-hint-scrollbar--dragging` が残る。
- 原因: `GridScrollHint.tsx:409-413` に `onPointerCancel` / `onLostPointerCapture` が無く、`dragGrabRef.current` / `dragging` state を解除する経路が `onPointerUp` のみ。ブラウザがジェスチャ等で pointer を奪う(pointercancel)と、キャプチャは自動解放されるがコンポーネント側は「ドラッグ中」のまま。
- 実害: 以後ガター上をホバーするだけでコンテンツがジャンプ・ジャンププレビューが出ない。タッチ端末で起こりやすい(`touch-action: none` で頻度は下がる)。
- 修正方向: `onPointerCancel={handleGutterPointerUp}` と `onLostPointerCapture` で同じ後始末を行う。

### V-05 ARIA 構造の欠落と orphan `role="row"`(中 / 高)

- 確認: `grep -rn 'role="grid"\|gridcell\|columnheader\|aria-sort\|aria-rowindex' packages/react/src --include=*.tsx | grep -v test` → 0 件。`role="row"` は `GridBodyLabelRow.tsx:106` / `GridStickyLabelLayer.tsx:227` の 2 箇所のみ。
- 実害: (1) ラベル行の `role="row"` は `grid` / `table` / `treegrid` / `rowgroup` の子孫でなければならず(ARIA 1.2 required context)、axe の `aria-required-parent` 違反になる。(2) ヘッダーのソート状態(`GridHeaderRow.tsx:395-413` の矢印は `aria-hidden`)がスクリーンリーダーへ一切伝わらない。(3) `GridBodyLayer.tsx:234-235` / `GridHeaderRow.tsx:224-233` の `role="checkbox"` + `aria-checked` にアクセシブル名(aria-label)と `tabIndex` が無く、"checkbox without name" になり、キーボードで到達も操作もできない(glyph は `aria-hidden`)。
- 修正方向: 最小限として、ラベル行の `role="row"` を外すか root に `role="grid"`(行 `role="row"` / セル `role="gridcell"` / ヘッダー `role="columnheader"` + `aria-sort`)を付ける。チェックボックス役の要素には `aria-label`(「行 N を選択」「すべての行を選択」)を付与。

### V-06 存在しない日付の受理(低 / 確実)

- 再現(一時テスト): `toDateKey('2026-02-30') === '2026-02-30'`、`toDateKey('2026/4/31') === '2026-04-31'`。
- 原因: `filtering.ts:213` は `day > 31` しか見ない。`FilterDateField.tsx:82-90` はこれを信頼して commit するため、赤枠(aria-invalid)にならずフィルター条件として確定する。
- 実害: equals / 範囲端として永久に一致しない日付が条件になる。カレンダーを開いても該当日が無く選択表示されない。
- 修正方向: `new Date(y, m-1, d)` で round-trip(getMonth / getDate が一致)して不一致なら null。
- 付記(要確認): `20260701`(区切りなし 8 桁)と全角数字は `toDateKey` 非対応。ドキュメントは「`2026/7/1` / `2026-07-01` など」としか書いていないため仕様外扱いだが、「表記ゆれ」の期待値として追加候補。

### V-07 (0,3,0) ルールによる公開契約の逸脱(低 / 確実)

- `styles.css:2554-2556` `.ssg-body-row--checked .ssg-body-cell:not(.ssg-body-cell--row-hovered) { background-color: transparent }` は特異度 (0,3,0)。API_REFERENCE 1304-1315 は「連結 `.ssg-body-cell.my-class` で基底に勝たせる」(0,2,0)を公開契約としているが、チェック選択行ではこれより強いルールが背景を透明化する。
- 実害: `validate` の mark 背景(`:838-840`)が、行チェックを入れた瞬間に消える(右上三角だけ残る)。StyleX / Tailwind の条件付きセル背景(負数の赤背景等)もチェック行で消える。
- 修正方向: 行の選択色をセルではなく行コンテナの擬似要素で描く、または `:where()` で特異度を (0,1,0) に落として連結上書きが勝てるようにする。

### V-08 `.ssg-label-row` の contain 上書きが無効(低 / 高・要確認)

- `styles.css:451` `.ssg-label-row { contain: layout style; }` と `:2540` `.ssg-body-row { contain: layout style paint; }` は同特異度で、後者が後方 → ラベル行にも paint containment が掛かる(dist/style.css でも `.ssg-label-row{` offset 8253 < `.ssg-body-row{` 41851)。
- コメント(`:449-450`)の「contain: paint は外し、中身の sticky をスクロールコンテナ基準で効かせます」は実現していない。実害は paint containment が `position: sticky` 子孫へ与える影響次第(現行ブラウザでは overflow: clip 相当でスクロールコンテナを作らないため、実測で問題が出ていない可能性が高い)。
- 修正方向: 連結 `.ssg-body-row.ssg-label-row` にするか、ルールを `.ssg-body-row` より後ろへ移す。意図どおり不要なら死にルールを削除。

### V-09 ヘッダー操作ボタンのフォーカス不可視(低 / 高)

- `styles.css:2583-2601`: `.ssg-header-actions` は非 hover で `opacity: 0; pointer-events: none`、表示条件は `.ssg-header-cell:hover` のみ。`⋮` は `<button>`(`GridHeaderRow.tsx:467-480`)なので Tab で到達でき、Enter で `onColumnMenuButtonClick` が発火して列メニューは開くが、フォーカス中のボタンが見えない。
- 修正方向: `.ssg-header-cell:focus-within .ssg-header-actions` を hover と同じ表示にする。

### V-10 オーバーレイスクロールバー環境のトラック帯誤判定(低 / 高)

- `GridScrollHint.tsx:140-144`: `zoneStart = offsetWidth - (offsetWidth - clientWidth) - 18`。macOS 既定(オーバーレイバー幅 0)では右端 18px のセル領域が「トラック上」になり、セルをホバーしているだけでジャンプライン(`:354-373`)とルーラー(`:215`)が点灯する。
- 実害: API_REFERENCE 94 / 265 の「既存操作へ一切干渉しない」は保たれる(pointer-events: none)が、常用時の視覚ノイズ。右固定列上でも同様。
- 修正方向: スクロールバー幅 0 のときは帯幅を 0〜数 px にする、または `scrollbar: false` 運用時だけ `trigger` に従う。

### V-11 行番号の基準不一致(低 / 高)

- `GridScrollHint.tsx:366, 387` は `rowIndex + 1`(view index)。`labelRow` 有効時の行ヘッダーは `GridBodyLayer.tsx:1097` の `resolveDataRowNumber`(ラベル行を飛ばす)、バーの件数は `leafRowCount` / `dataRowCount`(ラベル・グループ行除外)。
- 実害: 同じ行に対しバブル「行 12 / 1,005」と行ヘッダー「11」が並び、総行数もバーの Rows と一致しない。
- 修正方向: `labelViewIndexes` を GridScrollHint へ渡して `resolveDataRowNumber` を使う(グループ行はスコープ外として据え置き可)。

### V-12 A1 ラベルが合成列込み(低 / 高)

- `gridBarHelpers.ts:290-295`(`formatGridCellLabel`)/ `:321-323, 332-334`(選択ラベル)は `toExcelColumnName(cell.col)` を論理 index で呼ぶ。`enableRowDrag` / `detailRow.showToggleColumn` / `rowGroup` で合成列が先頭に挿入されるため、先頭データ列が "B" / "C" と表示される。
- 修正方向: 合成列数(`isSyntheticColumnKey` の先頭連続数)を引く、または列 title を使う。

### V-13 GridDetailLayer の baseOffset 二重減算(低 / 中・要確認)

- `GridDetailLayer.tsx:363` `top: virtualRow.start + size - baseOffset`。一方 `verticalGeometry.ts:453` で `start` は既に `headerHeight + index*rowHeight - windowBaseOffsetPx`。`GridBodyLayer.tsx:949/978/1099` は `start` をそのまま使う。
- 現状は `engine/verticalLayout.ts:270-274` の gate で detailActive 時は metrics 経路(`windowBaseOffsetPx = 0`)のため実害なし。将来 scaling 経路と展開行を併用(gate 緩和)すると帯だけ `windowBaseOffsetPx` 分ずれる。
- 修正方向: `baseOffset` prop を撤去し `start` をそのまま使う(オーバーレイ系とは座標の由来が違うことをコメントに明記)。

### V-14 細かな a11y(低 / 高)

- `DefaultGridTopBar.tsx:354-360`: `<input>` に `aria-label` が無く placeholder だけがアクセシブル名(値入力後は名前が消える UA もある)。
- `CellContextMenuPopover.tsx:86-93`: `role="menu"` 内の区切り `<div>` に `role="separator"` が無い。
- `ToolPanel.tsx:153-182`: `role="tablist"` / `role="tab"` に `aria-controls` と対応する `role="tabpanel"` が無い。

### V-15 「列のリセット」だけ menuItem スロット非適用(低 / 確実)

- `ColumnMenuPopover.tsx:546-549` の className に `slots?.menuItem?.className`、style に `slots?.menuItem?.style` が無い(他項目 `:245-246, 274-275, 307-308, 344-345, 371-372, 440-441, 481-482, 497-498, 517-518` は適用)。`classNames.menuItem` を指定すると 1 項目だけスタイルが揃わない。

### V-16 renderHeader と列範囲選択の衝突(低 / 中・要確認)

- `GridHeaderRow.tsx:334` のヘッダーセル `onPointerDown` → `onColumnHeaderPointerDown(colIndex)`(列範囲選択の開始)。`renderHeader`(`:378-385`)の中身に `<button>` 等を置いても pointerdown はバブルするため、ボタン押下と同時に列選択が走る。消費側で `stopPropagation` すれば回避できるが API_REFERENCE 313(「カスタムヘッダー描画。」のみ)に記述がない。
- 修正方向: ドキュメントに注意書きを足すか、`renderHeader` のラッパ要素でインタラクティブ要素(button / input / a)からの pointerdown を無視する。

## 4. 確認したが問題なしだった観点

- **GridBodyLayer**: 3 ペインとも同一の `virtualRows` / `virtualRowIndexes` / `rowModel` を受ける(SpreadsheetGrid.tsx 4006 / 4196 / 4383)。`GridBodyRow` の memo 比較(`arePropsEqualWithStyleKeys`、`rowStyle` のみ内容比較)はキー数・own 判定・Object.is とも妥当で、prop 追加の取りこぼしは無い(全 prop を shallow 比較するため)。選択 / active / editing / hover / checked はすべてプリミティブへ分解済み。`getRowClassName` は本層で毎レンダー評価(stale なし)。style マージは slot → rowStyle → cellStyle → 座標 / 寸法(グリッド後勝ち)で API どおり。`.ssg-body-cell--readonly` は「範囲選択外のとき」で API 表どおり。`data-autoheight-cell` は `autoHeight && column.autoHeight` のみ。clientSide の key(rowKeyGetter 由来)はラベル行・データ行で同一空間だが rows 自体のキーのため重複しない。合成列は `renderEntries` の論理 index をそのまま使い、ハンドル / トグル列は `renderCellContent` 側で描画。
- **GridHeaderRow**: ソート指示子(複数ソート時の優先番号)、フィルター済みマーク、リサイズハンドルは `column.resizable ?? enableColumnResize`(合成列は `resizable: false` で出ない)、ダブルクリック autoSize は `engine/columnCommands.ts:95,406-415` の時刻 + 位置判定で実装済み(API_REFERENCE 295 と整合)。合成列ではメニューボタン非表示 + 右クリック抑止。全選択チェックは `getSelectAllState` の all / some / none を `checked / indeterminate / unchecked` と `aria-checked true / 'mixed' / false` に正しく写像。
- **ColumnFilterPopover**: 全 filterType の分岐(collecting → loading/error → combo → set → number → select → text/date/custom)に漏れなし。set の検索 / Select All(非検索 'all' スコープ、検索中・numberSet は明示スコープ)/ 候補連動時の選択保持(件数の二重計上なし)/ Enter 確定の同期再マッチ / IME ガード(isComposing + compositionend commit)/ 非同期候補(取得中・失敗・再試行・打ち切り注記)/ dateSet ツリーの 3 状態と一括トグル。popover の位置クランプは `logic/filterPopoverLayout.ts`(下 → 上フリップ → 下端 → 上端、maxHeight)で網羅。Escape(各入力で stopPropagation + onRequestClose)/ 外側クリック(controller)。key 遮断は bubble 相で内部ハンドラを殺さない(回帰テストあり)。
- **FilterDateField(ロジック面)**: `buildCalendarDayCells` は `new Date(y, m, 1 - offset + i)` のローカル日付計算で月末 / うるう年 / 42 セル固定とも正しく、`formatDateKey` もローカル基準のため `new Date('YYYY-MM-DD')` の UTC 解釈問題は発生しない(文字列入力は正規表現で部品抽出、Date 値はローカル getters)。ドリルアップ / 戻る / 月送り / 今日 / クリア / blur 確定 / Escape 二段階は実装・テストとも整合。
- **GridScrollHint**: 行番号写像(`physicalToLogicalScrollTop` → `rowAtContentY`)は本体ジオメトリと同式。SSRM 総行数は `rowMetrics.rowCount`。クリック(サム中心掴み)/ ドラッグ(grab オフセット)/ ホイール転送(非 passive)/ minRows ゲート(親で `activeScrollHint` null → 非描画 + ネイティブバー維持)/ `pointer-events: none` オーバーレイ + ガターのみ auto。リスナー / タイマーは effect cleanup で解放。
- **Detail / LabelRow / StickyLabel**: `data-ssg-detail` の境界(keydown / keyup / paste / copy / cut / contextmenu / dragstart / dblclick を stopPropagation、pointer は通す)は設計どおり。sticky 押し上げ(`resolveStickyLabel`: 次ラベル上端が帯下端に達した分だけ負の translateY)と帯高(`cellHeight(labelViewIndex)`)の整合、横スクロール時の `position: sticky` 器(left / width は展開行カードと同値)、z-index(ヘッダー 6 > 固定ラベル 5 > 行)も問題なし。行コンテナの `contain: paint` は各行をスタッキングコンテキスト化するため、固定ラベルが行ヘッダー(z 5)に負けることもない。
- **パネル系**: ColumnChooser の DnD は `[data-chooser-pane=pane]` の DOM 順 = `items` の pane 内相対順で index が一致、`to > from` の -1 補正・no-op 時 null・セクション跨ぎ不可。SortManagement も同じ補正。非表示列 / pinned / 合成列の除外は呼び出し側(`SpreadsheetGrid.tsx:2952` の `isSyntheticColumnKey`)で実施。`onColumnsChange` 未指定時は canToggle / canChangePinned / canResetColumns が false で全操作 disabled + 注記。rAF オートスクロールは unmount で cancel。閉じるときのフォーカス戻しは controller 側の責務(view 外)。
- **CSS**: `@layer` 不使用(src / dist とも 0 件)、`!important` / ID セレクタ 0 件。ポータル root(`.ssg-popover` / `.ssg-menu-panel` / `.ssg-filter-popover` / `.ssg-select-editor-popover` / `[data-grid-drag-ghost]` / `.ssg-tooltip`)にトークンを直接定義し、`.ssg-root` 外でも var() が解決する(リテラル色は invalid 赤 / 曜日色のみで両テーマ安全)。light / dark のトークン差分を機械抽出した結果、dark 未定義は寸法トークン(radius / pad / icon-btn-size)と var() 参照トークン(checkbox-checked-bg / hover-border / panel-accent-text)のみで意図どおり。`--ssg-seg-count / index` は inline 供給。density トークンはルート修飾子 `:where()` で特異度 0。スクロールバー非表示化は Chromium / WebKit は `::-webkit-scrollbar { width: 0 }`、Firefox は `scrollbar-color` のみ(ネイティブ縦バー残存)で API_REFERENCE 233 の記述どおり。
- **emit-layer-css / dist**: `dist/style.layer.css` の 44 バイトは `@import url("./style.css") layer(ssg-base);\n` の 1 行で**意図どおり**(スクリプトコメント、package.json `exports["./style.layer.css"]` と整合。CSS の複製を持たない設計)。`stripCssImports` の正規表現は `import './styles.css';` 行に一致。`dist/style.css` は Lightning CSS の `color-scheme` 補助変数(`--lightningcss-light/dark`)が付くだけで、`@media (hover:none)` / `:where(...) :where(*)::before` 等の構造は保持。
- **a11y で問題なしの点**: 全 `<button>` に `type="button"`(欠落 0 件)。ツールチップ・アイコンボタンの `aria-label`、`aria-expanded`(グループ / 展開トグル)、`role="menu"/"menuitem"`、`role="tablist"/"tab" + aria-selected`、`role="alert"`(候補取得失敗 / SSRM エラー)、`aria-invalid`(FilterDateField)。