# 点検の報告: Solid 版 `@ishibashi0112/spreadsheet-grid-solid@0.1.0`(S3 商品マスタ / S5 ログと株価)

一番重いのは **S5-01(高)** です。README どおりに `let grid!` + `ref={grid}` で受けると、初回の `createEffect` と `onSettled` ではハンドルがまだ `undefined` です。そこでハンドルのメソッドを呼ぶと、本番でも Solid の反応全体が止まります(REACTIVITY_HALTED)。ほかの所見は低で、React 版 1.2.1 と挙動・速さに Solid だけの退行は見つかりませんでした。

`$D` = `audit/dogfood/2026-11-22-solid`

- 起動したサーバーはすべて PID で止めました。ポート 5503 / 5505 が空いていることも確かめています。
- タイミングの数字は共有マシン(4 CPU / 3 エージェント)なので参考値です。
- 自分のアプリには 3 つ手を入れました。
  - S5 の Solid 版と React 版の両方に、比べるための `window.__stocks` を足しました。
  - S5 の Solid 版は、S5-01 を見つけた後にハンドルを `grid?.` で読むように直しました。
  - S3 のカスタムエディタの初期文字は S3-02 の回避を入れてあります。

---

## S3 商品マスタ(ポート 5503、`$D/S3/app`)

### 作ったもの
- 商品 5,000 件と 12 カテゴリのラベル行(sticky)の表です。行の型は `Product | CategoryLabel` の union です。
- グリッドは `createSpreadsheetGrid({ features: { ...standardFeatures, labelRow, rowDrag, find, contextMenu, fillHandle, selectionAggregates } })` で、モジュールの先頭で作っています。
- 列:
  - サムネイルを `renderCell` で描く列
  - 候補 240 件の select の列(ブランド)
  - 仕入先 600 件を選ぶカスタムエディタ(`$D/S3/app/src/SupplierEditor.tsx`。候補の一覧はポータルで出し、キーボードで操作できる)
  - number の min/max と検査(reject / mark)の列
- 画面の部品:
  - カテゴリの中だけで動かせる行ドラッグ(`canDropRow`)
  - 右クリックの「複製 / 削除」(`applyRows`)
  - 検索
  - CSV(`includeLabelRows`)
  - shadcn テーマ + `theme="class"` のダーク
  - ネイティブ `<dialog>` の `showModal` の中のグリッド
- `?grid=lite|nofill|bare|mixed|full` で切り替え、機能の入れ忘れの警告と `SpreadsheetGrid` との混在を見ました。

### 確かめた操作(問題なし。dev と本番)
- **カスタムエディタ**: Enter / Tab / Esc / マウスで選べる。一覧のホイールでは閉じず、グリッドのスクロールで閉じる。undo / redo も効く。
- **select(240 件)**: IME の先頭一致が効く。
- **検査**: reject / mark、Delete が reject の列を飛ばす、min/max のツールチップ。
- **行ドラッグ**: カテゴリの中で動く。`canDropRow` の拒否は no-drop のゴーストで出る。undo で戻る。
- **フィルハンドル**: 数値の連続で負になると mark が付く。日付の連続、undo。
- **検索**: 61 件、Enter で移動する。
- **右クリック**: マウス / Shift+F10 / キーボードで開け、複製・削除と undo が効く。
- **フィルター**: 列メニューと set フィルター(ラベル行の件数も変わる)。フィルター中は行ドラッグのハンドルが淡色になる。
- **ダークと集計**: shadcn のダークでメニュー・ポップオーバーが正しい色。選択範囲の集計、CSV 5,013 行。
- **ダイアログの中**: 列メニュー / フィルター / 右クリック / select の一覧がダイアログの中に出て、押せる。Esc の効き方はドキュメントどおり。
- **入れ忘れの警告**: find / fillHandle / enableRowDrag / enableContextMenu / filterType / labelRow / exportCsv() の警告は日本語 + 英語でわかりやすい。足せば動く。
- **混在**: `SpreadsheetGrid` と `createSpreadsheetGrid` を同じページに置いても、rows の同期・両方のフィルターのポップオーバーが動く。
- **初期 JS のサイズ**(gzip、Vite 8。Solid の実行環境を含む。空の Solid アプリが 11.55KB):

  | 構成 | 合計 | グリッド分(合計 − 空のアプリ) | README の数字 |
  | --- | --- | --- | --- |
  | 機能なし | 103.37KB | 約 91.8KB | 約 90KB |
  | standard | 129.58KB | 約 118.0KB | 約 117KB |
  | 全部入り | 171.30KB | 約 159.8KB | 約 162KB |
  | 混在 | 171.35KB | 全部入りとほぼ同じ | — |
  | 後から読む分 | 14.80KB | — | 約 16KB |

  - 混在は React 版のように二重にならず、全部入りとほぼ同じでした。
  - S3 アプリは 177.18KB でした。

### 所見

**S3-01 ダイアログの中ではドキュメントどおりに書いたカスタムエディタの一覧を押せない**
- 重要度・種類: 低 / ドキュメント / React 版も同じ(確度 高)
- 再現手順:
  1. custom エディタのドキュメントのとおり、候補の一覧を `document.body` へポータル + fixed で出す。
  2. そのグリッドを `<dialog>.showModal()` の中に置く。
- 期待: 候補を押せる。
- 実際:
  - 一覧が top layer のダイアログの裏に出て、押せません。
  - ガイドのダイアログの節にも custom エディタの説明にも書いてありません。
  - `root.closest('dialog') ?? document.body` へ出せば動くことを確かめました。
- 証拠: `$D/S3/shots/t8-custom.png`、`$D/S3/t8-dialog.cjs`。dev と本番で確認。

**S3-02 `ctx.initialText` の中身がドキュメントより広い**
- 重要度・種類: 低 / ドキュメント / React 版も同じ(確度 高)
- 内容:
  - ダブルクリック / F2 / Enter で開いたときは `String(value)` が入ります。
  - 文字キーで開いたときはその文字が入ります。
  - ドキュメントは文字キーの場合しか書いていません。
- 影響: 検索欄の初期値にそのまま使うと、ダブルクリックで生のコード(例「SUP-0123」)が入ります。
- 証拠: `repro-test.cjs` の出力。k → "k"、F2 → "city-3"、Enter → "city-3"、ダブルクリック → "city-2"。Solid と React で同じでした。

**S3-03 別のセルを自動化のダブルクリックで開くと、カスタムエディタにキーが入らない**
- 重要度・種類: 低 / 不具合かは未確定 / React 版も同じ(確度 低)
- 再現手順:
  1. カスタムエディタを開いておく(blur で cancel でも commit でも同じ)。
  2. Playwright の `locator.dblclick()` で別のセルを開く。
- 実際:
  - 新しいエディタは開きますが、フォーカスは入力欄が受けた 1ms 後に `.ssg-shell` へ移ります。
  - そのためキーが効きません。
- 再現範囲:
  - 最小再現では dev / 本番 × Solid / React のすべてで再現します。
  - 手で組んだ mouse down/up(間隔 0 / 50 / 120 / 250ms)や S3 の本番アプリでは再現しません。
  - 合成イベントのタイミング由来の疑いがあります。

**S3-04 共通の props をオブジェクトで作り直して spread すると dev で HUGE_FAN_OUT が出る**
- 重要度・種類: 低 / 使いにくさ / Solid だけ(確度 高)
- 内容:
  - rows が変わるたびに作り直す props オブジェクトを `{...gridProps()}` で渡すと、dev で `Signal merge changed with 2322 subscribers` が出ます。
  - props を直接書けば出ません。
  - 本番の負荷はどちらも 1 編集あたり中央値 約 16.6ms で同じでした。
- 証拠: `$D/S3/t13-fanout.cjs` / `$D/S3/t14-spreadcost.cjs`。
- 要望: 複数のグリッドで同じ props を共有する書き方を README に一言。

**S3-05 テーマ CSS のコメントが React 版のパスを指している**
- 重要度・種類: 低 / ドキュメント / Solid だけ
- `themes/*.css` のコメントが React 版のパッケージのパスを案内しています。

---

## S5 ログと株価(ポート 5505。Solid 版 `$D/S5/app`、React 1.2.1 版 `$D/S5/react`。データは同じ `data.ts`)

### 作ったもの
- **ログ**:
  - 1,000,000 行
  - 時刻の dateSet(相対の日付)、レベル・サービスの set + チップ
  - メッセージは autoHeight、traceId
  - detailRow で JSON を出す
  - 末尾を追うモード(毎秒 50 行を足し、`isAtBottom` / `onScroll` の atBottom / `scrollToBottom` で、末尾にいるときだけ下へ)
- **株価**:
  - 2,000 銘柄、250ms ごとに 100 銘柄を更新
  - 更新は 2 つの方式: signal の配列を作り直す / `applyRows(prev => …, { undoable: false })`
  - `highlightChanges`、`animateRows`、`activeCellFollows="row"`、`pinnedTopRows`(指数 2 行)
  - colorScale / dataBar / chips
  - `?group` で業種の rowGroup + aggFunc(avg / sum)
  - メモの列だけ編集できる

### 確かめた操作

すべて本番で Solid と React を比べました。結果は同じです。

- **ログの機能**:
  - 「今日」のプリセット 354 行、ERROR + auth 12,330 行
  - autoHeight の行の高さ 96 / 36 / 124 / 58 / 94px
  - 展開トグル 35 個と JSON の詳細
  - 絞り込み中の検索 1/2174
  - 1M 行では autoHeight の切り替えの警告が出て展開トグルが隠れる(ドキュメントどおり)
  - スクリーンショットは Solid と React で見た目も同じ(`$D/S5/shots/app-detail.png` / `react-detail.png`)
- **末尾を追うモード**(`$D/S5/t9-tail.cjs`、20,000 行と 1M 行):
  - 末尾では毎秒 50 行ずつ追いかける。
  - 上へスクロールすると「上を見ています」になり、20,000 行では位置が動かない。
  - 「末尾へ」で追いかけ直す。
  - 1M 行では、上を見ている間に 150 行を足すと見えている行が 1 行ずれました(Solid も React も同じ。スクロールの縮尺の補正による)。
- **株価の更新中の操作**(`$D/S5/t5-stocks.cjs`、両方式):
  - 固定行は左右のペインに 2 行出る。
  - 光るセルは最大 24 個、colorScale / dataBar / chip が出る。
  - 選択範囲の集計は値の変化について更新される。止めたときの合計は DOM とデータに一致(45,687)。
  - コピーはデータの値(整数)で、tween の途中の値は混ざらない。
  - 前日比の降順は更新中も保たれる(違反 0)。
  - `activeCellFollows="row"`: 行が 4〜17 回動いても、アクティブセルとの不一致は 0。毎フレームの rAF で枠と行の位置を比べても、600 フレーム中ずれは 0(`$D/S5/t11-tear.cjs`)。
  - 何行かにまたがる範囲は、中の行が入れ替わると 1 セルになる(ドキュメントどおり)。
  - 並べ替え中に打っている間に行が動いても、メモは正しい行に入る。Enter は確定前の並びの下の行へ動く。
- **メモの undo**:
  - `applyRows(undoable:false)`: undo でメモだけ戻り、株価は戻らない(巻き戻った行 0)。
  - signal の配列を作り直す方式: 履歴が消えて `canUndo()` は false。ドキュメントどおりで、React も同じ。
- **グループ化**(`$D/S5/t7-group.cjs`):
  - 10 グループ、集計は更新について変わる。
  - グループの中でも光る。
  - 外して戻しても壊れない。
  - スクリーンショットは Solid と React で同じ。

### 速さとメモリ(本番)

**ログ 1M 行**(`$D/S5/perf-logs.cjs`、各 2 回)

| 指標 | Solid | React |
| --- | --- | --- |
| 最初のセルまで(ms。データ生成を含む) | 1,275 / 1,366 | 1,192 / 1,001 |
| 読み込み後のヒープ | 198MB | 195MB |
| 検索 "timeout"(ms) | 465 / 456 | 395 / 370 |
| グローバルフィルター "502"(ms。打つ時間を含む) | 1,712 / 1,647 | 1,902 / 1,815 |
| 列フィルター ERROR(ms) | 98 / 111 | 115 / 124 |
| 絞り込み中のソート(ms) | 164 / 160 | 143 / 152 |
| ソート後のヒープ | 127MB | 125MB |
| Ctrl+End(ms) | 12 / 86 | 7 / 71 |
| scrollToRow(ms) | 73 / 90 | 64 / 47 |
| ホイールのフレーム p50 / p95 / 最大(ms) | 11.2 / 49.7 / 51.6 | 12.3 / 43.6 / 64.4 |
| 長いタスク | 6〜7 回、最大 619ms | 3〜6 回、最大 537ms |

- グローバルフィルターの結果はどちらも 96,843 行です。
- dev の Solid はスクロールの p95 が 240ms、長いタスク 45 回でした(dev だけ)。

**末尾を追うモードの 1 回の追加にかかる主スレッドの時間**(ms/秒。`$D/S5/t10-append.cjs`、2 回)

| 状態 | Solid | React |
| --- | --- | --- |
| 20,000 行・末尾 | 93 / 83(長いタスク 6 / 2) | 67 / 69(0 / 0) |
| 1M 行・末尾 | 182 / 141 | 183 / 146 |
| 1M 行・上を見ている | 348 / 257 | 235 / 256 |

- 20,000 行 + autoHeight だけ Solid が 1 回あたり約 15〜25ms 多い(script 分)ですが、参考値です。
- 1M 行で上を見ている間に足すと 1 回約 250ms かかるのは、Solid も React も同じでした。

**株価を 3 分ずつ**(`$D/S5/t6-long.cjs`、前日比の降順 + アクティブセルあり、両方式)

| 指標 | Solid | React |
| --- | --- | --- |
| ヒープ(GC 後) | 9.7 → 10.5MB | 7.2 → 8.0MB |
| CPU | 約 25〜28% | 約 23〜27% |
| フレーム | p50 16.7 / p95 16.8ms、約 60fps | 同じ |
| 長いタスク | 最初の 30 秒に 1 回(75〜79ms、ソートの操作) | 0 回 |
| コンソール | なし | なし |

- ヒープはどちらも 2.5 分で +0.8MB と同じ増え方です。3 分では頭打ちを確かめていません。
- 3 分後もアクティブセルは同じ行(492 行目)に付いていました。
- DOM ノードは Solid 3,258 / React 1,622 です。要素の数は 1,193 で同じで、差は Solid の目印のコメント 964 と空のテキスト 403 でした(`$D/S5/t8-nodes.cjs`)。

**結論:** Solid だけの退行は見つかりませんでした。

### 所見

**S5-01 グリッドのハンドルが初回の `createEffect` と `onSettled` ではまだ `undefined` で、呼ぶとアプリ全体が止まる**
- 重要度・種類: 高 / 不具合(またはドキュメント)/ Solid だけ(確度 高)
- 前提:
  - README は「`ref` は Solid の DOM の ref と同じ」と書き、`let grid!` + `ref={grid}` を勧めています。
  - しかし DOM の ref は初回の effect の時点で入っているのに、グリッドのハンドルは入っていません。
  - ref の関数が呼ばれるのは `onSettled` の後(次の microtask)です。
- 再現手順:
  1. `$D/S3/repro-solid/ref.html` を開く(dev)。
  2. 記録を見る。
  3. `?crash` を付けて開く(effect の初回で `grid.scrollToBottom()` を呼ぶ)。
- 記録(手順 2): `effect(rows=1): grid=undefined viaFn=undefined div=object` → `onSettled: grid=undefined … div=object` → `ref function called` → `microtask after settle: grid=object`
- 実際(手順 3): TypeError から `[REACTIVITY_HALTED] … No further updates will be processed` になり、その後の更新がすべて止まります(数の表示が 1 のまま)。
- 本番でも同じです: S5 の本番ビルドで、React の `useEffect(() => { … grid.current.scrollToBottom() }, [rows])` を素直に移した effect で再現しました。
- React 版: 同じ書き方でも初回に動き、最初から末尾にいます。
- 回避: ref の関数で受けて `grid?.` で読む、または queueMicrotask で読む。
- 要望(どちらか):
  - ハンドルを DOM の ref と同じ時点(初回の effect の前)で渡す。
  - README に「`onSettled` / 初回の effect ではまだ無い」と書く。
- 最小再現: `$D/S3/repro-solid/src/ref.tsx` + `ref.html`、記録を出すスクリプト `$D/S3/repro-ref.cjs [?crash]`。

**S5-02 dateSet のプリセットを押した後、Escape でポップオーバーが閉じない**
- 重要度・種類: 低 / 不具合 / React 版も同じ(確度 高)
- 再現手順:
  1. dateSet のフィルターのポップオーバーを開く。
  2. 相対のプリセットのチップ(「今日」)を押す。
  3. Escape を押す。
- 実際: 手順 2 でフォーカスが BODY へ落ち、Escape でポップオーバーが閉じません。
- 確認範囲: 20,000 行と 1M 行、本番、Solid と React。
- スクリプト: `$D/S5/t4-dateesc.cjs`

**S5-03 グリッドの中の effect から dev で Solid の診断が出る**
- 重要度・種類: 低 / 使いにくさ / Solid だけ(確度 高)
- 内容:
  - dev で `EFFECT_RELAY_TEAR` / `EFFECT_WRITES_OWN_SOURCE` が出ます。
  - 出元はグリッドの中の effect で、`activeRowFollow` / `edit` / `autoHeightMeasurer` です。
  - 出る場面:
    - `activeCellFollows="row"` で並べ替え中に値が変わるとき
    - 並べ替え中の編集で、打っている間に行が動くとき
    - autoHeight + 行の追加(S5 のログで確認。最小再現では出ず)
- 影響:
  - 場所は利用者の `<SpreadsheetGrid>` の行として出ます。
  - 「agent repair guide」の文も付くので、利用者や AI が自分のコードを直そうとしかねません。
  - 「pre-write の値が描かれた」と言いますが、本番の毎フレームの確認ではずれは 0 でした(S5 の確かめた操作を参照)。
- 最小再現: `$D/S3/repro-solid/src/diag.tsx` + `diag.html`(`?case=follow|editsort` で出る、`edit|auto|autotail` では出ない)、`$D/S3/repro-diag.cjs <case>`。

**S5-04 グループ行の平均が 100px の列で省略される**
- 重要度・種類: 低 / 使いにくさ / React 版も同じ
- 内容:
  - グループ行の平均が「平均 4,9…」「平均 -0.…」と省略されます。
  - `numberFormatter()` の株価の列で、平均は 4,991.785 と小数 3 桁になります。
- 証拠: `$D/S5/shots/t7-app-signal-group.png` / `t7-react-signal-group.png`

---

## Solid の利用者として
- React 版と同じ props・同じ画面がほぼそのまま移せ、見た目と挙動は(スクリーンショットの比較でも)一致しました。サイズも React の実行環境が無いぶん小さいです(S5: Solid 175.17KB / React 213.61KB)。
- 引っかかった所:
  - ハンドルの時点(S5-01)。
  - React の tail の例を素直に移すと apply の中で signal を読む形になり、STRICT_READ_UNTRACKED が出ます。
  - props オブジェクトの spread で出る HUGE_FAN_OUT(S3-04)。
  - グリッドの中の effect の診断(S5-03)。
  - aria-* の真偽値は文字列で渡す必要がある(Solid 2 の型)。
  - union の行型の `renderCell` では `row.kind` で絞り込む必要がある。
- 要望:
  1. S5-01 を直すか README に書く。
  2. Solid 版 README に Solid の書き方の例を足す: ライブ更新は `applyRows(…, { undoable: false })`(signal の配列の作り直しは undo の履歴を消す)、effect / onSettled でハンドルを使う例、props の共有。
  3. グリッドの中の effect を Solid の診断が出ない形にする(memo 化など)。
  4. カスタムエディタのドキュメントに `<dialog>` の中のポータル先と `initialText` の中身を足す(S3-01 / S3-02)。

## ファイル

**最小再現**
- `$D/S3/repro-solid/src/main.tsx` + `index.html`(カスタムエディタ。`?s=focus|dialog&blur=cancel|commit`)と、React 1.2.1 の同じもの `$D/S3/repro-react/src/main.tsx`
- `$D/S3/repro-test.cjs`、`$D/S3/repro-focus-timing.cjs`(S3-02 / S3-03)
- `$D/S3/repro-solid/src/ref.tsx` + `ref.html`、`$D/S3/repro-ref.cjs`(S5-01)
- `$D/S3/repro-solid/src/diag.tsx` + `diag.html`、`$D/S3/repro-diag.cjs`(S5-03)
- `$D/S5/t4-dateesc.cjs`(S5-02)

**アプリ**
- `$D/S3/app`(サイズの計測は `$D/S3/app/size/measure.mjs`)
- `$D/S5/app`(Solid)と `$D/S5/react`(React 1.2.1)

**テストのスクリプト**
- `$D/S3/t*.cjs`
- `$D/S5/perf-logs.cjs`、`t1.cjs`、`t3-logs.cjs`、`t4-dateesc.cjs`
- `$D/S5/t5-stocks.cjs`、`t6-long.cjs`、`t7-group.cjs`、`t8-nodes.cjs`
- `$D/S5/t9-tail.cjs`、`t10-append.cjs`、`t11-tear.cjs`

**スクリーンショット**
- `$D/S3/shots/`
- `$D/S5/shots/`