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

同じ台本を npm の 1.4.1 と 1.5.0 で回して出力を比べた(時間・ポート・ハッシュをならして diff)。S1〜S4 は回帰なし(行が届く間隔や取りに行くブロックの順など、時間で変わる所だけが違う)。1.5.0 では開発時の `HUGE_FAN_OUT` が S1 の 15 本の台本で出なくなった。1 か所だけ新しく出た: S1 の自作のバー(`bars.html?mode=bodysort`)で自作のグローバルフィルターに打つと、行モデルの購読が 2,000 を超えた(`canEditCell` があると、編集できるかの式がセルごとに行モデルを読む)。元の rows の位置を行ごとの memo で受けるように直した(Solid 版 `view/GridBodyLayer`。テスト `shellBehavior.test.tsx`、直す前は 2,611 の購読で落ちる。Solid 版の CHANGELOG の「修正」)。S5 以降の結果は PR に書く。