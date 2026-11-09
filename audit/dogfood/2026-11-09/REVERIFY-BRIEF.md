# 1.0.1 の確かめ直し — 共通の手順

以下 `$S` = `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad`。

## 目的

あなたが前に npm の 1.0.0 で作ったアプリ(`$S/dogfood/<アプリID>/`)に、直した版(1.0.1 の候補。版の番号はまだ 1.0.0 のまま)を入れ直し、

1. あなたが報告した所見のうち「1.0.1 で直した」ものが、本当に直っているか(前と同じ手順で再現しないか)
2. 直したことで、前は動いていた操作が壊れていないか(回帰)
3. 直したドキュメント(`$S/dogfood/docs/` の写しを新しくした。CHANGELOG の「## 未リリース」も読む)が、書いてあるとおりに動くか

を確かめる。**修正はしない**(確かめて報告するだけ)。

## ルール

1. 作業場所は `$S/dogfood/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. 直した版は pack した tarball: `$S/verify101/pack/ishibashi0112-spreadsheet-grid-core-1.0.0.tgz` と `$S/verify101/pack/ishibashi0112-spreadsheet-grid-1.0.0.tgz`。**2 つを一緒に**入れる(`npm install <core の tgz> <react の tgz>`。pnpm のアプリは `pnpm add <core の tgz> <react の tgz>`)。入れた後、`node_modules/@ishibashi0112/spreadsheet-grid-core/dist/logic/focusCycle.js` があること(= 直した版が入ったこと)を確かめる。npm のキャッシュで古い版が残ることがあるので、無ければ `node_modules/@ishibashi0112` を消して入れ直す。
3. リポジトリ `/home/user/datasheet-grid` のソース(`packages/` / `audit/harness` など)は読まない。読んでよいのは: 自分のアプリ、`node_modules` の中の同梱の資料(README / API_REFERENCE.md / SKILL.md)、`$S/dogfood/docs/`、あなたの前の報告 `/home/user/datasheet-grid/docs/audits/2026-11-09/findings-<アプリID>.md`、直したことの一覧 `/home/user/datasheet-grid/docs/audits/2026-11-09/README.md` の §3 の表。新しいコンテナでは、アプリは `audit/dogfood/2026-11-09/<アプリID>/` から `$S/dogfood/<アプリID>/` へ写して `npm install` し、tarball はリポジトリで `pnpm pack` して作る。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` が使えないときは `require('/home/user/datasheet-grid/node_modules/playwright-core')` + `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`)。前に書いたスクリプト(`pw/` / `scripts/` / `t/` など)を使い回してよい。console と pageerror を集める。StrictMode のまま。dev と本番ビルドの両方で、少なくとも主要な操作を一度は確かめる。
5. ポートは前と同じものだけ。終わったら自分が起動したサーバーとブラウザを PID で止める(`pkill -f` は使わない)。長く動くサーバーは Bash の `run_in_background` で起動する。
6. 「直っていない」「壊れた」と書く前に、最小の構成で再現し直す。再現が安定しないものは「未確定」。
7. マシンは 4 CPU を共有している。時間の数値は参考値で、重さの判断は本番ビルドで 2 回以上測ってから。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、アプリごとに:

1. **入れた版の確認**: focusCycle.js があったか、dev / 本番の両方で起動したか。
2. **直したものの確認**: 渡された一覧の各 ID について「直った / 直っていない / 一部」と、確かめた手順と結果(数値・console の文言・スクショのパス)。
3. **回帰**: 前は動いていて今は壊れた操作(あれば最小の再現)。無ければ「無し」と、確かめた操作の一覧。
4. **ドキュメント**: 直したドキュメントのとおりに書いて動いたか(該当するものだけ)。
5. **新しく見つけたもの**(あれば。前の報告に無いもの。重要度 高 / 中 / 低)。
