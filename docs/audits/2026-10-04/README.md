# SpreadsheetGrid 全体監査レポート(2026-10-04・v0.41.1 時点・調査のみ、修正なし)

## 1. 進め方と前提

- ベースライン: `tsc -b` 0 / `tsc -p tsconfig.vitest.json` 0 / `eslint .` 0 problems / `vp test` 1,317 tests・155 files 全緑 / `build:lib` 0。リポジトリの追跡ファイルは一切変更していない(`git status --short` 空)。
- 静的レビュー: ソース全文(約 40,000 行)を 6 系統に分けて精読。各系統のレポート(再現手順・行番号つき)は同ディレクトリの `findings-*.md`。
  - `findings-logicA.md` 純ロジック(フィルター / ソート / 集計 / 状態 / エクスポート / クリップボード)20 件
  - `findings-engineB.md` ジオメトリ / reducer / store / engine 12 件
  - `findings-controllersC.md` DOM コントローラ(ライフサイクル / ドラッグ / SSRM / popover)12 件
  - `findings-reactD.md` React シェル / エディタ / hooks 12 件
  - `findings-viewE.md` view コンポーネント / CSS / a11y 16 件
  - `findings-packagingF.md` パッケージング / 型配布 / ドキュメント整合 7 件
- 実機検証: Chromium(Playwright)上で、ライブラリのソースを直接 import するハーネス(`audit/harness/`)を組み、13 シナリオ・約 250 チェックを自動実行。1,000,000 行 / SSRM モック / StrictMode / mount-unmount 繰り返し / 2 グリッド共存 / 空データ / 各エディタ / 各フィルター種別 / 列操作 / 行選択 / コンテキストメニュー / 状態往復 / エクスポート / グルーピング / 展開行 / ラベル行 / 行ドラッグ / auto-height を網羅した。静的所見のうち高・中は実機で追試し、再現したものに ✅ を付けた。
- パッケージ実消費: `pnpm pack` した 2 パッケージを別プロジェクトへ install し、ESM / CJS import・`renderToString`(SSR)・Vite 本番ビルド・`tsc`(bundler / node16 / nodenext)を実測。

合計 **79 件 + 本調査固有 6 件**。重複(同じ原因を複数系統が指摘)は統合して以下に並べる。ID は各レポートの ID をそのまま使う(M-xx は本レポート固有)。

## 2. 最優先(高)— データ破壊・機能停止・配布不良

| ID | 実機 | 要約 | 場所 |
| --- | --- | --- | --- |
| RD-1 | ✅ | **編集中に行順 / 列構成が変わると、確定値が別の行に書き込まれる。** `editingCell` が view index だけで rowKey を持たず、確定時に再解決するため。再現: qty 昇順ソート中に id=2 の行(view 3)を編集 → 編集中に rows を差し替えて並びが変わる → Enter → **id=42 の行に書き込まれた**。ポーリング / サーバープッシュで rows を更新するアプリ、SSRM の refresh で起きる。 | `core/controllers/editController.ts:123-162`, `SpreadsheetGrid.tsx:1797-1850` |
| RD-2 / C-2 | ✅ | **エディタ内の Ctrl+V をグリッドが横取りする。** input へ貼り付かず、代わりにセル範囲貼り付けとして `onRowsChange` が走る(キー側には `editingCell` ガードがあるが paste だけ無い)。再現: 名前セルを編集 → Ctrl+V → input は旧値のまま、行データは即 `PASTED` に変化。`renderCell` / `renderHeader` 内の利用側 input でも同様。 | `core/controllers/clipboardController.ts:153-184`, `SpreadsheetGrid.tsx:3850` |
| C-1 | ✅ | **SSRM が React StrictMode で永久に空になる**(`initialRowCount` 未指定時)。初回 block 0 の fetch が effect 二重実行の dispose で abort され、再 update では `prevQueryKey` 一致で再発行されない。Vite 既定の開発環境では「データが一切出ない」。デモは `initialRowCount` を渡しているため未顕在。 | `core/controllers/serverSideRowModel.ts:325-345, 384-389`, `react/hooks/useController.ts:37-41` |
| L-01 | ✅ | **貼り付けの列あふれ(`createOverflowColumn`)で consumer の `columns` が壊れる。** `onColumnsChange` に渡すのが「視覚順の可視列 + 合成列」のため、非表示列が消え、固定列順に並び替わり、`__ssg_*` 合成列が混入し得る。再現: `visible:false` の列 `secret` が貼り付け後に消失。 | `core/controllers/clipboardController.ts:255,272-281`, `SpreadsheetGrid.tsx:2133` |
| P-1 | 実測 | **配布 d.ts の相対 import に拡張子が無く、`moduleResolution: node16 / nodenext` の利用側で公開型が全部 `any` に潰れる**(react dist 61 箇所 / core dist 158 箇所。`"type": "module"` 配下)。`skipLibCheck: true`(TS 6 の `tsc --init` 既定)だと無言で any 化し、`rowKeyGetter={(row) => row.id}` が TS7006 になる。リポジトリ内は全て bundler 解決のため未検出。 | `packages/*/tsconfig.lib.json`, `packages/*/dist/**/*.d.ts` |
| M-01 | ✅ | **右寄せセルがあふれると上位桁が隠れる。** `.ssg-body-cell` が `display:flex; overflow:hidden` + `justify-content:flex-end` のため左側(先頭)がクリップされる。再現: 幅 70px の数量列で `123,456,789` → 表示 `56,789`、単価 `9876543.21` → `543.21`。グループ行の avg(`418.13919999999996`)も `99999996` と読める。数値グリッドとして誤読リスクが高い。 | `react/src/styles.css:344-381` |
| B-01 | ✅(部分) | **auto-height + 展開行帯(またはラベル行高)でアンカー補正がずれる。** 計測 flush 時の補正が未装飾 `rowHeightStore.prefix` を読むため、帯の 200px 分だけ scrollTop が上へ飛ぶ。単体テストで scrollTop 350 → 150 を再現。実機でも帯あり時だけ、列幅変更後の先頭行が 15 → 11 へずれた(帯なしは 26 → 26 で不変)。 | `core/controllers/autoHeightMeasurer.ts:126-136`, `core/engine/verticalLayout.ts:263-270` |

## 3. 中 — 誤動作・契約違反・操作不能

### 編集 / クリップボード / 状態
| ID | 実機 | 要約 | 場所 |
| --- | --- | --- | --- |
| RD-3 | ✅ | 編集中に編集行が消える(rows 差し替え / 行数減 / 列消失)とエディタ DOM だけ消え `editingCell` が残る → 矢印 / Enter / Escape / 印字キーが全滅。復帰はセルのダブルクリックのみ。 | `SpreadsheetGrid.tsx:1801-1850`, `core/controllers/keyboardController.ts:139-141` |
| RD-4 | 単体 | `canEditCell(rowIndex, …)` の `rowIndex` が経路で違う空間(表示 / 編集開始 / SSRM = view index、clientSide の貼り付け / Delete = source index)。ソート中に同じセルで 0 と 2 が渡る。API_REFERENCE は空間を未規定。 | `SpreadsheetGrid.tsx:2097-2104, 2178-2184`, `clipboardController.ts:295-296` |
| RD-5 / M-03 | ✅ | `columns` prop の参照が変わるたび `resetColumnWidths` で列幅 state が**全列**の `width` で置き換わる。結果 (a) インライン `columns={[...]}` の利用側では編集のたびに手動リサイズ幅が消える、(b) `getState().columnWidths` は mount 直後から**全非 flex 列**の幅を含み(実測 10 列分)、API_REFERENCE「手動リサイズした列のみ」と矛盾、保存 state が全列幅を焼き込む(以後コードで `width` を変えても保存ユーザーに効かない)。`applyState(getState())` も冪等でない。 | `SpreadsheetGrid.tsx:926-940`, `core/model/gridReducer.ts`(`columnWidths/reset`) |
| RD-6 | 単体 | `readOnly` が編集を完全には止めない: 編集中に `readOnly=true` へ切り替わっても Enter / blur で書き込まれる、`renderCell` の `setValue` は readOnly / canEditCell を見ない。 | `core/controllers/editController.ts:102-169`, `SpreadsheetGrid.tsx:3231-3259` |
| L-03 | 単体 | TSV パースが空行を全部落とすため、1 列コピーに空セルがあると貼り付け行がずれる(データ破壊)。 | `core/utils/clipboard.ts:16-25` |
| L-04 | 単体 | TSV の引用符(Excel のセル内改行 / タブ / `"`)を解釈せず、コピー側も引用しない → 改行入りセルが複数行に割れる。 | `core/utils/clipboard.ts:16-25, 55-80` |
| L-05 | 単体 | ソート中に view 末尾を超える貼り付けは行を追記せず静かに捨てる(恒等 order では `createRow` で追記)。 | `core/controllers/clipboardController.ts:255-262` |
| L-09 | 単体 | `applyState` に未知 `kind` の列フィルターが入ると `undefined` を格納し、次の `getState` / `onStateChange` で TypeError(将来版の保存 state を旧版が読むケース)。`{kind:'set'}` で `values` 欠損は migrate 内で throw。 | `core/logic/gridState.ts:31-73, 184-191` |
| L-02 | 単体 | 非表示列(`visible:false`)の列フィルター / ソートは「適用中」と表示されるが絞り込み / 並べ替えに効かない(パイプラインが `visibleColumns` を渡す)。 | `core/engine/rowPipeline.ts:180,184` |

### SSRM
| ID | 実機 | 要約 | 場所 |
| --- | --- | --- | --- |
| M-02 | ✅ | SSRM のトップ / ボトムバーが **`Rows: 10000 / 0`** と分母 0 を表示する(`rows.length` を分母にしているため)。 | `react/src/view/gridBarHelpers.ts:88-93`, `react/hooks/useGridBarContext.ts:97` |
| B-04 / V-01 | ✅ | 未ロード行(スケルトン)の React key = viewIndex がロード済み行の数値 rowKey と衝突し、`Encountered two children with the same key` 警告 + 毎レンダー再マウント。1 始まり id を `rowKeyGetter` で返す一般的な構成で常時発生。 | `core/controllers/serverSideRowModel.ts:106-109`, `react/view/GridBodyLayer.tsx:1008-1011, 1090` |
| B-03 | 単体 | 末端の部分ブロックがキャッシュ済みのまま `totalRowCount` が増えると `hasBlock` で再取得がスキップされ、後半行が LRU 退避 / refresh まで永遠にスケルトン(API_REFERENCE 1179「件数増減に追従」と矛盾)。 | `core/controllers/serverSideRowModel.ts:168-199`, `core/logic/serverSideCache.ts:77-100` |
| C-7 | 単体(要判断) | 失敗ブロックを `fetchBlock` が見ないため、可視窓が 1 行動くたびに再要求して `onServerSideLoadError` が毎回発火(トースト連打)。 | `core/controllers/serverSideRowModel.ts:168-174, 213-226` |
| RD-8 | コード | serverSide では `rows.length === 0` 判定のため `noMatchingRowsText` が出ず常に `noRowsText`。`rows` + `dataSource` 併用時に clientSide パイプラインが rows に対して空走。 | `SpreadsheetGrid.tsx:4458-4460, 1022-1033` |

### UI / フォーカス / a11y
| ID | 実機 | 要約 | 場所 |
| --- | --- | --- | --- |
| C-3 | ✅ | 列メニュー / フィルター popover / コンテキストメニュー / ツールパネルを**外側クリックで閉じると、クリック先の input からフォーカスを奪い返す**(`restoreGridFocus` が close 理由を区別せず rAF で grid root を focus)。ページ内の別フォームに入力できない。 | `core/controllers/popoverSupport.ts:23-29` ほか |
| V-02 / V-03 | ✅ | フィルター popover の「適用 / クリア / 閉じる」、条件クリア、プリセットチップ、日付ツリー開閉、日付フィールドの全ボタンが **pointerdown 専用で click / Enter / Space に反応しない**。再現: 「適用」ボタンにフォーカスして Enter → 何も起きない。キーボード・支援技術で操作不能。 | `react/view/ColumnFilterPopover.tsx:1586-1647 ほか`, `react/view/FilterDateField.tsx:161-166` |
| C-5 | ✅ | `Tab` / `Shift+Tab` が常に `preventDefault` + 端でクランプ → **キーボードだけではグリッド外へフォーカスを移せない**(WCAG 2.1.2 キーボードトラップ)。 | `core/controllers/keyboardController.ts:197-201` |
| V-05 / RD-10 | コード | ARIA 構造欠落: role=grid/row/gridcell/columnheader/aria-sort/aria-rowindex が無い一方、ラベル行だけ孤立 `role="row"`(aria-required-parent 違反)。行選択 / コーナーの `role="checkbox"` にアクセシブル名・tabIndex 無し。 | `react/view/GridBodyLabelRow.tsx:106`, `react/view/GridStickyLabelLayer.tsx:227`, `CheckboxCell.tsx:24-27` |
| C-4 | 単体 | フィルター popover を開いたまま横スクロールしてアンカーヘッダーが仮想化で unmount すると (8,8) へ飛ぶ(列メニューは `isConnected` で閉じるが popover は未対応)。 | `core/controllers/filterPopoverController.ts:154-181, 215-220` |
| V-04 | 単体 | scrollHint カスタムスクロールバーに `onPointerCancel` / `onLostPointerCapture` が無く、pointercancel 後にドラッグ状態が固着し、以後のホバーで scrollTop が書き換わる。 | `react/view/GridScrollHint.tsx:288-318, 409-413` |
| B-02 | ✅ | 列チューザーの「全解除」(マスタートグル)で `orderedColumns[0]` が合成列(展開トグル / 行ドラッグ / 自動グループ列)だと **consumer 列が 0 本**になる(「最後の 1 列は残す」契約の破れ)。再現: 展開行あり → 全表示 → 全解除 → ヘッダーに `__ssg_detail_toggle__` だけ残る。 | `core/engine/columnCommands.ts:258-281` |

### ロジック
| ID | 実機 | 要約 | 場所 |
| --- | --- | --- | --- |
| L-06 | 単体 | `dateSet` 列のセル値が `Date` インスタンスだと候補が `String(Date)` になり、年月日ツリーに出ず選んでも一致しない(`filterType:'auto'` は Date を dateSet と判定するので自動的にこの状態)。 | `core/logic/selectOptions.ts:24` |
| L-07 | ✅ | 数値ソートで `null` / `''` は 0 として並び、`undefined` は先頭(asc)— 空値の位置が型で変わる。実機: qty 昇順で空値が先頭。 | `core/logic/sorting.ts:27-37, 221-233` |
| L-08 | 単体 | 比較関数がペア単位で数値 / 文字列を切り替えるため非推移(1.25 < 1.5 < '1.5x' < 1.25)→ 非数値 1 件の混入で列全体の順序が不定。 | `core/logic/sorting.ts:27-37, 268-282` |
| L-13 | 単体 | `numberFormatter` が呼び出しごとに `new Intl.NumberFormat`(5,000 回 110ms vs キャッシュ 1.9ms)。可視セルごと毎レンダー。 | `core/logic/valueFormatters.ts:51-56` |
| L-10 | 単体 | 組み込み集計が空白のみ文字列 `' '` / boolean / 配列 / Date を 0 や数値として算入。 | `core/logic/aggregation.ts:60-63` |
| P-2 | 実測 | CJS 利用側(node16・`.cts`)で TS1479(masquerading-as-ESM): `require` 条件に `index.d.cts` が無い。 | `packages/*/package.json` exports |
| P-3 | 実測 | README 推奨の `import '@ishibashi0112/spreadsheet-grid/style.css'` が TS 6 の strict(`noUncheckedSideEffectImports`)で TS2882(`./style.css` exports に `types` 条件 + 空 d.ts が無い)。 | `packages/react/package.json` exports |
| P-4 / L-14 | 確認 | API_REFERENCE / website の `GridState` 記述が v1 のまま(「version 現行 1」「列メタは含めない」「3 dispatch」)。実装は v2 で `columns` を get / apply し `onColumnsChange` も呼ぶ。`GridColumnState` は export されるが API_REFERENCE 未登場。利用者が「列順は保存されない」前提で applyState すると列順が巻き戻る。 | `API_REFERENCE.md:1089-1092`, `core/logic/gridState.ts:26`, `core/engine/gridApi.ts:552-562` |

## 4. 低 — 軽微な誤動作・ドキュメント不整合・性能

| ID | 要約 |
| --- | --- |
| M-04 ✅ | **開発モード(React dev build)では 100 万行のソート / フィルター変更 1 回に 40〜55 秒かかる**(本番ビルドは 0.36〜0.68 秒、ソート解除 9ms)。プロファイルの自己時間はほぼ `react-dom_client` の `addValueToProperties` / `addObjectDiffToProperties`(React 19.2+ dev の Performance Track 向け props 差分収集)で、巨大配列 / TypedArray を含む prop が子コンポーネントへ渡され、順序が変わるたびに全要素が走査される。CLAUDE.md の「性能検証は本番のみ」規約と整合はするが、デモ app(dev)で 1M 行を触ると体感不能になる。巨大構造は prop ではなく参照ホルダー経由で渡す等で回避可。 |
| M-05 ✅ | auto-height モードの `scrollToBottom()` が 1 回目は末尾に届かない(実測 1,184px 不足。計測後に総高が伸びるため)。2 回目で到達。`scrollToRow(last, 'end')` も同様の経路。 |
| M-06 ✅ | API_REFERENCE の `enableSorting`「ヘッダークリックでのソート」は現状と不一致(ヘッダークリックは**列範囲選択**。ソートは列メニュー / 管理パネル)。 |
| M-07 ✅ | `editable` 未指定の列は**既定で編集可**(`editable === false` / `readOnly` のみ不可)だが、API_REFERENCE の `editable` 行(既定 `—`「編集を許可」)と README の全サンプル(`editable: true` を明示)からは opt-in に読める。既定の明記を推奨。 |
| B-05 ✅ | `selectCell` / `setActiveCell` / `selectRange` が範囲外 index をクランプしない(`selectCell(999,999)` → `getActiveCell() = {999,999}`)。API_REFERENCE 844「範囲外 index は内部でクランプ / 無視」と不一致。rows 減少時も `getActiveCell` / `getSelection` が範囲外のまま残る(表示側で隠すのみ。操作は throw しない)。 |
| B-06 | 列リセットの初期スナップショットが最初の `update` で固定 → columns を非同期で流し込む(初回 `[]`)消費側では「列のリセット」が恒久 no-op。 |
| B-07 | `visible:false` の左固定列が 1 本あるだけで合成列が `pinned:'left'` になり、合成列だけの左ペインが出る。 |
| B-08 | 展開行の MAX_BODY_PX ゲートで帯が抑止されても `detail.expanded` / `getExpandedDetailRowKeys` は true のまま(約 41.7 万行超)。 |
| B-09 | flex 配分幅が非整数のまま `columnWidths` / pin 書き戻し後の `column.width` に乗る → 1px 横スクロールバー誤発生の可能性。 |
| B-10 | clientSide で `rows` 参照が変わる(1 セル編集)たびに列フィルター / 数値キー前計算 / ソートが全行再実行(1M 行で編集 1 回 = O(n log n))。 |
| B-11 | reducer の 6 action が同値でも新 state を返す(余分な再レンダーのみ)。 |
| B-12 | `column/resizeStart` の `minWidth: action.minWidth \|\| 60` で `minWidth: 0` 明示列の手動リサイズ下限が 60。 |
| C-6 | `autoSizeColumns:'onMount'` が StrictMode で効かない(複数チャンク計測が dispose で中断)。 |
| C-8 / C-9 | 列ヘッダー D&D に Escape / window blur 中断が無い(行 D&D にはある)。列 / 行 D&D のマルチポインタ再入で旧 rAF が二重に回る。 |
| C-10 | ツールチップの 350ms 遅延中に対象が DOM から外れると 0 矩形基準で左上に表示され残留。 |
| C-11 | StrictMode 再入耐性: `globalFilteredOrder` / `selectOptionsCollector` / `autoHeightMeasurer` は dispose 後の同一 args update で再開しない(実害限定)。 |
| C-12 | clientSide 貼り付け後の選択 endCol が `matrix[0].length` 基準(不揃い行列で選択が狭い)。 |
| RD-7 | CellEditorLayer のセッション再マウントが rect の null→非 null しか見ないため、別セルへ直接遷移すると前セルのドラフトが残る(custom エディタ中の別セル dblclick 等)。 |
| RD-9 | 印字キーで select エディタを開くとその 1 文字がタイプアヘッドに使われず捨てられる(doc「印字キーはその 1 文字を初期値に」と不一致)。 |
| RD-11 | `setActiveCell` / `selectCell` の `scrollIntoView` 指定に関わらず中央ペインのアクティブセルは常に可視化スクロールされる。 |
| RD-12 | 公開バレルに `onUndoRedoStateChange` の引数型 `UndoRedoState` だけ未公開。 |
| L-11 | ラベル行 `sortMode:'follow'` + ソートのみで、元から空のセクションのラベルが消える(`'section'` は残る)。 |
| L-12 | CSV / `getExportData` のヘッダーが `title:''` で key にフォールバックしない(他 UI は `||`)。 |
| L-15 | 相対日付プリセット(今日 等)の解決基準が memo 入力に無く、日付をまたいで開きっぱなしだと他入力が変わるまで前日の範囲のまま。 |
| L-16 | 日付の TZ 解釈が値の型で異なる(`Date` はローカル、ISO 文字列は文字部分)。負オフセット TZ で `new Date('2026-07-01')` が前日になる。文書化推奨。 |
| L-17 / L-18 / L-19 | `migrateGridState` が幅 0 / 負値を採用 / number・date 列の `undefined` セル Delete が `null` へ「変更あり」になる / 空白候補ラベルの全角・半角不統一。 |
| L-20 | CSV エクスポートが `=`/`+`/`-`/`@` 始まりを無害化しない(CSV インジェクション。方針判断)。 |
| V-06〜V-16 | `toDateKey` が 2026-02-30 を受理 / チェック行の `(0,3,0)` セレクタが invalid 背景と利用側上書きを透明化(API_REFERENCE 1304 の契約逸脱)/ `.ssg-label-row { contain }` が後勝ちで無効 / ⋮ ボタンに :focus-within 表示なし / macOS オーバーレイバー環境の右端 18px がトラック帯扱い / scrollHint の行番号がラベル行で行ヘッダー番号とズレ / ステータスバーの A1 ラベルが合成列込み / `GridDetailLayer` の二重減算(休眠)/ aria 系欠落 / 「列のリセット」だけ slots.menuItem 非適用 / `renderHeader` 内ボタン押下で列範囲選択も走る。詳細は `findings-viewE.md`。 |
| P-5 / P-6 / P-7 | website 複製の 1 行遅れ(`Ctrl/Cmd+C` 行の `isRowExportable` 注記)/ ci.yml コメントが削除済み `devEngines` を参照・デモ app と website の build を CI 未実行 / `exports` に `./package.json` が無い。 |
| M-08(仕様確認) | `readOnly=true` でも行ドラッグハンドルが出て並べ替えできる(`onRowsChange` が走る)。意図なら API_REFERENCE に明記を。 |

## 5. 実機で問題なしを確認した範囲

- **仮想化(100 万行)**: `scrollToBottom` / `scrollToTop` / `scrollToRow` の 4 align / 手動最大スクロール / 中間位置での行 index と内容の整合 / 描画窓の欠落なし / ホイール連打の単調性。scrollHint のルーラー描画。
- **本番ビルドの性能(1M 行)**: 数値ソート 0.36 秒、文字列ソート 0.40 秒、2 列ソート 0.68 秒、set / text 列フィルター 2〜15ms(同期)、グローバルフィルター 1.4 秒(時間分割)、Ctrl+A 全選択 0.1 秒、`exportCsv` 1.9 秒(103MB)。
- **SSRM**: ブロック取得範囲(`endIndex <= total`)、スクロール連打時の abort と到着順、ソート / グローバルフィルターのクエリ送出と debounce、クエリ変更時の先頭リセット、`getRows` 失敗 → エラーバー → 再試行 → 回復、`updateRows` の楽観更新・失敗ロールバック・保存失敗バー・`onServerSideWriteError`、同一行の連続編集で最新値維持、`refreshServerSide` の反映とスクロール位置維持、件数減少時のクランプ、複数行ペーストの 1 回集約、undo 無効 / `getInvalidCells` 空 + warn / `scope:'raw'` のフォールバック warn。
- **編集**: text / number / select / date / checkbox / custom の確定・キャンセル・blur・Tab・`editorEnterMove`、reject の確定拒否 + エラーバブル + blur キャンセル、mark の invalid 表示と `showValidationMarks`、IME 変換中 Enter のガード(グリッド / フィルター入力)。
- **クリップボード / 履歴**: 2×2 コピー(生値)、複数行ペースト、CRLF + 末尾改行、reject セルのスキップ、`createRow` / `createOverflowColumn` の拡張、Delete クリア(number→null)、readOnly の no-op、undo 20 段の完全復元と redo、Ctrl+Z / Ctrl+Shift+Z、外部差し替えでの履歴破棄。
- **列操作 / UI**: メニューソート(昇降・解除)、text / set(include・exclude)/ numberSet / dateSet / auto の popover、チップバーの「すべてクリア」、0 件オーバーレイ、リサイズドラッグ(`onStateChange` は確定時 1 回)、境界ダブルクリック autoSize、列 D&D、ピン切替、列チューザー(非表示列の一覧と再表示)、列のリセット。
- **行選択**: ガタークリック / Shift / トグル、コーナー tri-state、exclude モードの件数、single モード、フィルター中の全選択と件数 / キーの一貫性。コンテキストメニュー(開閉・`onSelect`・選択不変)。
- **状態 / エクスポート**: フィルター + ソートの往復、壊れた入力への耐性(throw なし)、CSV の RFC 4180 クォート / TSV / BOM / `isRowExportable` / 非表示列除外、`getExportData` の shape。
- **ライフサイクル**: StrictMode で編集 1 回 = `onRowsChange` 1 回、mount/unmount 3 サイクル後に window / document リスナーと rAF がベースラインへ戻る、2 グリッド共存(キーボード分離・ツールチップ共有)、`height:'100%'` が親 400px に収まる・`maxHeight` 併用・数値 height、theme dark / auto(prefers-color-scheme 追従)・density compact の寸法、0 行 / 0 列 / 全列非表示 / 全列 pinned / 重複 rowKey / rows 減少で throw なし。
- **機能群**: グルーピング(2 階層・集計 sum/avg 値・開閉 API・leaf 編集可 / グループ行不可・セクション内ソート・件数は leaf のみ・labelRow / rowDrag との排他警告)、展開行(開閉・帯の高さ・カード内イベント境界・sticky・`isExpandable`・ソート追従・フィルター中のキー保持・↓ / 貼り付けの帯またぎ)、ラベル行(件数除外・↑↓ 読み飛ばし・貼り付け読み飛ばし・セクション内ソート・sticky 見出し・`includeLabelRows` / `rowKinds`・フィルターで空セクション非表示・コピー除外・ハンドルはデータ行のみ)、行ドラッグ(ドロップ・`onRowMove` 順序・undo・Escape キャンセル・`moveRow` と no-op・ソート中の無効化・autoscroll)、auto-height(可変行高・3 ペイン一致・末尾到達・`scrollToRow` 精度・上方向ホイールの単調性・編集 / 列幅変更の再計測・autoSize 除外・50,000 行超の uniform フォールバック)。
- **パッケージ**: `pnpm pack` の publishConfig 差し替えと `workspace:^` 変換、react dist が参照する core サブパス 61 個の存在、Node での ESM / CJS import、`renderToString` 5 構成で例外なし、Vite 本番ビルド、`style.layer.css` の設計意図(`@import … layer(ssg-base)` 1 行)、既定値の doc 照合、`docs:jsdoc:check` 同期。

## 6. 推奨する着手順(参考)

1. データ破壊系: RD-1(編集中の行差し替え)、RD-2 / C-2(エディタ内ペースト)、L-01(列あふれ)、L-03 / L-04 / L-05(TSV)。
2. 機能停止 / 配布: C-1(SSRM StrictMode)、P-1(d.ts 拡張子)、P-2 / P-3。
3. 表示 / 操作: M-01(右寄せの上位桁クリップ)、M-02(SSRM 分母 0)、B-04(skeleton key)、C-3(フォーカス奪取)、V-02 / V-03(pointerdown 専用ボタン)、C-5(Tab トラップ)、B-02(全解除)。
4. 契約 / ドキュメント: RD-5 / M-03(列幅 state)、P-4 / L-14(GridState v2)、M-06 / M-07、B-05、L-02、L-09。
5. 残りの低優先と a11y(V-05 / RD-10)は計画的に。

## 7. 再現環境

- ハーネス: `audit/harness/`(使い方は同ディレクトリの README)(`main.tsx` = シナリオ定義、`pw.mjs` = Playwright 共通部、`t-*.mjs` = シナリオ別テスト、`perf-*.mjs` = 性能計測、`explore*.mjs` = 個別追試)。起動は `node_modules/.bin/vp dev --config vite.config.ts`(port 5177)、本番計測は `vp build … --outDir dist-prod` + `vp preview`(port 5178)。
- 実測ログ / スクリーンショットは監査セッション内にのみ残した(リポジトリには取り込んでいない)。