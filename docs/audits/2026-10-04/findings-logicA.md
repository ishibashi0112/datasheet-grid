# findings-logicA — 純ロジック層(logic / utils / model/gridSelectors)監査

## 1. 概要

- 読んだ範囲(全文): `packages/core/src/logic/` の filtering / numberFilterCondition / textFilterCondition / dateFilterCondition / dateFilterPresets / dateFilterTree / inferFilterType / setFilterSearch / setFilterSelection / filterSummary / selectOptions / sorting / grouping / aggregation / labelRows / gridState / history / clearCells / exportCsv / exportData / exportScope / validation / editorValues / checkboxEditor / selectEditorState / valueFormatters、`utils/` の clipboard / permissions / excelColumnName、`model/gridSelectors.ts`。対応する `*.test.ts` も全件確認。
- 呼び出し側として `engine/rowPipeline.ts` / `engine/columnLayout.ts` / `engine/gridApi.ts`(export / getState / applyState)/ `engine/filterPopoverCommands.ts` / `controllers/clipboardController.ts` / `controllers/selectOptionsCollector.ts` / `SpreadsheetGrid.tsx`(候補収集アクセサ・フィルター管理パネル)/ `API_REFERENCE.md` を突き合わせた。
- 所見: **20 件**(高 1 / 中 9 / 低 10)。うち「要確認」3 件(L-15 / L-16 / L-20)。L-01〜L-13 は一時 vitest で再現済み。

## 2. 所見一覧

| ID | 重要度 | 確度 | 要約 | file:line |
| --- | --- | --- | --- | --- |
| L-01 | 高 | 確実 | 貼り付けの列あふれ(`createOverflowColumn`)で `onColumnsChange` に**視覚順の可視列 + 合成列**を渡し、consumer の `columns` から非表示列が消える / 固定列順に並び替わる / 合成列が混入する | `controllers/clipboardController.ts:255,272-281`, `SpreadsheetGrid.tsx:2133` |
| L-02 | 中 | 確実 | 非表示列(`visible:false`)の列フィルター / ソートは state・チップ件数・管理パネルでは「適用中」だが、行の絞り込み / 並べ替えに効かない | `engine/rowPipeline.ts:180,184`, `logic/filtering.ts:894`, `logic/sorting.ts:200`, `SpreadsheetGrid.tsx:2700-2730` |
| L-03 | 中 | 確実 | `parseClipboardText` が空行を全部落とすため、単一列コピーの空セル行で貼り付け行がずれる(データ破壊) | `utils/clipboard.ts:16-25` |
| L-04 | 中 | 確実 | TSV の引用符(Excel のセル内改行 / タブ / `"`)を解釈せず、コピー側も引用しない → 改行入りセルがコピー / 貼り付けで複数行に割れる | `utils/clipboard.ts:16-25, 55-80` |
| L-05 | 中 | 確実 | ソート中に view 末尾を超える貼り付けは行を追記せず**静かに捨てる**(恒等 order では `createRow` で追記) | `controllers/clipboardController.ts:255-262` |
| L-06 | 中 | 確実 | `dateSet` 列のセル値が `Date` インスタンスだと候補が `String(Date)` の生文字列になり、年月日ツリーに出ず選択しても一致しない(照合側は `toDateSetKey` の日付キー) | `logic/selectOptions.ts:24`, `logic/dateFilterTree.ts:20-30`, `SpreadsheetGrid.tsx:3023` |
| L-07 | 中 | 確実 | 数値ソートで `null` / `''` は 0 として中間に並び、`undefined` は先頭(asc)— 空値の位置が型で変わり、フィルター / 集計の空値規則(空白は不参加)と不整合 | `logic/sorting.ts:27-37, 221-233` |
| L-08 | 低〜中 | 確実 | `compareUnknownValues` のペア単位の数値 / 文字列切替が**非推移**(1.25 < 1.5 < '1.5x' < 1.25)→ 非数値 1 件の混入で列全体の順序が不定 | `logic/sorting.ts:27-37, 268-282` |
| L-09 | 中 | 確実 | `applyState` に未知 `kind` の列フィルターが入ると `cloneColumnFilterValue` が `undefined` を格納 → 次の `buildGridState`(`onStateChange` / `getState`)で TypeError(前方互換ケース)。`kind:'set'` で `values` 欠損は migrate 内で throw | `logic/gridState.ts:31-73, 184-191`, `engine/notifiers.ts:153` |
| L-10 | 低〜中 | 確実 | 組み込み集計(sum/avg/min/max)が空白のみ文字列 `' '` を 0 として算入(`Number(' ')===0`)。boolean / 配列 / Date も算入 | `logic/aggregation.ts:60-63` |
| L-11 | 低 | 確実 | ラベル行 `sortMode:'follow'` + ソートのみで、元から空のセクション(連続ラベル)のラベルが消える(`'section'` は残る。仕様は「フィルターで 0 件」のみ) | `logic/labelRows.ts:187-193`(vs `:160-161`) |
| L-12 | 低 | 確実 | CSV / `getExportData` のヘッダーが `title:''` で key にフォールバックしない(`??`)。API_REFERENCE `title` 行と矛盾 | `logic/exportCsv.ts:80`, `logic/exportData.ts:41` |
| L-13 | 中 | 確実 | `numberFormatter` が呼び出しごとに `new Intl.NumberFormat`(5,000 回 110ms vs キャッシュ 1.9ms ≒ 55 倍)。可視セルごと毎レンダー | `logic/valueFormatters.ts:51-56` |
| L-14 | 低 | 確実 | API_REFERENCE「状態の保存 / 復元」の `GridState` 記述が v1 のまま(version 現行 `1` / 列メタを「含めない」/ 3 dispatch)。実装は v2 + `onColumnsChange` | `API_REFERENCE.md:1089-1092`, `logic/gridState.ts:26`, `engine/gridApi.ts:552-562` |
| L-15 | 低 | 高(要確認) | 相対プリセットの解決基準 `now` が memo 入力に無く、日付をまたいで開きっぱなしでは他入力が変わるまで前日の範囲のまま。SSRM も queryKey 不変 | `engine/rowPipeline.ts:172-181`, `logic/filtering.ts:893` |
| L-16 | 低 | 高(要確認) | 日付の TZ 解釈が型で異なる: `Date` はローカル、ISO 文字列は文字部分採用。`new Date('2026-07-01')` は負オフセット TZ で `2026-06-30`(LA で実測) | `logic/filtering.ts:188-217`, `logic/editorValues.ts:16-45` |
| L-17 | 低 | 確実 | `migrateGridState` が `columnWidths` の 0 / 負値を採用 | `logic/gridState.ts:160-170` |
| L-18 | 低 | 確実 | number/date エディタ列で `undefined` セルを Delete すると `null` へ書き換わり「変更あり」(onRowsChange + undo 1 段) | `logic/clearCells.ts:148-151`, `logic/editorValues.ts:13-18` |
| L-19 | 低 | 確実 | 空白候補ラベルが `selectOptions` だけ全角 `（空白）`、他は半角 `(空白)` | `logic/selectOptions.ts:26` |
| L-20 | 低 | 中(要確認) | CSV エクスポートが `=`/`+`/`-`/`@` 始まりを無害化しない(CSV インジェクション)。方針判断 | `logic/exportCsv.ts:13-23` |

## 3. 各所見の詳細

### L-01(高 / 確実)貼り付けの列あふれで consumer の columns が壊れる
- 再現(core 一時テスト): consumer の columns `[a, b(visible:false), c(pinned:'left')]`、controller へ渡る `visibleColumns`(実体は `orderedColumns`)は `[c, a]`。アクティブセル (0,1) に `'x\ty'` 貼り付け → `onColumnsChange` が受け取ったキーは **`['c','a','extra2']`**(期待 `['a','b','c','extra2']`)。
- 原因: `clipboardController.ts:255` `workingColumns = [...visibleColumns]` → `:274-281` で overflow 列を push しそのまま `onColumnsChange(workingColumns)`。`SpreadsheetGrid.tsx:2133` は `visibleColumns: orderedColumns` を渡しており、これは `columnLayout.ts:124-126` の `effectiveColumns.filter(visible!==false)` を pane 順に並べた配列 = 非表示列を含まず、固定列が先頭、合成列(行ドラッグ / 展開トグル / 自動グループ列)を含む。
- 影響: 非表示列定義の消失、論理順の破壊、`__ssg_*` 合成列の consumer columns への混入(次レンダーで二重注入の恐れ)。
- 方向性: overflow 列は consumer の全列(論理順)の末尾へ追加して `onColumnsChange`、書き込み用 `workingColumns` は別に持つ。

### L-02(中 / 確実)非表示列のフィルター / ソートが効かないのに「適用中」
- 再現(react jsdom): `name` を `visible:false` にし `applyState` で `columnFilters.name={kind:'text',value:'be'}` と `sort=[name desc]` → `getState()` には残るが `getExportData({scope:'view'})` は 3 行全件・順序不変。
- 原因: `rowPipeline.ts:180,184` が `visibleColumns` を `filterOrderByColumns`/`sortOrder` に渡し、`filtering.ts:894` は `for (const column of columns)`、`sorting.ts:200` は `columns.find` でスキップ。一方 `gridBarHelpers.ts:181` の件数や `SpreadsheetGrid.tsx:2700-2730` の管理パネル(「非表示列の絞り込みの発見性を塞ぐ」目的)は有効扱い。
- 方向性: パイプラインへ `effectiveColumns` を渡すか、非表示化時にその列の filter/sort を clear して UI と一致させる(仕様判断)。

### L-03(中 / 確実)TSV の空行が落ちて行ずれ
- 再現: `parseClipboardText('a\r\n\r\nb\r\n')` → `[["a"],["b"]]`(期待 `[["a"],[""],["b"]]`)。Excel の 1 列 3 セル(中央空)コピーがこの形。
- 原因: `clipboard.ts:21-24` `.filter(line => line.length > 0)` が末尾改行対策で全空行を除去。
- 方向性: 末尾の空要素 1 つだけ落とす。

### L-04(中 / 確実)引用符付き TSV 非対応・コピー側も引用なし
- 再現: `parseClipboardText('"line1\nline2"\tx\r\n')` → `[["\"line1"],["line2\"","x"]]`。`serializeSelectionToTsv` で `'l1\nl2'`,`'x'` → `"l1\nl2\nx"` → 再 parse 3 行。
- 原因: `clipboard.ts:16-25` は `\t`/`\n` 分割のみ、`:55-80` は無加工 join。Excel / Sheets は改行・タブ・`"` を含むセルを `"…"`+`""` で囲む。
- 方向性: RFC 4180 風クォート対応パーサと対称なエスケープ。

### L-05(中 / 確実)ソート中の貼り付けあふれ行が捨てられる
- 再現(core、偽 RowModel): rows 3 行 + `createRow`。恒等 order で view 2 から 3 行貼付 → `['r0','r1','p1','p2','p3']`。降順 `[2,1,0]`(view 2 = source 0)で同操作 → **`['p1','r1','r2']`**(p2/p3 消失)。
- 原因: `clipboardController.ts:258-260` `requiredOriginalRowCount = startOriginalRowIndex + matrix.length` が view=source を前提。`resolveSourceIndex` は view 3,4 を `appendBaseSource+…` に解決するが行が無く skip。ラベル行経路の式 `workingRows.length + appendCount` は正しい。
- 方向性: ラベル行なしでも `appendCount = max(lastTargetViewIndex+1-viewRowCount,0)` を使う。

### L-06(中 / 確実)`Date` 値列の dateSet 候補が選択不能
- 再現: `v` が `new Date(2026,6,1)`/`new Date(2026,6,2)` → `collectSelectOptions`→`normalizeDateSetOptions` の value は `'Thu Jul 02 2026 00:00:00 GMT+0000 (…)'` 等(非日付リーフ)。それを `set.values` にして `filterOrderByColumns` → 一致 0 行(述語側は `toDateSetKey(Date)='2026-07-01'`)。
- 原因: `selectOptions.ts:24` が `String(rawValue ?? '')` で先に文字列化するため `toDateKey` の正規表現に乗らない。`inferFilterType` は Date 値を dateSet と判定するため `filterType:'auto'` で自動的にこの状態になる。
- 方向性: dateSet 列の候補収集は `toDateSetKey` を通してから accumulator へ。

### L-07(中 / 確実)数値ソートの空値位置が型で変わる
- 再現: `[5,null,-3,'',2]` asc → `[-3,null,'',2,5]`;`[5,undefined,-3,2]` asc → `[undefined,-3,2,5]`。
- 原因: `sorting.ts:28-29` `Number(null)=0`,`Number('')=0` が有限で数値枝、`undefined` のみ文字列枝(`''`)。B-1 高速経路(`:221-233`)も同判定。
- 方向性: `isBlankCellValue` 相当を先に判定し空値を端へ固定。

### L-08(低〜中 / 確実)比較関数が非推移
- 再現: `compareUnknownValues(1.25,1.5)=-0.25`、`(1.5,'1.5x')=-1`、`('1.5x',1.25)=-1` → 循環。
- 原因: `sorting.ts:27-37` のペア単位切替(Collator `numeric:true` は小数点以降を別の数として比較)。
- 影響: 非数値 1 件混入で `Array.prototype.sort` の全順序前提が崩れ他の数値の順序も乱れる。
- 方向性: 列単位で数値 / 文字列 / 空に分類し同種内のみ比較。

### L-09(中 / 確実)未知 kind の列フィルターで applyState 後 TypeError
- 再現: `migrateGridState({filters:{columnFilters:{a:{kind:'futureKind'}}}})` → `columnFilters.a === undefined` だがキーは残る → `buildGridState({}, migrated.filters, [], [])` が **TypeError**(`cloneColumnFilterValue(undefined)` の `value.kind`)。実運用では `applyState` → `notifiers.ts:153` で throw。`{kind:'set'}`(values 欠損)/`{kind:'numberSet',set:{}}` は migrate 自体が `[...undefined]` で throw。
- 原因: `gridState.ts:184-191` は「kind を持つオブジェクト」だけ検査、`cloneColumnFilterValue` の switch は未知 kind で何も返さず、`isSameColumnFilterValue(:380)` も `a.kind` 直参照。
- 影響: 新 kind を追加した将来版の保存 state を旧版が読む(ロールバック / 複数デプロイ共存)と再現。「壊れた入力に耐える」目的に反する。
- 方向性: 既知 kind 集合で採用判定し、`default` で drop(or そのまま返す)。

### L-10(低〜中 / 確実)集計が空白文字列を 0 として算入
- 再現: `[10,' ',20]` → `sum=30, avg=10, min=0, numericCount=3`。`[true,[7],new Date(0)]` も `numericCount=3`。
- 原因: `aggregation.ts:60-63` のガードが `value == null || value === ''` のみ。
- 方向性: `isBlankCellValue`(trim)で除外、必要なら number/string 以外も除外。

### L-11(低 / 確実)'follow' で元から空のセクションのラベルが消える
- 再現: rows `[A(label),3,1,B(label),C(label),2]`、`sortActive:true`、`order=[2,5,1]`、`keepEmptySections:false` → `'section'` は `[A,B,C]`、`'follow'` は **`[A,C]`**。
- 原因: `labelRows.ts:160-161` の `showLabel` は `!filterActive` なら残すが `'follow'`(`:187-193` `flushEmptyBefore`)は `keepEmptySections` だけ見る。
- 方向性: 条件を `(keepEmptySections || !filterActive)` にそろえる。

### L-12(低 / 確実)`title:''` の CSV ヘッダー
- 再現: `[{key:'k1',title:''},{key:'k2'}]` → ヘッダー `",k2"`。
- 原因: `exportCsv.ts:80`/`exportData.ts:41` が `??`(ヘッダー表示・列メニュー・autosize・パネルは `||`)。`SortManagementPanel.tsx:102` も `??`。

### L-13(中 / 確実 / 性能)`numberFormatter` が毎回 Intl.NumberFormat 生成
- 実測: 5,000 回 **110ms** vs キャッシュ済み `format` 1.9ms(1 セル ≒ 22µs)。
- 原因: `valueFormatters.ts:51-56` が毎呼び出し `new Intl.NumberFormat`。`resolvedMax` が値依存のため `(locale,useGrouping,min,max)` キーの小 Map が必要。
- 影響: 可視窓 50×10 なら 1 レンダー ≒ 11ms がスクロール毎フレームに乗る。

### L-14(低 / 確実 / ドキュメント)`GridState` 記述が v1 のまま
- `API_REFERENCE.md:1092`「`{version, columnWidths, filters, sort}`、現行 `1`、列メタは含めない、3 dispatch」。実装は `GRID_STATE_VERSION=2`、`columns?: GridColumnState[]` を get/apply し `gridApi.ts:558` で `onColumnsChange` も呼ぶ。website 複製も同様と思われる。

### L-15(低 / 高・要確認)相対プリセットが日付をまたいで追従しない
- `filtering.ts:893` `resolveNow = now ?? new Date()` はコンパイル時 1 回。`rowPipeline.ts:172-181` の `memoColumnFiltered` 入力に時刻が無いため、`today` を 23:59 に適用して放置すると翌日も前日の範囲。SSRM は queryKey が相対のまま不変で再取得なし。API_REFERENCE は「翌日開くと追従」(再オープン前提)で文言上は矛盾しないが、`filtering.ts:889-890` のコメント「日付が変わった後の再計算で追従」は自動では成立しない。
- 方向性: プリセットを含むときだけ `formatDateKey(now)` を memo 入力 / queryKey に加える。

### L-16(低 / 高・要確認)日付の TZ 解釈が値の型で異なる
- 実測(`TZ=America/Los_Angeles`): `toDateKey('2026-07-01T23:30:00Z')='2026-07-01'`、`toDateKey(new Date('2026-07-01'))='2026-06-30'`、`toDateInputValue(new Date('2026-07-01'))='2026-06-30'`。
- `new Date('YYYY-MM-DD')` は UTC 深夜のため負オフセット TZ で前日になり、同じ日を表す文字列セルとずれる。設計自体は妥当だが API_REFERENCE / JSDoc に前提(Date はローカル日付、ISO 文字列はオフセット無視)の記載が無い。

### L-17(低 / 確実)`migrateGridState({columnWidths:{a:0,b:-50}})` → `{a:0,b:-50}` をそのまま採用。`columnLayout.ts:197`/`geometry.ts:27` は `columnWidths[key] ?? column.width` で潰れる。`> 0`(minWidth 以上)に制限を。

### L-18(低 / 確実)`clearCells.ts:148-151` は `Object.is` 同値判定。number/date 列のクリア値は `null` なので未設定(`undefined`)セルに Delete で `null` が書かれ `changed=true`(API_REFERENCE 278 行「変更が無ければ no-op」とずれる)。`isBlankCellValue` 同士なら no-op が自然。

### L-19(低 / 確実)`selectOptions.ts:26` `'（空白）'`(全角)/ `filterSummary.ts:30`・`grouping.ts:44`・`dateFilterTree.ts:49` `'(空白)'`(半角)。同じ popover 内で表記が違う。

### L-20(低 / 中・要確認)`exportCsv.ts:13-23` は RFC 4180 クォートのみで `=SUM(...)` 等をそのまま出力(OWASP CSV Injection)。無害化するか consumer 委ねかは方針判断、少なくとも文書化を推奨。

### テストのカバー漏れ(所見の裏付け)
- `utils/clipboard.ts` の `parseClipboardText` / `serializeSelectionToTsv` / `applyClipboardMatrixToRows` に core 単体テストなし(`clipboard.copyFallback.test.ts` はコピーのフォールバックのみ、react 結合テストは単一セル貼り付けのみ)→ L-01/L-03/L-04/L-05 が空白。
- `sorting.test.ts`: `null`/`undefined` の位置、非数値混入時の順序一貫性なし(L-07/L-08)。
- `aggregation.test.ts`: 空白のみ文字列 / boolean / Date なし(L-10)。
- `gridState.test.ts`: 未知 kind / `values` 欠損なし(L-09)。
- `labelRows.test.ts`: 'follow' の「元から空のセクション」はフィルター併用のみ(L-11)。
- `exportCsv.test.ts`/`exportData.test.ts`: `title:''` なし(L-12)。
- dateSet 候補収集に `Date` インスタンスを流すテストなし(L-06)。

## 4. 確認したが問題なしだった観点
- フィルター述語の境界: number/text/date の blank・notBlank と空白不参加は `isBlankCellValue`/`coerceNumberFilterCellValue` に一元化、B-2 Float64 key 経路と非 key 経路は source index 基準で一致(ラベル行 / グルーピング order でも破綻なし)。`!=`/`=`/range 両端含む一貫。text 系は大文字小文字無視。全角数字 / 先頭ゼロ / `1e3` / `0x10` は `Number()` 仕様どおり。`toDateKey` は `Date.parse` 非依存で月日範囲検査。
- dateSet プリセット: today / thisMonth(月末 `new Date(y,m+1,0)`)/ last30days(今日含む 30 日)両端含みで正しい。カスタム `resolve` の片側 / 逆転 / Invalid Date、消えた ID → 条件なし、ラベル逆引きフォールバックは実装・テスト一致。
- ソート安定性: タイブレーク `order[a]-order[b]` で全経路安定。B-1 高速経路は「全列有限数値」時のみで数値枝と恒等。Collator はモジュール 1 個。`nextSortEntries` / 管理パネル純関数の不変条件 OK。
- ラベル行 / グルーピング順序: 'section' バケットは安定、'hide' は order そのまま、非活性時 3 モード恒等。グループは初出順 + 型タグ bucket。`flattenGroupTree`、`resolveStickyLabel`、`resolvePasteTargetViewIndexes` 正しい。rowGroup とラベル行の排他はパイプラインで保証。
- 集計 count / 空グループ: `count` は leaf 行数、数値 0 件は `undefined` で API 一致。
- getState/applyState 往復: JSON 往復で `set.mode` 省略 / `custom` 参照共有 / `columns` の `undefined`(v1)と `[]`(v2)区別まで一致。`applyColumnState` の新列末尾 / 削除列 drop / 幅焼き込み / pane 正規化は妥当。
- CSV RFC 4180: 必要時のみクォート、`""` 二重化、CRLF、BOM、未ロード行 / ラベル行差し込み、`isRowIncluded` index 空間すべて正しい。`exportScope` エイリアス OK。
- 貼り付けパーサ既定とエディタ commit / Delete の一貫性: `resolveCellParser` を 3 経路が共有し、number/date/checkbox/select の既定は API_REFERENCE「セルエディタ」表と一致。`parseCommittedValue` の非 string バイパス、`decideCellWrite` の reject スキップも全経路同一。
- history / gridSelectors / excelColumnName / permissions: 不変性・等価性・桁上がり(25→Z, 26→AA, 702→AAA)問題なし。
- 性能(100 万行): 列フィルターは有効数×行数の単一ループ(Int32Array、全通過は同一参照)、グローバルはチャンク化、ソートは decorate + O(n log n)、グルーピング / ラベル行は 1 パス、候補収集は閾値超で時間分割。ホットループ内の文字列結合 / 不要な全走査なし(`inferFilterType` は 20,000 行 / 1,000 サンプル打ち切り)。