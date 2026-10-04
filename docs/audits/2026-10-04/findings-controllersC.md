# findings-controllersC — controllers/ 監査所見

## 1. 概要

- 読んだ範囲: `packages/core/src/controllers/*.ts` 全 24 ファイル(全文)+ 対応する `*.test.ts` の構成 / dispose カバレッジ、React 側アダプタ `packages/react/src/hooks/*.ts`(useController / useGridPointerInteractions / useColumnHeaderDragController / useRowDragController / usePanelHeaderDrag / useGridClipboardController / useGridKeyboardInteractions / useServerSideRowModel / useAsyncSelectOptionsSource / useColumnSelectOptionsCollector / useGridTooltip / useColumnMenuController / useCellContextMenuController / useFilterPopoverController / useToolPanelController / useGridViewportSync / useGridEditController / useGridHistoryController / useGlobalFilteredOrder / useColumnAutosizeRunner)、配線先の `SpreadsheetGrid.tsx`(paste / keydown / requestRange / viewportSync / 候補収集)、`engine/createGridEngine.ts`(debounce / autoSizeOnData)、関連 logic(serverSideBlocks / serverSideCache / chunkedLoop / filterPopoverOutsideClick / domGuards / verticalGeometry.rowAtContentY / tooltipGeometry)。
- 検証方法: 一時 vitest(core 3 本 + react 1 本)で再現 → 全て削除済み(`git status` に controllersC 由来の差分なし。他エージェントの `zz_audit_reactD_*` / `zz_audit_viewE_*` は未タッチ)。
- 所見件数: 12 件(高 1 / 中 4 / 低 7)。うちテストで再現したもの 6 件(C-1, C-2, C-3, C-4, C-6, C-7)。

## 2. 所見一覧

| ID | 重要度 | 確度 | 要約 | file:line |
| --- | --- | --- | --- | --- |
| C-1 | 高 | 確実 | SSRM: React StrictMode(effect 二重実行)で `initialRowCount` 未指定だと初回 block 0 fetch が abort され再発行されず、グリッドが永久に空(件数 0) | `packages/core/src/controllers/serverSideRowModel.ts:325-345, 384-389` / `packages/react/src/hooks/useController.ts:37-41` |
| C-2 | 中 | 確実 | セル編集中にエディタ input 内で Ctrl+V すると shell root の onPaste が奪い、input へ貼り付かず代わりにセル範囲へ複数セル貼り付けが実行される | `packages/core/src/controllers/clipboardController.ts:153-184` / `packages/react/src/SpreadsheetGrid.tsx:3850` / `packages/react/src/editors/TextCellEditor.tsx` |
| C-3 | 中 | 確実 | ポップオーバー系 4 コントローラの「外側 pointerdown で閉じる」が rAF で grid root へ focus を戻すため、ページ内の別 input をクリックして閉じるとフォーカスを奪い返す | `packages/core/src/controllers/popoverSupport.ts:23-29` / `contextMenuController.ts:93-107` / `columnMenuController.ts:156-177` / `toolPanelController.ts:136-150` / `filterPopoverController.ts:200-220` |
| C-4 | 中 | 確実 | フィルターポップオーバー: アンカーのヘッダーセルが横仮想化で unmount すると scroll 時に 0 矩形基準で (8,8) へ飛ぶ(columnMenu は isConnected で閉じるが filterPopover は未対応) | `packages/core/src/controllers/filterPopoverController.ts:154-181, 215-220` |
| C-5 | 中 | 確実 | キーボード: Tab / Shift+Tab を常に preventDefault して端で clamp → グリッドからキーボードでフォーカスを出せない(キーボードトラップ、WCAG 2.1.2) | `packages/core/src/controllers/keyboardController.ts:197-201` |
| C-6 | 低 | 確実 | `autoSizeColumns: 'onMount'` が StrictMode で効かない(runner.dispose が世代を進めて複数チャンク計測を中断、トリガーの `hasAutoSizedOnMount` は消費済みで再発火しない) | `packages/core/src/controllers/columnAutosizeRunner.ts:113-117, 142-169` |
| C-7 | 低 | 確実(要確認=設計意図) | SSRM: 失敗ブロックを `fetchBlock` が見ないため、可視窓が 1 行動くたびに同じ失敗ブロックを再要求し `onLoadError` が毎回発火(トースト連打 / サーバ負荷) | `packages/core/src/controllers/serverSideRowModel.ts:168-174, 213-226` |
| C-8 | 低 | 高 | 列ヘッダー D&D: Escape / window blur / visibilitychange での中断が無い(rowDrag には Escape あり)。Alt+Tab 等で pointerup を取りこぼすとゴースト・`grabbing` カーソル・rAF ループが次の pointerup まで残る | `packages/core/src/controllers/columnHeaderDragController.ts:605-639` |
| C-9 | 低 | 高 | 列 / 行 D&D: ドラッグ中に別ポインタ(マルチタッチ)でハンドルを再度押すと前セッションの `activeDragDispose` / `rafId` が上書きされ、旧ポインタの up が新しい対象で `endDrag(true)` を実行、旧 rAF ループも二重に回る | `columnHeaderDragController.ts:581-639` / `rowDragController.ts:428-494` |
| C-10 | 低 | 高 | ツールチップ: SHOW_DELAY(350ms)中に対象要素が DOM から外れる(SSRM スケルトン→実データ差替、フィルター結果変化)と 0 矩形基準で画面左上に表示される | `packages/core/src/controllers/tooltipController.ts:141-150, 92-123` |
| C-11 | 低 | 中(要確認) | StrictMode 再入耐性: `globalFilteredOrder` / `selectOptionsCollector` は dispose で `current` を保持したまま cancel するため、マウント時点で非同期経路が走っていると再開されず 0% 固着。`autoHeightMeasurer` は disconnect 後 `last` が同じで ResizeObserver が次の deps 変化まで再生成されない | `globalFilteredOrder.ts:151-174` / `selectOptionsCollector.ts:190-215` / `autoHeightMeasurer.ts:168-179` |
| C-12 | 低 | 高 | clipboard: clientSide 貼り付け後の選択範囲 endCol が `matrix[0].length`(先頭行幅)基準で、serverSide 経路の `maxPasteWidth` と不一致。先頭行が短い不揃い行列では選択が貼り付け範囲より狭い | `packages/core/src/controllers/clipboardController.ts:304-311`(vs `231-235`) |

## 3. 各所見の詳細

### C-1(高 / 確実)SSRM が StrictMode で永久に空になる

- 再現(一時テストで確認): `createServerSideRowModel(args)`(`initialRowCount` 未指定)→ `update(args)`(block 0 fetch 開始、`getRows` 1 回)→ `dispose()`(abort)→ `update(args)` → microtask flush → `requestRange(0, 50)` + 200ms → **`rowCount` が 0 のまま、`getRows` は 1 回のみ**。
- 期待: 再マウント相当の update で block 0 を取り直し `rowCount` が到着件数になる。
- 原因: `useController` は `useState(create)` でインスタンスを保持し、StrictMode の擬似アンマウントで `dispose()` → 再マウントで同じ args の `update()` を呼ぶ(useController.ts:37-41)。`dispose` は `abortAll()` するが `prevQueryKey` / `hasInitialized` を戻さないため `syncQueryKey()` は `prevQueryKey === args.queryKey` で早期 return(serverSideRowModel.ts:326-328)、`syncRefreshToken()` も no-op。件数 0 のためシェル側の `requestRange` effect は空窓で発火せず(SpreadsheetGrid.tsx:1750-1760)、仮に発火しても `computeBlockIndexes(..., rowCount=0)` は `[]`(serverSideBlocks.ts:28-30)。結果、何も取得しない。
- 影響: Vite テンプレート既定の `<StrictMode>` 開発環境で `initialRowCount` を渡さない SSRM グリッドは dev で一切データが出ない(デモ app は `initialRowCount` を渡しているため顕在化していない。API_REFERENCE.md:1168 は `initialRowCount` を任意と明記)。`initialRowCount > 0` のときは窓が非空で `requestRange` → `runFetch` が救う。
- 修正の方向性: `dispose` で `prevQueryKey = undefined` / `hasInitialized = false` を戻す、または `update` で「dataSource あり & cache 空 & in-flight 無し & rowCount 0」なら block 0 を再取得する。

### C-2(中 / 確実)編集中のペーストがグリッドに横取りされる

- 再現(一時テストで確認): clientSide グリッドで `setActiveCell({row:0,col:1})` → shell に `Enter` → `.ssg-cell-editor-input` 出現 → その input に `paste`(`'PASTED\tROW\nSECOND\tLINE'`)→ **`defaultPrevented === true`、`onRowsChange` が 1 回呼ばれ 2 行 × 2 列が書き込まれる**(`{name:'PASTED', qty:'ROW'}` 等)。
- 期待: 編集中は input の既定ペースト(テキスト挿入)だけが起き、グリッドのセル貼り付けは走らない(keyboardController は `uiState.editingCell` で早期 return している: keyboardController.ts:139-141。paste だけガードが無い)。
- 原因: `handlePaste` は `readOnly` / 書き込み口 / `activeCell` しか見ず(clipboardController.ts:171-177)、`event.preventDefault()` を無条件に呼ぶ(184)。エディタ(TextCellEditor 等)は paste を stopPropagation していないため、shell root の `onPaste`(SpreadsheetGrid.tsx:3850)までバブルする。展開行カード(GridDetailLayer.tsx:105)だけは `stopPropagation` 済み。
- 修正の方向性: `handlePaste` 冒頭で `uiState.editingCell` なら return(または `shouldIgnoreGridKeydown(event.target)` 相当で input / textarea / contenteditable 配下は無視)。
- 付記(他エージェント範囲): 同テストで number 列(`editor.type:'number'`)に `'ROW'` が文字列のまま書き込まれた(utils/clipboard の値解釈)。

### C-3(中 / 確実)ポップオーバーを外側クリックで閉じるとフォーカスを奪い返す

- 再現(一時テストで確認、contextMenu / toolPanel): 開いた状態でグリッド外の `<input>` に `pointerdown` を dispatch → `close()` → input を focus(ブラウザ既定相当)→ rAF を流す → **`document.activeElement` が grid root(div tabindex=0)に戻る**。columnMenu / filterPopover も同じ `onOutsidePointerDown: close` → `restoreGridFocus` 経路。
- 期待: ユーザーがクリックした要素にフォーカスが残る(閉じるだけ)。
- 原因: `restoreGridFocus`(popoverSupport.ts:23-29)が「展開行カード内にフォーカスがある」場合しか除外せず、close の理由(Escape / 項目選択 / 外側クリック)を区別しない。pointerdown ハンドラ → ブラウザのフォーカス移動 → rAF の順で実行されるため必ず奪い返す。
- 影響: グリッドと同じページの検索ボックス等をクリックしても入力できない(1 回目のクリックでフォーカスが戻る)。複数グリッド同居時も同様。
- 修正の方向性: 外側 pointerdown 由来の close では復帰しない(target が grid root 内のときだけ復帰)、または rAF 時点で `document.activeElement` が `body` / grid 内のときだけ `focus()`。

### C-4(中 / 確実)フィルターポップオーバーがアンカー消失で左上へ飛ぶ

- 再現(一時テストで確認): アンカーセル(`[data-ssg-col-key]`)が接続中は `{top:100,left:300,w:120,h:32}`、切断後は 0 矩形を返す stub で `open()` → layout `{top:140,left:180}` → `cell.remove()` → `window.dispatchEvent(new Event('scroll'))` → **layout が `{top:8,left:8}`**、state は開いたまま。
- 期待: 閉じる(columnMenuController.ts:123-129 は `anchorButton.isConnected` を見て閉じる)か位置を保つ。
- 原因: `updateLayout`(filterPopoverController.ts:154-181)は `anchorElement.getBoundingClientRect()` を無条件に使う。中央ペインのヘッダーは `virtualColumns` で横仮想化されており(GridHeaderRow.tsx:175 コメント)、ポップオーバーを開いたままホイールで横スクロールするとアンカーセルが unmount し得る。scroll は window capture で拾って `updateLayout` が走る(215-220)。
- 修正の方向性: `anchorElement.isConnected` を確認し、消えていたら root から `[data-ssg-col-key="…"]` を再解決(見つからなければ close)。

### C-5(中 / 確実)Tab でグリッドから出られない(キーボードトラップ)

- 成立条件: grid root にフォーカス → `Tab` / `Shift+Tab` は常に `preventDefault()` して `moveActiveCell` で端 clamp(keyboardController.ts:197-201、clamp は 79-93)。`Escape` は選択解除のみでフォーカスは残る(202-206)。最終列 / 先頭列でも既定の Tab 移動が起きないため、キーボードのみの利用者はマウス無しにグリッド外の要素へ移れない。
- 期待(WCAG 2.1.2 No Keyboard Trap): 端で既定動作を許す(AG Grid は最終セルの Tab でグリッド外へ出す)か、別の脱出手段(例: Escape でフォーカス解放)を用意・文書化する。API_REFERENCE.md:273 は Tab を「アクティブセル移動」としか記載しておらず脱出手段の記述も無い。
- 修正の方向性: 端(次セルが現在と同じ)なら `preventDefault` せず return。

### C-6(低 / 確実)`autoSizeColumns: 'onMount'` が StrictMode で効かない

- 再現(一時テストで確認、`performance.now` を 1 visit ごとに進めて 1 チャンク=1 行にした): `runner.update` → `trigger.update`(run 開始)→ `runner.dispose()`(StrictMode cleanup)→ `runner.update` → `trigger.update`(同じ args)→ yield を全て流す → **`dispatch(syncColumnWidths)` が 0 回**。
- 原因: `dispose` が `runGeneration += 1`(columnAutosizeRunner.ts:113-117)→ `isCancelled` が true で run 中断。`createAutoSizeOnDataTrigger.update` は deps 同一で早期 return し(147-156)、`hasAutoSizedOnMount` は初回で true 化済み(164)のため二度と発火しない。1 チャンク(10ms)で完走する小規模データは `await` 前に全行処理されるため影響なし。
- 修正の方向性: トリガーに reset を設け runner.dispose と連動、または中断された run を次 update で再開。

### C-7(低 / 確実・要確認)失敗ブロックがスクロールのたびに再要求される

- 再現(一時テストで確認): 常に reject する `getRows` で `requestRange(0,50)` → 失敗(`onLoadError` 1 回、`loadError.failedBlockCount=1`)→ `requestRange(1,51)`(1 行スクロール)→ **`getRows` 2 回目、`onLoadError` 2 回目**。
- 原因: `fetchBlock` のスキップ条件は `cache.hasBlock || inFlight.has` のみ(serverSideRowModel.ts:173)で `failedBlocks` を見ない。`runFetch` は可視窓変化のたびに走る(213-226)。
- 要確認: 「スクロールで自動再試行」が意図なら仕様だが、`retryFailedBlocks()` と内蔵の再試行 UI がある以上、利用側 `onLoadError` でトーストを出す実装では連打になる。バックオフ or 明示再試行までの抑止が妥当。

### C-8(低 / 高)列ヘッダー D&D の中断手段が不足

- 成立条件: pointerdown で window に pointermove / pointerup / pointercancel のみ登録(columnHeaderDragController.ts:632-634)。Escape / `blur` / `visibilitychange` は無い(rowDragController.ts:479-489 には Escape がある)。Alt+Tab・OS 通知等で pointerup を取りこぼすと、`draggingKey` が残り `autoScrollTick` の rAF(446-489)が回り続け、`document.body.style.cursor='grabbing'` とゴーストが残る(次に window のどこかで pointerup するまで)。
- 修正の方向性: rowDrag と同じ `keydown(Escape)` と `window blur` で `cleanup(); endDrag(false)`。

### C-9(低 / 高)D&D のマルチポインタ再入

- 成立条件: ドラッグ中(`draggingKey !== null`)に別 pointerId でハンドルを pointerdown → `activeDragDispose` / `rafId` を上書き(columnHeaderDragController.ts:635-638、rowDragController.ts:490-493)。旧ポインタの up は旧 `handleUp` → `cleanup()` → `endDrag(true)` が **新しい** `draggingKey` / `dropTarget` で確定(491-523)。旧 rAF ループは `rafId` 共有のため cancel できず、`draggingKey` が null になるまで二重に回る。
- 修正の方向性: pointerdown 冒頭で `draggingKey !== null` なら無視(または既存セッションを `endDrag(false)`)。

### C-10(低 / 高)ツールチップが左上に出る

- 成立条件: pointerover で `showTimerId = setTimeout(showTooltipFor(target), 350)`(tooltipController.ts:146-149)。その間に target が再レンダーで DOM から外れる(SSRM のスケルトン→実データ差替、フィルター確定での行入替、行削除。scroll は capture で hide するが再レンダーは拾わない)と、`target.getBoundingClientRect()` が 0 矩形 → `computeTooltipPlacement`(tooltipGeometry.ts:33-54)で `left = margin`, `top = 0 + gap` → 画面左上に表示され、pointerout も来ないため次の pointerdown / scroll まで残る。
- 修正の方向性: `showTooltipFor` 冒頭で `target.isConnected` を確認。

### C-11(低 / 中・要確認)StrictMode 再入耐性(その他)

- `globalFilteredOrder.ts:171-174` / `selectOptionsCollector.ts:212-215`: dispose は `cancelCurrent` のみで `current` を保持 → 直後の同一 args `update` は `keyChanged=false` で再開しない。マウント時点で非同期経路(>50k 行 + 初期フィルター文字列 / 開いている列)が走っている場合のみ 0% 固着。通常のマウントでは非同期経路が無いため実害は限定的(asyncSelectOptionsSource は `current=null` に戻しており問題なし)。
- `autoHeightMeasurer.ts:168-179`: dispose(`disconnect`)後の同一 deps `update` は `sameDeps` で skip → ResizeObserver が null のまま。初回測定で高さが変わらなかった場合、次の scroll / version 変化まで内容変化(編集で行が伸びる)を検知しない。dev 限定。

### C-12(低 / 高)貼り付け後の選択範囲の幅が経路で不一致

- clientSide 経路の `endCol` は `matrix[0]?.length`(clipboardController.ts:305)、serverSide 経路は `maxPasteWidth`(232)。先頭行が他行より短い TSV(例: `a\nb\tc`)では clientSide の選択範囲が実際の貼り付け範囲より 1 列狭い。軽微な表示不整合。

## 4. 確認したが問題なしだった観点

- **useController のライフサイクル**: 生成 1 回(useState)/ update はレイアウト effect / dispose は unmount。pointerInteractions(update で再 attach)/ scrollSync(detach=null で再 attach)/ asyncSelectOptionsSource(current=null)/ tooltip(refCount 対称、dispose 冪等)/ popover 系(閉じた状態では bindings 未 attach)は StrictMode で再開できる。
- **pointerInteractionsController**: window リスナーの add/remove が対応(attachListeners / detachListeners、capture 無しで一致)。選択 auto-scroll の rAF は dragState 遷移で開始 / 停止し dispose で cancel、ガター行選択の rAF は `rowSelectionDragging` で自己停止。pointerup のたびに dispatch する `endSelection` / `endColumnResize` は reducer が同一 state を返す(gridReducer.ts:207-218)。タッチのタップ確定は pointerId でフィルタ。`rowAtContentY` は [0,rowCount-1] に clamp、列は clamp 済みで負 index は出ない。
- **rowDragController**: pointerId フィルタ、pointercancel / Escape で中断、setPointerCapture は try/catch、ドラッグ中の行 unmount は window 登録で耐える、ヒットテストは共有スクロールコンテナの rect と `scrollTop*(1-sf)` 補正で pointerInteractions と同式。dispose でリスナー / rAF / cursor / ゴースト / `data-ssg-row-dragging` を後始末。
- **panelHeaderDragController**: pointerId フィルタ、`cleanup !== null` で二重開始を拒否、dispose で window リスナー解除。
- **clipboard**: `clipboardData` が null の環境は `?? ''` で no-op、コピーは `navigator.clipboard` → `execCommand` フォールバック(utils/clipboard.ts:316-332)、`readOnly` / 書き込み口無しは早期 return、popup open 中は shell の `onPaste` 自体を外す(SpreadsheetGrid.tsx:3850)。ラベル行読み飛ばし / 末尾追記 / 列追加の index 計算は一貫。
- **keyboard**: Mac `metaKey` と `ctrlKey` 双方対応、フォーム要素 / contenteditable 配下は `shouldIgnoreGridKeydown` で無効、編集中は早期 return、IME 変換中(`isComposing`)の Ctrl+Z/Y 無視、ラベル行 / グループ行の分岐、`data-ssg-detail` 境界は GridDetailLayer の stopPropagation で素通し。
- **serverSideRowModel(C-1 / C-7 以外)**: abort 済み / 置換済み controller の到着は `signal.aborted` と `inFlight.get !== controller` の二重ガードで破棄(到着順逆転をテストで確認)。`refresh()` / queryKey 変化で `abortAll + cache.clear + writeEpoch++`、書き戻しは epoch ガードで古い決着を破棄、`cache.updateRow` は退避済みブロックで false(無害)。dispose で in-flight abort + timer clear。queryKey 変化時はシェルの `requestRange` effect が `serverSideQueryKey` 依存で可視窓を再要求するため固着しない。
- **asyncSelectOptionsSource / selectOptionsCollector**: 要求トークン + AbortController で開閉連打 / 列切替の取り違えなし、`signal` を無視する getFilterOptions も token 不一致で破棄、同期例外も reject 経路へ、retry は最新 args を使用。collector は `getRawValueAt` の identity が rows / 開いている列に連動する useCallback で安定(SpreadsheetGrid.tsx:3022-3028)。
- **columnMenu / contextMenu / toolPanel / popoverSupport**: `createPopoverWindowBindings` の attach / detach は冪等、capture フラグは add / remove で一致。外側判定は panelRef.contains(+ anchorButton / alliedRef / `data-ssg-filter-keep-open`)で Portal 内の pointerdown を内側扱い。Escape は capture で拾い preventDefault。columnMenu はアンカー消失で閉じる、座標アンカーは scroll で閉じる、rAF 再測定は cancel 管理。
- **filterPopoverController(C-4 以外)**: ResizeObserver はパネル差替で接続し直し dispose で disconnect、二重 rAF は cancel 管理、`lastFocusKey` で再フォーカスの重複抑止。
- **viewportSync / scrollSync / autoHeightMeasurer**: deps の Object.is 比較で旧 effect と同じ発火条件、clamp は内容縮小時のみ、active cell 可視化は中央ペインの rect のみ(pinned は `centerViewportActiveRect=null`)で横計算の不整合なし、scroll 通知は rAF 間引きで user 優先、ResizeObserver は dispose で disconnect、auto-height は anchor 補正を layout フレーム内で同期適用し収束で停止、ネストした展開行カード内のセルは除外。
- **editController / historyController / debouncedValueStore / systemColorSchemeStore**: 編集確定後の rAF は guard で再入抑止、blur の二重 commit は guard で noop、履歴は自己発行 rows の識別で外部差し替えのみリセット、debounce の初期値は engine の `initialServerSideQuery`(メモ化で初回 update と同一参照)のため StrictMode でも値ずれなし、matchMedia 非対応環境は light 固定。