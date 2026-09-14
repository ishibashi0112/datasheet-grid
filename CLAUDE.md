# CLAUDE.md — SpreadsheetGrid 開発ガイド

React 19 + TypeScript + Vite 製のカスタム AG Grid 風・仮想化データグリッドのライブラリ化プロジェクト。**すべて日本語で対応する。** 現状・アーキテクチャ・残タスクの詳細は `SSRM_PROJECT_HANDOFF.md` を参照(本書は規約とワークフローに集中し、詳細は同ドキュメントに委ねる。同ドキュメントはオリジナル消失のため 2026-07-13 に現行コードベースから再作成)。

## 技術スタック

- React 19 / TypeScript / Vite。ツールチェーンは vite+(VoidZero 統合、`vp` コマンド)。
- `@tanstack/virtual-core` v3(React アダプタは自前 `hooks/useVirtualizerCore.ts`)、Vitest、pnpm 11.12.0。
- 公開パッケージ(非依存化 ⑤-2 で monorepo 化、2026-09-14): `packages/core` = `@ishibashi0112/spreadsheet-grid-core`(フレームワーク非依存コア。model / logic / controllers / engine / utils / testing。サブパス `…-core/<dir>/<module>` を exports の `./*` で公開)と `packages/react` = `@ishibashi0112/spreadsheet-grid`(React 版。core に `workspace:^` で依存し、publish 時は `^X.Y.Z` に変換される。両パッケージの版は常に揃える)。ルートは private な workspace(デモ app + 共通ツールチェーン)。website は React 版を `workspace:*` で参照。
- 開発時の解決: core の package.json `exports` は `./src/*.ts` を指し(ビルド不要でテスト / 型チェックが通る)、`publishConfig.exports` が publish 時に dist へ差し替える(pnpm が publishConfig を適用)。React 版の dist は core を外部化する(バンドルしない)。
- 消費側 UI 例: Mantine / HeroUI / Tailwind(v3・v4)。共存が設計要件。

## 厳守事項

### 改行コード

- **全ファイル LF・UTF-8**。`.gitattributes`(`* text=auto eol=lf`)と `.editorconfig` で固定済み。Windows で clone しても CRLF 化しない。
- **末尾改行なし**(`.editorconfig` の `insert_final_newline = false`)。
- ※歴史的経緯: 旧 Windows 運用では作業ツリー都合で src 配下を CRLF 扱いし Python バイト編集していたが、**git 正本は元から LF**。Mac / Claude Code では通常どおり編集してよい(CRLF 変換・`bare_lf=0` 検証・`rm -rf src` 再展開は不要)。

### eslint

- baseline を **1 件も増やさない**。現状 **0 problems(0 errors / 0 warnings)**(2026-09-13 非依存化 ②で react-virtual 起因の `incompatible-library` 2 件が消滅、③ のコントローラ抽出で latest-ref 由来の warning も消滅)── ただしセッション冒頭に実測で確定する。対象は `**/*.{ts,tsx}` のみ(`.mjs` スクリプトは対象外)。errors は 2026-07 に全件解消済み(修正 or 理由付き disable)。CI で lint はブロッキング。
- `react-hooks/set-state-in-effect` は「effect 内の**先頭** setState のみ報告」する。先頭でない setState に disable を付けると Unused directive warning になる。
- `SpreadsheetGrid.tsx` の file 単位 eslint-disable(`react-hooks/refs` / `immutability` / `set-state-in-effect`。非依存化 ②で置いたもの)は本体分解 E-1〜E-6(2026-09-14)で latest-ref イディオムを全件エンジン / コントローラへ移して撤去済み。render 中の `ref.current` 参照 / 代入は baseline にカウントされるので増やさない。最新値をイベント / rAF から読みたいときは latest-ref ではなく、コントローラの `update(args)`(useController がレイアウト effect で毎レンダー渡す)経由で読む。React Compiler の lint は `xxxRef` という名前の変数を ref 扱いするため、ref でない構造的 `{ current }` ホルダーには Ref 接尾辞を付けない(例: `detailIndexCacheHolder`)。

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
| eslint | `vp exec eslint .` | baseline 維持(現状 0 errors / 0 warnings) |
| test | `vp test` | 全緑(現状 ~1,216 tests / 145 files) |
| build | `vp run build:lib`(ルートで `pnpm -r --filter ./packages/* run build:lib` = core → react の順。各パッケージは `vp build --config vite.lib.config.ts` + `tsc -p tsconfig.lib.json`、react はさらに emit-layer-css)。デモ app は `vp build` | 0 |

- リリース: `pnpm run version:minor`(= `node scripts/bump-version.mjs minor`。両パッケージの版を揃えて上げ「X.Y.Z」コミット + `vX.Y.Z` タグ)→ ユーザーが `pnpm run publish:all`(= `pnpm -r publish --access public`。core → react の順。2FA は各パッケージ)→ `git push origin main --follow-tags`。旧 `vp exec pnpm version minor` は単一パッケージ時代のもので使わない。
- 依存インストールは `vp install`(pnpm へ委譲)。ローカルのゲートは上記 vp 経由で実行する。※ `devEngines` は 2026-07-18 に削除(pnpm 11 が lockfile へ書く packageManagerDependencies ドキュメントを Vercel CLI が解釈できずデプロイが失敗するため)。pnpm のピンは `packageManager` フィールドで維持(復活させないこと。詳細は `website/README.md`)。CI(GitHub Actions)は pnpm で package.json スクリプトを実行する(`pnpm test` / `pnpm run build:lib` 等)。
- vite+ 統合は **2026-07-13 に設定済み**: `pnpm-workspace.yaml` の overrides(`vite` → `@voidzero-dev/vite-plus-core` エイリアス / `vitest` を vp 同梱版へ pin)+ devDependency `vite-plus`(native binding 供給)。これにより `vite` の bin は `vp` に置き換わり、package.json scripts も vp 化済み。この構成を崩すと `vp test` が同梱 vitest へフォールバックし、jsdom を解決できず DOM 系テストが起動しなくなる(2026-07 の障害の原因)。vitest の pin は `vp --version` の同梱バージョンと揃えること。`vite` override(`-dev/vite-plus-core`)も `` ではなく vite-plus devDependency と同じ版へ固定する(2026-09-13。`` は lockfile 更新のたびに再解決され vp 本体と core がずれた)。

## アーキテクチャ要点(詳細は HANDOFF §2 / §3 / §5)

- reducer ベースの状態管理(2026-09-13 非依存化 ④-1 で React 非依存の外部 store `model/gridStore.ts` = `createGridStore(getState / dispatch / subscribe)` に載せ替え。React は `hooks/useGridStore.ts` の `useSyncExternalStore` で購読。④-2 で一時状態(ビューポート計測 / ホバー)も同 store の view スライス `getViewState / setViewState` へ)、命令的 ref API、3 ペイン固定列レイアウト、SSRM(サーバーサイド行モデル)。
- `packages/react/src/SpreadsheetGrid.tsx` は本体分解 E-0〜E-6(2026-09-14)で 7,092 行 → ~4,300 行。派生値計算とコマンド群は `engine/`(React 非依存: columnLayout / rowPipeline / verticalLayout / columnCommands / filterPopoverCommands / rowSelectionCommands / gridApi(命令的 API の実体)/ notifiers、メモ化は `engine/memo.ts` の `createMemo` = useMemo と同じ Object.is 比較)へ、DOM を触る処理は `controllers/`(autoHeightMeasurer / scrollSyncController / debouncedValueStore 等)へ移設済み。シェル側はリゾルバ呼び出しを React Compiler lint(preserve-manual-memoization)向けに `useMemo` で包み、コマンド / コントローラは `useController`(生成 + update + dispose。外部通知は `'passive'` タイミング)で接続する。E-7(2026-09-14)で `engine/createGridEngine.ts` に束ね、シェルは `useState(createGridEngine)` 1 箇所 + `useControllerLifecycle` 接続。Solid アダプタは同じ engine を createEffect で接続する想定。シェルに残る useCallback / useMemo は JSX 組み立て・React 合成イベントの接着・popover 系 hook との配線(React 寄り)。
- 純粋ロジックは `logic/` に抽出(テスタビリティ)。hooks は薄いオーケストレーション層。
- `packages/core`(model / logic / controllers / engine / utils)は **React 非依存**を保つ(2026-09-13 非依存化 ①、⑤-2 で物理分離。eslint の `no-restricted-imports` で react / react-dom / React 版パッケージの import を禁止)。公開型の本体は `model/gridTypes.core.ts`(描画ノード / style はフレームワーク束ね型 `F` 経由で `F['node']` / `F['style']`)、React 束縛は `model/gridTypes.ts`(`ReactGridTypes` で固定したエイリアス + `ref` prop)。`ReactNode` / `CSSProperties` を core に import しない。非依存化 ⑤-1(2026-09-14)以降、core は React 束縛の `packages/react/src/model/gridTypes.ts` を import せず(物理的にも不可)、`model/gridTypes.unbound.ts`(描画ノード / style を any で素通しする内部層専用の束縛)か `gridTypes.core.ts`(F ジェネリックのまま扱う場合)から型を取る。この境界は eslint(`no-restricted-imports`)で固定済み。DOM を扱うがフレームワーク非依存のコードは `controllers/`(③ で hooks から抽出。`{ update, attach, dispose, subscribe? }` の共通形。React を import しない)に置き、`hooks/` は effect に接続するだけの薄いアダプタにする。F は `F['node']` の位置から推論されないため、F ジェネリックな関数の呼び出しでは型引数を明示する(`resolveScrollHintOptions<T, ReactGridTypes>(...)`)。
- CSS: 未レイヤー単一クラス基底(Tailwind/Mantine/HeroUI 共存のため `@layer` は使わない ── 未レイヤーはレイヤー付きに特異度無関係で勝つため)。Portal 系(popover/tooltip)は `.ssg-root` 外に描画されるためリテラル色を使う。
- 仮想化 DOM 上のドラッグは window レベルのリスナ + `pointerId` フィルタ(要素直付けは capture 対象の unmount で壊れる)。

## ドキュメントサイト(website/)

- 2026-07-18 追加。Next.js 16 + Fumadocs 16 + Tailwind v4 の日本語ドキュメントサイト(pnpm workspace メンバー、lib は `link:..` 参照)。詳細は `website/README.md`。
- ルートのゲート(eslint / tsc -b / vitest)の**対象外**(eslint は `globalIgnores(['website'])`)。website の検証は `cd website && vp exec next build`。
- API リファレンス(`website/content/docs/api/`)は `packages/react/API_REFERENCE.md` の複製。**型変更時は両方同期**。
- **運用ルール: ライブラリの機能追加・変更・削除をしたら、同じ作業の中で website も更新する**(該当ガイドの追記 or 新規ページ、API リファレンス両方、必要ならデモ / プレイグラウンドのトグル追加)。ドキュメント未更新のまま機能だけ納品しない。
- ホスティングは Vercel 予定(Root Directory: `website`)。デプロイ操作はユーザーが行う。

## 現状と残タスク(詳細は HANDOFF §4 / §7 / §8)

- 最新 v0.39.0(非依存化 ⑤-1 型境界 + ⑤-2 monorepo 分割: `@ishibashi0112/spreadsheet-grid-core` 0.39.0(初回公開)と `@ishibashi0112/spreadsheet-grid` 0.39.0(core 依存化。公開 API 不変))。v0.38.0(非依存化 ③ 本体分解 E-0〜E-7: `engine/` 10 モジュール(createMemo / columnLayout / rowPipeline / verticalLayout / columnCommands / filterPopoverCommands / rowSelectionCommands / gridApi / notifiers / createGridEngine)+ controllers 追加(autoHeightMeasurer / scrollSyncController / debouncedValueStore / autoSizeOnData)。SpreadsheetGrid.tsx 7,092 → 4,291 行、file 単位 eslint-disable 撤去。挙動不変)。v0.37.0 = ③-9〜③-19(hooks 19 本のコントローラ抽出完了)。v0.36.0 = ④(外部 store)+ ③-1〜③-8。③ ⑤ は完了し、次は ⑥ Solid アダプタ(packages/solid。Solid 2.0 final 後)。
- SSRM は**完成**(2026-07-16)── 読み取り系(`refreshServerSide()` / エラー・リトライ UI は 2026-07-15 の batch 8 / 9)に加え、セル編集の書き戻し(`dataSource.updateRows` + 楽観更新 + 失敗時ロールバック / 保存失敗バー)を 2026-07-16 に実装済み(書き戻し batch 1〜5)。行追加削除は「サーバ反映後に refresh」運用・SSRM の undo/redo は無効(いずれもスコープ外として合意)。
- 行グルーピング + 集計は 2026-07-17 に実装済み(grouping batch 1〜5: `rowGroup` / `aggFunc`、自動グループ列、開閉 UI + 命令的 API。clientSide 限定・SSRM は対象外)。
- 展開行(Master/Detail)は 2026-09-04 に実装済み(detail batch 1〜6: `detailRow` prop、rowKey ベース状態、`data-ssg-detail` イベント境界。clientSide / SSRM 両対応)。
- 行ドラッグ並び替えは 2026-09-04 に実装済み(row-drag batch 1〜5: `enableRowDrag` / `isRowDraggable` / `onRowMove` / `moveRow()`。合成ハンドル列 + ガイド線 + ドロップ後 FLIP。clientSide 限定・ソート / フィルター中は無効。ドラッグ中に行が退避する live 方式は未実装 = 後付け可)。
- 大きな未実装: 多段カラムヘッダー、ピン留め行、フィルハンドル。※エディタ種別(text / number / select / date / checkbox / custom)とセル編集バリデーション(mark / reject)は 2026-07-14 に実装済み。
- react-doctor 由来の保留: `no-giant-component`(App.tsx + SpreadsheetGrid.tsx)、`require-pnpm-hardening`(`pnpm-workspace.yaml` 判断待ち)、`prefer-module-scope-pure-function`(ハンドラ巻き上げ Batch A 未実行)。