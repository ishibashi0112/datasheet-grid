# findings-packagingF — パッケージング / ビルド成果物 / ドキュメント整合(利用者視点)

## 1. 概要

- 読んだ範囲: `packages/core|react/package.json`(exports / publishConfig / files / sideEffects / peer)、`packages/*/vite.lib.config.ts`、`packages/*/tsconfig(.lib).json`、`packages/react/scripts/emit-layer-css.mjs`、`scripts/bump-version.mjs` / `sync-api-jsdoc.mjs`、両 dist の全ファイル(core 312 / react 65)、`.github/workflows/ci.yml`、`packages/react/API_REFERENCE.md` と `website/content/docs/api/*.mdx`、各 README / LICENSE。
- 実消費テスト(`scratchpad/agents/packagingF/consumer/`): `pnpm pack` で両 tgz 化 → React 19.3 / TypeScript 6.0.3 / Vite 8.3 の最小プロジェクトへ install →(a) `tsc --noEmit`(strict。bundler / node16 / nodenext の 3 通り + skipLibCheck:false)、(b) Node 22 で ESM `import` / CJS `require`(jsdom 無し)、(c) `react-dom/server` の `renderToString` 5 構成、(d) Vite 本番ビルド。tgz はスクラッチ配下のみに出力(リポジトリ内に .tgz なし)。
- 所見: 7 件(高 1 / 中 3 / 低 3)。一時テストファイルは作成していない。リポジトリの追跡ファイルは未変更(`git status` に出ている `zz_audit_*` は他エージェントのもの)。

## 2. 所見一覧

| ID | 重要度 | 確度 | 要約 | file:line |
| --- | --- | --- | --- | --- |
| P-1 | 高 | 確実 | 配布 d.ts の相対 import に拡張子が無く、`moduleResolution: node16 / nodenext` の利用側で **公開型が全部 `any` に潰れる**(skipLibCheck:true で無言。TS 6 の `tsc --init` 既定がこの構成) | `packages/react/dist/index.d.ts:1`(`from './SpreadsheetGrid'`)/ `packages/core/dist/logic/valueFormatters.d.ts:1`(`'../model/gridTypes.unbound'`)← `packages/react/tsconfig.lib.json` / `packages/core/tsconfig.lib.json` の declaration emit |
| P-2 | 中 | 確実 | CJS 利用側(`moduleResolution: node16`、`.cts` / `type` 無し)で TS1479 ── `require` 条件は `index.cjs` だが型は ESM 扱いの `index.d.ts` しか無い(masquerading-as-ESM) | `packages/react/package.json:40-50`(exports `"."` / `"./testing"`)、`packages/core/package.json:35-52`(publishConfig.exports) |
| P-3 | 中 | 確実 | README 推奨の `import '@ishibashi0112/spreadsheet-grid/style.css'` が TypeScript 6.0.3 の `strict: true`(= `noUncheckedSideEffectImports` 有効)で **TS2882** になる(`vite/client` / Next の `*.css` 宣言が無い利用側) | `packages/react/package.json:51-52`(`./style.css` / `./style.layer.css` に `types` 条件なし)、`packages/react/README.md:14-17` |
| P-4 | 中 | 確実 | `GridState` のドキュメントが v1 のまま(`{ version, columnWidths, filters, sort }`・現行 `1`・列メタは「含めない」)。実装は **v2** で `columns`(可視 / 順序 / ピン)を `getState()` が常に出力・`applyState` が `onColumnsChange` 経由で列順 / ピン / 幅焼き込みまで適用・`onStateChange` も列メタ変化で発火。`GridColumnState` 型は export されているが API_REFERENCE に未登場 | `packages/react/API_REFERENCE.md:1089-1092`、`website/content/docs/api/handle.mdx:271` ↔ `packages/core/src/logic/gridState.ts:29`、`packages/core/src/engine/gridApi.ts:538-566`、`packages/core/src/engine/notifiers.ts:112-157` |
| P-5 | 低 | 確実 | website の API 複製が 1 行遅れ: キーボード表の `Ctrl/Cmd+C` 行に `isRowExportable` の注記が無い(他 209 行は Name / Type / Default 一致) | `website/content/docs/api/props.mdx`(`Ctrl/Cmd+C` 行)↔ `packages/react/API_REFERENCE.md` 同行 |
| P-6 | 低 | 確実 | CI コメント「devEngines.packageManager と揃える」が古い(devEngines は削除済み、ピンは `packageManager`)。CI は CLAUDE.md ゲート表の「デモ app は `vp build`」と website build を実行しない | `.github/workflows/ci.yml:22-24`、`:40-44` |
| P-7 | 低 | 高 | `exports` に `./package.json` が無く、`pkg/package.json` を import 解決するツール(バンドルアナライザ / 一部 lint)が弾かれる | `packages/react/package.json:40`、`packages/core/package.json:35` |

## 3. 各所見の詳細

### P-1(高 / 確実)node16 / nodenext 解決で配布型が `any` に潰れる

- 再現(consumer): `tsconfig` に `"module": "nodenext", "moduleResolution": "nodenext", "strict": true, "skipLibCheck": true`(= TypeScript 6.0.3 の `tsc --init` が吐く既定)。
  ```ts
  import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
  export const probe: number = SpreadsheetGrid   // nodenext: エラーなし(any) / bundler: TS2322
  <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(row) => row.id} />  // nodenext: TS7006 'row' implicitly any
  ```
  `--skipLibCheck false` にすると原因が露出する:
  `spreadsheet-grid/dist/index.d.ts(1,33): TS2834: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'`、
  `spreadsheet-grid-core/dist/logic/valueFormatters.d.ts(1,41): TS2307: Cannot find module '../model/gridTypes.unbound'`。
- 期待: bundler と同じく全型が解決される。実際: `"type": "module"` パッケージの d.ts は ESM として読まれ、拡張子無しの相対 import(react dist 39 ファイル / 61 箇所、core dist 158 箇所。`.js` 付きは 0)が **解決失敗 → `any`**。skipLibCheck:true が通常なので利用側に警告が一切出ない。入口の `index.d.ts` 1 行目が落ちるため `SpreadsheetGrid` / `GridColumn` / `SpreadsheetGridHandle` 等すべてが any になる。
- 原因: ソースが拡張子無し相対 import(`moduleResolution: bundler`)で、`tsc -p tsconfig.lib.json` がそのまま d.ts へ出す。リポジトリ内(root / packages / website)は全部 bundler 解決なので検出されない。JS 側(vite/rolldown 出力)は `./model/gridActions.js` と拡張子付きで問題なし。
- 修正の方向性: ソースの相対 import を `.ts` 付きにして `rewriteRelativeImportExtensions`(TS 5.7+)で emit、または `emit-layer-css.mjs` の `stripCssImports` と同じ後処理で d.ts の相対 import に `.js` を付与、または d.ts をバンドル(`vite-plugin-dts` の `rollupTypes`)。CI に nodenext 解決の消費 tsc を 1 本足す。

### P-2(中 / 確実)CJS 利用側(node16)の TS1479

- 再現(consumer `src/cjs-check.cts`、`moduleResolution: node16`):
  `import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'` → `TS1479: The current file is a CommonJS module whose imports will produce 'require' calls; however, the referenced file is an ECMAScript module`(`/testing` も同様)。`nodenext`(TS 5.8+ の require(esm) 許容)では通る。
- 原因: `exports["."].require` は `./dist/index.cjs` だが、`types` は ESM 扱い(`type: module` 配下の `.d.ts`)の 1 本だけ。実行時 `require()` 自体は通る(下記 §4)ので型だけの問題。
- 修正の方向性: `require` 条件に `types: './dist/index.d.cts'`(d.ts を複製 / リネーム)を付ける(core の `./*` も同様に `./dist/*.d.cts`)。P-1 の拡張子付与と同時にやるのが楽。

### P-3(中 / 確実)`style.css` の副作用 import が TS 6 strict で TS2882

- 再現: consumer `tsconfig.bundler.json`(strict、`types: []`、vite/client なし)で `import '@ishibashi0112/spreadsheet-grid/style.css'` → `TS2882: Cannot find module or type declarations for side-effect import`。`--noUncheckedSideEffectImports false` または `strict: false` で消える(TypeScript 6.0.3 では strict 配下で有効。`tsc --init` も `noUncheckedSideEffectImports: true` を出力)。
- 期待: README の手順どおりに書いて型検査が通る。実際: Vite(`vite/client`)/ Next(`*.css` 宣言)以外の TS 利用側(SSR サーバ / テスト / ライブラリ内)で型エラー。
- 修正の方向性: `exports["./style.css"]` / `["./style.layer.css"]` を `{ types: './dist/style.css.d.ts', default: './dist/style.css' }` の形にして空宣言(`export {}`)を同梱する(emit-layer-css.mjs で生成可)。少なくとも README に注記。

### P-4(中 / 確実)`GridState` v2(列メタ)の未文書化

- 実装: `GRID_STATE_VERSION = 2`(`gridState.ts:29`)。`getState()` は `extractColumnState(columns)` を常に `columns` へ出力(`gridApi.ts:538-546`)。`applyState` は `onColumnsChange` 指定時に `applyColumnState` で **列順 / visible / pinned を上書き**し、手動リサイズ幅を `column.width` へ焼き込む(`gridApi.ts:548-566`、`gridState.ts:10-12, 41`)。`onStateChange` は列メタ変化でも発火(`notifiers.ts:112, 131, 153-157`)。
- ドキュメント(API_REFERENCE 1089-1092 / website handle.mdx:271): 「`GridState`: `{ version, columnWidths, filters, sort }`。version 現行 `1`。列の可視/順序/ピン/flex は columns prop 側のため**含めない**」。`getState()` / `onStateChange` 行も「手動リサイズ幅 / フィルター / ソート」のみ。`GridColumnState` 型は `index.ts` から export されるが API_REFERENCE に 1 度も出ない(`gridTypes.apiDocs.test.ts` の対象型にも含まれないので検出されない)。
- 実害: 「列順は保存されない」と読んだ利用者が `applyState(saved)` を呼ぶと、`onColumnsChange` 指定時に列順 / ピン / 可視が保存時点へ巻き戻る。保存 JSON を手で組む利用者は `columns` を知らない。`version: 1` と書かれた状態を期待して分岐するコードも誤る。
- 修正の方向性: API_REFERENCE の `GridState` 節(両複製)を v2 に更新し `GridColumnState` の表を追加。`apiDocs` の同期対象に加えるか検討。

### P-5(低 / 確実)website 複製の 1 行遅れ

- `website/content/docs/api/props.mdx` のキーボード表 `Ctrl/Cmd+C` 行: 「選択範囲の TSV コピー / アクティブセル起点の貼り付け(readOnly では no-op)」。API_REFERENCE 同行は「(`isRowExportable` 指定時は `false` の行を除く)」付き。それ以外の 209 行は Name / Type / Default とも一致(行集合も同一)。

### P-6(低 / 確実)CI の記述ずれ

- `ci.yml:22-24` のコメントが `devEngines.packageManager` を参照(CLAUDE.md: devEngines は 2026-07-18 に削除、ピンは `packageManager`)。`version: 11.12.0` と `packageManager: pnpm@11.12.0` は一致しているため動作に支障なし(action は不一致時のみエラー)。
- CI は tsc / test / build:lib / lint を実行するが、CLAUDE.md ゲート表の「デモ app は `vp build`」と website(`next build`)は未実行。
- 要確認(低): pnpm/action-setup README は後継 `pnpm/setup` への移行を案内している。現状動作に影響なし。

### P-7(低 / 高)`./package.json` が exports に無い

- `exports` が `"."`, `"./testing"`, `"./style*.css"`(react)/ `"./*"`(core。`package.json` は `./dist/package.json.js` へ写像され存在しない)のため、`import pkg from '@ishibashi0112/spreadsheet-grid/package.json'` 系のツールが `ERR_PACKAGE_PATH_NOT_EXPORTED`。慣例どおり `"./package.json": "./package.json"` を足すだけ。

## 4. 確認したが問題なしだった観点

- **publish 変換**: `pnpm pack` の package.json で core の `publishConfig.exports / main / module / types` が差し替わり、react の `workspace:^` が `^0.41.1` に変換されることを確認(tgz 展開で実測)。同梱物: core = `dist`(312)+ `LICENSE` + `README.md` + `package.json`、react = `dist`(65)+ `API_REFERENCE.md` + `LICENSE` + `README.md`。`prepublishOnly` は pack 出力から除去される。
- **core 外部化と解決**: react `dist/index.js` / `index.cjs` は core を 61 のサブパス(`@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`)のまま外部化。全サブパスに core dist の `.js` / `.cjs` / `.d.ts` が存在(照合済み)。`/testing` は core の明示 export `./testing` → `dist/testing/index.*` で解決。preserveModules 出力に共有 chunk(`_virtual` 等)は無く、`./*` 写像から漏れるファイルなし。react / react-dom / `react/jsx-runtime` / `@tanstack/virtual-core` も外部化(CJS 側も `require("react/jsx-runtime")`)。
- **Node 実行(SSR 耐性)**: jsdom 無しの Node 22 で ESM `import()` / CJS `require()` とも成功(`typeof window === 'undefined'` のまま。公開値 `SpreadsheetGrid` / `numberFormatter`、`/testing` の `installJsdomLayoutStubs`、core ルート 4 値、core サブパス require)。モジュールスコープで window / document / matchMedia を触るコードなし。`process.env` / `import.meta` は dist に無し。ES2023+ のランタイム API(toSorted / structuredClone / groupBy 等)も無く `engines.node >= 18` と整合。
- **renderToString**: basic / `theme="auto"` + scrollHint + rowSelection / labelRow + detailRow / rows 空 / SSRM(dataSource)の 5 構成が例外・警告なしに描画(`.ssg-root` あり、仮想化行 21 行)。`'use client'` は付いていないが README に「Client Component から描画」と明記済み。
- **Vite ビルド**: `style.layer.css` 経由で `@layer ssg-base` に包まれた CSS が 1 本に抽出され、未解決の core パスなし。警告は標準の chunk-size(react-dom 込み 518 kB min。grid 本体 ≒ ESM 184 kB + core)のみで、ライブラリ起因の警告なし。
- **`style.layer.css` が 44 バイトな理由**: 設計どおり 1 行の `@import url("./style.css") layer(ssg-base);`(複製を持たず利用側バンドラ / ブラウザが解決。Vite で取り込み確認)。
- **sideEffects**: core `false` はモジュールスコープ副作用が無いので安全。react `["**/*.css"]` は dist/style.css を保護。JS から CSS 注入しない設計と整合。
- **d.ts の CSS import 除去**: `emit-layer-css.mjs` の後処理で `.css` 副作用 import は 0。`vite/client` への参照も 0。`@tanstack/virtual-core` 型参照は dependencies で解決可。
- **型の import 可能性(bundler)**: API_REFERENCE に登場する型名 37 種 + `GridColumnState` を `import type` で一括 import、README Quick start と API_REFERENCE の handle サンプル(`scrollToRow` / `exportCsv({ scope: 'selection' })` / `getState()` / `numberFormatter` / `installJsdomLayoutStubs`)が strict で型検査を通過(P-3 の 1 件を除き 0 エラー)。
- **既定値の照合**(API_REFERENCE ↔ 実装): rowHeight 36 / headerHeight 40(standard。compact 28/32、comfortable 44/48)、maxHeight 480(`styles.css:2706` の CSS 既定)、undoHistoryLimit 100、rowHeaderWidth 56、editorEnterMove `'down'`、theme `'light'`、density `'standard'`、rowSelectionMode `'multiple'`、autoSizeColumns `false`、scrollHint(bubble / ruler / scrollbar true、trigger `'scroll'`、minRows 0)、detailRow height 200 / showToggleColumn true、labelRow sortMode `'section'` / keepEmptySections false / sticky false、validationMode `'mark'`、各 enable* / show* の boolean 既定 ── すべて一致。
- **JSDoc 同期**: `node scripts/sync-api-jsdoc.mjs --check` = 同期済み。
- **bump-version.mjs**: 両 package.json を同一版へ更新、末尾改行なし(editorconfig 整合)、注釈付きタグ。lockfile に importer 版は記録されないため更新不要。
- **LICENSE / README**: 両パッケージ直下に存在し tgz に同梱(npm の自動包含)。