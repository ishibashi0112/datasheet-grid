# Solid 版の速さと SSRM の取り直しの見せ方(1.5.0 の候補)

2026-11-23。ユーザーの依頼「Solid 版の速度改善(遠くの行へ移動するときに React 版より遅い点)」「Solid の細かな非同期の管理を SSRM に取り入れられないか」を調べ、判断材料(Claude Doc「Solid 版の速さと非同期の調べ」)からユーザーが選んだ 2 つ(B と N2)を 1.5.0 として入れた作業の記録。ブランチ `claude/project-thread-aq2bqi`。

## 決めたこと(ユーザー判断)

| 項目 | 選んだもの | 退けたもの |
| --- | --- | --- |
| 速さ | **B**: Solid 版で行の要素とセルの部品を位置ごとに使い回す(描く範囲だけが変わったとき)。中身は値だけを書き換え、`renderCell` の中身は行ごとに作り直す。core の DOM の部品 4 つ(行のフェードイン / 値の光り / 保存の印 / 行ドラッグ)を、要素の行のキーが変わることに対応させる | A 見送り / C 行と列の両方を使い回す(列は効果が小さく、横の使い回しは Solid の For の流儀から外れる) |
| 非同期 | **N2**: core の SSRM の行モデルが、取り直し(並べ替え・絞り込み・`refreshServerSide()`)の間も前の行を持つ `serverSideRefetch="keep"`(React 版・Solid 版の両方。既定 `'skeleton'` は 1.4 と同じ) | N1 ガイドのレシピだけ / N3 Solid 版だけ SSRM を Solid の非同期に載せる / N4 SSRM を Solid の非同期で作り直す(ブロックのキャッシュ・debounce・スクロールで外れた取得の中止は Solid の非同期に無い) |
| 見せ方 | 案 2「薄く + 線」(前の行を薄く見せ、列見出しの下に流れる線。HTML のプレビューで 3 案から) | 案 1 薄くするだけ / 案 3 線だけ |
| 初期 JS の上限 | 入れ終えた後の実測 + 0.5KB(切り上げ) | — |

## 速さ(B。本番ビルド、Chromium、`audit/harness/perf-compare.mjs` と同じ測り方)

| 操作 | React 版 | Solid 1.4.1 | Solid(B) |
| --- | --- | --- | --- |
| 約 200 列 × 2 万行で縦に 120 回飛ぶ(JS の時間) | 1.8 秒 | 4.0 秒 | 1.9 秒 |
| 少しずつのスクロール | 0.6 秒 | 1.1 秒 | 0.9 秒 |
| 100 万行の `Ctrl+End` | 35〜45ms | 55〜62ms | 35〜40ms |
| 横のスクロール・ヒープ | — | — | ほぼ不変(ヒープ +1MB) |

使い回しだけ(中身は作り直す)では約 7% しか速くならず、文字だけの書き換えと組み合わせて効いた。空いた枠を前の順のまま使うと DOM の移動が減り、強制レイアウトが 3.4 → 1.8 秒になった。

## SSRM の取り直しの見せ方(N2)

- core `controllers/serverSideRowModel`: `refetch: 'keep'` のとき、取り直しで前のキャッシュ・保存中の楽観行・件数を `stale` に残し、新しいキャッシュへ取る。見えている範囲(`latestRange`)のブロックがすべて届いたか失敗したら一度に差し替える。前の行を見せている間は `applyCellEdits` が 0 を返す。取り直す前の保存中の書き込みは、決着したら前の行のキャッシュへ確定する。スナップショットに `refetching`。
- シェル(React 版 `GridShell.tsx`・Solid 版 `SpreadsheetGrid.tsx`): `editLocked = readOnly || refetching` をコントローラ(編集・貼り付け・削除・フィルハンドル・IME)にだけ渡す(表示の読み取り専用の印は変えない)。ルートに `.ssg-root--refetching`、表に `aria-busy`、列見出しの下に `.ssg-refetch-bar`、本体の見えている所に内部の `.ssg-refetch-veil`。
- **見つけて直したこと**: 最初は行(`.ssg-body-row`)に `opacity` を掛けていたが、固定列のペイン(sticky)の行まで半透明になり、下をスクロールする中央の列の文字が透けて見えた(ハーネスのスクリーンショットで発見)。行は不透明のまま、本体の見えている所(列見出しの下〜合計行の上、スクロールバーを除く)へセルの背景色の面(濃さ `1 - --ssg-refetch-row-opacity`)を重ねる形に変えた。面はポインタを通す。

## 確かめたこと

| 方法 | 結果 |
| --- | --- |
| core のテスト `serverSideRowModel.keep.test.ts`(7 本: 差し替え / 0 件 / 範囲のブロックがそろうまで待つ / 失敗 / 取り直し中の取り直し / 保存中の書き込み / 前の行が無いとき) | 全部通る |
| React 版の結合テスト `SpreadsheetGrid.ssrmRefetch.integration.test.tsx`、Solid 版の比較テスト `parity/serverSide`(keep の場面)、Solid 版の使い回しのテスト `rowReuse.test.tsx` / `primitives/rowSlots.test.ts`、core の `utils/rowRekeyObserver` と 4 つのコントローラのテスト | 全部通る(ルート 2,919 / 2,919、Solid 版 413 / 413、SSR 11 / 11) |
| ハーネス `t-refetch.mjs`(新しい。19 項目) | 下の表 |
| ゲート(tsc ×2 / eslint 0 / build:lib / size:check / types:check / examples:check / website の next build) | 全部緑 |

ハーネス(`pnpm run audit:test`、`SSG_AUDIT_FRAMEWORK=solid` で Solid 版):

| ブラウザ | React 版 | Solid 版 |
| --- | --- | --- |
| Chromium | 1,023 / 1,023 | 1,023 / 1,023 |
| WebKitGTK | 938 / 941(既知の BR-3・BR-4 だけ) | 938 / 941(同じ) |
| Firefox(geckodriver) | 今回は回していない(下) | 同じ |

- React 版と Solid 版に同じでたらめな操作を流して比べる `t-diff.mjs` は 40 / 40 の列で差なし(4,800 手)。
- Solid 版の WebKit で `t-total.mjs` が止まった: 100 万行で描いた行の 11 番目(上の先読みの行 = 画面の外)を押していて、WebDriver の押す前の `scrollIntoView` が縮めたスクロールで遠くへ飛び、Solid 版は前に見つけた要素が別の行になって窓の外に残った(1.4.1 と React 版は要素が外れて、押す点が窓の左上になって何も起きていなかった)。ハーネス側の直し: 真ん中に見せた行を押す、`wd.mjs` はスクロールの後に要素を探し直す(Playwright の locator と同じ)。グリッドの不具合ではない。
- Firefox: conda-forge の Firefox を落として動かそうとしたところ、このセッションでは落とした実行ファイルを動かすことが止められたので回していない。core の行モデルとシェルの変更はブラウザに依らない作り(線は CSS のアニメーション、面は絶対配置の要素)で、Chromium と WebKit で同じ結果。

初期 JS(gzip、esbuild): full 154.87 / lite 90.94 / standard 114.49 / ai 14.03 / solid-full 169.75 / solid-lite 96.79 / solid-standard 124.17 / solid-ai 14.71KB(1.4.1 から full +1.00KB)。上限は実測 + 0.5KB(切り上げ)= full 155.4 / lite 91.5 / standard 115.0 / solid-full 170.3 / solid-lite 97.3 / solid-standard 124.7KB。

## 1.5.0 の後の残り(2026-11-23〜24)

1.5.0 で残した 3 つ(Solid 版の速さの残りの差・開発時の `EFFECT_WRITES_OWN_SOURCE`・S4-06)と、回していなかった Firefox と 12 本のアプリでの確かめ。ブランチ `claude/project-thread-7vwpfl`。

### 判断

- 速さ: 今のまま(ユーザーの週の使用量の都合で、試作の仕上げは見送り)。試作で分かったことは下に残す。
- 開発時の `EFFECT_WRITES_OWN_SOURCE`(`autoHeightMeasurer` / `activeRowFollow` / `edit`): 今のまま。消すには core がアクティブセル・選択・編集中のセルを位置ではなく行のキーで持つよう作り替える必要があり、React 版の編集と選択に広く触れる(`docs/next-major.md` の「1.x のまま残すと決めたこと」)。
- S4-06(`SpreadsheetGridProps<T>` に `T extends object` が無い): 型を狭めるのは壊す変更なので 2.0 の候補(`docs/next-major.md`)。今は API リファレンスの props の節とガイド「困ったとき」に包み部品は `<T extends object>` で書くと書き、型のテスト `type-tests/src/wrapper.tsx` / `type-tests/solid/src/wrapper.tsx` を足した。
- Firefox で大きな表の列見出しが消える件(下の FF-1): Firefox だけ上限を下げる(ユーザー判断。ほかの案は全ブラウザで下げる / 記録だけ)。

### 速さの試作(仕上げていない)

本番ビルド(Chromium)で、1.5.0 の残りの差は、約 200 列 × 100 万行の少しずつのスクロールの JS が React 版 0.79 秒 / Solid 版 1.25 秒、約 200 列の横の移動 60 回が 1.28 / 2.45 秒(測ったときは別の実行と重なっていた)。プロファイルに目立つ 1 か所は無く、見えているセルごとの Solid の部品(作る・つなぐ・片付ける)と GC(横で 594 / 125ms)とスタイルの計算(約 2 倍)に分かれる。`createScrollScaleAnchor` と virtual-core の位置の読み取りが重く見えるのは、フレームに 1 回の強制レイアウトがそこで起きるだけ(どちらも 1 回)。

試作(作業用のコピー。リポジトリには入れていない)で、行の上端と高さを値の memo にし(`top={rowStart()}` / `rowHeight={rowSize()}`)、`primitives/rowSlots` で同じ枠の中身が変わらない行は前の項目のオブジェクトを返し、core の `rowEnterController` で消えたのが行のときだけ親を辿るようにすると、2 万行の少しずつのスクロールで 1 回あたりの行の effect が 159 → 9、計算し直し 894 → 453、effect 282 → 132(100 万行では 1,042 → 634 / 360 → 218)。Solid 版のテストは 413 本すべて通った。横の移動は変わらない(新しいセル 1 つにつき計算し直し約 5.9・effect 約 3.3 で、作るセルの数で決まる)。時間の短縮は、空いた環境で測っていないので未確認。再開するときは、この 3 つを移して `rowSlots` に項目のオブジェクトが変わらないことのテストを足し、`perf-compare.mjs` で測って効いたものだけ入れる。

### Firefox(161.0、geckodriver 0.37.1、conda-forge)

ハーネスの全部: React 版・Solid 版とも 935 / 941。落ちた 6 件は 1.4.1 でも同じに落ちた(1.5.0 の回帰ではない)。

| 所見 | 中身 | 対応 |
| --- | --- | --- |
| ツールチップ(`t-popups` mantinelike) | ハーネスの誤り。列フィルターのチップの帯で見出しが下がった後も最初に測った見出しの位置へポインタを動かしていて、⋮ の上へ外から飛んでいた。⋮ は見出しのホバーで押せるようになる(`pointer-events`)ので、Firefox 161 はポインタが止まったままでは `pointerover` を出し直さない | ハーネスを直した(見出しを測り直して先に見出しの上へ)。Firefox・Chromium(React 版 / Solid 版)とも 54 / 54 |
| FF-1(中・前から) | 行の多い表(36px の行で約 25 万行より多い)を下の方までスクロールすると、列見出しの行が上へ流れて消える。Firefox は `position: sticky` の要素を約 8,947,848px(2^29 の app unit)より先へ追わない。縮めたスクロールの上限が 15,000,000px だった。Firefox 159.0.1 でも同じ。合計行のハーネスの確かめは見出しの位置を緩く見ていたので気づかなかった | 直した: Firefox だけ上限を 8,000,000px に(core `logic/verticalGeometry` の `FIREFOX_MAX_BODY_PX`、`utils/browserLimits`、スクロールコンテナを付けたときに `scrollSyncController` が view スライスの `maxBodyPx` へ書く = サーバーの HTML とハイドレーションの最初の描画は 15M でそろう)。Chrome / Safari は 15M のまま。`t-big` に「末尾でも見出しの行が見える」を足した(Firefox / Chromium、React 版 / Solid 版とも 22 / 22) |
| 合計行(`t-total` big × 3) | 100 万行の末尾で最後の行が合計行に 1.8px 重なる。Firefox は 15M px の末尾へちょうどスクロールできず 1px 手前で止まる(159 は 0.8px で、確かめの 1px の余裕に収まっていた)。上限 8M でも 0.5px 手前で止まり 2.3px 重なる | 記録だけ(低) |
| フィルハンドル(`t-fill` × 2) | BR-4(端のフィルハンドルの上に重ねて出るスクロールバーの当たり)が Firefox 161 でも出る | 記録だけ(BR-4 は様子見のまま) |

### 12 本のアプリ(2026-11-22 の Solid 版の点検のアプリ)

同じ台本を npm の 1.4.1 と 1.5.0 で回して出力を比べた(時間・ポート・ハッシュをならして diff)。12 本とも回帰なし(違うのは、行が届く間隔や取りに行くブロックの順、流れてくるデータの件数、乱数の ID など、時間や乱数で変わる所だけ)。1.5.0 では開発時の `HUGE_FAN_OUT` が S1 の 15 本の台本で出なくなった。1 か所だけ新しく出た: S1 の自作のバー(`bars.html?mode=bodysort`)で自作のグローバルフィルターに打つと、行モデルの購読が 2,000 を超えた(`canEditCell` があると、編集できるかの式がセルごとに行モデルを読む)。元の rows の位置を行ごとの memo で受けるように直した(Solid 版 `view/GridBodyLayer`。テスト `shellBehavior.test.tsx`、直す前は 2,611 の購読で落ちる。Solid 版の CHANGELOG の「修正」)。

## 横の大きな移動の速さ(2026-11-28)

1.5.0 の後の残りの差のうち、約 200 列の表で横に大きく飛ぶとき(11/23 に 1 回あたりの JS が React 版 21ms / Solid 版 41ms)をユーザーが「必要な対応をしたい」とした。数時間で区切り、Solid の流儀のまま、測って効いたものだけを入れる(列の使い回し = 案 C は前にユーザーが見送った)。ブランチ `claude/project-thread-pf1zfh`。測り方のスクリプトは `audit/harness/.out/bench/`(リポジトリに入れない)。

### 分かったこと

- 横に飛ぶたびに作り直す DOM は両方とも同じ(1 回に約 1,100 セル。セルの HTML も同じ)。描画(Paint)も rAF 2 回で待つと 1 回あたり 12〜19ms で同じ。React 版は描き直しを scroll の後の MessageChannel のタスクで行い、Solid 版は scroll のイベントの中で行うので、トレースの Paint の数え方が違って見える(1 回の rAF で次へ進むと React 版の描画が数えられない。入れ子の Paint を足すと Solid 版を二重に数える)。
- 差はセルごとの Solid の部品(For の項目・属性の effect・中身の insert・行の memo へのつなぎと片付け)と GC。
- 両方に共通の重さ: core `rowEnterController` の MutationObserver が、行の中のセルの出入りの記録(見えているセルの数だけ来る)をすべて調べ、記録ごとに `closest` で展開行のカードを辿っていた。
- 列見出しのセルは 1 つあたり重い(svg の属性の spread・Show が 5 つ)が、全体の 3% 未満で、直しても測れる差にならないので見送った。

### 入れたもの

1. Solid 版 `view/GridBodyLayer`: 飾りの無い列(`isPlainCellColumn`)で中身が既定の文字だけ(シェルの `isTextCellColumn` = `renderCellContent` が最後の既定の `span` に落ちる条件)のセルを、少ない部品で作る `renderTextCell`(位置と幅は項目から読み、列だけを memo にする。中の `span` は 1 度だけ作り文字の式だけが追従する。検索のヒットは行にヒットがあるときだけ memo。いつも undefined の属性を持たない)。セルの形は列のオブジェクトごとに WeakMap に控え(控えたときと `renderCell` が違えば決め直す)、For のキーに入れる(形が変わったら作り直す)。編集できるかは、グリッドの `readOnly` と列で決まるとき(core `utils/permissions` の `isColumnEditable`)は行や位置を読まない(一般のセルも同じ)。セルが読むグリッドの設定は層の memo 2 つ(`readOnly` / `canEditCell` と、`showCellOverflowTooltip` / `bodyCell` の slot / 左の幅。どちらも中身が同じなら知らせない)、行の class / style と `bodyCell` の組み合わせは行ごとの memo。DOM は前と同じ(比較テスト `src/parity` が通る)。
2. core `controllers/rowEnterController`: 記録の対象が行のとき(行の中のセルの出入り)は見ない(行の中に行は無い。入れ子のグリッドの行は展開行のカードの中)。入れ子のグリッドの判定は消えた行があったときだけ。React 版も速くなる。

### 別視点のレビュー(1 系統)

DOM を HEAD の `GridBodyLayer` と約 35 の状態で比べて同じ(選択・編集・ホバー・`readOnly` / `canEditCell`・行の値・`showCellOverflowTooltip`・`bodyCell` の slot・`getRowClassName`・列の並べ替えと幅・検索・auto-height と `verticalAlign`・遠くへのスクロールと戻り・固定列・クリックの通知)。`rowEnterController` は行の中に行が無いことを確かめて問題なし。指摘 3 件はすべて直した(テストは `src/cellShape.test.tsx` の「文字だけのセル」):

| 指摘 | 直し方 |
| --- | --- |
| 層の memo 1 つに `readOnly` / `canEditCell` と左の幅をまとめたので、列の幅を変えるたびに `renderCell` の本体で `ctx.readOnly` を読んだ中身(と `cellClassName(ctx)` / `cellNote(ctx)`)を作り直していた | 編集できるかの 2 つを別の memo にし、どちらの memo も中身が同じなら知らせない(列の幅の変化で作り直す回数は HEAD の 1 → 0) |
| 文字だけのセルが列と位置を項目から直接読むので、列の幅を変えるたびに見えているセルの文字を作り直していた(`valueFormatter` を見えているセルの数だけ呼ぶ。検索の印も作り直す) | 列を memo にし、検索のヒットは行にヒットがあるときだけ memo(速さの差は約 2%) |
| セルの形の控えが `renderCell` の有無を覚えていて、キー(`renderCell` を毎回読む)とずれうる | 控えたときと `renderCell` が違えば決め直す。なお、store に入れた列のオブジェクトをその場で書き換えたとき(`s.columns[0].renderCell = …`)は、文字だけのセルは追従しない(HEAD でも `cellClassName` などは追従しない。列は React 版と同じく新しいオブジェクトで渡す前提で、ドキュメントにも書いていない)ので記録だけ |

### 速さ(本番ビルド、Chromium、1440×900)

| 測ったもの | React 版 前 → 後 | Solid 版 前 → 後 |
| --- | --- | --- |
| 横に大きく飛ぶ 60 回の JS(約 200 列 × 2 万行。11/23 と同じ測り方 = rAF 2 回ずつ、6 回の中央値) | 1,153 → 913ms(1 回あたり 19.2 → 15.2ms) | 1,894 → 1,334ms(31.6 → 22.2ms) |
| 同じ操作の rAF までのフレーム(中央値) | 29.5 → 27.0ms | 40.7 → 30.4ms |
| 新しい中身が出るまで待つ測り方の JS / 出るまで(中央値) | 1,132 → 918ms / 45.5 → 42.6ms | 1,965 → 1,254ms / 84.2 → 68.1ms |
| 少しずつのスクロール 200 回の JS(約 200 列 × 100 万行、72px ずつ、4 回の中央値) | 821 → 783ms | 1,066 → 903ms |
| 縦に遠くへ 120 回の JS(`perf-compare.mjs`) | 1.8〜2.2 秒(変わらない) | 2.1〜2.3 → 1.1 秒 |
| 100 万行の `Ctrl+End`(`perf-compare.mjs`) | 39〜46ms(変わらない) | 47〜51 → 36〜42ms |
| スクロールした後のヒープ(約 200 列) | 13.6MB(変わらない) | 22.8 → 17.1MB |

(表はレビューの直しの前の測り。直した後は横の 60 回が約 2% 長い = 同じ実行で 1,488 → 1,523ms、React 版 1,038ms。)

横の差は React 版の約 1.6 倍 → 約 1.5 倍(1 フレームの時間では 1.4 → 1.1 倍)。残りはセルごとの Solid の部品で、ここから先は形を変える直しになる(見送った案: 行の memo を 1 つにまとめてつなぎを減らす = 約 5%、セルごとの `pointerenter` を層の `pointerover` 1 つに = 約 2%、列見出しのセル = 3% 未満、縦のスクロールで使い回した行の DOM の移動とスタイルの計算 = DOM の順番が変わる、列の使い回し = 案 C)。

### 確かめたこと

- ゲート: tsc × 2・eslint 0 件・ルートのテスト 2,925 / 2,925・Solid 版 418 / 418(足した 4 本を含む)・SSR 11 / 11・Solid 版の型・build:lib・size:check・types:check・examples:check・website の `next build`。
- 初期 JS: Solid 版が増えた(main から solid-full +0.87 / solid-lite +0.84 / solid-standard +0.89KB = 170.83 / 97.83 / 125.22KB。文字だけのセルの部品と memo)ので、これまでと同じく上限を今の値 + 0.5KB(切り上げ)にした(171.4 / 98.4 / 125.8KB)。React 版は full 155.10KB(+0.01KB)。
- ハーネス(監査ハーネスの全部、dev サーバー): Chromium は React 版・Solid 版とも 1,024 / 1,024、WebKitGTK は両方とも 939 / 942(既知の BR-3 の 1 件・BR-4 の 2 件だけ。React 版の `t-total` は 1 回目に WebDriver の起動の時間切れで止まり、回し直して 52 / 52)、Firefox 161 は両方とも 936 / 942。Firefox の 6 件は BR-4 の 2 件、上の「1.5.0 の後の残り」の `t-total`(big)の 3 件、`t-pinned` の「100 万行で最後までスクロールしても最終行は下の固定行のすぐ上」の 1 件。`t-pinned` の 1 件は `t-total`(big)と同じわけ: 1.5.1 で Firefox だけ縮めたスクロールの上限を 8M にしたので物理の 1px が約 4.5px になり、scrollTop が最大の 0.5px 手前で止まると最終行が 2.3px 重なる(確かめは 15M のとき = 1px が約 2.4px を前提に 2px まで許す)。1.5.0 の後の残りのときは上限を変える前に全部を回していたので出ていなかった。今回の変更はスクロールの位置に触れない。記録だけ(低)。`t-diff.mjs` は 40 / 40(5 つのシナリオ × 種 8 個 × 120 手)。