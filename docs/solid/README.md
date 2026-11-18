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
| 1-2 | エディタ 6 種(text / number / select / date / checkbox / custom)・入力の検査(reject)・エラーの吹き出し | 作業中(1-2a: エディタの判断と DOM の処理を core へ = 済み。エラーの吹き出しの置き方 `utils/errorBubblePlacement`、複数行の入力欄の大きさと改行 `utils/multilineEditor`、見えている範囲 `utils/editorVisibleBounds`(React 版から移動)、number / date の開く値と確定する値 `logic/editorStart`、select のキーと開いたときのハイライト `logic/selectEditorState`(React 版はフル版が 0.08KB 増えるので展開したまま)。フル版 149.71KB) |
| 1-3 | 行の選択(チェックボックス)・展開行・フォーカスの順 | まだ |

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