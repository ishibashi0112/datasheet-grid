## B. 株価ボード — 実アプリ点検の報告(@ishibashi0112/spreadsheet-grid 1.0.0)

以下 `$S` = `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad`。アプリは `$S/dogfood/B/app`、操作のスクリプトは `$S/dogfood/B/tests/*.cjs`、スクリーンショットとログは `$S/dogfood/B/tests/out/` にあります。サーバー(5402)とブラウザはすべて止めました。

### 1. 作ったもの

- **構成**: create-vite 9.3.4 の react-ts(Vite 8.3.6 / React 19.3.1 / TypeScript 7.0.2)を npm で、`StrictMode` を有効にしています。UI ライブラリは使っていません。`localeText={localeTextEn}` で英語にしました。`tsc -b` は `skipLibCheck: false` でもエラーなしです。本番のビルドは JS が 205.5KB gzip(React を含む)でした。
- **画面**: 2,000 銘柄の株価ボードです。
  - 上のツールバー: フィードの開始 / 停止、更新の方式の切り替え(`rows` を作り直す / `applyRows`)、Top gainers(`applyState` で並べ替え)、Clear sort、Undo / Redo、Find、Export CSV。
  - 右のパネル: アクティブセルの銘柄の詳細(`onActiveCellChange`)。
- **列**: Symbol(左に固定・text)、Company(textSet)、Sector(set)、Exch(select)、Last / High / Low(`numberFormatter` en-US・小数 2 桁)、Chg / Chg %(符号付きの自作フォーマッタ。Chg % は `colorScale` の diverging と numberSet、合計行は avg)、Volume(`dataBar`、合計行は sum)、Mkt Cap(compact 表記、合計行は sum)、Status(`chips`)、Target(number エディタ `min: 0`、`validate` の mark、numberSet)、Memo(編集可・`validationMode: 'reject'`・`flex`・textSet)、Updated(時刻表示・dateSet)。
- **グリッドに渡した主な機能**: `highlightChanges` / `animateRows` / `find` + `onFindChange` / `showFilterChipBar` / `totalRow` / `enableContextMenu` + `getContextMenuItems` / `onUndoRedoStateChange` / `density="compact"`。
- **フィード**: 250ms ごとに 100 行の値を変えます。
  - `rows` を作り直す方式: `setRows(prev => tick(prev))`
  - ハンドルの方式: `ref.current.applyRows(next)`

### 2. 確かめた操作(問題が無かった範囲を含む)

dev と本番(`vite build` + `vite preview`)の両方で確かめました。コンソールの警告・エラーは、全操作を通じて dev(StrictMode)でも本番でも 0 件です。

- **英語の画面の日本語の残り**: CJK と和文の約物(U+3000-303F)を、テキストと全属性(aria-label / title / placeholder / data-ssg-tooltip)について走査しました。どこにも見つかりませんでした。
  - 上部 / 下部のバー、選択範囲の集計、コピー範囲の点線
  - 列メニュー(text / textSet / set / select / number / numberSet / dateSet の各フィルター画面と演算子の一覧)、日付のカレンダー(曜日)、「Pin column」の小メニュー
  - Manage sorting(空のときと 2 段のとき)、Manage filters、ツールパネルの 3 タブ
  - 検索バー(ヒットあり / なし / Searching…)、右クリックメニュー、一致なしの表示、フィルターチップ
  - 合計行(Total / Avg)
  - 検査のメッセージ: 組み込みの「Enter 0 or more」「Enter a number」と、自作の mark / reject
  - 空の値の「(Blank)」(set / numberSet / dateSet の一覧と、グループ行)
- **更新中の強調**:
  - 変わったセルのフラッシュは、並べ替えなし・あり(Chg % 降順 / Symbol 昇順)のどちらでも出ます。
  - カウントアップの途中の値は、4 秒・232 フレームの間すべて `valueFormatter` で整形されていました。
  - colorScale / dataBar / chips も値の変化に追従します。
- **更新中に前日比で並べ替え**(列メニューと `applyState` の両方。2 つの方式・dev / 本番): 何 tick 経っても並びはデータと一致し、逆転は 0 件でした。
- **更新中の列フィルター**(Chg % ≥ 1): 境目をまたいだ行がちゃんと出入りし、件数もデータと一致します。チップには整形した値「≥ +1.00%」が出ます。set の除外(exclude)は、値が変わり続けても保たれ、すぐに効きます。
- **範囲選択とコピー(更新中)**:
  - TSV はコピーした時点のデータと 10 行すべて一致しました。コピー範囲の点線は tick をまたいでも残ります。
  - 集計(Average / Count / Sum)は計算値と一致し、更新に追従します。Ctrl+A(30,000 セル)でも tick ごとに計算し直します。
- **更新中の Memo の編集**:
  - エディタは閉じず、打った文字も消えません。確定で他の行の tick が巻き戻ることもありません(updatedAt で確認)。
  - 並べ替え中に編集している行が動いても、確定は開いた行に入ります(メモに行ごとの初期値を入れて確認)。F2 で開いて Enter 10/10、ダブルクリック 28/28、Tab 8/8、`applyRows` の方式 8/8、本番 16/16。
  - エディタは行に付いて動き、行が端まで来るとグリッドごとスクロールします。
  - 行が動いている最中のダブルクリックでエディタが開かないことが 1 回ありました(行の移動による。不具合とはしません)。
- **検査**:
  - reject: エディタを開いたままメッセージを出します。
  - mark: 赤い三角と、ホバーのツールチップが出ます。
  - `getInvalidCells()` のメッセージも英語です。
- **右クリックメニュー**: 自作の項目が出ます。項目から `applyRows` で値を変えるのも動きます。
- **CSV**: `downloadCsv('quotes.csv', { includeTotalRow: true })` で、BOM・英語の見出し・末尾の「Total」行・計 2,002 行でした。
- **ほかの操作(更新中)**:
  - 列の幅のドラッグ: 220 → 300px になり、`getState().columnWidths` にも入ります。
  - ホイールでのスクロール: 並べ替え中でも scrollTop は 3000 のまま動きません。
  - キー操作: ↓ は 1 回ごとに 26〜82ms で反映され、PageDown は 25 行進みます。
- **4 分ずつの連続稼働(本番・2 つの方式)**:
  - JS のヒープ: rows 方式 6.1 → 8.2MB、applyRows 方式 6.6 → 10.3MB(元に戻すの履歴の分)で、どちらも頭打ちでした。
  - DOM ノード約 2,810、リスナー 950〜1,000 で増えません。
  - tick は 3.95 回 / 秒を維持し、コンソールの出力は 0 件でした。

### 3. 所見

**B-01 中 不具合 — numberSet の値の一覧が数の順に並ばない(小数と負の数で崩れ、(Blank) が途中に入る)**
- 再現: `$S/dogfood/B/app/src/repro/NumberSet.tsx`(`repro-numberset.html`)。値 `[1.2, -0.1, 10, 0.2, -3, 1.01, 0.02, 2, null, 1.1, -2.5, 0, 1]` の列に `filterType: 'numberSet'` を付け、フィルター画面を開きます。
- 期待: -3, -2.5, -0.1, 0, 0.02, 0.2, 1, 1.01, 1.1, 1.2, 2, 10, (Blank)(Excel と同じ数の順)。
- 実際: -0.1, -2.5, -3, (Blank), 0, 0.2, 0.02, 1, 1.01, 1.1, 1.2, 2, 10。
- アプリでも同じでした。Chg % は -0.1, -0.01, -0.02, -0.2 …(負の値が逆順)、Target は 4.07, 6.8, 6.24, 8.06, 8.8。株価のような小数の列では一覧で値を探せません。
- 原因(dist): core の `logic/selectOptions.js` が、候補を文字列のラベルで `Intl.Collator('ja', { numeric: true })` で並べています。
- 回避策: 条件欄か検索欄を使う。
- 証拠: `$S/dogfood/B/tests/out/r01-v.png`、`$S/dogfood/B/tests/r01-numberset.cjs`、`t05-setorder.cjs`。dev / 本番、確実。

**B-02 中 不具合 — `rows` がよく変わる間、セル内検索が「Searching…」を出し続け、最初のヒットへ移動しない**
- 再現: `$S/dogfood/B/app/src/repro/FindLive.tsx`(`repro-find.html`)。2,000 行 × 13 列(numberFormatter)で、250ms ごとに 100 行を変えます。セルを押して Ctrl+F で「target」と打ちます。
- 期待: 止めているとき(`?live=0`)と同じく、件数を出したまま A8(1 件目)へ移動する。
- 実際: 約 3 割の時間「検索中…」になり、アクティブセルは A1 のまま(3 回中 2 回)です。最初の Enter で 2 件目(A58)へ飛び、1 件目を飛ばします。
- アプリの本番では、検索バーの 73%(44/60 サンプル)が「Searching…」で、3 回とも 1 件目へ移動しませんでした。
- 原因(dist): `controllers/findController.js` の `update()` が rows の変化のたびに `y(false)` で検索し直します。このとき打った直後の検索(`y(true)` =ヒットへ移動)が取り消され、毎回 `scanning: true` に戻ります。
- 回避策: 検索中はフィードを止める / 一度 Enter を押す。
- 証拠: `$S/dogfood/B/tests/r02-find.cjs`、`t13-find-detail.cjs`、`t18-find-prod.cjs`。dev / 本番。表示のちらつきは確実です。1 件目へ移動しないのは時機しだいですが、何度も再現しています。

**B-03 中 使いにくさ(ドキュメント)— 外からの更新と「元に戻す」が両立しない**
- `rows` を作り直す方式: tick のたびに履歴が消えます。Memo を直した 1.5 秒後に Ctrl+Z を押しても何もせず、`canUndo` は false です。
- `applyRows` の方式: 価格の tick が 1 つずつ履歴に積まれます。Ctrl+Z は株価を巻き戻し、Memo の修正は 6 手前になります(上限 100 は約 25 秒ぶん)。
- 外からの更新を「履歴を消さず、積みもせず」反映する手段がありません。ドキュメントも、ライブのデータでどちらを使うべきかに触れていません。
- `applyRows` は関数の形(`prev => …`)を受けないので、フィードと一緒に使うには最新の rows を ref で持つ必要があります。この書き方も載っていません。
- 証拠: `$S/dogfood/B/tests/t07-edit-live.cjs`、`t16-undo-apply.cjs`。dev、確実。

**B-04 低 使いにくさ — 並べ替え中のライブ更新で、アクティブセルと選択範囲が「位置」に残り、選んだ銘柄が逃げていく**
- `onActiveCellChange` が tick ごとに別の銘柄で呼ばれます。row 4 のまま、3 秒の間に BD → OVRT → BH → KAEP → VLWT と変わりました。
- 選択範囲の行も ['KAEP', 'OVRT', 'VLWT', 'PAW'] → ['WY', 'KAEP', 'PAW', 'OVRT'] に入れ替わります。
- 編集中だけは行に付いて動くので、挙動が非対称です。
- ドキュメントには書かれた挙動(「表示位置に付く。Excel と同じ」)です。ただ、株価ボードの「選んだ銘柄の詳細を見る」は成り立ちません。
- 証拠: `t06-sort-live.cjs`。dev / 本番、確実。

**B-05 低 不具合(見た目)— 右端の列で、検査のエラーの吹き出しがグリッドの外へはみ出して切れる**
- 再現: Memo(reject)がグリッドの右端にある状態で 70 文字を入れて Enter。
- 実際: `.ssg-cell-editor-error` の右端 1244px が、グリッドの右端 1212px を越えて「Memo must be 60 characters or fe…」で切れます。左へ寄せ直しません。英語のメッセージは長いので目立ちます。
- 証拠: `$S/dogfood/B/tests/out/10-reject.png`、`t28-errchip.cjs`。dev / 本番、確実。

**B-06 低 使いにくさ(性能)— 高頻度の更新では `highlightChanges` の負荷が大きい**
- 本番・20 秒の計測を 2 回(マシンを共有しているので数値は参考)。主スレッドの使用率は次のとおりです。
  - 全部入り: 47% / 43%、長いタスクの最大 217 / 142ms
  - `highlightChanges` だけ外す: 22% / 19%、長いタスク 1 件以下
  - highlightChanges・animateRows・conditionalFormat を全部外す: 8%
- フラッシュとカウントアップの両方が効いています(`--ssg-motion-base: 0` で 25%、`--ssg-motion-slow: 0` で 22%)。
- フラッシュだけにする設定は無く、ドキュメントにも高頻度の更新での注意はありません。
- 証拠: `t22-perf.cjs`、`t24-perf-css.cjs`。

**B-07 低 使いにくさ — ライブの並べ替えで `animateRows` の行がフェードインで透明になり、ちらつく**
- 本番で 5 秒計測したところ、10% のフレームに見えている範囲の透明な行がありました。1 行が最長 18 フレーム(約 0.3 秒)空白になります(`animateRows=false` で 0)。
- 証拠: `$S/dogfood/B/tests/out/06-burst-replace-0.png`(7 行目が空白)、`t27-fade.cjs`。確実。

**B-08 低 使いにくさ — 列フィルター画面を開いている間も候補の一覧が tick ごとに作り直され、ポインタの下の値が入れ替わる**
- ポインタの下の値が 250ms ごとに -0.89 → -0.91 → -0.88 … と変わり、押した値と違う値を外すことがあります。
- 外した状態そのものは保たれます。
- 証拠: `t26-list-shift.cjs`、`t21-interact-live.cjs`。本番、確実。

**B-09 低 ドキュメント — `width` と `flex` を両方書いた列は `width` が無視され、余り幅が無いと 50px に潰れる**
- 再現: `$S/dogfood/B/app/src/repro/FlexWidth.tsx`。120px × 8 列の後に `{ width: 240, flex: 1 }` の列を置き、幅 800px の中に入れると、その列は 50px になります。
- SKILL の「列の width は型の上で必須。伸縮させる列は flex も足します」は、`width` が最小の幅になると読めます。
- 回避策: `minWidth` を付ける。
- 証拠: `$S/dogfood/B/tests/out/r04-flex.png`。確実。

**B-10 低 ドキュメント — 同梱の資料に保守者向けの文と古い数字が残っている**
- API_REFERENCE.md の冒頭に「保守者向け: … `pnpm run docs:jsdoc` … `packages/core/src/…`」があります。
- 末尾の節「ライブラリ化の宿題(現状把握)」が 1.0 の利用者向けの資料に残っています。
- 値フォーマッタの節に内部のファイル名 `logic/valueFormatters.ts` が出ています。
- SKILL.md は API_REFERENCE.md を「約 1,800 行」と書いていますが、実際は 2,585 行です。

**B-11 低 ドキュメント — `selectCell` / `setActiveCell` はフォーカスを移さない**
- `selectCell` は「単一セル選択(クリック相当)」と書かれていますが、キー入力は届きません。ハンドルから選んで打つと、何も入りませんでした。`focus()` を併せて呼ぶ必要があることを書いておくとよいと思います。
- 証拠: `t10-validate.cjs` の 1 回目(target が変わらず null)。確実。

所見にしなかったもの: CSV の合計行の平均が `0.11664499999999976` の生の値になる / 英語でも日付の入力欄の placeholder が yyyy/mm/dd / 件数に区切りが入らない(いずれもドキュメントどおり)。

### 4. ピン留め行

**あり。** 次の 2 つの行を、並べ替えやフィルターに関係なく表の上に固定したい場面がありました。今は、全体の合計を `totalRow`(Total / Avg / sum)で下端に出しているだけです。
- 主要な指数(S&P 500 / Nasdaq / Dow / 米 10 年債)の行。列の幅と横スクロールは本体と揃えたい。
- ウォッチリストに入れた銘柄の行。

指数はグリッドの外に別の小さな表を置くしかありません。その場合、列の幅や横スクロールを揃えるには `onScroll` / `setScrollPosition` で同期させる必要があり、今回のアプリには入れていません。

### 5. 要望

- アクティブセル / 選択範囲を行キーに付けて動かすオプション(B-04)。
- 履歴に触れずに外からの更新を反映する手段。例: `applyRows(next, { history: 'none' })`、または外からの差し替えでも履歴を消さない設定(B-03)。
- `highlightChanges` をフラッシュだけにする / 長さを変えるオプションと、高頻度の更新での注意書き(B-06 / B-07)。
- 検索し直す間は前の件数を出したままにし、「1 件目へ移動」を引き継ぐこと(B-02)。
- フィルター画面を開いている間は候補の一覧を固定すること(B-08)。
- numberSet の一覧を数の順に並べること(B-01)。
