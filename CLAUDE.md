# CLAUDE.md — SpreadsheetGrid 開発ガイド

React 19 + TypeScript + Vite 製のカスタム AG Grid 風・仮想化データグリッドのライブラリ化プロジェクト。**すべて日本語で対応する。** 現状・アーキテクチャ・残タスクの詳細は `SSRM_PROJECT_HANDOFF.md` を参照(本書は規約とワークフローに集中し、詳細は同ドキュメントに委ねる。同ドキュメントはオリジナル消失のため 2026-07-13 に現行コードベースから再作成)。

## 技術スタック

- React 19 / TypeScript / Vite。ツールチェーンは vite+(VoidZero 統合、`vp` コマンド)。
- `@tanstack/react-virtual` v3、Vitest、pnpm 11.12.0。
- 公開パッケージ: `@ishibashi0112/spreadsheet-grid`(npm、`publishConfig.access: public`、`prepublishOnly` で `build:lib`)。
- 消費側 UI 例: Mantine / HeroUI / Tailwind(v3・v4)。共存が設計要件。

## 厳守事項

### 改行コード

- **全ファイル LF・UTF-8**。`.gitattributes`(`* text=auto eol=lf`)と `.editorconfig` で固定済み。Windows で clone しても CRLF 化しない。
- **末尾改行なし**(`.editorconfig` の `insert_final_newline = false`)。
- ※歴史的経緯: 旧 Windows 運用では作業ツリー都合で src 配下を CRLF 扱いし Python バイト編集していたが、**git 正本は元から LF**。Mac / Claude Code では通常どおり編集してよい(CRLF 変換・`bare_lf=0` 検証・`rm -rf src` 再展開は不要)。

### eslint

- baseline を **1 件も増やさない**。現状 **3 problems(0 errors / 3 warnings)** ── ただしセッション冒頭に実測で確定する。対象は `**/*.{ts,tsx}` のみ(`.mjs` スクリプトは対象外)。errors は 2026-07 に全件解消済み(修正 or 理由付き disable)。CI で lint はブロッキング。
- `react-hooks/set-state-in-effect` は「effect 内の**先頭** setState のみ報告」する。先頭でない setState に disable を付けると Unused directive warning になる。
- render 中の `ref.current = x` 代入は baseline にカウントされる。新しい安定コールバックは latest-ref を増やさず `useCallback` の deps に直接入れる。rAF tick から不安定な関数を読む必要がある場合は useEffect 内で同期する latest-ref(RS-AS 方式)。

### TypeScript

- `strict` on(2026-07 に全 tsconfig へ明示) / `noUncheckedIndexedAccess` OFF / `verbatimModuleSyntax` on(型は必ず `import type`)。index アクセスの null 安全は実行時ガードで担保。

### その他

- コメント・UI テキスト・コミュニケーションはすべて日本語。応答は簡潔に。
- パフォーマンス検証は本番ビルドのみ。

## ワークフロー

1. セッション冒頭に**ベースライン確認**(下記ゲートが全緑であること)。
2. **方針合意 → diff 提示 → 承認 → 実装 → 全ゲート検証 → コミット**。
3. **1 バッチ = 1 コミット**(独立に検証可能な単位)。ユーザーが「推奨で」「一気に実装したい」等と言えば設計判断を委任しバッチ粒度を広げてよい(納品前の全ゲート緑確認は必須)。途中で判断が要る事項が出たら遠慮なく質問する。
4. コミットメッセージ例: `feat(ssrm): ... — stage 2-N`。
5. UX の設計判断が要るときは、実装前にインタラクティブな HTML プレビューで選択肢を提示し、名前付きオプションから選んでもらう。

## ゲート(全緑必須)

| ゲート | コマンド | 期待値 |
| --- | --- | --- |
| tsc(build) | `vp exec tsc -b` | 0 |
| tsc(test) | `vp exec tsc -p tsconfig.vitest.json --noEmit` | 0 |
| eslint | `vp exec eslint .` | baseline 維持(現状 0 errors / 3 warnings) |
| test | `vp test` | 全緑(現状 ~687 tests / 65 files) |
| build | `vp build`(publish 経路は `build:lib` = `vp build --config vite.lib.config.ts` + `tsc -p tsconfig.lib.json` + emit-layer-css) | 0 |

- 依存インストールは `vp install`(pnpm へ委譲)。ローカルのゲートは上記 vp 経由で実行する。※ `devEngines` は 2026-07-18 に削除(pnpm 11 が lockfile へ書く packageManagerDependencies ドキュメントを Vercel CLI が解釈できずデプロイが失敗するため)。pnpm のピンは `packageManager` フィールドで維持(復活させないこと。詳細は `website/README.md`)。CI(GitHub Actions)は pnpm で package.json スクリプトを実行する(`pnpm test` / `pnpm run build:lib` 等)。
- vite+ 統合は **2026-07-13 に設定済み**: `pnpm-workspace.yaml` の overrides(`vite` → `@voidzero-dev/vite-plus-core` エイリアス / `vitest` を vp 同梱版へ pin)+ devDependency `vite-plus`(native binding 供給)。これにより `vite` の bin は `vp` に置き換わり、package.json scripts も vp 化済み。この構成を崩すと `vp test` が同梱 vitest へフォールバックし、jsdom を解決できず DOM 系テストが起動しなくなる(2026-07 の障害の原因)。vitest の pin は `vp --version` の同梱バージョンと揃えること。

## アーキテクチャ要点(詳細は HANDOFF §2 / §3 / §5)

- reducer ベースの状態管理、命令的 ref API、3 ペイン固定列レイアウト、SSRM(サーバーサイド行モデル)。
- `SpreadsheetGrid.tsx` は既知の God component(~5,000 行)。リファクタは保留。
- 純粋ロジックは `logic/` に抽出(テスタビリティ)。hooks は薄いオーケストレーション層。
- CSS: 未レイヤー単一クラス基底(Tailwind/Mantine/HeroUI 共存のため `@layer` は使わない ── 未レイヤーはレイヤー付きに特異度無関係で勝つため)。Portal 系(popover/tooltip)は `.ssg-root` 外に描画されるためリテラル色を使う。
- 仮想化 DOM 上のドラッグは window レベルのリスナ + `pointerId` フィルタ(要素直付けは capture 対象の unmount で壊れる)。

## ドキュメントサイト(website/)

- 2026-07-18 追加。Next.js 16 + Fumadocs 16 + Tailwind v4 の日本語ドキュメントサイト(pnpm workspace メンバー、lib は `link:..` 参照)。詳細は `website/README.md`。
- ルートのゲート(eslint / tsc -b / vitest)の**対象外**(eslint は `globalIgnores(['website'])`)。website の検証は `cd website && vp exec next build`。
- API リファレンス(`website/content/docs/api/`)は `API_REFERENCE.md` の複製。**型変更時は両方同期**。
- **運用ルール: ライブラリの機能追加・変更・削除をしたら、同じ作業の中で website も更新する**(該当ガイドの追記 or 新規ページ、API リファレンス両方、必要ならデモ / プレイグラウンドのトグル追加)。ドキュメント未更新のまま機能だけ納品しない。
- ホスティングは Vercel 予定(Root Directory: `website`)。デプロイ操作はユーザーが行う。

## 現状と残タスク(詳細は HANDOFF §4 / §7 / §8)

- 最新 v0.19.0。
- SSRM は**完成**(2026-07-16)── 読み取り系(`refreshServerSide()` / エラー・リトライ UI は 2026-07-15 の batch 8 / 9)に加え、セル編集の書き戻し(`dataSource.updateRows` + 楽観更新 + 失敗時ロールバック / 保存失敗バー)を 2026-07-16 に実装済み(書き戻し batch 1〜5)。行追加削除は「サーバ反映後に refresh」運用・SSRM の undo/redo は無効(いずれもスコープ外として合意)。
- 行グルーピング + 集計は 2026-07-17 に実装済み(grouping batch 1〜5: `rowGroup` / `aggFunc`、自動グループ列、開閉 UI + 命令的 API。clientSide 限定・SSRM は対象外)。
- 大きな未実装: 多段カラムヘッダー、ピン留め行、フィルハンドル。※エディタ種別(text / number / select / date / checkbox / custom)とセル編集バリデーション(mark / reject)は 2026-07-14 に実装済み。
- react-doctor 由来の保留: `no-giant-component`(App.tsx + SpreadsheetGrid.tsx)、`require-pnpm-hardening`(`pnpm-workspace.yaml` 判断待ち)、`prefer-module-scope-pure-function`(ハンドラ巻き上げ Batch A 未実行)。