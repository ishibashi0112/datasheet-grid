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