# 1.2.0 の確かめ直し — 共通の手順

以下 `$S` = `/tmp/claude-0/-home-user/6b8121d8-3539-541e-b612-056fcc0e1016/scratchpad`(新しいコンテナでは自分のスクラッチに読み替える)。

## 目的

前に npm の 1.0.0 で作ったアプリ(`$S/dogfood/<アプリID>/`。元は `audit/dogfood/2026-11-09/<アプリID>/`)に、直した版(1.2.0 の候補。版の番号はまだ 1.1.0 のまま)を入れ直し、

1. 渡した一覧の所見(1.2.0 で直した / 足したもの)が、本当に直っているか(前と同じ手順で再現しないか)
2. 1.2.0 の新しい機能を、渡したものについて自分のアプリへ実際に入れてみて、ドキュメントどおりに動くか
3. 直したことで、前は動いていた操作が壊れていないか(回帰)。1.0.1 / 1.0.2 / 1.1.0 で直したものが戻っていないかも含む

を確かめる。**ライブラリの修正はしない**(確かめて報告するだけ。自分のアプリのコードは変えてよい)。

1.2.0 で変わること(詳しくは `$S/dogfood/docs/CHANGELOG.md` の「## 未リリース」):

- 追加: `onFindChange` の `truncated` / 列の `selectionAggregate` / number・date エディタの `strict` / `pasteFillsSelection` / `canDropRow`(型 `RowDropParams`)/ `includeGroupingInState`(と `getGroupRows()` の `collapsed`)/ 右クリックメニューの読み上げの名前(`localeText.contextMenuCell` / `contextMenuRow`)/ ハンドルの `isAtBottom()` と `onScroll` の `atBottom` / `pinnedBottomRowsPlacement: 'belowTotal'` / `activeCellFollows: 'row'` / custom エディタの `imeDirectInput: true`
- 変更(既定の動きが変わる): 1 つのセル(や倍数の大きさ)のコピーを広い範囲へ貼ると範囲いっぱいに書く(A-08。`pasteFillsSelection={false}` で前の動き)/ 固定行・合計行・行選択のグループ行の行見出しの ARIA(見た目は不変)/ タッチが主の端末(`pointer: coarse`)でメニュー・候補・ボタンの的が大きい(L-12)
- 修正: 背の高い行の上にそろえたセルで、1 行のエディタ(text / number / date / select)と IME の変換中の文字が 1 行目に出る

## ルール

1. 作業場所は `$S/dogfood/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. 直した版は pack した tarball: `$S/verify120/pack/ishibashi0112-spreadsheet-grid-core-1.1.0.tgz` と `$S/verify120/pack/ishibashi0112-spreadsheet-grid-1.1.0.tgz`。**2 つを一緒に**入れる(`npm install <core の tgz> <react の tgz>`。pnpm のアプリは `pnpm add <core の tgz> <react の tgz>`)。公開版の 1.1.0 と版の番号が同じなので、入れる前に `node_modules/@ishibashi0112` を消す。入れた後、`grep -rl followActiveRow node_modules/@ishibashi0112/spreadsheet-grid-core/dist` と `grep -rl pinnedBottomRowsPlacement node_modules/@ishibashi0112/spreadsheet-grid/dist` の両方が何か見つけること(= 直した版が入ったこと)を確かめる。見つからなければ npm のキャッシュで公開版が入っているので、消して入れ直す。pnpm のアプリは、React 版から見た core が tarball のものか realpath でも確かめる(registry の公開版に解決されることがある)。
3. リポジトリ `/home/user/datasheet-grid` のソース(`packages/` / `audit/harness` など)は読まない。読んでよいのは: 自分のアプリ、`node_modules` の中の同梱の資料(README / API_REFERENCE.md / SKILL.md)、`$S/dogfood/docs/`(website のドキュメント `website-docs/`・API_REFERENCE.md・CHANGELOG.md の「## 未リリース」)、あなたの前の報告 `/home/user/datasheet-grid/docs/audits/2026-11-09/findings-<アプリID>.md`、直したことの一覧 `/home/user/datasheet-grid/docs/audits/2026-11-09/README.md` の「### 1.2.0 の作業」の節(と、その下のレビューの表)。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` が使えないときは `require('/home/user/datasheet-grid/node_modules/.pnpm/playwright-core@1.56.0/node_modules/playwright-core')` + `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`)。前に書いたスクリプト(`pw/` / `scripts/` / `t/` など)を使い回してよい。console と pageerror を集める。StrictMode のまま。dev と本番ビルドの両方で、少なくとも主要な操作を一度は確かめる。型の検査(`tsc`)も通すこと(新しい props を書いたら、利用側の `exactOptionalPropertyTypes` を含む今の設定で)。
5. ポートは前と同じものだけ(A 5401 / B 5402 / C 5403 / D 3401 / E 5405 / F 5406 / G 5407 / H 5408 / I 5409 / J 5410 / K 5411・3411 / L 5412)。終わったら自分が起動したサーバーとブラウザを PID で止める(`pkill -f` は使わない。ほかのエージェントとリポジトリのハーネスも同じマシンで動いている)。長く動くサーバーは Bash の `run_in_background` で起動する。
6. 「直っていない」「壊れた」と書く前に、最小の構成で再現し直す。再現が安定しないものは「未確定」。
7. マシンは 4 CPU を共有している(ほかのエージェントとハーネスが同時に動く)。時間の数値は参考値で、重さの判断は本番ビルドで 2 回以上測ってから。
8. 既定の動きが変わった貼り付け(A-08)は、どのアプリでも一度は試す(1 セルをコピーして範囲へ貼る・2 行のコピーを 6 行へ・割り切れない範囲・編集できない列を含む範囲・元に戻す 1 回)。自分のアプリで前の動きに頼っていた所があれば書く。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、アプリごとに:

1. **入れた版の確認**: 2 つの印が見つかったか、dev / 本番の両方で起動したか、tsc が通ったか。
2. **直したものの確認**: 渡された一覧の各 ID について「直った / 直っていない / 一部」と、確かめた手順と結果(数値・console の文言・スクショのパス)。
3. **新しい機能を入れてみた結果**: 書いたコード(短く)と、ドキュメントどおりに動いたか。ドキュメントで分かりにくかったところ。
4. **回帰**: 前は動いていて今は壊れた操作(あれば最小の再現)。無ければ「無し」と、確かめた操作の一覧。
5. **新しく見つけたもの**(あれば。前の報告に無いもの。重要度 高 / 中 / 低)。

## アプリごとの割り当て

| アプリ | 確かめる所見 | 入れてみる新しい機能 |
| --- | --- | --- |
| A 経費精算 | A-07(`strict`)/ A-08(範囲を埋める貼り付け) | `strict`、`pasteFillsSelection`、列の `selectionAggregate`(金額以外の数字の列) |
| B 株価ボード | B-04(並びが変わってもアクティブセルが行に付いていく) | `activeCellFollows: 'row'`(ソートしたままのライブの更新。スクロールしないこと・`onActiveCellChange` が位置だけでは呼ばれないこと・選択の範囲の扱い) |
| C シフト表 | A-08 の貼り付け(シフトの記号を範囲へ) | `pasteFillsSelection`、背の高い行の上にそろえたセルの 1 行のエディタ |
| D SaaS 管理画面(Next.js) | H-04(状態に入るグループ化) | `includeGroupingInState`(サーバーで描く HTML とハイドレーション)、`isAtBottom()` |
| E 商品マスタ(`/lite`) | E-07(`canDropRow`)/ E-09(`selectionAggregate`) | `canDropRow`、`selectionAggregate`、`/lite` で新しい props を使ったときに機能が無いときの警告 |
| F 見積書(React 18.3) | F-06(custom エディタの IME)/ RV3-要望(合計 → 消費税 → 税込) | `pinnedBottomRowsPlacement: 'belowTotal'`、custom エディタの `imeDirectInput: true`(CDP の変換の模擬で)、1 行のエディタの上ぞろえ(ラベル行 + autoHeight) |
| G ログビューア(100 万行) | G-15(`truncated`)/ G-08 の続き(末尾を追う) | `onFindChange` の `truncated`、`isAtBottom()` / `onScroll` の `atBottom`(行が増える表で末尾を追う。100 万行でも) |
| H WBS | H-04(グループ化と開閉の保存) | `includeGroupingInState`、`getGroupRows()` の `collapsed` |
| I AI 売上分析(`/ai`) | — | `/ai` の回帰が無いこと、A-08 の貼り付け、`strict` |
| J ダッシュボード | — | ダイアログの中で新しい機能(右クリックメニューの名前・`activeCellFollows`)、A-08 の貼り付け |
| K テストと SSR と型 | RV3-H2(`getByRole('menu', { name: 'セルのメニュー' })`) | 新しい公開型(`RowDropParams` / `FindChangeParams` の `truncated` / `GridScrollEventParams` の `atBottom` / `activeCellFollows` / `pinnedBottomRowsPlacement`)を `exactOptionalPropertyTypes` で、jsdom のテストで新しい props |
| L モバイル・タッチ・アクセシビリティ(React 18.3) | L-12(タッチの的の大きさ)/ RV3-H2 / RV3-L2(axe の empty-table-header) | タッチの端末(`hasTouch` + `pointer: coarse`)でメニュー・候補・ボタンの大きさ、axe で固定行 / 合計行 / 行選択のグループ行 |