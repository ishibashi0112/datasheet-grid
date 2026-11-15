# 1.1.0 の確かめ直し — 共通の手順

以下 `$S` = `/tmp/claude-0/-home-user/65edaad2-f046-5827-9609-ab9598a81dfe/scratchpad`(新しいコンテナでは自分のスクラッチに読み替える)。

## 目的

前に npm の 1.0.0 で作ったアプリ(`$S/dogfood/<アプリID>/`。元は `audit/dogfood/2026-11-09/<アプリID>/`)に、直した版(1.1.0 の候補。版の番号はまだ 1.0.2 のまま)を入れ直し、

1. 渡した一覧の所見(1.1.0 で直した AP-07 / 08 / 09 / 14 / 33・RV2-L1 / L2 と、そのレビューの修正 QC-* / QD-*)が、本当に直っているか(前と同じ手順で再現しないか)
2. 1.1.0 の新しい機能(固定行 `pinnedTopRows` / `pinnedBottomRows`、`popupContainer`、`groupLabel` / `globalFilterMatch` / select の `clipboard: 'label'`、`numberParser` / `onPasteSkipped`、`applyRows(next, { undoable: false })`、`Shift+F10` / メニューキーの右クリックメニュー)を、渡したものについて自分のアプリへ実際に入れてみて、ドキュメントどおりに動くか
3. 直したことで、前は動いていた操作が壊れていないか(回帰)。1.0.1 / 1.0.2 で直したものが戻っていないかも含む

を確かめる。**ライブラリの修正はしない**(確かめて報告するだけ。自分のアプリのコードは変えてよい)。

## ルール

1. 作業場所は `$S/dogfood/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. 直した版は pack した tarball: `$S/verify110/pack/ishibashi0112-spreadsheet-grid-core-1.0.2.tgz` と `$S/verify110/pack/ishibashi0112-spreadsheet-grid-1.0.2.tgz`。**2 つを一緒に**入れる(`npm install <core の tgz> <react の tgz>`。pnpm のアプリは `pnpm add <core の tgz> <react の tgz>`)。公開版の 1.0.2 と版の番号が同じなので、入れる前に `node_modules/@ishibashi0112` を消す。入れた後、`grep -rl pinnedTopRow node_modules/@ishibashi0112/spreadsheet-grid-core/dist` と `grep -rl ssg-pinned-rows node_modules/@ishibashi0112/spreadsheet-grid/dist` の両方が何か見つけること(= 直した版が入ったこと)を確かめる。見つからなければ npm のキャッシュで公開版が入っているので、消して入れ直す。
3. リポジトリ `/home/user/datasheet-grid` のソース(`packages/` / `audit/harness` など)は読まない。読んでよいのは: 自分のアプリ、`node_modules` の中の同梱の資料(README / API_REFERENCE.md / SKILL.md)、`$S/dogfood/docs/`(website のドキュメント `website-docs/`・API_REFERENCE.md・CHANGELOG.md の「## 未リリース」)、あなたの前の報告 `/home/user/datasheet-grid/docs/audits/2026-11-09/findings-<アプリID>.md`、直したことの一覧 `/home/user/datasheet-grid/docs/audits/2026-11-09/README.md` の §3 の表(AP-*)・§7(RV2-* の説明)・「### 1.1.0 の作業」の節(QC-* / QD-* の表)。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` が使えないときは `require('/home/user/datasheet-grid/node_modules/.pnpm/playwright-core@1.56.0/node_modules/playwright-core')` + `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`)。前に書いたスクリプト(`pw/` / `scripts/` / `t/` など)を使い回してよい。console と pageerror を集める。StrictMode のまま。dev と本番ビルドの両方で、少なくとも主要な操作を一度は確かめる。型の検査(`tsc`)も通すこと(新しい props を書いたら、利用側の `exactOptionalPropertyTypes` を含む今の設定で)。
5. ポートは前と同じものだけ(A 5401 / B 5402 / C 5403 / D 3401 / E 5405 / F 5406 / G 5407 / H 5408 / I 5409 / J 5410 / K 5411・3411 / L 5412)。終わったら自分が起動したサーバーとブラウザを PID で止める(`pkill -f` は使わない。ほかのエージェントとリポジトリのハーネスも同じマシンで動いている)。長く動くサーバーは Bash の `run_in_background` で起動する。
6. 「直っていない」「壊れた」と書く前に、最小の構成で再現し直す。再現が安定しないものは「未確定」。
7. マシンは 4 CPU を共有している(ほかのエージェントとハーネスが同時に動く)。時間の数値は参考値で、重さの判断は本番ビルドで 2 回以上測ってから。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、アプリごとに:

1. **入れた版の確認**: 2 つの印が見つかったか、dev / 本番の両方で起動したか、tsc が通ったか。
2. **直したものの確認**: 渡された一覧の各 ID について「直った / 直っていない / 一部」と、確かめた手順と結果(数値・console の文言・スクショのパス)。
3. **新しい機能を入れてみた結果**: 書いたコード(短く)と、ドキュメントどおりに動いたか。ドキュメントで分かりにくかったところ。
4. **回帰**: 前は動いていて今は壊れた操作(あれば最小の再現)。無ければ「無し」と、確かめた操作の一覧。
5. **新しく見つけたもの**(あれば。前の報告に無いもの。重要度 高 / 中 / 低)。