# Solid 版の作業記録

2026-11-17 に Solid 2.0 の正式版(solid-js / @solidjs/web 2.0.0)が出たのを受けて、core の上に Solid のシェルを載せた
`@ishibashi0112/spreadsheet-grid-solid` を作る。2026-11-17 にユーザーが「Solid 版を作る」を選んだ(試作の報告と見積もりは
Claude Doc「Solid 2.0 版の試作の報告」)。試作の中身と分かったことは `packages/solid/README.md`。

この表は進み具合の記録も兼ねる。コミットごとに「状況」を更新して push する(週の使用量の上限などで途中で止まっても、
別のセッションがこの表とコミットから再開できるように)。

## 段取り

| 段階 | 中身 | PR | 公開 |
| --- | --- | --- | --- |
| 0 | core へ寄せる整理(React 版の公開 API と見た目は不変)+ 試作の `packages/solid`(非公開) | 1 | React 版は patch / minor に混ぜる |
| 1 | Solid 版の本体(React の `/lite` の機能なし = `createSpreadsheetGrid({ features: {} })` と同じ範囲: 見出しとセル・列幅・ソート・ツールチップ・エディタ 6 種・入力の検査・行の選択・展開行・ARIA) | 3 | — |
| 2 | 21 の機能(`/lite` の部品と同じ名前で。ラベル行・SSRM・行のグループもここ = React 版でも機能のため) | 3〜4 | — |
| 3 | ハーネス(3 ブラウザ)・`types:check`・`size:check`・ドキュメント・サンプル | 2 | `@ishibashi0112/spreadsheet-grid-solid` 0.x |

## 段階 1 の中身

React 版の機能なしの構成と並べて、同じ props・同じ操作で DOM と通知(on* の呼ばれ方と引数)が同じかを比べるテスト
(`packages/solid/src/parity/`)で確かめながら進める。

| # | 内容 | 状況 |
| --- | --- | --- |
| 1-1 | 見出しとセル: 見出し(renderHeader・並びの印・列幅のつまみ・角)、セル(renderCell・valueFormatter・cellClassName・メモ・入力の検査の印・checkbox のセル・ARIA)、上下のバー、空の表示、テーマ・密度・モーション・classNames、ツールチップ、Tab でグリッドの外へ、通知(onStateChange / onSortChange / onScroll / onCellClick ほか)。共通の部品を core へ(下部バーの文字列 = core `logic/gridBarSummary`、renderHeader の中のボタンの判定 = core `logic/domGuards`)。React 版と並べて比べるテスト | 済み(比べる場面 11 で DOM・フォーカス・要素の使い回し・id の参照・通知が一致。別視点のレビューの指摘も直した。PR #62 でマージ済み) |
| 1-2 | エディタ 6 種(text / number / select / date / checkbox / custom)・入力の検査(reject)・エラーの吹き出し | 済み(1-2c: 別視点のレビュー = 高 1・中 2・低 3 を直した。比べる場面 13 で DOM・フォーカス・通知が一致、Solid だけのテスト 1、Chromium のデモで実際のキー入力・IME・吹き出しの置き方・エディタが外れるときを確かめた。全ゲートと React 版のハーネス Chromium 941 / 941・Firefox 865 / 865・WebKit 861 / 864(FAIL は既知の BR-3・BR-4 だけ。1.2.0 と同じ数)。1-2b: Solid のエディタ 6 種と比べるテスト = 済み。1-2a: エディタの判断と DOM の処理を core へ = 済み。エラーの吹き出しの置き方 `utils/errorBubblePlacement`、複数行の入力欄の大きさと改行 `utils/multilineEditor`、見えている範囲 `utils/editorVisibleBounds`(React 版から移動)、number / date の開く値と確定する値 `logic/editorStart`、select のキーと開いたときのハイライト `logic/selectEditorState`(React 版はフル版が 0.08KB 増えるので展開したまま)。フル版 149.71KB) |
| 1-3 | 行の選択(チェックボックス)・展開行・フォーカスの順 | 済み(1-3c: 別視点のレビュー 2 系統(React 版が前と同じか = 高・中なし / Solid 版が React 版と同じか = 中 2・低 3 のうち中 2・低 2)を直し、比べる場面を 8 に。React 版のハーネスの WebKit で core へ移したカードの Shift+Tab の回帰を 1 件見つけて直した(core `logic/domGuards` の `isTabKeyEvent`)。直した版で全ゲートと React 版のハーネス Chromium 941 / 941・Firefox 865 / 865・WebKit 861 / 864(FAIL は既知の BR-3・BR-4 だけ。1.2.0 と同じ数)。フル版 149.82KB。1-3b: Solid の行の選択・展開行と比べるテスト(DOM・フォーカス・通知が一致)、Chromium のデモで実際のポインタ / キー入力を 33 項目。1-3a: 展開行の開閉とカードの Tab の順を core `controllers/detailRowController` へ) |

### 1-3 で分かったこと

- **core へ寄せたもの**: 展開行の開閉(閉じる前にカードの中のフォーカスを表へ戻し、その行のセルを選ぶ)・トグル列のセルの
  Enter / Space・最終列の Tab でカードへ・カードの端の Tab / Shift+Tab・表の直後の目印(後ろから戻ってきたらカードの最後の
  要素へ)・セルの中の要素の Tab で表の外へ・フォーカスを持ったカードが消えたとき(G-13)は、React 版の `GridShell.tsx` の
  useCallback に書いてあったので core `controllers/detailRowController` へ移した(jsdom のテスト `detailRowController.test.ts`)。
  開閉できる行かの判断は core `logic/detailRow` の `isDetailRowExpandable`。React 版はフル版が 0.06KB 増える(149.77KB。上限
  150.1KB の中)が、フォーカスの順は細かい条件が多く、二重に持つと片方だけ直すずれが起きやすいので共有にした(1-2 の select の
  判断は 0.08KB で展開したまま = こちらは数行の計算だったため)。
- **カードが消えたときの判断を共用**: React 版はレイアウト effect の後始末で「今カードの中にフォーカスがあるか」を見て、外れた後
  (マイクロタスク)に body へ落ちたときだけ表へ戻していた。この判断を core の `notifyDetailCardFocusLost` へそのまま移し、Solid 版は
  `onCleanup`(DOM から外す前に走る)から呼ぶ。
- **カードの中身は rowKey で対応させる**: 帯は `For keyed={(entry) => entry.rowKey}` で、`render` の ctx の `row` / `rowIndex` /
  `sourceRowIndex` は読んだときに引く getter。並べ替えても中身を作り直さず、打った文字が残る(React 版と同じ。比べるテストで
  同じ要素のままかを見た)。
- **選択の塗りは展開行の帯を避けて分ける**: core の `resolveSelectionBandSegments` / `resolvePaneSegmentRects` で、範囲が開いた
  行をまたぐと塗りが 2 つ以上になる(React 版と同じ数と位置)。
- **比べるテストで見たもの**: multiple(行番号のチェック・Shift で範囲・角で全選択 / 解除・ドラッグ・`clearRowSelection`)、
  single、controlled(`selectedRowKeys` / `rowSelection` の exclude)・`enableSelectAllRows={false}`、トグル列で開閉・中身の
  `collapse`・`isExpandable`・`className`・ハンドルの `setDetailRowExpanded` / `collapseAllDetailRows`・開いたまま並べ替え、
  キーボード(Enter / Space・Tab でカードへ・カードの端・後ろから戻る)、カードの中にフォーカスがあるまま閉じる / 行が消える、
  カードの中のキーが本体へ伝わらない、`showToggleColumn: false` と renderCell の `ctx.detail`、`detailRow` を外す。
  Chromium のデモでは実際の Tab / Shift+Tab(表の外のボタンから戻るのも)・ポインタのドラッグ・横スクロールでカードが留まる・
  スクロールで外れたカードからのフォーカスの戻りも確かめた。
- **利用側の関数の本体での読み取りは、その行の値の memo で受ける**(別視点のレビューの中 2・低 1): Solid は render / renderCell の
  本体での読み取りを追跡するので、React の書き方そのままの `render: ({ row, collapse }) => …`(引数の分解)で、`ctx.row` が
  rowModel(どの行が変わっても新しくなる)を読んでいると、ほかの行の編集や並べ替えのたびにカードの中身を作り直し、打ちかけの
  文字とフォーカスが消えていた。renderCell の本体で `ctx.detail.expandable` / `expanded` を読むと、スクロールのたびに(縦の
  レイアウトをそのまま読んでいた)/ どれか 1 行の開閉のたびに(開いている行の集合ぜんたいを読んでいた)その列のセルを作り直して
  いた。→ カードの `row` / `sourceRowIndex`、セルの `expanded` / `expandable` をその行の値だけの memo にし、`detailDrawable` /
  `detailRowEnabled` も memo にした(props をスプレッドで渡すと、値が同じでも読む側が呼び直されるため)。比べるテストに「本体で
  ctx を読む render / renderCell」の場面を足し、カードの中の入力欄とセルの中身が同じ要素のままかを見る(修正を 1 つずつ外すと
  落ちることも確かめた。`detailDrawable` の memo は DOM には出ず、isExpandable をスクロールのたびに呼ばないためのもの)。
  React 版の側のレビュー(core へ移した処理が前と同じか)は高・中なし。低は、開閉の関数が参照安定になって列を変えてもカードの
  render を呼び直さなくなった(利用側の render が純粋なら同じ)・カードの Tab の `defaultPrevented` を元のイベントから読む・
  別の document(iframe)に描いたときのフォーカスの判定で、どれも挙動を悪くする向きではないのでそのまま。Solid 版の側の低の残り
  1 つ(コントローラの最初の `update` の前に、セルやカードの中身のマウント時の layout effect から開閉を呼ぶと何もしない)は、
  最初の描画では見える高さが 0 で行もカードも描かれないので通らない(React 版でマウント時に `setExpanded(true)` を呼ぶと開く
  ことを確かめた)ので直さない。
- **元のイベントの key は React の合成イベントと違うことがある**(WebKit のハーネスで見つけた): WebKitGTK の WebDriver は
  Shift+Tab の keydown を `key: 'Unidentified'`(keyCode 9)で送る。React の合成イベントは key を keyCode から 'Tab' に直すが、
  core へ移した処理は元のイベント(`nativeEvent`)を読むので、カードの最初の要素の Shift+Tab がその行の最終列へ戻らなかった
  (React 版の回帰。Chromium / Firefox / jsdom では出ない)。→ core `logic/domGuards` の `isTabKeyEvent`(key が 'Unidentified' の
  ときは keyCode で見る)にした。Solid 版はキー操作のすべてで元のイベントを読むので、段階 3 で Solid 版のハーネスを WebKit で
  回すときにキー操作のコントローラの Tab も見る。
- **まだ入れていないもの**: 展開行の高さが本体の上限を超えるときの開発時の警告(React 版の `detailMaxBody`。開発時の警告は
  段階 2〜3 でまとめて)。
- **既知の開発時の診断**: 読み込んだときに 1 回、列の仮想化の測り直し(`createColumnVirtualizer.version`)で見出しを 2 回描く
  EFFECT_RELAY_TEAR が出る(段階 1-1 から。main でも出る。大きさを測った後に描き直す = 診断の文言どおり「測る代わり」)。

### 1-2 で分かったこと

- **Solid 2.0 の `value` は式で結ぶと描き直しのたびに書き直される**: コンパイラは同じ要素の動く属性(min / max / aria-invalid /
  class / style など)を 1 つの effect にまとめ、`value` はそのどれかが変わるたびに書き直す(同じ値でも)。number エディタを
  `value={start.text}`(式)にしていたら、reject でエラーの印が付いた描き直しで打った文字が開いたときの値へ戻った(比べる
  テストで見つけた)。下書きの signal を結ぶ形にしても、type="number" の「-」「1e」だけの打ちかけや欄が欠けた date は入力欄の
  value が '' のまま input が来るので、'' を書いて見えている文字を消した(別視点のレビューの高。jsdom では出ず Chromium で
  確かめた)。→ text / number / date は `value` を素の変数で渡して作ったときに 1 回だけ入れる(コンパイラは素の変数を動かない
  値として 1 回だけ書く)。select は表示する名前が変わるので、今の値と違うときだけ書く effect にした(React 版の制御された入力欄
  と同じ。IME の変換中に同じ値を書かない)。
- **custom エディタのフォーカスは利用側**: React 版の例は `autoFocus` で入力欄へフォーカスを置くが、Solid 2.0 の `autofocus` は
  属性を書くだけで後から足した要素にはフォーカスが動かない。Solid 版では `onSettled(() => input.focus())` で置く(デモと比べる
  テストもこの形)。段階 3 の Solid 版のドキュメントに書く。
- **effect の後半で signal を読まない**: Solid の開発ビルドが STRICT_READ_UNTRACKED を出した(エディタの入力欄の ref の signal・
  セルの高さを effect の後半や `onSettled` で読んでいた)。→ 前半(compute)で読んだ値を後半へ渡し、1 回だけの読み取りは
  `untrack` で明示した。
- **select の一覧は `Portal`(`@solidjs/web`)で描く場所へ**: 描く場所(既定はグリッドを囲むダイアログの中、無ければ body)は
  シェルが `context/portal.ts` で渡し、開いている間だけ決める(React 版の `resolvePopupContainer` と同じ)。テーマのトークンの
  写しと transform の打ち消しは core の `watchPortalTokens` / `syncPopupOrigin` をそのまま使う。
- **比べるテストで見たもの**: text(打ち始め・F2・Esc・Tab・外へのフォーカス)、複数行(修飾キー付きの Enter で改行)、number
  (「-」から打ち始めると text の入力欄)、reject(吹き出し・打ち直すと消える・Esc / 外へのフォーカスは取り消し)、select
  (矢印 / Home / End / PageDown・タイプアヘッド・押して選ぶ・打ち始め・IME の変換中の文字と確定した文字の候補)、date(文字から
  打ち始め・読めない文字の吹き出し)、checkbox(Space・Enter / F2 では開かない・読み取り専用)、custom(ctx の値・commit / cancel)、
  編集中に上へ行が足されたとき、`editorEnterMove`。Chromium のデモ(`pnpm --filter ./packages/solid dev`)では、実際のキー入力・
  CDP の IME・候補のクリック・吹き出しが見えている範囲に収まること・複数行の高さの伸びも確かめた。
- **エディタが外れるときの blur**: Chromium はフォーカスのある要素を DOM から外すと同期で blur を出す。React は DOM を書き換える
  間のイベントを止めるので届かないが、Solid は届くので、グリッドの破棄・編集中の列の固定(ペインが変わる)・editor の差し替えで
  打ちかけを確定していた(別視点のレビューの中)。→ エディタの `onCleanup` で印を立てて、その後の blur では確定 / 取り消しを
  しない(列の固定では新しいペインで開き直す = React 版と同じ。Chromium で確かめ、印を外すと再び確定することも確かめた)。
- **custom の ctx はセッションが終わった後もそのセッションの値**: getter が今の編集のセルを読んでいたので、別のセルの編集が
  始まった後に古い ctx の `rowKey` / `row` を読むと新しいセルを指した(サーバーで検査してから commit する作りで効く。
  レビューの中)。→ セッションの番号が同じ間だけ追従する memo で受ける(`editorBehavior.test.tsx`。修正を外すと落ちる)。
- **ポップアップのトークンは createEffect で測る**: 一覧の中身は後から作られるので、その class の描き直しより先に測ると、
  開いたままテーマを変えたときに利用側が `.ssg-root` で上書きしたトークンが写らなかった(レビューの低)。描画の effect の後に
  動く createEffect にした(React 版はコミット後のレイアウト effect)。select の候補は位置で使い回す(`For keyed={false}`)、
  空のエラーの文言でも吹き出しを出す(Show の when は '' を偽とみなすので箱に入れる)も直した。
- **後の段階で気をつけること(レビューの低)**: custom で開いた時点に行が無い(SSRM の読み込み中)と描かない / custom の `render`
  は開いたときのものを使う(columns を差し替えても開いている間は替えない。Solid 版のドキュメントに書く)/ style の式が
  オブジェクトから undefined になると style 属性ごと消える(autoHeight の上そろえの padding と混ぜるとき)。
- **jsdom に無いもの**: 吹き出しの置き方(上へ / 左へずらす / 折り返す)は core `utils/errorBubblePlacement` のテスト(jsdom で
  矩形を差し替える)と Chromium で見る。比べるテストの jsdom は矩形が 0 なので、React 版・Solid 版とも下のまま。

### 1-1 で分かったこと

- **中身を作る式が状態を読むと、要素が作り直されて click が落ちる**: Solid は React と違って要素を使い回さない。セルの中身を作る式が
  アクティブセルやホバーを読んでいる(または素の関数の位置 `() => item().index` が、作り直された描く行の配列の新しいオブジェクトを
  読んでいる)と、pointerdown のたびに中身の要素が作り直され、pointerup が別の要素に落ちて click が起きない(checkbox のセルが押せ
  なかった。jsdom の fireEvent.click では見つからず、Chromium の確かめで見つけた)。→ 位置・列は memo で受け、renderCell /
  renderHeader へ渡す状態(isActive / isSelected / isEditing / readOnly、見出しの width / isFiltered)は読んだときに引く形にした。
  renderCell は行・値・列・行の位置が変わったときだけ呼び直す(状態は ctx から JSX の中で読めば追従する)。回帰テスト
  `packages/solid/src/cellContent.test.tsx`(修正を外すと 2 件落ちる)。Solid 版のドキュメント(段階 3)に書く。
- **renderCell の setValue**: React 版は描き直しのたびに描いた時点の rows / rowModel を渡す(段階 0 の見直しの中-1)。Solid 版は中身を
  作り直さないので、呼ばれた時点で行のキーから今の位置を引き直して書く(行が消えていれば書かない)。
- **別視点のレビュー(1-1 の差分を、結論を渡さずに読んでもらった)**: 高 2・中 1・低 5。
  - 高-A: `renderTopBar` / `renderBottomBar` の自作のバーを、状態が変わるたびに呼び直して作り直していた(バーの入力欄に 1 文字
    打つとフォーカスが外れる)。→ バーの関数は 1 回だけ呼び、文脈(slotContext)は読んだときに引く形(`primitives/liveObject.ts`)。
    関数は memo で受けて、親が props を広げ直しても同じ関数なら作り直さない。既定のバーも Show で分けて作り直さない。
  - 高-B: エディタを位置(行:列)で作り直していたので、編集中に上へ行が足される / 並びが変わると打ちかけの文字が消えた。
    → React 版の CellEditorLayer と同じ決め方(編集の開始か、位置と行 / 列のキーが両方変わったときだけ新しいエディタ)。
  - 中-C: エディタの枠に id が無く、編集中のセルの `aria-owns` が参照切れ。枠と入力欄の名前(「(列名) を編集」)、
    `classNames.cellEditor` も無かった。→ 直した。エディタの中身(複数行・number / select / date / custom)は 1-2 で React 版と
    同じ DOM にする。
  - 低: 並べ替えで行の位置が変わるたびに renderCell の中身を作り直していた → 位置も読んだときに引く形に(行と列が変わった
    ときだけ作り直す)。`manualSorting` などの props はまだ受けない(足すときに行の並びへ渡す)。機能が無いときの開発時の
    警告は段階 2(機能を足すとき)。Escape の伝わり方と `onCellClick` の `event.currentTarget` は React と同じだった
    (`shellBehavior.test.tsx` で確認)。ref に null が来ない(ハンドルは変わらないので実害なし)。
  - 比べるテストを強めた: 要素を作り直していないか(`ctx.track`)、id を指す属性の参照切れ、自作のバーと描いた後の props の
    差し替え、右の固定列と横に仮想化される多くの列の場面を足した。回帰テスト `shellBehavior.test.tsx`(エディタのセッション
    を位置で作り直すように戻すと落ちる)。
- **比べるテストの書き方**: React の onPointerEnter は pointerover から作られ、Solid は pointerenter のリスナーを要素へ直接付けるので、
  ホバーはブラウザと同じく両方を送る(`ctx.hover`)。差は `PARITY_DUMP=<dir>` で書き出して `diff -u` で見る。

## 段階 2 の中身

`/lite` の 21 の機能を、React 版と同じ名前の部品(`<名前>Feature`)と `createSpreadsheetGrid({ features })` で差し込む形で
足す。比べるテストは場面ごとに両方へ同じ機能を差し込む(`expectParity({ features: ['export'], … })`)。4 つの PR に分ける
(2026-11-19 にユーザーへ伝えた順。フィルターは SSRM の取り直しの条件に使うので SSRM より前)。

| # | 内容 | 状況 |
| --- | --- | --- |
| 2-1 | 機能を差し込む仕組み + 表示の機能 8 つ(totalRow / pinnedRows / conditionalFormat / selectionAggregates / scrollHint / motionExtras / export / autoHeight) | 作業中(2-1a: 仕組み(`features/types.ts` / `createSpreadsheetGrid.tsx` / `features/full.ts`、比べるテストの `features`)と export = 済み。2-1b: autoHeight、2-1c: conditionalFormat、2-1d: totalRow + pinnedRows = 済み) |
| 2-2 | 操作の機能 7 つ(find / fillHandle / columnReorder / rowDrag / columnAutosize / imeDirectInput / contextMenu) | まだ |
| 2-3 | ポップアップ 3 つ(columnMenu / toolPanel / filtering) | まだ |
| 2-4 | 行のモデル 3 つ(serverSide / labelRow / grouping) | まだ |

## 段階 0 の中身

| # | 内容 | 状況 |
| --- | --- | --- |
| 0-1 | キー操作 / コピー・貼り付け / ポインタのコントローラが、イベントの時点の状態を store から読む(`getUiState`。Solid は書き込みをマイクロタスクでまとめるので、同じタスクの中で続けたイベントが古い状態を読んでいた) | 済み(コントローラ 3 つ + React 版 + 試作。`keyboardController.test.ts` と試作の `timing.test.tsx` で確認) |
| 0-2 | シェルの「セルの操作」を core のコマンド群へ(編集を始めてよいかの判断・ダブルクリック・チェックボックスの切り替え・選択したセルの削除・全選択) | 済み(core `engine/cellCommands`。renderCell の `setValue` の書き込みも。React 版はシェルの useCallback 5 つを置き換え) |
| 0-3 | オーバーレイの位置(アクティブセル / 編集中のセル / 選択範囲のペインごとの矩形)と `aria-activedescendant` の判断を core の関数へ | 済み(core `logic/cellPlacement`。クロスヘアの列の帯も) |
| 0-4 | エディタのキーの割り当て(Enter / Tab / Esc / 複数行の Enter / スクロールのキー)と密度の既定の高さを core へ | 済み(core `logic/editorKeys` / `logic/density`。React 版の `editors/editorKeyBindings.ts` は合成イベントを詰め替えるだけ) |
| 0-5 | 試作(`packages/solid`)を 0-1〜0-4 の core の関数へ差し替え | 済み(試作のシェル 903 → 828 行、エディタ 101 → 76 行。React 版の GridShell.tsx は 5,721 → 5,420 行) |
| 0-6 | 全ゲート + ハーネス(Chromium / Firefox / WebKit)+ 別視点のレビュー → PR | 済み(下の「段階 0 の確かめ」)。PR を見てもらう |

## 段階 0 の確かめ

- ゲート(見直しの修正 6a2fdd0 の後): `tsc -b` / `tsc -p tsconfig.vitest.json` 0・eslint 0 problems・`vp test` 277 files / 2,788 tests・`build:lib`・`types:check` 11 通り・`examples:check` 3 つ。試作は `pnpm --filter ./packages/solid test`(8 件)/ `typecheck` / `spike:build`(ルートの vitest と CI には入れていない)。
- サイズ: full 149.79 / lite 87.12 / standard 110.40 / ai 14.03KB(上限 150.1 / 87.5 / 110.8 / 14.6。core の関数に分けたぶん約 0.2KB 増え、full の残りは 0.31KB)。
- ハーネス(6a2fdd0 の後、新しく起動した開発サーバーで全部): Chromium 941 / 941・Firefox 865 / 865・WebKit 861 / 864(FAIL は既知の BR-3 = t-priority の 1 件と BR-4 = t-fill の 2 件だけ。1.2.0 と同じ数)。
- 別視点のレビュー(このブランチの差分を、結論を渡さずに読んでもらった)で、このブランチの変更による回帰が 2 件(公開版には無い):
  - 高-1: div などの custom エディタが keydown の中で `ctx.commit` / `ctx.cancel` を呼ぶと、同じ keydown が描き直す前のシェルまで上がってきて、store の今の値だけで「編集中か」を見ていたため Enter で同じセルの編集が開き直り、Escape で選択まで消えた。→ core `controllers/liveUiState` の `isEditingAtEvent`(描いた時点か今のどちらかで編集中なら扱わない)を keyboard / clipboard で使う。
  - 中-1: `renderCell` の `ctx.setValue` を並びが変わった後に呼ぶと、描いた時点の行の位置を今の並びで読んで別の行へ書いた(初回のマウントでは何もしなかった)。→ 書き込みを純粋な `writeCellValueTo` に分け、React 版は描いた時点の `rows` / `rowModel` で書く(元の動き)。Solid 版の試作は今のところ `cells.writeCellValue`(今の値)のままで、段階 1 で描いた時点の値を渡す形にそろえる。
  - 回帰テスト `SpreadsheetGrid.sharedCore.integration.test.tsx`(2 件)と `keyboardController.test.ts`(1 件)。修正を外すと落ちることを確かめた。
  - 低(直さない): 同じタスクの中で JS から続けて送った keydown が、今の状態から動くようになった(React は離散イベントごとに描き直すので実際の入力では変わらない)/ `cellCommands` は `createGridEngine` に入れずシェルが作る(`T extends object` の制約のため)。