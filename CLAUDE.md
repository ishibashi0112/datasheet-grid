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
| test | `vp test` | 全緑(現状 ~1,430 tests / 166 files) |
| build | `vp run build:lib`(ルートで `pnpm -r --filter ./packages/* run build:lib` = core → react の順。各パッケージは `vp build --config vite.lib.config.ts` + `tsc -p tsconfig.lib.json`、react はさらに emit-layer-css)。デモ app は `vp build` | 0 |

- リリース: **まず `git checkout main && git pull origin main` で PR マージ後の main を取り込んでから**(古い main 上で版上げすると新機能を含まないコードに新しい版が付いて公開される。2026-10-10 の 0.46.0 がその例)`pnpm run version:minor`(= `node scripts/bump-version.mjs minor`。両パッケージの版を揃えて上げ「X.Y.Z」コミット + `vX.Y.Z` タグ。連番を飛ばすときは `node scripts/bump-version.mjs X.Y.Z` で版を明示)→ ユーザーが `pnpm run publish:all`(= `pnpm -r publish --access public`。core → react の順。2FA は各パッケージ)→ `git push origin main --follow-tags`。旧 `vp exec pnpm version minor` は単一パッケージ時代のもので使わない。
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
- **公開型の JSDoc は API_REFERENCE.md の表から生成する**(2026-10-03 api-docs)。tsc の d.ts は `//` コメントを落とすため、npm 利用者 / AI に届く説明は JSDoc だけ。対象は `SpreadsheetGridProps` / `GridColumn` / `SpreadsheetGridHandle` / `DetailRowOptions` / `LabelRowOptions` / `ScrollHintOptions` / `GridContextMenuParams` / `GridClassNames` のフィールドで、正本は API_REFERENCE.md の表。フィールドを足したら表に行を足し `pnpm run docs:jsdoc`(= `node scripts/sync-api-jsdoc.mjs`)で `gridTypes.core.ts` の JSDoc を再生成する。生成済み JSDoc は手で編集しない(表を直して再生成)。表と型の過不足・JSDoc のずれは `gridTypes.apiDocs.test.ts`(`vp test`)が検出する。`//` の開発メモはそのまま残してよい(d.ts には出ない)。
- npm 同梱物: React 版は `dist` + `API_REFERENCE.md` + `README.md` + `LICENSE`、core は `dist` + `README.md` + `LICENSE`(各パッケージ直下。LICENSE はルートの複製)。
- **運用ルール: ライブラリの機能追加・変更・削除をしたら、同じ作業の中で website も更新する**(該当ガイドの追記 or 新規ページ、API リファレンス両方、必要ならデモ / プレイグラウンドのトグル追加)。ドキュメント未更新のまま機能だけ納品しない。
- ホスティングは Vercel 予定(Root Directory: `website`)。デプロイ操作はユーザーが行う。

## 監査記録とハーネス(2026-10-04 追加)

- 全体監査の記録は `docs/audits/<日付>/README.md`(所見・重要度・実機再現の有無・**問題なしを確認した範囲**・対応状況)と `findings-*.md`(系統別の再現手順 / 行番号)。初回は `docs/audits/2026-10-04/`。
- 実ブラウザ(Chromium)で叩く監査ハーネスは `audit/harness/`(`pnpm run audit:dev` + `pnpm run audit:test`。使い方は同ディレクトリの README)。ルートのゲート対象外(eslint は `globalIgnores(['audit'])`、tsc / vitest の include 外)で、定期確認やリリース前に手動で回す。`t-verify.mjs` は所見の再現 = 修正後の回帰確認に使う。
- 所見を修正したらその記録の「対応状況」を更新する(所見 ID = `RD-1` / `C-1` / `L-01` / `M-01` 等でコミットメッセージから辿れるようにする)。

## 現状と残タスク(詳細は HANDOFF §4 / §7 / §8)

- 最新 v0.47.0(2026-10-10。公開 API は追加のみで既存 API 不変: M-12 列ドラッグの live 方式 `columnDragMotion: 'ghost' | 'live'`(columnHeaderDragController。同じペイン内は掴んだ列が追従し周りの列が退避、固定ペインをまたぐときは縦線 + ゴースト、列ドラッグに Esc キャンセルを追加。新ガイド guides/column-drag)/ M-4 修正 `animateRows` でソート時に DOM 移動された行も滑らせる / website の各デモ・プレイグラウンドで直近のモーション / 機能を試せるようにした)。v0.46.1(2026-10-10 差別化 batch = モーション + 機能 4 件。※ **0.46.0 は欠番扱い**: 版上げを origin/main 取り込み前の古い main 上で実行したため、core 0.46.0 だけが旧コード(= 0.45.0 と同じ中身)で npm に公開された。npm deprecate 済みで、実体は両パッケージとも 0.46.1。公開 API は追加のみで既存 API 不変だが**既定の見た目に変化あり**(`motion` 既定 `'auto'` で動きが入る / `showCopyRange` 既定 true / SSRM 書き戻しの `showSaveStatus` 既定 true / `animateRows` 既定 true。OS の「視差効果を減らす」では自動で止まる)。モーション batch 0〜8: `motion` prop + トークン `--ssg-motion-fast/base/slow/ease` + `.ssg-motion-off`(root + 全ポータル)/ M-1 滑るアクティブセル・M-7 ポップオーバー出現 / M-8 SSRM スケルトンのシマー + 行のフェードイン(`controllers/rowEnterController`。MutationObserver で scroll 由来の mount と DOM 移動を除外)/ M-4・M-5 `animateRows`(ソート / フィルター / グループ開閉の FLIP。auto-height と SSRM では自動無効)/ M-3 `showCopyRange`(store の view スライス `copiedRange` + `CopyRangeOverlay`)/ M-6 `hoverHighlight: 'row' | 'cross'`(`ColumnHoverOverlay`)/ M-2 `highlightChanges`(`controllers/changeHighlightController`。フラッシュ + 数値トゥイーン)/ M-9 `showSaveStatus`(`controllers/saveStatusController` + SSRM `onWriteStateChange`)/ M-11 `rowDragMotion: 'ghost' | 'live'`(rowDragController の live 方式)。F-1 打ち出し(README / ランディング「有料級を MIT で」+ 他にない 5 つ + 他社比較表)/ F-2 セル内検索 `find` + `onFindChange` + ハンドル `openFind` / `closeFind` / `findNext` / `findPrev`(core `logic/find` + `controllers/findController`。時間分割走査、`view/GridFindBar`、`<mark class="ssg-find-mark">`)/ F-3 条件付き書式 `GridColumn.conditionalFormat`(`dataBar` / `colorScale` / `chips`。core `logic/conditionalFormat` + engine `resolveConditionalFormatStats`、`view/GridChip`、トークン `--ssg-cf-*`)/ F-4 website のテーマビルダー `/theme-builder`(実物のグリッド + CSS 変数出力 + 共有 URL。ライブラリは不変)。新ガイド: guides/motion / find / conditional-format。ハーネスでの実機確認は各 batch で実施)。v0.45.0(2026-10-06 SBOM 移行で見つかった編集確定後の不具合 2 件の修正。**既存利用側に挙動変化あり(改善)**: セル編集中にグリッド外の要素(グリッドの上の登録フォームの入力欄 / 上部バーのグローバルフィルター等)をクリックして blur 確定したとき、フォーカスをグリッドへ奪い返さない(確定後の rAF での復帰は `document.activeElement` が null / body / グリッドのルート内のときだけ。Enter / Tab / Escape は従来どおりグリッドへ、`imeDirectInput` 有効時は入力受けへ。展開行カード内は従来どおり奪わない)/ 編集中にグリッド内の別のセル・行・列ヘッダーを押して確定したとき、アクティブセル / 選択を編集していたセルへ戻さない(方向なしの確定時点の activeCell / selection の参照から rAF までに変わっていれば後処理の単一選択を省く。方向付きの確定の移動は不変)。いずれも core `controllers/editController`。公開 API は不変)。v0.44.0(2026-10-06 SBOM 移行(`ishibashi0112/s-b`)向けの機能追加 G-1〜G-3。公開 API は追加のみで既存 API 不変: セル操作の通知 `onCellClick` / `onCellDoubleClick` / `onActiveCellChange`(G-1。`event` は DOM 標準の MouseEvent、`params.preventDefault()` で編集開始を止める。core `logic/cellRef` + `engine/notifiers` の createCellEventNotifier / createActiveCellNotifier)/ セルのメモ `GridColumn.cellNote`(G-3。右上の二重三角 = メモ 10px アンバー + エラー 6px 赤、ツールチップは「エラー → 改行 → メモ」、`--ssg-note-indicator` / `.ssg-body-cell--has-note`)/ IME オンのままの直接入力 `imeDirectInput`(G-2。opt-in。`controllers/imeInputController` の透明な入力受けにフォーカスを置き、変換確定で確定文字列を初期値にエディタへ引き継ぐ。CDP で確認済み・最終確認は Windows + MS-IME 実機))。v0.43.0(2026-10-04 監査ハーネス残 FAIL の切り分け `docs/audits/2026-10-04/` §10。**既存利用側に挙動変化あり**: 行グルーピング中のエクスポート(scope `'view'`)は折りたたみに関係なく全 leaf 行を出力し、`isRowExportable` の `viewRowIndex` は全展開時のビュー行 index(H-1)。ハーネス側の誤り 12 件を修正し FAIL 0(H-2〜H-8))。v0.42.0(2026-10-04 全体監査 `docs/audits/2026-10-04/` の §9 判断待ちを全件対応。**既存利用側に挙動変化あり**: 非表示列の列フィルター / ソートも評価(L-02)/ 空値は昇順・降順とも末尾(L-07 / L-08)/ `getState().columnWidths` は決まった列だけ・`columns` の参照変化で消えない(RD-5 / M-03)/ 端の列の Tab でグリッド外へ(C-5)/ SSRM の失敗ブロックは明示再試行まで再要求しない + 新ハンドル `retryServerSideLoads()`(C-7)/ 表示行数の減少で activeCell / selection を範囲内へ詰める(B-05 補足)/ popover 外側クリックのフォーカス復帰(C-3)/ 確定時の編集可否再評価(RD-6)/ TSV の Excel 互換(L-03 / L-04)/ auto-height の scrollToBottom 補正(M-05)。M-08 / M-09 は文書化のみ、P-2 は対応しない。core の破壊的変更: `createInitialGridUiState()` 引数なし・`RowOrderInputs.visibleColumns` → `filterSortColumns`・`compareUnknownValues` の意味変更)。v0.41.2〜0.41.3(同監査の非破壊修正 RD-1〜3 / C-1 / L-01 / L-05 / P-1 / P-3 / P-7 / M-01 / M-02 / B-02 / B-04 / B-05 / L-09 / L-13 / V-02 / V-03 と文書修正)。v0.41.1(公開型 JSDoc を API_REFERENCE から生成して同梱 / height の % 指定)。v0.41.0(sql-editor-tool からの要望 1〜5、2026-09-24: フィルター入力の IME 変換中ガード(ime-fix)/ `manualFiltering` / `manualSorting`(手動フィルター / 手動ソート = UI と状態通知はそのままで行の絞り込み / 並べ替えを行わない)/ `onFiltersChange` / `onSortChange`(スライス単位の変更通知)/ `getFilterOptions`(set / select / 複合列の候補を非同期に供給。`controllers/asyncSelectOptionsSource` + popover の取得中 / 失敗 + 再試行 / 打ち切り表示)。公開 API は追加のみで既存 API 不変)。v0.40.0(ラベル行 = `labelRow` prop。label-row batch 1〜5 + プレイグラウンドのトグル。公開 API は追加のみで既存 API 不変)。v0.39.0(非依存化 ⑤-1 型境界 + ⑤-2 monorepo 分割: `@ishibashi0112/spreadsheet-grid-core` 0.39.0(初回公開)と `@ishibashi0112/spreadsheet-grid` 0.39.0(core 依存化。公開 API 不変))。v0.38.0(非依存化 ③ 本体分解 E-0〜E-7: `engine/` 10 モジュール(createMemo / columnLayout / rowPipeline / verticalLayout / columnCommands / filterPopoverCommands / rowSelectionCommands / gridApi / notifiers / createGridEngine)+ controllers 追加(autoHeightMeasurer / scrollSyncController / debouncedValueStore / autoSizeOnData)。SpreadsheetGrid.tsx 7,092 → 4,291 行、file 単位 eslint-disable 撤去。挙動不変)。v0.37.0 = ③-9〜③-19(hooks 19 本のコントローラ抽出完了)。v0.36.0 = ④(外部 store)+ ③-1〜③-8。③ ⑤ は完了し、次は ⑥ Solid アダプタ(packages/solid。Solid 2.0 final 後)。
- SSRM は**完成**(2026-07-16)── 読み取り系(`refreshServerSide()` / エラー・リトライ UI は 2026-07-15 の batch 8 / 9)に加え、セル編集の書き戻し(`dataSource.updateRows` + 楽観更新 + 失敗時ロールバック / 保存失敗バー)を 2026-07-16 に実装済み(書き戻し batch 1〜5)。行追加削除は「サーバ反映後に refresh」運用・SSRM の undo/redo は無効(いずれもスコープ外として合意)。
- 行グルーピング + 集計は 2026-07-17 に実装済み(grouping batch 1〜5: `rowGroup` / `aggFunc`、自動グループ列、開閉 UI + 命令的 API。clientSide 限定・SSRM は対象外)。
- 展開行(Master/Detail)は 2026-09-04 に実装済み(detail batch 1〜6: `detailRow` prop、rowKey ベース状態、`data-ssg-detail` イベント境界。clientSide / SSRM 両対応)。
- 行ドラッグ並び替えは 2026-09-04 に実装済み(row-drag batch 1〜5: `enableRowDrag` / `isRowDraggable` / `onRowMove` / `moveRow()`。合成ハンドル列 + ガイド線 + ドロップ後 FLIP。clientSide 限定・ソート / フィルター中は無効。ドラッグ中に行が退避する live 方式は 2026-10-10 の M-11 で `rowDragMotion: 'live'` として実装済み)。
- ラベル行(見出し / 区切り行)は 2026-09-23 に実装済み(label-row batch 1〜5: `labelRow` prop = `isLabelRow` / `getLabel` / `render` / `height` / `className` / `sticky` / `sortMode` / `keepEmptySections` / `exportText`。rows 混在 + 述語識別、セクション内ソート、全幅帯 + sticky-left の中身、縦固定レイヤー、エクスポートの `includeLabelRows` / `rowKinds`。clientSide 中心・SSRM は述語判定のみ・rowGroup とは併用不可)。
- 大きな未実装: 多段カラムヘッダー、ピン留め行、フィルハンドル。※エディタ種別(text / number / select / date / checkbox / custom)とセル編集バリデーション(mark / reject)は 2026-07-14 に実装済み。
- react-doctor 由来の保留: `no-giant-component`(App.tsx + SpreadsheetGrid.tsx)、`require-pnpm-hardening`(`pnpm-workspace.yaml` 判断待ち)、`prefer-module-scope-pure-function`(ハンドラ巻き上げ Batch A 未実行)。