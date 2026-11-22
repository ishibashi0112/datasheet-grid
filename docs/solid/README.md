# Solid 版の作業記録

2026-11-17 に Solid 2.0 の正式版(solid-js / @solidjs/web 2.0.0)が出たのを受けて、core の上に Solid のシェルを載せた
`@ishibashi0112/spreadsheet-grid-solid` を作る。2026-11-17 にユーザーが「Solid 版を作る」を選んだ(試作の報告と見積もりは
Claude Doc「Solid 2.0 版の試作の報告」)。試作の中身と分かったことは `docs/solid/prototype.md`(段階 3-3 で `packages/solid/README.md` から移した。そちらは npm の README)。

この表は進み具合の記録も兼ねる。コミットごとに「状況」を更新して push する(週の使用量の上限などで途中で止まっても、
別のセッションがこの表とコミットから再開できるように)。

## 段取り

| 段階 | 中身 | PR | 公開 |
| --- | --- | --- | --- |
| 0 | core へ寄せる整理(React 版の公開 API と見た目は不変)+ 試作の `packages/solid`(非公開) | 1 | React 版は patch / minor に混ぜる |
| 1 | Solid 版の本体(React の `/lite` の機能なし = `createSpreadsheetGrid({ features: {} })` と同じ範囲: 見出しとセル・列幅・ソート・ツールチップ・エディタ 6 種・入力の検査・行の選択・展開行・ARIA) | 3 | — |
| 2 | 21 の機能(`/lite` の部品と同じ名前で。ラベル行・SSRM・行のグループもここ = React 版でも機能のため) | 3〜4 | — |
| 3 | 開発時の警告と CI・ハーネス(3 ブラウザ)・`types:check`・`size:check`・ドキュメント・サンプル(下の「段階 3 の中身」) | 3 | `@ishibashi0112/spreadsheet-grid-solid` 0.1.0(React 版と core の 1.2.1 の後) |
| 4 | 品質を React 版にそろえる: React 版と同じ物差しで測り直し(段 1)、直して出し(段 2)、残件の大きなものを 0.2.0 へ(段 3)。進み具合と所見は `docs/audits/2026-11-22-solid-quality/README.md` | 段ごと | 段 2 で React 版と core の 1.2.2 + Solid 版の 0.1.1 |

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
| 2-1 | 機能を差し込む仕組み + 表示の機能 8 つ(totalRow / pinnedRows / conditionalFormat / selectionAggregates / scrollHint / motionExtras / export / autoHeight) | 済み(PR #65、2026-11-19 マージ。2-1a: 仕組み(`features/types.ts` / `createSpreadsheetGrid.tsx` / `features/full.ts`、比べるテストの `features`)と export、2-1b: autoHeight、2-1c: conditionalFormat、2-1d: totalRow + pinnedRows、2-1e: selectionAggregates、2-1f: scrollHint、2-1g: motionExtras) |
| 2-2 | 操作の機能 7 つ(find / fillHandle / columnReorder / rowDrag / columnAutosize / imeDirectInput / contextMenu) | 済み(PR #66、2026-11-19 マージ。2-2a: find、2-2b: imeDirectInput、2-2c: columnAutosize、2-2d: columnReorder、2-2e: rowDrag、2-2f: fillHandle、2-2g: contextMenu。別視点のレビュー = 高 1・低 1 を直した) |
| 2-3 | ポップアップ 3 つ(columnMenu / toolPanel / filtering) | 済み(PR #67、2026-11-20 マージ。2-3a: 行の絞り込み(グローバル / 列フィルターの適用・上部バーの検索欄・manualFiltering / manualSorting)、2-3b: 列メニュー、2-3c: 列フィルターのポップアップ、2-3d: ツールパネル(フィルター / 列 / 並び替えのタブ)とフィルターのチップのバー = 済み。別視点のレビュー = 中 1・低 2 を直した) |
| 2-4 | 行のモデル 3 つ(serverSide / labelRow / grouping) | 作業中(2-4a: 行のグループ化 = 済み、2-4b: ラベル行 = 済み、2-4c: サーバーサイドの行モデル = 済み。別視点のレビュー = 高 1・中 1 を直した。次は PR) |

### 2-3 で分かったこと

- **core と React 版は変えていない**(2-3a): 列フィルターの段(core `engine/columnFilterStage`)と相対日付プリセットの見張り
  (`controllers/dateRolloverStore`)はエンジンが機能から作り、グローバルフィルターの適用は core のランナー
  (`controllers/globalFilteredOrder`。5 万行を超える表は時間分割)を Solid 版の `primitives/filterOrder.ts` でつなぐだけで足りた。
- **入力の遅延は無し**: React 版は列フィルターと検索の文字を `useDeferredValue` で遅らせる(チェックを続けて押したときに
  行の絞り込みを後回しにするため)。Solid には同じ仕組みが無いので、その場で絞り込む(大きな表はランナーの時間分割なので入力は
  詰まらない。10 万行のデモで、打っている間に「適用中 n%」の印が出て結果へ変わることを Chromium で確かめた)。
- **同じ値の組なら計算し直さない**: グローバルフィルターの計算の key(rows / 恒等の並び / 対象の列 / 文字)は、列の解決が
  別の理由で計算し直されても新しくならないよう、項目を比べる `equals` 付きの memo にした(React 版の `useMemo` の依存と同じ)。
- **上部バーの検索欄**: 値は今の値と違うときだけ書く(セル内検索のバーと同じ。変換中の文字を消さない。Chromium の IME で確認)。
  利用側が JSX で渡す左アイコン(`globalFilterIcon`)は、prop を読むたびに要素が作り直されるので memo で 1 回だけ読む。
- **列メニューも core のコントローラのまま**(2-3b): 位置・閉じ方・フォーカス・↑ ↓ の移動は core の
  `controllers/columnMenuController`、項目の処理は engine の `columnCommands`(段階 1 でつないだもの)で、Solid 版は
  ポップアップの部品(`view/ColumnMenuPopover.tsx`。React 版と同じ DOM)と見出しの ⋮ を足しただけ。開いたまま別の列へ
  切り替えたときの小メニューの閉じ方は、React 版の「列が変わったら state を戻す effect」ではなく、開いた列のキーと一緒に
  覚えて比べる形にした(effect の中で signal へ書かない)。フィルター… / 並び替えを管理… などの、ほかのポップアップを開く
  項目は 2-3c / 2-3d でつなぐ。
- **列フィルターのポップアップも core のまま**(2-3c): 位置・高さ・閉じ方・開いた後のフォーカス・下書きは core の
  `controllers/filterPopoverController`、候補は `selectOptionsCollector`(5 万行までその場、超えたら時間分割)と
  `asyncSelectOptionsSource`(`getFilterOptions`)、派生値と操作は engine の `filterPopoverCommands` で、Solid 版は部品
  (`view/ColumnFilterPopover.tsx` / `ColumnFilterPopoverHost.tsx` / `FilterDateField.tsx`。React 版と同じ DOM)と
  `primitives/filterPopover.ts` を足しただけ。コントローラの `update` は「パネルの要素の signal」も読むふつうの effect で渡す
  (高さの測り直しと開いた後のフォーカスの予約はパネルが描かれてから要る。React 版はコミット後のレイアウト effect)。
- **ref の中で `onCleanup` は書けない**: Solid 2.0 は ref の関数の中の `onCleanup` を止める(CLEANUP_IN_FORBIDDEN_SCOPE)。
  要素を外へ渡す ref(入力欄の控えなど)は、部品の本体で後片付けを登録して ref の関数を返す小さな工場(`createHeldRef`)にした。
- **チェックボックスは制御された形に**: Solid は `checked` を属性ではなくプロパティで書くので、押したときにブラウザが変えた
  チェックを戻してから操作を呼ぶ(`primitives/inputValue.ts` の `controlledToggle`。中間の印 `indeterminate` も同じく)。
  比べるテストの DOM の正規化は、`checked` を属性ではなくプロパティで比べる(React は描いたときに属性も書く)。
- **遅延読み込みはまだ無し**: React 版はポップアップの部品を別のチャンクにして暇なときに読む(`preloadGridPopups`)。Solid 版は
  今は本体に入れたまま(大きさを測る段階 3 で決める)。候補の控えを残すため、ホストの部品は閉じている間も外さない。
- **行のフェードインは比べるテストで止める**: animateRows のフェードインは「前に行が現れてから 1 秒の間は付けない」(B-07)ので、
  手順の間の時間で付く / 付かないが変わる(1.1 秒待つと React 版と Solid 版はそろう)。行を出し入れする場面は `animateRows: false`。
- **比べるテストの時間切れに注意**: 1 つの場面で手順が多いと vitest の既定の 5 秒を超え、時間切れの場面の React 版の
  ポップアップが body に残って、次の場面の控えに混ざった(差の原因が分かりにくい)。手順の多い場面は `20_000` を渡す。
- **ツールパネルも core のまま**(2-3d): 位置・幅・閉じ方(外を押す / Escape。列フィルターのポップアップが開いていれば先に
  それを閉じる)・開いたまま開き直したときの数は core の `controllers/toolPanelController`、ヘッダーを掴んで動かすのは
  `panelHeaderDragController`、タブの中の操作は engine の `columnCommands`(段階 1 でつないだもの)で、Solid 版は部品
  (`view/ToolPanel.tsx` / `FilterManagementPanel.tsx` / `ColumnChooserPanel.tsx` / `SortManagementPanel.tsx` /
  `GridFilterChipBar.tsx`。React 版と同じ DOM)と `primitives/toolPanel.ts` / `filterManagement.ts` を足しただけ。React 版と
  同じく、filtering と columnMenu のどちらも無いときはツールパネルを差し込んでも動かさない。
- **パネルは開いている間だけ描く**: 開いたときのフォーカス(選ばれているタブへ)は部品の `onSettled` で、開いたまま開き直した
  ときの枠の光り(`flashTick` が増えたとき)は、開いたときの値を控えて比べる effect にした(開いたときの値では光らせない)。
- **一覧は keyed の `For`**: タブ・フィルターの一覧・列の一覧・並び替えの基準は、どれもキーで行を使い回す(押した直後に行の
  要素が作り直されるとフォーカスが外れる)。列の一覧の行の区分(左固定 / 中央 / 右固定)は、区分の `For` の値ではなく項目の
  `pane` から読む(`For` の子の関数の中で親の値を読むと Solid 2.0 の開発時の警告 STRICT_READ_UNTRACKED になる。Chromium の
  確認で見つけた)。「フィルターを追加」の select は選んだらすぐ空に戻す(React 版と同じ)。
- **行のグループ化の部分は 2-4 で**: 列の一覧の「グループ化中」の印、並び替え / フィルターの一覧のグループ元の列は、grouping を
  つなぐ 2-4 で足す(今は groupColumns を渡していない。→ 2-4a でつないだ)。React 版にある「ツールパネルが無いときに `openFilterManager` を呼んだ
  ときの開発時の警告」は段階 3 の開発時の警告でまとめて足す(→ 3-1 で足した)。
- **別視点のレビューで直したもの**: (中)種別を推定した列('auto')の列フィルターで、下書きを変えるたびに開いている列が
  新しいオブジェクトになり(core の `resolveOpenedFilterColumn` が `{ ...column, filterType }` を作る)、相対の期間のチップと
  差し替えた日付欄が作り直されてフォーカスが外れていた。開いている列は列のキー・種別・列の定義が変わったときだけ作り直し、
  チップの `For` は id で使い回す。(低)チップや一覧から列へ移った直後に表を外すと、見出しを待つ rAF が外した表のポップアップを
  開いてフォーカスを奪っていた(React 版は外すと ref が null になって止まる。Solid 版の ref は外した後も要素を指すので、rAF を
  控えて後片付けで止める)。(低)利用側が props を signal の広げで渡すと、ポップアップの部品の本体で描く場所を決めるときの
  `props.popupContainer` の読み取りが開発時の警告 STRICT_READ_UNTRACKED になっていた(追跡しない読み取りにした)。どれも
  再発を防ぐテストを足した(比べるテスト 1 つ + `shellBehavior.test.tsx` に 2 つ)。
- **React 版の既存の不具合を 1 つ見つけた(直していない)**: ツールパネルを開いたまま開き直したときの枠の光り
  (`ssg-toolpanel--flash`)は、`styles.css` の後ろにあるポップアップの出現のアニメ(`.ssg-popover { animation: ssg-pop-in … }`。
  0.46.1 の M-7 で追加)が同じ詳細度で上書きするので、0.46.1 から光っていない(クラスは付くが `animationend` が来ないので
  残ったまま)。Solid 版は同じ CSS を使うので同じ見た目。直すのは React 版の CSS の変更になるので、ユーザーに聞いてから別に行う。

### 2-2 で分かったこと

- **core と React 版は変えていない**: 7 つの機能はどれも core のコントローラ(findController / imeInputController /
  columnAutosizeRunner / columnHeaderDragController / rowDragController ほか)をそのまま使い、Solid 版のシェルでつなぐだけで足りた。
  行をドラッグで離したときのアクティブセルの列の選び方(React 版の `GridShell.tsx` の `commitRowMoveFromDrag`。1.0.2 の RV-F3 /
  QA-6)は、React 版と同じ処理を Solid 版のシェルにも書いた(core へ寄せるのは React 版のコードを変えることになるので、段階 3 で
  決める)。
- **命令的 API の `moveRow` は機能が無くても動く**: React 版は行の移動の確定(`commitRowMove`)をシェルに置くので、`/lite` の
  機能なしでも `moveRow` が動く。Solid 版は段階 1 で何もしない関数にしていたので、2-2e で React 版と同じにした(比べるテストの
  機能なしの場面で確かめた)。
- **ドラッグの後の滑り込みは描き終えた後の effect で**: 列 / 行のドラッグのコントローラは、確定した直後の 1 フレームの間だけ
  滑り込みの用意を残す(次の `requestAnimationFrame` で捨てる)。Solid のふつうの effect は書き込みの後の同じマイクロタスクで
  走るので、`createEffect(() => paneLayout(), applyReorderSettle)` で間に合う(Chromium で列の FLIP を確かめた)。行は React 版と
  同じく行のキーで要素を使い回すので、`animateRows` の CSS の transition で滑る(コントローラの FLIP は差が 0 で何もしない。
  React 版も同じ)。
- **コントローラが DOM へ直接書く要素は作り直さない**: 行のドロップのガイド線のキャップの有無(中央のペインが行見出しを持つか)を
  呼ぶ側の式で読んでいたため、列幅などでペインの解決が変わるたびに要素ごと作り直し、コントローラが書いた位置が消えていた
  (比べるテストで見つけた)。class の中で読む形にした。
- **比べるテストで気をつけること**: jsdom の要素の矩形はどれも同じ大きさなので、列のドラッグはいつも左の固定ペインにいる扱いに
  なる(中央の中の並べ替えと実際の位置は Chromium で見る)。行のドラッグの縦の位置は行の高さの計算で決まるので jsdom でも通る。
  ドラッグのゴーストはライトのテーマでは `ssg-` の class が無いので、body 直下の要素として `[data-grid-drag-ghost]` も控える
  ようにした。見出しの普通のクリックは列の選択で、ソートは Shift + クリック。フィルハンドルのダブルクリックは押した時刻で決まる
  ので、比べるテストではイベントの `timeStamp` をそろえて送る(React 版の結合テストと同じ)。
- **表の状態が変わるたびに新しいオブジェクトになる値は、項目ごとに memo で受ける**: core の縦のレイアウトの答え
  (`resolveVerticalLayout`)は呼ぶたびに新しいオブジェクトを返す(中の `rowMetrics` などは同じ参照)。フィルハンドルの
  埋めたあとのボタンの位置をそれでまるごと読むと、別のセルを押しただけで位置を計算し直し、続いてコントローラがボタンを消した
  ときにもう 1 回計算していた(Solid の開発時の EFFECT_RELAY_TEAR)。項目ごとの memo にし、ルートの `ssg-root--filling` も
  真偽値の memo にして、Chromium のデモで警告が出ないことを確かめた。React 版は描くたびに計算し直すので、この差は無い。
- **右クリックメニューの params を作る関数は React 版の写し**: 右クリックの対象を DOM から逆引きして params を作る 2 つの関数
  (React 版の `features/contextMenu.tsx` の `buildBodyContextMenuParams` / `buildCellContextMenuParams`)はフレームワークに
  依らないが、React 版の機能のファイルにあるので、Solid 版の `features/contextMenu.ts` へ同じ処理を写した(core へ寄せるかは
  `commitRowMoveFromDrag` と一緒に段階 3 で決める)。シェルの配線(キーボードから開いた直後の contextmenu を 1 秒止める、
  ポップアップを出している間はシェルを Tab の止まる先から外し、キー操作と貼り付けを止める、Escape をグリッドが受ける条件)は
  React 版の `GridShell.tsx` と同じ。
- **関数が変わったことを合図にするコントローラには、変わる関数を渡す**(別視点のレビューの高): 行のドラッグのコントローラは、
  引いている間に掴んだ行の探し直しの関数(`locateDragRow`)が変わると、行が変わったとみなして掴んだ行を探し直す(1.0 前の最終
  チェック FC-12。行が増えたら新しい位置へ、消えたらやめる)。React 版は `useCallback([rowModel, hasRowKeys])` で行の並びが
  変わるたびに別の関数になるが、Solid 版は呼んだ時点の行を読む 1 つの関数にしていたので、引いている間に行が増えると別の行が
  動き、掴んだ行が消えても止まらなかった。行の並びの memo で作り直すようにし、探し直しが掴んだ行の印を新しい行番号の要素へ
  付け直せるよう、update を描いた後の effect にした(比べるテストに「引いている間に行が増える / 消える」を足した)。ほかの
  コントローラ(fill / find / contextMenu / columnHeaderDrag)は関数の同一性を合図にしていない。
- **描かれた後に合わせ直すコントローラには、描かれたことを伝える**(レビューの低): IME の入力受けは描かれていないセルへは
  合わせられず、次の update で合わせ直す。React 版は描くたびに update するのでスクロールで描かれた後に合うが、Solid 版は
  スクロールでは args が変わらず、Ctrl+End などで画面の外へ跳ぶと前のセルの位置に残っていた(変換を始めると直る)。
  アクティブセルが描かれているかの memo(aria-activedescendant と共用)を args の関数で読むようにした。なお React 版でも、
  PageDown のように先読みの行(描かれている)へ移ってからスクロールするときは、入力受けがスクロール前の位置に残る(Chromium で
  16px。変換を始めると直る。core の imeInputController の待機中の位置合わせの話で、Solid 版はこの場面では合う)。直すかは
  段階 3 で決める。
- **ref の関数の中では `onCleanup` を呼べない**(Solid 2.0 の CLEANUP_IN_FORBIDDEN_SCOPE): コントローラの外側クリックの判定に
  使うボタン / メニューの要素の控えは、部品の本体で `onCleanup` を登録して外したときに消す(React 版の ref の null)。

### 2-1 で分かったこと

- **機能の代役は要らない**: React 版は hook の呼ぶ順番を変えないために、無い機能にも代役の hook を入れる(`features/resolve.ts`)。
  Solid には順番の決まりが無いので、シェルは `features.X` があるときだけ部品を作る / 描く。`DISABLED_FEATURE_PROPS` は、機能の
  有無より前に行や列の形を決める prop(`autoHeight`)と、既定でオンの prop を機能なしで止めるもの(`motionExtras` の
  `showCopyRange` など)だけ。エンジン側(core)の代役は React 版と同じく `createGridEngine` が入れる。
- **機能だけの文言は文脈で渡す**: React 版はシェルが機能の文言を重ねた表を props で部品へ渡す所がある。Solid 版は
  `mergeFeatureLocaleDefaults(features)` で重ねた表を文脈(`GridLocaleTextContext`)に置き、部品は
  `useFeatureLocaleText<typeof DEFAULT_…_LOCALE_TEXT>()` で型だけ足して読む。
- **全部のセルが読む値は memo に畳む**: `vertical()`(縦のレイアウト)や `autoHeightActive` のような大きな値をセルごとに読むと、
  1 つの書き込みに数千の購読が付き、Solid の開発ビルドが HUGE_FAN_OUT を出す(2,000 から)。シェルで真偽値だけの memo
  (`autoHeightActive`)にし、セルの中でもその列の判断を 1 つの memo(`autoHeightFlags`)にまとめた。
- **DOM を書いた後に読むコントローラは 'effect' でつなぐ**: 変わったセルのフラッシュ(core の changeHighlightController)は
  書き換わったセルの文字を旧値へ戻してから補間するので、`connectController(…, 'effect')`(セルの文字を書き終えた後。同じ
  マイクロタスクの中なので画面には出ない)。行の高さの実測(autoHeightMeasurer)も同じ。
- **測り直しの警告**: 合計行 / 固定行を出し入れすると、見える高さ(clientHeight から下端の行を引く)の測り直しで
  EFFECT_RELAY_TEAR が出る(既知の列の仮想化のものと同じく「測る代わり」。packages/solid/README.md)。
- **比べるテストで気をつけること**: React の `onPointerLeave` は `pointerout` から作られるので、`fireEvent.pointerLeave` だけでは
  React 側が動かない(出るときは `pointerout` も送る。入るときの `ctx.hover` と同じ)。jsdom の `requestAnimationFrame` の時刻は
  `performance.now()` とずれるので、数値のトゥイーンの途中の値は決まらない(トゥイーンは Chromium で確かめた)。`ctx.track` は
  要素ができてから呼ぶ(無いうちに呼ぶと以後ずっと「作り直し」になる)。大きな選択の集計(時間分割)は待ってから控える。
- **別視点のレビューで直したもの**: 1 セルをコピーした後の Escape をグリッドが受けていなかった(escapeClaim の条件に
  コピー範囲を足し忘れ。ダイアログの中では 1 回目で閉じてしまう)。合計行 / 固定行のセルの中身が列の幅や位置が変わるたびに
  作り直されていた(列や位置を memo で受けていなかった。renderCell の中の要素のフォーカスが消える)。どちらも比べるテストに
  足した(Escape の既定の動きを止めたか / `ctx.track` で列の幅の前後)。
- **残した違い**: 同じ行の別の列の値が変わると、Solid 版はセルの中身の span を作り直す(行のオブジェクトが変わると
  `valueFormatter` を呼び直すため。React 版は仮想 DOM の差分で span を使い回す)。動いている数値のトゥイーンはそこで最後の値へ
  飛ぶ(見た目だけの差)。
- **2-4 で確かめること**: React 版の `DISABLED_FEATURE_PROPS` は `undefined` を入れて prop を切る(`dataSource` / `labelRow`)。
  Solid の `merge(props, overrides)` で `undefined` が元の値を上書きするかを、serverSide / labelRow を移すときに確かめる。

### 2-4 で分かったこと

- **core と React 版は変えていない**(2-4a): グループのツリーと集計(core `logic/grouping`)、自動グループ列を足す列の解決
  (core `engine/columnLayout` の `createColumnResolver(features)`)、グループ行を挟む行のモデル(core `engine/rowPipeline`)、
  Enter / Space の開閉(core `controllers/keyboardController`)、命令的 API(`setGroupCollapsed` / `expandAllGroups` /
  `collapseAllGroups` / `getGroupRows`)、列メニューのグループ化 / 外す(core `engine/columnCommands`)はどれも core のまま。
  Solid 版は機能の部品(`features/grouping.ts` = core の 2 つ + グループ行の部品 `view/GridBodyGroupRow.tsx`)とシェルの
  つなぎ(グループ元の列をグローバルフィルター / 列フィルター / ツールパネルの並び替えと列の一覧へ、件数はグループ行を除く
  データ行の数、`includeGroupingInState`)だけを足した。
- **グループ行もキーで対応させる**: 本体の行は keyed の `For`(キー = rowModel の `getRowKey`)。グループ行のキーは core の
  `groupRowKey`(データ行と名前空間が違う)なので、同じ項目がグループ行とデータ行の間で入れ替わることはない。項目ごとに
  `getGroupRow` を memo で見て、グループ行なら機能の部品、データ行なら今までの行を描く(グループ行では `getRow` が undefined)。
  開閉・並べ替え・行の追加でもグループ行の要素は同じまま(比べるテストの `ctx.track`)。
- **残した違い**: 行が現れたときのフェードイン(animateRows)の印 `ssg-body-row--enter` は、React 版は行の className が
  変わる(チェックを入れるなど)と描き直しで外れ、Solid 版は animationend(無ければ 1.5 秒後)まで残る(見た目の終わりは同じ)。
  jsdom には animationend が無いので、比べるテストの該当の場面は `animateRows: false` にした。
- **ラベル行も core のまま**(2-4b): 配置(`resolveLabelRowLayout`)・表示順とセクション(`createLabelRowModel`。sortMode /
  keepEmptySections)・縦の高さ(`labelRow.height`)・固定の帯の位置(`resolveStickyLabel`)・行番号と番地(`resolveDataRowNumber` /
  `createDataRowNumberer`)・エクスポート / 検査の除外(core `engine/exportCommands` / `gridApi`)はどれも core。Solid 版は機能の
  部品(`features/labelRow.ts` = core の 6 つ + `view/GridBodyLabelRow.tsx` / `view/GridStickyLabelLayer.tsx`)とシェルのつなぎ
  (列フィルターの候補と 'auto' の推定からラベル行を外す、固定の帯の高さ = `stickyTopInset` をアクティブセルの追従と
  `scrollToRow` へ、列メニューのグループ化はラベル行の表では出さない、ラベル行へのホバーで行 / 列の帯を外す)だけ。
- **ラベル行の中身を作り直すとき**: 本体のラベル行は keyed の `For` の項目ごとに 1 回だけ `render` を呼ぶ(ラベル・件数・位置は
  読んだときに引く)。固定の帯は 1 つの要素を使い回すので、別のラベル行に替わったとき(行のキーが変わったとき)と `render` が
  変わったときに中身を作り直す(React 版は記述子が変わると `render` を呼び直す。Solid で作り直さないと、`render` の本体で読んだ
  値が前のラベル行のまま残る)。
- **残した違い(通知の順番)**: 1 回の操作で別々の通知が呼ばれるとき(見出しで並べ替えたときの `onStateChange` と、アクティブセル
  の行が替わった `onActiveCellChange` など)、その順番は React 版と違うことがある。React 版は passive effect を宣言の順に走らせ、
  Solid の effect は宣言の順に走るとは限らない(並べ替えでは Solid 版が `onStateChange` を先に呼ぶ)。それぞれの通知の中身と
  回数は同じ。比べるテストのその場面は片方の通知だけを控え、状態は `getState` で見る。
- **開発時の警告は段階 3**(→ 3-1 で足した): React 版の「行のグループ化とラベル行は併用できない」の警告(`console.warn`)は、ほかの開発時の警告
  (足りない機能の警告など)と一緒に段階 3 で足す(Solid 版にはまだ開発時の警告の仕組みが無い)。サーバーサイドの警告
  (`rowGroup` は使えない・auto-height は使えない・`moveRow` は何もしない)も同じ(動き = 無視する / 何もしないは React 版と同じに
  してある)。
- **サーバーサイドの行モデルも core のまま**(2-4c): ブロックの読み込みとキャッシュ・query の変化で捨てて読み直す・取得の失敗と
  再試行・書き戻しの楽観更新と巻き戻し(core `controllers/serverSideRowModel`)、query の組み立てと debounce
  (`rowPipeline.resolveServerSideQuery` / `engine.serverSideQueryStore`)、セルの保存の印(`controllers/saveStatusController`)、
  届いた行のフェードイン(`controllers/rowEnterController`)はどれも core。Solid 版は機能の部品(`features/serverSide.ts` =
  core の 1 つ + `primitives/serverSide.ts`(コントローラのつなぎ)+ `view/GridServerSideErrorBars.tsx` /
  `view/GridBodySkeletonRow.tsx`)とシェルのつなぎ(rows を空に、編集できるか = `updateRows` が無ければ編集しない、書き込み口を
  エディタ / 貼り付け / Delete / チェックボックス / フィルハンドルへ、query が変わったら先頭へ戻して展開行を閉じる、描く窓の
  行を行モデルへ知らせる、元に戻す / 行の追従 / 合計行の集計 / 列メニューのグループ化はサーバーサイドでは止める)だけ。
- **読み込み中の行のキー**: 本体の keyed の `For` のキーを、届いていない行は `__ssg_skeleton__:<位置>`(React 版の key と同じ。
  データ行のキー = 1 始まりの id などとぶつからない)にした。届くとキーが変わって本物の行の要素に替わり、行モデルの
  フェードイン(skeleton → 行の差し替え)が React 版と同じ DOM の変化で動く。
- **機能が無いときは dataSource を外す**: `createSpreadsheetGrid` の `merge(props, { dataSource: undefined })` で `undefined` が
  元の値を上書きすることを確かめた(機能なしの構成の比べるテストで、clientSide の空の表になり `getRows` を呼ばない。React 版の
  `DISABLED_FEATURE_PROPS` と同じ)。
- **別視点のレビューで直したもの**(2-4): 行が少ない(描く窓がビューポートを測る前後で変わらない)サーバーサイドの表で
  `getRows` を一度も呼ばず、読み込み中の行のまま止まっていた(最初の update が onSettled まで遅れるため、シェルの effect の
  描く窓の知らせが先に届き、最初の update の query の同期で取得の予約ごと捨てられていた。React 版は update = レイアウト
  effect → 知らせ = passive effect の順)。`primitives/serverSide.ts` で最初の update より前の知らせを控えて直後に渡す。
  本体のラベル行の `render` の本体で `rowKey` を読むと、どのデータ行の書き換えでも中身を作り直していた(行のキーを行モデル
  から直接読んでいた。値の memo で受ける)。どちらも比べるテストに足した。
- **途中で dataSource を渡すときは作り直す**: 行の数とキャッシュの大きさは作ったときの `dataSource` で決まる(React 版と同じ。
  API リファレンスの「実行時にモードを切り替える場合は `key` を変えて再マウント」)。デモの「サーバーサイド」は keyed の `Show` で
  作り直す。
- **開発時の性能の知らせ(EFFECT_RELAY_TEAR)**: query が変わったとき、行モデルのコントローラは effect の中で新しい行モデルを
  出すので、query と行モデルの両方を読む effect(フィルハンドルのつなぎなど)が 2 回走る。0 件になったときの選択を詰める
  effect も同じ。React 版も同じ所で 2 回描く(レイアウト effect / effect の中の setState)ので、列の仮想化の計測と同じく受け入れる
  (Chromium のデモの確かめでもこの 2 つだけ)。
- **比べるテスト**(`src/parity/serverSide.parity.test.tsx`): サーバーは答えを手で返す擬似のもの(依頼を溜めて respond / fail)
  なので、読み込み中の行・依頼の範囲と query・失敗のバーも比べられる。時間で外れる印(届いた行のフェードイン 1.5 秒・保存できた
  ✓ 1.3 秒・スクロール中の印 0.12 秒)は、外れる時刻が両者の待ち方で前後するので、最初のテスト以外は `motion: 'off'` にし、✓ と
  スクロール中の印は外れるまで待ってから次へ進む。

## 段階 3 の中身

公開の準備。2026-11-20 にユーザーがおすすめの案を選んだ: 3-1 → 3-2 → 3-3 の順に PR を出し、React 版と core を 1.2.1 で出して
(前に決めた 12 本のアプリの確かめ直しと npm の 1.2.0 との比べの後)から、Solid 版を 0.1.0 で出す。Solid 版の版は 0.1.0 から
独自に数え、core の内部の部品を使うので依存する core の版に固定する。React 版と同じ処理を写している 2 つ(右クリックメニューの
引数を作る関数、行ドラッグを離した後の列の選び方)は今は core へ寄せない(React 版のコードが変わるため)。React 版の既知の低
(PageDown の後に IME の入力受けが 16px ずれる)は段階 3 では直さない。ポップアップの遅延読み込みは 3-3 で大きさを測ってから
決める。
12 本のアプリの確かめ直しと npm の 1.2.0 との比べは 2026-11-21 に済み(回帰なし。記録は `docs/audits/2026-11-09/README.md` の
「1.2.1 の確かめ直し」)。
1.2.1 の後に、0.1.0 の前に実際のアプリで確かめるかをユーザーが決め、「アプリを 6 本作って確かめる」を選んだ(2026-11-21)。
2026-11-22 に済み: Solid だけの退行(操作・見た目・速さ)は無く、Solid 版だけの所見は高 1(S5-01 ハンドルの時点)・中 1(S1-01
store で持つ行)・低 12、React 版も同じは低 16。記録は `docs/audits/2026-11-22-solid/README.md`、アプリは
`audit/dogfood/2026-11-22-solid/`。2026-11-22 にユーザーが「Solid 版だけの所見を直す」を選び(React 版も同じだった低 16 件は
React 版の次の版へ)、0.1.0 の前に直した: ハンドルを部品を作った時点で ref へ渡し、メソッドが呼ばれたら描き終わった後の最初の処理
(コントローラの最初の update・store の購読など。`primitives/mountGate.ts` の `onGridMounted`)を先に済ませる(S5-01)/
`connectController` の update を untrack の中で呼ぶ(通知の中で signal を読んだときの STRICT_READ_UNTRACKED。S2-01)/ rows が store の
ときの開発時の警告(S1-01)/ 本体のセルと checkbox のセルに空の onclick(Chromium のタッチの位置合わせを React 版と同じに。
S6-01。`primitives/clickTarget.ts`)/ テーマの CSS のコメントのパッケージ名(S3-05)/ npm の README の「Solid で気をつけること」
(store / `flush()` / テスト / SSR / URL / 展開行 / props の共有 / 開発時の知らせ)。

| # | 内容 | 状況 |
| --- | --- | --- |
| 3-1 | 開発時の警告(React 版と同じ条件・文言・回数)と、Solid 版の型チェックとテストを CI へ | 済み(警告と、React 版と比べるテスト 8 本・CI の手順。別視点のレビュー = 中 1・低 1 を直した。Solid 版の全体 145 / 145) |
| 3-2 | 実ブラウザのハーネス(`audit/harness` の確認)を Solid 版でも Chromium / Firefox / WebKit で回し、違いを直す | 済み(ハーネスを Solid 版でも回せるようにした。違い 5 つと別視点のレビューの指摘を直した(core に省略できる引数を 1 つ足した)。Solid 版は遅延読み込みの 25 項目を除いて Chromium 927 / 927・Firefox 875 / 876・WebKit 872 / 875、React 版は Chromium 952 / 952・Firefox 876 / 876・WebKit 872 / 875。WebKit の 3 件は両方とも既知の BR-3・BR-4、Firefox の 1 件は下の「速さ」の時間の確かめ)。PR を見てもらう |
| 3-2b | 速さの違い(3-2 で測った、100 万行で遠くへスクロールしたときに Solid 版が約 1.5〜2 倍かかる)を直す。2026-11-21 にユーザーが「3-3 の前に別の段階で直す」を選んだ | 済み(本番ビルドの Chromium で、近いスクロールは React 版 20ms・直す前の Solid 版 27ms・今 22ms、遠くへ飛ぶスクロールは React 版 54ms・直す前 79ms・今 75ms。Firefox の遠くへは React 版 55ms・直す前 118ms・今 114ms。遠くへの残りの差は、2026-11-21 にユーザーが「今の直しで区切って 3-3 へ」を選び、記録だけにした。ハーネスは Solid 版 Chromium 927 / 927・Firefox 875 / 876(3-2 と同じ t-aggregates の時間の 1 件)・WebKit 872 / 875(既知の BR-3・BR-4))。PR を見てもらう |
| 3-3 | パッケージの形(dist と型)・`size:check` / `types:check` に Solid 版・StackBlitz のサンプル・README とドキュメントサイトの「Solid で使う」・ポップアップの遅延読み込み(測ってから決める) | 済み(3-3a 済み: 公開の型と関数を React 版にそろえ、dist・「solid」条件・CSS・`size:check` / `types:check`。3-3c 済み: ポップアップの遅延読み込み(2026-11-21 にユーザーが「React 版と同じく後から読む」を選んだ)。3-3d 済み: サンプル `examples/solid` と npm の README(サイトの「Solid で使う」とリンクは 0.1.0 の公開と一緒に出す = 2026-11-21 ユーザー判断)。別視点のレビュー 2 系統の指摘を直した。ハーネスは Solid 版で Chromium 952 / 952(遅延読み込みの 25 項目を含む)・Firefox 876 / 876・WebKit 872 / 875(既知の BR-3・BR-4。React 版の 3-2 の結果と同じ数)。ルートのゲートは全部緑。PR #73 で main へ(2026-11-21)) |
| 0.1.0 | 公開前の PR(サイトの「Solid で使う」のページ・README と StackBlitz のリンク・Solid 版の変更履歴 `packages/solid/CHANGELOG.md` とタグ `solid-vX.Y.Z`・`private` を外す)→ ユーザーが公開 → npm と GitHub Release と新しいアプリで確かめる → StackBlitz での起動をユーザーに確かめてもらう | 公開済み(2026-11-22。公開前の PR #76、タグ `solid-v0.1.0`。npm の dist は手元の pack と同じ、GitHub Release は自動で作られ Latest は v1.2.1 のまま、`examples/solid` を写して npm から入れたビルドと Chromium の操作(編集・元に戻す、console 0 件)を確認。StackBlitz(Vite 8)で起動して操作できることをユーザーが確認) |

### 3-3 で分かったこと

- **公開の形**(3-3a): 入口は `.`(全部入りの `SpreadsheetGrid` と、`createSpreadsheetGrid` + 機能の部品 + `standardFeatures` を同じ入口から)・
  `/locales/en`・`/testing`・CSS(`style.css` / `style.layer.css` / `themes/*.css`)。React 版の `/ai` は無い。
  - 「.」は Solid のライブラリの慣例どおり 2 つ: `solid` 条件 = JSX のままの `dist/source/index.jsx`(esbuild で 1 つに束ね、型だけ消す。
    利用側の Vite + `@solidjs/vite-plugin` が自分の設定でコンパイルする。SSR はこれでないと動かない)、`import` 条件 = DOM 向けに
    コンパイルした `dist/index.js`(Solid に対応していないバンドラ向け)。ESM だけ(solid-js 2.0 も ESM だけ)。
  - CSS は React 版の dist から写す(同じ DOM と class なので同じもの)。ルートの `build:lib` が core → React 版 → Solid 版の順に
    なるよう、Solid 版の devDependencies に React 版(workspace:*)を入れた。
  - 公開の値と型は React 版の index・`/lite`・common.ts と同じ名前(`src/publicApi.test.ts` が検査。React 版だけのものは
    `/ai`。`preloadGridPopups` は 3-3c で足した)。`SpreadsheetGridProps<T, L>` は React 版と同じく core の props そのまま(段階 2 までに全部の
    props を受けるようになったので `Pick` をやめた)+ 関数の `ref`。
  - `pnpm -r publish`(publish:all)が出さないよう、0.1.0 を出すまで `private: true` のまま。core への依存は `workspace:*`
    (pack で同じ版に固定される)。
- **利用側の新しいアプリで確かめた**(pack した core と Solid 版の tarball、Vite 8 + `@solidjs/vite-plugin` 3 + solid-js 2.0.0):
  開発サーバーは `solid` 条件の `dist/source/index.jsx` を読む、本番ビルド・`tsc`(strict + exactOptionalPropertyTypes +
  skipLibCheck: false)が通る、全部入りと `standardFeatures` の 2 つのグリッドが描け、編集・並べ替え・英語の文言が効く、
  SSR(`renderToString`)がエラーなく描く(Chromium。ハイドレーションはまだ見ていない)。`@solidjs/vite-plugin` 3 は Vite 8 以上が要る
  (React 版のサンプルは StackBlitz の不具合で Vite 7 に留めているので、Solid 版のサンプルは StackBlitz で起動するかを確かめる)。
- **`types:check` で見つけた不具合**: 全部入りの `SpreadsheetGrid` の型を推論のままにしていたら、tsc が d.ts に `import(".")`
  (入口)と書き、nodenext の利用側で解決できず props が any になっていた。型を書いて直した(`src/fullGrid.ts`)。
- **大きさ**(esbuild、solid-js は外部化): 全部入り 175.63KB / 機能なし 89.42KB / standardFeatures 130.47KB(React 版は 149.85 /
  87.24 / 110.55KB。React 版はポップアップの部品 12.95KB を後から読む)。機能なしは React 版とほぼ同じで、使わない機能の部品は
  束ねたときに消えている。
- **ポップアップの遅延読み込み**(3-3c。2026-11-21 にユーザーが「React 版と同じく後から読む」を選んだ): 列フィルターの
  ポップオーバー(`view/ColumnFilterPopover.tsx`)とツールパネルの枠と 3 つのタブ(`view/toolPanelViews.ts`)を別のチャンクにし、
  `view/lazyPopups.ts` の `createLazyModuleSignal`(core の `createLazyModule` を外部ストアの signal で読む)で読む。条件は React 版と
  同じ: 開いたら読み込む / 描いた後の暇なとき(core の `scheduleIdleTask`)に先読み(列フィルターは列メニューかツールパネルがあり、
  filterType のある列があるとき。ツールパネルはタブが 1 つでもあるとき)/ 失敗したら console.error に出して閉じる / `preloadGridPopups()`。
  機能の部品は `filtering.createFilterPopoverViews` と `toolPanel.createToolPanelViews`(部品そのものの代わりに読み込みを渡す)。
  - 大きさ(esbuild): 全部入り 175.63 → 161.89KB(後から 15.58KB)/ standardFeatures 130.47 → 117.20KB / 機能なし 89.42 → 90.17KB。
    Vite 8 で束ねると全部入り 187.76 → 174.72KB / standard 139.71 → 126.87KB / 機能なし 96.53 → 96.60KB(Vite の方が全体に約 12KB
    大きい)。機能なしの +0.75KB(esbuild)は Rolldown が共有のモジュールを別のチャンクへ分けたことによる増え方。
  - esbuild は使われない `import()` の先もチャンクに出し、その先と共有するファイルを丸ごと共有チャンクへ入れるため、機能なしを
    約 4KB 多く数えた(94.08KB)。遅延分が 0 の Solid の構成は splitting なしで束ね直して測る(`measure-size.mjs` の
    `remeasureUnusedLazy`)。React 版の lite も同じ理由で約 1.2KB 多く数えているが、記録と比べられるように測り方を変えていない。
  - 「solid」条件の `dist/source/` も esbuild の splitting で分ける(`dist/source/chunks/*.jsx`。分けないと esbuild が入口へ入れる)。
    利用側のアプリで、開発(「solid」条件)と本番の両方で、2 つの部品が描いた後に別のリクエストで読まれ、開くと出て入力欄へ
    フォーカスが入ることを確かめた。SSR(`renderToString`)もエラーなし。
  - テストの落とし穴: `vi.resetModules()` で取り直すと `@solidjs/web` も取り直されるので、`@solidjs/testing-library` も一緒に取り直す
    (前のままの `render` で描くと、Solid 2.0 のイベントの委譲(描いた入れ物ごとの登録)が取り直した部品と別のものになり、ポータルの
    中のメニューの項目を押しても何も起きない)。`<Show>` の子の関数の本体で読み込んだ部品の signal を読むと開発時の
    `STRICT_READ_UNTRACKED` になるので `untrack` で読む(読み込んだ部品は変わらない)。
- **サンプルと README**(3-3d): `examples/solid` は React 版の `examples/basic` と同じ在庫表(10,000 行。Vite 8 + `@solidjs/vite-plugin` 3)。
  `examples:check` が Solid 版の tarball で型チェック + ビルドし(版は Solid 版の版と比べる)、手元では開発サーバーで編集・行の追加・
  CSV・列フィルター・Ctrl+F が動くのを Chromium で確かめた。`packages/solid/README.md` は npm の README(英語 + 日本語。React 版との
  違い = `ref` は Solid の DOM の ref と同じ・描く関数は必要なときだけ・`/ai` は無い)にし、試作からの中身の記録は `docs/solid/prototype.md` へ移した。
  StackBlitz のリンク・サイトの「Solid で使う」・ルートの README の案内は、0.1.0 の公開と一緒に別の小さな PR で出す
  (2026-11-21 ユーザー判断。サイトは main へのマージで公開されるため)。
  - ハーネスの `t-lazy` も Solid 版で回す(`SUPPORTS.lazyPopups` を消した)。3-3a で `SupportedPropKeys` を消したときに、Solid 版の
    ハーネスのページがその型から props の名前を読んでいて開けなくなっていた(3-3a の後にハーネスを回していなかった)。core の
    `SpreadsheetGridProps` の項目の名前を読むように直した。
- **別視点のレビュー 2 系統**(3-3 の全体。高は無し。直したもの):
  - 先読みの予約が、列の定義を差し替えるたびにやり直されていた(Solid 2.0 の `createEffect(compute, effect)` は compute が同じ値を
    返しても effect と後片付けを走らせ直す)。compute を `createMemo` で包んだ(devWarnings.ts と同じ形)。列を 80ms ごとに 8 回
    差し替えても先読みすることをテストに足した(直す前は落ちる)。
  - `ref` が関数だけだった: Solid の DOM の ref と同じく、`let grid!: …` + `ref={grid}`(コンパイラが代入の関数に書き換える)と
    関数の配列も受けるようにした(型は solid-js の `Ref<T>`。React の ref オブジェクトは型エラーのまま)。
  - `size:check` に Solid 版の dist の形の検査を足した: 2 つの入口(`dist/index.js` と `dist/source/index.jsx`)が列フィルターと
    ツールパネルを `import()` で読み、入口から静的 import でたどれるファイルにそのチャンクが無いこと(この計測は束ね直すので、
    入口の形が崩れても数字に出ないことがある)。dist が古いかの判定から `src/parity`(ビルドに入らない)を外した。
  - `emit-css.mjs`: React 版の CSS のソースが React 版の dist より新しければ止める(古い CSS を写して公開しない)、exports に書いた
    CSS が React 版の dist に無いときも止める、開発時の `exports` にも CSS を書いた(ワークスペースの中で `…-solid/style.css` を
    読めるように。publishConfig と同じ dist を指すかを検査)。
  - `types:check` は Solid 版の devDependencies が範囲(`^2.0.0` など)で書かれていてもそのまま使う。
  - `popups.parity.test.tsx` の検索欄のテストは React 版と Solid 版で入力の待ちが 6 回ずつあり、既定の 5 秒に近く、重いときに落ちた
    (直す前のコードでも 4.5 秒)。ほかの比べるテストと同じく時間の上限を 20 秒にした。
  - README に、Node の中(Vitest + jsdom など)では `solid` か `browser` の条件で解決すること(既定の条件では `@solidjs/web` が
    サーバー向けになり「Client-only API called on the server side」で止まる。利用側のアプリで確かめた)と、上に作るライブラリの
    `peerDependencies` を書いた。
- **ハーネス**(3-3 の全体の後。Solid 版): Chromium 952 / 952・Firefox 876 / 876・WebKit 872 / 875(既知の BR-3・BR-4)。3-2 で
  時間の確かめに 1 件落ちていた Firefox の `t-aggregates` も通った。回している途中にソースを直すと、ハーネスの開発サーバーが
  ページを読み直して、その間のファイルが落ちる(WebKit で 4 ファイル。直し終えてから回し直して通った)。
- **0.1.0 を出すときの作業**(段階 3 の最後。React 版と core の 1.2.1 の後):
  - 版上げ: `bump-version.mjs` は core と React 版だけを上げる(`examples/solid` の依存も書き換えない)。Solid 版は
    `packages/solid/package.json` の `version` を手で 0.1.0 にし、`private: true` を外す。そのときに決めること: タグの名前
    (`v*` は core と React 版の版なので別の名前にする。`release.yml` は `v*` で動く)、CHANGELOG の書き方(Solid 版の節を分けるか)、
    これからの Solid 版の版上げをスクリプトにするか。
  - 決めたこと(2026-11-22。ユーザーの「それでは公開しましょうか」を受けた公開前の PR で、おすすめのとおり): タグは `solid-vX.Y.Z`
    (0.1.0 は `solid-v0.1.0`)。変更履歴は Solid 版だけの `packages/solid/CHANGELOG.md`(見出しは React 版と同じ「## X.Y.Z — 日付」、
    各版に依存する core の版を書く。ルートの CHANGELOG.md は React 版と core だけで、`bump-version.mjs` の「## 未リリース」の
    書き換えに Solid 版の変更が混ざらないように)。`release.yml` は `solid-v*.*.*` のタグでも動き、`scripts/changelog-section.mjs` が
    `solid-vX.Y.Z` のときは Solid 版の変更履歴から節を取る(Release の「Latest」の印は React 版と core の最新版のまま)。版上げは
    手で行う(Solid 版の版上げはまだ少ないので、スクリプトは版上げが続くようになってから)。`private: true` は公開前の PR で外した。
  - 公開: `private` を外すと `publish:all`(`pnpm -r publish`)に Solid 版も入る(公開済みの版は pnpm が飛ばす)。core の版を
    上げた後に Solid 版を出すと、Solid 版が依存する core の版もその版になる(`workspace:*` を pack で固定)。
  - サイトの「Solid で使う」と README / StackBlitz のリンクの小さな PR を、公開の直前にマージする(2026-11-21 ユーザー判断)。
  - 公開の後に、`examples/solid` が StackBlitz で起動するかをユーザーに確かめてもらう(Vite 8。React 版のサンプルは StackBlitz の
    不具合で Vite 7 に留めている)。

### 3-2b で分かったこと

- **測り方**: ハーネスのページを `vp build`(本番)でビルドして静的に配り、100 万行(`?s=big`)で測る。遠くへ飛ぶスクロールは
  10 か所へ飛んで次の次のフレームまでの時間(Chromium は 6 回ずつを 2 巡 = 120 回、Firefox は 3 回ずつを 2 巡 = 60 回)、近い
  スクロールは 400,000px から 60px ずつ 40 回(2 回ずつを 2 巡)。見えているセルは約 360 個で、遠くへ飛ぶとすべての行のキーが
  変わるので、Solid 版も React 版も見えている行とセルを作り直す。
  - 最初に「Solid 版 54ms」と記録したのは測り方の誤り。同じ port で配り直したときに古いサーバーが残り、試しにセルの中身を
    最小にしたビルドを測っていた(port の古いサーバーを止め、配っているフォルダを確かめてから測るように直した)。
- **スクロールとホバーのたびに、見えているすべてのセルの effect が走っていた**(差分の外にもともとあった。別視点のレビューで
  見つかった)。シェルの `paneResolution` が view スライスをまるごと読み、core の `resolvePaneLayout` は毎回新しいオブジェクトを
  返すので、セルが読む `leadingWidth` がスクロールやホバーのたびに変わっていた。view スライスの幅・高さ・scrollTop を値ごとの
  memo にして、ペインの幅と縦のレイアウトへ渡す(React 版の useMemo の依存と同じ)。近いスクロールが 27ms → 22ms(React 版 20ms)。
- **機能を使う列にだけ要るセルの memo**(書式の文脈・書式・データバー・カラースケール・入力の検査の印・メモ・auto-height・
  検索のヒットの 8 つ)は `src/primitives/memoWhen.ts` の `createMemoWhen(needed, compute, empty)` で、使う列のセルだけ作る。
  - セルを作るときに `needed()` が真なら memo。偽なら作らず、読むたびに `needed()` を見て、初めて真を読んだときにセルの owner の
    下で memo を作る(作らないままその場で計算すると、セルの属性の effect が同じ値を何度も読むので、利用側の `validate` /
    `cellNote` / `cellClassName` を読むたびに呼んでいた。レビューの指摘)。memo の中でも `needed()` を見るので、後から偽になれば
    `empty`。
  - auto-height を使うかは行ごとの memo(`rowAutoHeight`)をセルが読む(セルがシェルの値を直接読むと、切り替えでシェルの値の
    購読がセルの数の 2 倍になり、Solid の開発ビルドの HUGE_FAN_OUT が出た)。
  - 遠くへ飛ぶスクロールは 79ms → 75ms と小さかった(Firefox は 118ms → 114ms)。
- **遠くへ飛ぶスクロールの残りの差**: セルの中身を最小(値の文字だけ)にしたビルドは React 版と同じ速さ(Chromium 51ms・
  Firefox 60ms)なので、差はセルの側にある。セルの部品を 1 つずつ外したビルド(データバーの `<Show>`、auto-height の器、
  セルの中身、class、style、イベント、aria / data 属性)で測ると、どれも数 ms ずつで、1 つで大きく縮むものは無かった(Firefox は
  揺れが大きく、同じビルドで 118ms / 140ms)。差は、遠くへ飛ぶたびに約 360 個のセルの Solid の計算(memo / effect)と DOM を
  作って捨てる手間の合計(CPU のプロファイルでも、`@solidjs/signals` の計算の作成・依存のつなぎと外し・GC・`@solidjs/web` の
  属性とクラスの書き込みに散る)。React 版は同じ作り直しが関数の呼び出しと DOM の作成で済む。
- **テスト**: React 版と比べるテストに 3 つ(列の書式・メモ・条件付き書式・検査を後から足す / 外す、最初から足した列で外す・
  足し直す(データバーの色も)、autoHeight を後から入れる・外す)、Solid 版だけのテストに 2 つ(後から足した検査・メモ・書式を
  ホバーやスクロールのたびに呼び直さない、autoHeight の切り替えで HUGE_FAN_OUT を出さない)。直しを 1 つずつ戻すと、それぞれ
  落ちることを確かめた。
- **試して入れなかったもの**: 読み取り専用かどうか(`readOnlyCell`)を memo から素の関数にすると、かえって遅くなった(属性・
  クラス・セルの中身の文脈の 4 か所で読むので、利用側の `canEditCell` を何度も呼ぶ)。データバーの `<Show>` を三項にしても
  速くならなかった(auto-height の器の `<Show>` は、コンパイラがもう三項と真偽の memo 1 つにしている)。

### 3-2 で分かったこと

- **ハーネスの作り**: React 版のページ(`audit/harness/main.tsx`)から、計測(`window.__events` / `__errors` ほか)・行のデータ・
  列・SSRM の擬似サーバー・URL のシナリオの読み取りを `audit/harness/shared.ts` へ移し、Solid 版のページ `audit/harness/solid/main.tsx`
  (port 5179)が同じものを使う(フレームワークの部品 = custom エディタの中身と展開行の中身だけをそれぞれのページで書く)。
  `__setProps` は Solid 版では prop ごとの signal で上書きする(props のオブジェクトを丸ごと差し替えると、prop を読むところが
  すべて動き直す)。テスト(`t-*.mjs`)は同じものを `SSG_AUDIT_FRAMEWORK=solid` で回す。React 版にしか無いポップアップの遅延
  読み込み(`t-lazy` の 25 項目)は飛ばす。React 版のページは中身を変えずに移しただけで、React 版のハーネスは 3 つのブラウザで
  前と同じ結果(足した `t-total` の 3 項目を除いて Chromium 949 / 949・Firefox 873 / 873・WebKit 869 / 872 = 既知の BR-3・BR-4)。
  React 版のコードは変えていない。core は命令的 API に省略できる引数と関数を 1 つずつ足しただけ(下の 2 つ目。React 版は
  渡さないので今までと同じ動き)。
- **見つかった違いと直したもの**(Solid 版だけ):
  - 編集中に、編集している行が `rows` から消えると Solid 版が止まっていた(エディタの識別の memo が、消えた行のキーを読もうとして
    利用側の `rowKeyGetter` に `undefined` を渡し、例外で Solid の反応が止まる。React 版はエディタを閉じてキー操作を続けられる。
    監査の RD-3 の確認)。行が無い間はキーを読まず、エディタのセッションもそのまま(React 版の CellEditorLayer と同じく、編集を
    始めたときに行が無ければ、最初に取れた位置とキーをセッションを変えずに覚える)。React 版と比べるテストを足した(直す前の
    Solid 版で落ちることを確かめた)。
  - auto-height で `scrollToBottom()` の後、末尾の 568px 手前で止まっていた。core の命令的 API は本体の高さが変わると末尾へ合わせ
    直す(M-05)が、Solid 版は命令的 API へ args を DOM の束縛と同じ回(render effect)に渡すので、スペーサーの高さがまだ前の値の
    うちに合わせ直していた(ブラウザがスクロールを前の高さで丸め、合わせ直しが止まる)。core の命令的 API に `deferBottomPin`
    (update では合わせ直さない)と `settleBottomPin()`(合わせ直す)を足し、Solid 版は本体の高さが変わったときの effect(DOM を
    書き終えた後)で `settleBottomPin()` を呼ぶ。React 版は `deferBottomPin` を渡さないので、今までどおり update(レイアウト effect)
    の中で合わせ直す(core の単体テストで今までのテストと、足した方の両方を見る)。args そのものは render の時機のまま(最初は
    args ごと effect へ移したが、別視点のレビューで、effect の時機の通知 = `onSortChange` などの中でハンドルを読むと並べ替えの前の
    並びを返すことが分かった。通知の中でハンドルを読む、React 版と比べるテストを足した)。
  - 末尾までスクロールしているときに合計行(または下の固定行)が出たり高くなったりすると、Solid 版だけ末尾から外れていた(最後の
    行が合計行の裏に隠れる)。core の scrollSyncController は update の中で増えた後の `scrollHeight` を読んで末尾に留めるが、
    Solid 版は render の時機(DOM を書く前)に渡していた。React 版のレイアウト effect と同じく、DOM を書き終えた後の effect で
    渡すようにした(`t-total` に確かめを足した。React 版も通る)。同じ原因で、ほかのコントローラも update の中で DOM を測るか /
    スクロールを書くかを見直し、縮めたスクロールの率が変わったときに見ている行を保つ処理(core の `createScrollScaleAnchor`。
    スクロールの上限を測って位置を書く)も DOM を書き終えた後の effect にした(React 版はレイアウト effect。100 万行で React 版と
    同じ位置になることを確かめた)。ほかの render の時機のコントローラは update の中で DOM を測らない(別視点のレビューでも確認)。
  - 命令的 API の末尾への合わせ直し(`settleBottomPin`)とほかの effect(アクティブセルを見せるスクロールの合わせ直しなど)の順番は、
    React 版(レイアウト effect の後に passive effect)と同じとは限らない(Solid の effect は作った順に走るとは限らない)。
    `scrollToBottom()` の後の 1 秒の間に、同じ回でアクティブセルの位置も変わったときだけの違いで、直さずにここへ書く。
  - 列の幅が変わると、列見出しとセルを同じ変化で 2 回描いていた(React 版は描いた後の effect で列の仮想化を測り直し、もう 1 回描く。
    Solid では別の流れになる)。列の仮想化の範囲を計算する memo の中で測り直すようにした(core の viewportSyncController には何も
    しない `measure` を渡す)。
  - WebKit(WebKitGTK)で Shift+Tab がグリッドのキー操作にならず、ブラウザの既定のフォーカスの移動(表の外の検索欄へ)になって
    いた。WebKitGTK は Shift+Tab の keydown を `key='Unidentified'`(keyCode 9)で送り(WebDriver だけでなく、xdotool で X の本物の
    キーを送っても同じ)、React の合成イベントは keyCode から `'Tab'` に直すが、Solid 版はブラウザのイベントの `key` をそのまま
    読んでいた。Tab を見るところ(シェル / エディタ 4 種 / ポップアップの中で回すフォーカス / フィルハンドルのメニュー)を
    `src/primitives/eventKey.ts` の `readEventKey`(core `logic/domGuards` の `isTabKeyEvent`。段階 1-3 で展開行のカードに使った
    ものと同じ)に通した。core のコントローラが document で受けるキー(メニュー / IME の入力受け)は React 版も元のイベントを読む
    ので同じ。React 版と比べるテストに `key: 'Unidentified', keyCode: 9` の手順を足した(直す前の Solid 版で落ちることを確かめた)。
    macOS の Safari でどう送るかは確かめていない(React 版と同じ読み方にしたので、どちらでも React 版と同じに動く)。
- **速さ(本番ビルドで測った。残した違い)**: 100 万行の表(ハーネスの `big`)で遠くへスクロールしてから次の次のフレームまでは、
  Solid 版が React 版より遅い。ハーネスのページを `vp build`(本番)にして 6 回ずつ測ると、Chromium で React 版 34〜64ms・Solid 版
  59〜152ms、Firefox で React 版 42〜72ms・Solid 版 72〜194ms(Firefox の開発ビルドでは `t-aggregates` の「計算中のスクロールの
  次フレームまで 200ms 未満」が Solid 版だけ 174〜219ms で揺れて落ちることがある。React 版は 73ms)。Chromium のトレースでは Layout / スタイル / Paint の回数と時間は
  同じで、違うのはスクロールの処理の中のスクリプト(10 回の合計で React 版 400ms・Solid 版 632ms)= 新しく出る行とセルを作り、
  前の行を捨てる Solid の反応の仕組みの手間(`recompute` / `computed` / `unlinkSubs` / `disposeChildren` と GC)。直すのは別の
  段階にする(3-2b。近いスクロールとホバーは React 版に並んだが、遠くへ飛ぶ差は残った。上の「3-2b で分かったこと」)。
- **Solid の Vite プラグインの開発用の計測**: `@solidjs/vite-plugin` は `vite dev` で既定で Chrome の Performance パネルのトラックを
  入れ、その計測(`solid-js/attribution`)が描き直しの理由を記録する。これが入っていると、(1) 描き直しが重くなる(100 万行で遠くへ
  スクロールした次のフレームまで約 0.5 秒。切ると React 版と同じ約 0.1 秒)、(2) Solid が console に知らせを出す(下)。ハーネスは
  React 版と同じ条件で比べるため既定で切り(`audit/harness/solid/vite.config.ts`)、`SSG_AUDIT_SOLID_TRACKS=1`(port 5180)で入れた
  ときに出る知らせが既知のものだけかを `audit/harness/t-solid-diagnostics.mjs` で見る。本番のビルドと、プラグインの
  `performanceTracks: false` では出ない。
- **開発ビルドで Solid が出す知らせ**(利用者の `vite dev` の既定で出る。どれも 1 つのページで 1 回ずつ):

  | 知らせ | effect の名前 | 出るとき | なぜ出るか |
  | --- | --- | --- | --- |
  | `EFFECT_WRITES_OWN_SOURCE` / `EFFECT_RELAY_TEAR` | `autoHeightMeasurer` | `autoHeight` の列があるとき | 描いた行の高さを DOM で測って行の高さの表へ書き、その高さで並べ直して新しく描いた行をまた測る |
  | `EFFECT_WRITES_OWN_SOURCE` / `EFFECT_RELAY_TEAR` | `activeRowFollow` | `activeCellFollows: 'row'` で並びが変わったとき | アクティブセルを押した行の新しい位置へ付け直す |
  | `EFFECT_WRITES_OWN_SOURCE` / `EFFECT_RELAY_TEAR` | `edit` | 編集中に並びが変わったとき | エディタとアクティブセルを編集している行の新しい位置へ付け直す |
  | `EFFECT_RELAY_TEAR` | `clampSelectionToRowCount` | 行や列が減って選択が範囲の外になったとき(3 回目から) | 選択を範囲の中へ詰める |
  | `EFFECT_RELAY_TEAR` | `reconcileColumnWidths` | 列の定義が変わって列幅の状態を合わせたとき(3 回目から) | 消えた列 / 幅を指定し直した列の手で変えた幅を捨てる |
  | `EFFECT_RELAY_TEAR` | `scrollSync` | 合計行 / 下の固定行が出たり高さが変わったりしたとき(3 回目から) | 見える高さを DOM で測り直して view スライスへ書く |
  | `EFFECT_RELAY_TEAR` | `fillHandle` | フィルハンドルで埋めた後に選択や行が変わったとき(3 回目から)。serverSide で並べ替え / 絞り込みが変わったときも、`serverSideRowModel` の書き込みを中継した effect としてこの名前が出る(フィルハンドルを使っていなくても。2026-11-22 の点検 S2-02) | 埋めたあとのボタンを消す(コントローラの store へ書く) |
  | `EFFECT_RELAY_TEAR` | `serverSideRowModel` | serverSide で並べ替え / 絞り込みが変わったとき(3 回目から) | 読み込んだブロックを捨てて読み直す(行モデルの store へ書く) |

  どれも「変化の後に状態を合わせ直す」処理で、React 版も同じ描き直しをしている(レイアウト effect / effect の中の dispatch。
  React は知らせない)。手間は DOM を 2 回書くぶん。Solid が勧める直し方(合わせ直した値を memo で
  求める)は、core のコントローラと reducer の作り(前の値を覚えて比べる・DOM を測る)を変えることになり、React 版のコードも変わる
  ので、今は直さずに文書に書く(Solid 版の README の「Solid で気をつけること」に書いた。2026-11-22。ドキュメントサイトには 0.1.0 の公開と一緒に)。知らせの中の名前で処理が分かるように、
  Solid 版の effect(コントローラをつなぐ effect = `connectController` の 4 つ目の引数を含む)と、core の外部 store を写した signal
  (`createExternalStoreSignal` の 2 つ目の引数)にすべて名前を付けた(名前の無い `effect` と出るのは Solid の DOM の束縛だけ)。
  表は Solid のトラックを入れて全部のハーネスを回したときに出た知らせのすべて。

### 3-1 で分かったこと

- **警告は `src/devWarnings.ts` に集めた**: 機能セットに無い機能の prop の表(React 版の `hooks/useUnregisteredFeatureWarnings.ts` と
  同じ)、エクスポートのメソッドの代役(React 版の `features/resolve.ts` の `inertExportFeature`)、`openFilterManager` の足りない
  機能(ツールパネル / フィルター)、フィルターの機能が無いのに入ったフィルターの状態、シェルの警告(サーバーサイドの rowGroup /
  行のグループ化とラベル行の併用 / auto-height のサーバーサイドと 5 万行の上限 / 展開行の高さの上限 / サーバーサイドの
  `moveRow()`)。文言は React 版と同じで、1 回だけの記録は core `logic/featureWarnings` を共有する。core と React 版は変えていない。
- **本番では消える**: どれも `process.env.NODE_ENV === 'production'` のときは何もしない関数に差し替わる(React 版と core と同じ
  判定。利用側のバンドラが置き換える)。dist を esbuild で `production` に束ねると、警告の文と prop の表とエクスポートの代役が
  残らないことを確かめた。
- **入れなかった警告**: React 版の「コンポーネントの中で `createSpreadsheetGrid` を呼んで、描くたびに作り直している」の警告。
  Solid の部品の関数は 1 回しか呼ばれないので、部品の中で呼んでも描き直しのたびに作り直すことは無い。
- **比べるテストの作り**(`src/parity/devWarnings.parity.test.tsx`): `console.warn` を控え、React 版と Solid 版を描く前に core の
  「1 回だけ」の記録を消す(`resetUnregisteredFeatureWarnings`。2 つの版で 1 つのモジュールを共有するため)。警告の順番は比べない
  (React 版は passive effect を宣言の順に、Solid 版の effect は順番が違うことがある)。
- **CI**: Solid 版の型チェックとテスト(`pnpm --filter ./packages/solid run typecheck` / `test`。約 2 分)を CI の手順に足した。
- **別視点のレビューで直したもの**: Solid 2.0 の `createEffect` は compute の値を比べない(effect は値が同じでも走る)。compute が
  読む `columnResolution()` は解決し直すたびに新しいオブジェクトを返すので、rowGroup の列の数が同じまま `columns` を新しい配列に
  替えただけで、サーバーサイドの rowGroup と、グループ化とラベル行の併用の警告がもう 1 回出ていた(中。React 版は deps が同じなら
  出さない)。compute を `createMemo`(`===` で比べる)に通してから effect へつなぐ(`createChangeEffect`)。スクロールのたびに
  auto-height と展開行の effect が走っていたもの(低。1 回だけの記録で警告の数は同じ)も一緒に消えた。比べるテストに「見出しだけ
  替えた」手順を足した(直す前の Solid 版で落ちることを確かめた)。

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