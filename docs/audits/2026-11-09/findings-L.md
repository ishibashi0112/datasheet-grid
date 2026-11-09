# L. 現場点検(モバイル・タッチ・アクセシビリティ / React 18.3)の報告

注: リポジトリの直下に、追跡されていないファイル `/home/user/datasheet-grid/dev.pid` があります。中身は PID 14362 で、そのプロセスはもう動いていません。書かれたのは 05:26:38 ですが、私のコマンドの記録にはこの時刻に書いたものがありません。他の担当が書いた可能性があるので消していません。私が 05:06 に書いてしまった dev.pid は、その場で消しました。

## 1. 作ったもの

- **構成**: Vite 7.3.7 + **React 18.3.1** + react-dom 18.3.1 + TypeScript 7.0.2(@types/react 18.3)、npm。
  - `@ishibashi0112/spreadsheet-grid` 1.0.0(core 1.0.0、@tanstack/virtual-core 3.19.11)。UI ライブラリは使わず、日本語の既定の文言のまま。StrictMode あり。axe-core 4.14。
  - 場所: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L`。ポート 5412。
- **画面 1「点検項目」** `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/src/App.tsx`。640 行(10 階 × 8 室 × 8 項目)。
  - 列:
    - 場所: 左に固定、編集不可、set フィルター
    - 項目: textSet
    - 結果: select エディタ + `conditionalFormat` の chips、set フィルター
    - 測定値: number(min 0)、`numberFormatter`、numberSet
    - 単位: readOnly
    - メモ: text の `multiline`。`validate`「不良ならメモ必須」
    - 写真: checkbox。`validate`「不良なら写真必須」
    - 点検日: date エディタ、dateSet
    - 点検者: set フィルター
  - グリッドの機能: `find`、`showFilterChipBar`、`onColumnsChange`、`enableContextMenu` + `getContextMenuItems`(メモをクリア / この行を削除)、`onActiveCellChange`(フッターに今のセルを表示)、`onUndoRedoStateChange`。
  - グリッドの上のフォーム:
    - 点検者の入力欄
    - 「行を追加」: `flushSync(() => applyRows)` → `getViewRowIndex` / `getColIndex` → `startEditing`
    - 「不良のみ」: `applyState`
    - 「絞り込み解除」
    - 「元に戻す」: `undo()`
    - 「送信」: `getInvalidCells` → `getRowNumber` → `selectCell` + `focus`
- **画面 2「日常点検表」** `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/src/DailySheet.tsx`。6 フロア × 8 設備 × 30 日。
  - 列:
    - 設備: 左に固定
    - 日の列 56px × 30: select(○△×)+ chips、`renderHeader`(日 + 曜日、土日は赤)、`aggFunc`(× の数)
    - 異常: 右に固定、`getValue` + `aggFunc: 'sum'`
  - 機能: 階の見出しを `labelRow`(sticky、型ガード)、`totalRow`、「今日へ」ボタン。
- **最小再現**: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/min.html` + `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/src/min.tsx`。
  - 中身: 4 列、validate、set フィルター、左に固定、右クリックメニュー、50 行。
  - 確かめるスクリプト: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/30-min-repro.cjs`(dev と本番の両方で実行)。
- 操作のスクリプトはすべて `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/` に、スクショは `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/` にあります(deviceScaleFactor 1)。

## 2. 確かめた操作(問題が無かった範囲を含む)

**スマホ(iPhone 13 相当 390×664、hasTouch / isMobile、CDP の Input.dispatchTouchEvent)・タブレット(iPad 第 7 世代 810×1080)**:
- 指での縦・横スクロールでは範囲選択にならない。タップで 1 セルを選び、ダブルタップで編集が始まる(select / number / multiline / date)。
- 選択肢のタップで確定する。
- checkbox はタップで切り替わり、セルの余白のタップでは切り替わらない。
- 2 つのセルを素早く続けてタップしても編集は始まらない。長押しでも変な動きは無い。
- 編集中に指でスクロールしても、エディタはセルに付いてくる。
- 縦横の回転で、スクロール位置とアクティブセルが保たれる。
- 行番号のタップで行、見出しのタップで列が選ばれる。列の幅は指のドラッグで変えられる。
- 列メニューは画面内に収まり「閉じる」がある。set フィルターはすぐ効き、チップバーが出る。
- 横向き(664×390)でも、列メニュー(中でスクロール)と列フィルター(上 8〜下 382px)は画面に収まる。
- ツールパネルの「列」タブで列を隠すと、`aria-colcount` と `aria-colindex` が詰め直される。
- iPad は縦横とも問題なし。
- 日常点検表: ラベル行の sticky、合計行、右に固定した列は崩れない。
- 320px 幅でもページの横スクロールは出ない(scrollWidth 320)。
- ダブルタップで編集が始まるのは 8/8 回(CPU 1 倍・4 倍の両方)。

**キーボードだけ**:
- Tab の順はフォーム → 上部バーのチップ → グローバルフィルター → グリッド。アクティブセルが無い間はグリッドの外枠にフォーカスの輪が出る。最初の矢印で先頭のセルへ行く。
- 矢印 / Home / End / Ctrl+Home / Ctrl+End / Ctrl+矢印 / PageUp / PageDown が動く。
- Alt+↓ で列メニューが開き、先頭の項目にフォーカスが来る。Esc でグリッドへ戻る。最終列の Tab でグリッドの外へ、Shift+Tab で戻る。
- 列の固定もキーボードならできる(Enter で小メニュー → ↓ → Space)。
- セル内検索:
  - Ctrl+F で入力欄にフォーカスが来る。
  - Enter / Shift+Enter でヒットへ移動し、件数は aria-live で読まれる。
  - Esc で閉じると、ヒットしたセルを選んだままグリッドへフォーカスが戻る。
  - 検索バーの axe は違反 0。

**aria**:
- 縦スクロール・フィルター・ソートの後も `aria-rowcount` / `aria-rowindex` / `aria-colindex` は正しい。見出しの `aria-sort` も正しい。
- 日常点検表の列の仮想化でも colindex は 1〜33 で正しい。ラベル行にも rowindex があり、sticky の複製は aria-hidden の層にある。合計行は rowcount(56)に数えられている。
- 主なボタンの名前: ⋮ は「X 列メニュー」、検索バーのボタンにも名前がある。

**axe-core**: 初期表示、アクティブセル、列メニュー、各フィルター(set / numberSet / dateSet / textSet)、並べ替え・列のパネル、エディタ 5 種、検査 NG のツールチップ、検索バー、チップバー、スマホの初期表示で検査しました。結果は `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/axe-run.log` にあり、違反は所見 L-06 と L-08 に分けて書きました。

**prefers-reduced-motion**:
- `.ssg-motion-off` が付き、動きのトークンは 0s になる。ポータルにも効く。コピー範囲の点線は止まる。
- 実行中に設定を変えても追従する。

**forcedColors 'active'**: フォーカスの輪、アクティブセル、範囲の枠、checkbox、メニューのフォーカスは見える。崩れるものは L-14 に書きました。

**React 18.3 + StrictMode**:
- コンソールの警告・エラーは 0(dev / 本番とも。React DevTools の案内だけ)。
- 18 でも ref は型も実行時も問題なし。
- ハンドルの流れが動く: `applyRows` + `flushSync` + `startEditing`、`undo` と元に戻すボタンの有効・無効、`getInvalidCells` / `getRowNumber` / `selectCell` / `focus`、`applyState`。

**本番(vite build + preview)**: 上の主な操作と最小再現を本番でも実行し、同じ結果でした。

**時間(本番、iPhone 13 相当、CPU 4 倍遅く、2 回)**:

| 画面 | 最初の行が出るまで | 指でスクロール 6 回(長いタスク) | ダブルタップ → エディタ | 「不良のみ」 |
| --- | --- | --- | --- | --- |
| 点検一覧(640 行) | 1155 / 1078ms | 2604 / 2979ms(0 / 2 件、最大 58ms) | 419 / 378ms | 546 / 523ms |
| 日常点検表 | 1044 / 1676ms | 3123 / 3295ms(7 / 16 件、最大 73 / 92ms) | 404 / 319ms | — |

- 「不良のみ」は、CPU を落とさなければタップから上部バーの更新まで 33 / 40ms。
- JS は約 574kB / gzip 約 186kB(React 込み)。

## 3. 所見

### L-01 [中 / 不具合(アクセシビリティ)] 検査 NG のメッセージが、マウスのホバーでしか読めない
- **再現**:
  1. min の 2 行目(状態「不良」でメモが空)のメモのセルを、スマホでタップ、または 900ms 長押しする。
  2. デスクトップで、キーボードの矢印でそのセルへ行く。
- **期待**: タップやキーボードで選んだときにもメッセージが見える(または読まれる)。セルに `aria-invalid` / `aria-describedby` が付く。
- **実際**:
  - どの操作でもツールチップは出ない(`.ssg-tooltip--visible` が無い)。
  - セルにあるのは `ssg-body-cell--invalid` と `data-ssg-tooltip="メモを書いてください"` だけで、aria-invalid / aria-describedby / aria-description は付かない。
  - 現場のタブレット利用者やスクリーンリーダーの利用者は、赤い印の理由が分からない。
- **回避**: アプリで `getInvalidCells()` のメッセージを表示する(このアプリでは送信ボタンでそうした)。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/30-min-repro.cjs` の [1][8]
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/07-touch-invalid.cjs`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/probe-kbd-invalid.cjs`
- **環境**: dev / 本番。**確度**: 確実。

### L-02 [中 / 不具合] 列メニューの「列の固定」の小メニューが、タッチで開けない
- **再現**: スマホで列の ⋮ をタップ → 「列の固定」をタップ。
- **期待**: 「固定しない / 左に固定 / 右に固定」が出て、選べる。
- **実際**:
  - iPhone: pointerdown で小メニューが開き、続く click でメニュー全体が閉じる(パネルの数が 1 → 2 → 0)。
  - iPad: メニューは残るが、小メニューは閉じたまま。何度タップしても同じ。
  - デスクトップのマウス: ホバーで開くが、項目をクリックすると閉じる(紛らわしい)。
  - キーボード: Enter では開くが、ArrowRight では開かない。項目に `aria-haspopup` / `aria-expanded` が無い。
- **回避**: タッチではアプリ側で `pinned` を切り替える UI を用意するしかない。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/31-min-pin.cjs`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/probe-min-pin-trace.cjs`(イベントの記録)
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/21-pin-submenu.cjs`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/31-dev-iphone-pin.png`
- **環境**: dev / 本番。**確度**: 確実。

### L-03 [中 / 不具合(アクセシビリティ)] 列フィルターのポップオーバーから Tab で外へ出てしまい、開いたまま取り残される
- **再現**: キーボードでセルへ行く → Alt+↓ →「フィルター…」→ Tab を押し続ける。
- **期待**: フォーカスがポップオーバーの中を回る、または外へ出たら閉じる。Esc で閉じる。
- **実際**:
  - 最後のボタン(閉じる)の次は BODY / ページの先頭へ行き、ポップオーバーは開いたまま。
  - 外に出た後は Esc で閉じず、Shift+Tab でも戻れない。
  - ポップオーバーに role=dialog / aria-label / aria-modal が無い。そのため axe の `region` が中の要素ごとに出る(6〜17 件)。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/30-min-repro.cjs` の [6](Tab 7 回で BODY へ出て、開いたまま)
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/09-popover-tab-out.png`
- **環境**: dev / 本番。**確度**: 確実。

### L-04 [中 / 不具合] スマホを横にすると、ツールパネルが画面の下にはみ出して、下の項目と「すべての列を初期状態に戻す」に届かない
- **再現**: 664×390(iPhone の横向き)で ⋮ →「列の表示」(または上部バーの「絞り込み: なし」)→「列」タブ。
- **期待**: 列メニューや列フィルターと同じく、画面の中に収まる。
- **実際**:
  - パネルは position: fixed、max-height: 420px で、ボタンの下から始まる。
  - 点検一覧での位置:
    - 一覧: 上 312〜下 569px
    - 最後の項目「点検者」: 上 640px
    - 初期状態に戻すボタン: 上 586〜下 620px
    - 画面の高さ: 390px
  - 一覧の中は指でスクロールできるが、端まで送っても(scrollTop 103 = 最大)届かない。ページ自体はスクロールしない。
  - 縦向き(664px)でも「列」タブの下端は 697px で、初期状態に戻すボタンが半分切れる。
  - 最小再現でも、パネル 79〜432px、ボタン 385〜419px(画面の高さ 390px)。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/22c-toolpanel-land-cols-scrolled.png`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/22-iphone-toolpanel.png`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/30-prod-toolpanel-land.png`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/probe-toolpanel-land.cjs`
- **環境**: dev / 本番。**確度**: 確実。

### L-05 [中 / 不具合(アクセシビリティ)] 右クリックメニュー(`enableContextMenu`)をキーボードで開けない
- **再現**: セルを選んで Shift+F10、または ContextMenu キーを押す。
- **期待**: OS の慣例どおり、右クリックメニューが開く。
- **実際**:
  - どちらのキーでも何も起きない。キーボードだけの利用者は、アプリが足した「この行を削除」などに届かない。
  - マウスの右クリックで開いたときも、↓ を押すまでフォーカスが body にある。
  - 列メニューは role=menu / menuitem ではなく、ただのボタンの並び。⋮ に aria-haspopup / aria-expanded が無い。
  - キー操作の表に右クリックメニューの記載が無い。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/30-min-repro.cjs` の [5]
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/20-ctxmenu-kbd.cjs`
- **環境**: dev / 本番。**確度**: 確実。

### L-06 [中 / 不具合(アクセシビリティ)] セルのエディタの入力欄に名前が無い(axe の critical)
- **再現**: どの列でも F2(またはダブルタップ)で編集を始め、axe をかける。
- **期待**: 入力欄が「メモ」などの名前で読まれる。
- **実際**:
  - text / number / date / multiline の textarea / select の読み取り専用 input のすべてで `label`(critical)。外側の `role=group aria-label="X を編集"` だけが名前を持つ。
  - その group が role=grid の直下にあり、`aria-required-children`(critical)。
  - select エディタの listbox に名前が無い(`aria-input-field-name`)。combobox / aria-expanded / aria-activedescendant が無く、option に id も無い。入力欄の値がハイライト中の選択肢に合わせて変わるだけ。
  - dateSet のフィルターの木の checkbox 2 つにラベルが無い(`label` critical)。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/axe-run.log`(editor-* と dateSet-filter-popover)
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/e2e/30-min-repro.cjs` の [7]
- **環境**: dev / 本番。**確度**: 確実。

### L-07 [低 / 不具合(見た目)] 390px 幅で、下部バーの選択範囲の集計が左から切れる
- **再現**: スマホで数値の列の見出しをタップして、列を選ぶ。
- **期待**: 平均 / データの個数 / 合計が読める(折り返す、または省略する)。
- **実際**: `.ssg-bar-aggregates-inner`(overflow: hidden)の中で、先頭が切れる。
  - 点検一覧: 「平均: 117.8491」がまるごと見えず、「データの個数」の「デ」も欠ける。
  - 最小再現: 「平均:148.8333」が 91〜176px にあるのに、箱は 120px から始まる。
- **証拠**:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/30-prod-agg-bar.png`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/18-bar-zoom.png`
- **環境**: dev / 本番。**確度**: 確実(数値の桁数しだいで起きる)。

### L-08 [低 / 不具合(アクセシビリティ)] コントラスト不足と、見えている文言と名前の不一致(axe の serious)
- **コントラスト**:
  - critical のチップ「不良」: #dc2626 / #fee2e2 で 3.95:1。
  - `.ssg-filter-sec-meta`: 2.56:1。
  - ツールパネルのタブ: 4.27:1。
  - `.ssg-sort-empty`: 2.56:1。
  - 列の選び方の節見出し: 2.56:1。
- **label-content-name-mismatch**:
  - 上部バーの「絞り込み: なし」の aria-label が「フィルター管理パネルを開閉」。
  - フィルターのチップが「結果 のフィルターを編集」。
- **その他**:
  - `.ssg-chooser-list` の `scrollable-region-focusable`。
  - ラベル行の左の rowheader が空(minor)。
- **証拠**: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/axe-run.log`
- **環境**: dev / 本番。**確度**: 確実。

### L-09 [低 / 使いにくさ] `onColumnsChange` が無いと、ツールパネルの「列」の状態が見えず、開発者向けの文言が利用者に出る
- **実際**:
  - checkbox が無効の塗りになり、薄い灰色の上の白いチェックがほぼ見えないため、外れているように見える。
  - 切り替えのボタンに aria-pressed / checked が無い。
  - 「onColumnsChange 未指定のため…」という文言が、そのまま利用者に出る(localeText で上書きはできる)。使えない項目も表示される。
- **証拠**: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/10-columns-panel-zoom.png`
- **環境**: dev。**確度**: 確実。

### L-10 [低 / 使いにくさ] タッチで開いた列フィルターが入力欄に自動でフォーカスする。入力欄の文字は 16px 未満
- **実際**:
  - タップで開くと `INPUT.ssg-filter-input` にフォーカスが来る。実機ではソフトキーボードが出て、値の一覧を覆うはず。
  - グローバルフィルターは 13px、ポップオーバーの入力欄は 12.5px。iOS Safari ではフォーカスでページが拡大されるはず(セルのエディタは 16px で問題なし)。
- **確度**: フォーカスは確実。キーボードと拡大は Chromium の模擬では見えないため未確定(CSS からの推定)。

### L-11 [低 / 使いにくさ] タッチでは ⋮(と並べ替えの grip)が常に出るので、狭い列の見出しが切れる
- 例: 「単位」64px →「単…」、「異常」64px →「異…」。
- **証拠**: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/24-320daily.png`
- **確度**: 確実。

### L-12 [低 / 使いにくさ] タッチの的が小さい
- メニューの項目 32px、フィルターの checkbox の行 24px、クリア / 閉じる 55×25、select の選択肢 28px、⋮ 20×20。
- `density` はポータル(メニュー / フィルター)に効かない。
- **確度**: 確実(実測)。

### L-13 [低 / ドキュメント] 複数行のエディタは、スマホのソフトキーボードで改行できない
- **実際**: 既定の `enterKey: 'commit'` では、改行に Alt / Ctrl+Enter が要る。ソフトキーボードでは押せない。
- **期待**: ドキュメントに「モバイルでは `enterKey: 'newline'`」の一言がある。
- **確度**: 確実(仕様どおりの動き)。

### L-14 [低 / 不具合(見た目)] forced-colors(Windows のハイコントラスト)で、検査 NG とチップの色の意味が消える
- **実際**:
  - NG の印が 6px の黒い四角になり、桃色の背景も消える。
  - チップの色が消える(アイコンは残るので、chips の `icon: false` の列は区別できない)。
  - style.css に forced-colors の指定が無い。
- **証拠**: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/L/shots/13c-fc-active-invalid-zoom.png`
- **確度**: 確実。

### L-15 [低 / ドキュメント] セル内検索(`find`)の入口が Ctrl+F だけで、スマホからは開けない
- **実際**: ドキュメントに、アプリで `openFind()` のボタンを置く案内が無い。
- **確度**: 確実。

### L-16 [低 / ドキュメント] `onActiveCellChange` の `row` / `value` は、同じセルを編集した後は古いまま
- **実際**:
  - 同じセルの間は呼ばれない(ドキュメントどおり)。そのためフッターの「結果: 良」が、編集後も前の値のまま残る。
  - 値の写しであることが書かれていない。
- **回避**: rowKey で `rows` から引き直す。
- **確度**: 確実。

### L-17 [低 / ドキュメント] ドキュメントの小さな食い違い
- **行数**: SKILL.md は「API_REFERENCE.md は約 1,800 行」と書くが、実際は 2,585 行。
- **バリデーションのレシピ**: API_REFERENCE.md 1140〜1153 行のレシピは `scrollToCell(first.sourceRowIndex, columns.findIndex(...))` で、「ソートのある画面では rowKey からビュー index を自前解決」と書いている。README / Skill の「`getViewRowIndex` / `getColIndex` を使う」と食い違う。合成列があると列もずれる。
- **書かれていないこと**: キー操作の表に Shift+F10 が無い。モバイル / forced-colors の注意も無い。

### L-18 [低 / 不具合] PageDown / PageUp の移動量が 1 行ずれる
- 2 行目 → 17 → 32 と下がり、PageUp で 16 へ戻る(17 ではない)。
- **確度**: 未確定(1 回だけ観察)。

## 4. ピン留め行

**無し**。
- 日常点検表の「階の見出しを残したい」は `labelRow` の sticky で足りた。
- 「異常の合計を下に残したい」は `totalRow` で足りた。
- 点検一覧の「未点検の行を上に」は、フィルター / ソートで代わりになった。

## 5. 要望

- 検査 NG のメッセージを、タップ・キーボードのフォーカスでも出す(アクティブセルが NG のとき下部バーに出す等)。あわせてセルに `aria-invalid` / `aria-describedby` を付ける。
- タッチで開閉できる小メニュー(または列メニューの中に固定の 3 択を並べる)。
- ツールパネル / ポップオーバーを `visualViewport` の高さに収める。
- 狭い画面向けの選択肢: 幅が足りないとき固定を自動で外す、または固定域の上限。320px では左 166px + 右 64px の固定で、中央が 73px しか残らない。
- `pointer: coarse` のときに、メニュー・選択肢・フィルターの行の的を大きくする設定(`density` をポータルにも)。
- forced-colors の CSS、Shift+F10 での右クリックメニュー、検索バーのタッチ用の入口。
