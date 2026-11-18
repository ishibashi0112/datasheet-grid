# Solid 2.0 版の試作(非公開)

2026-11-17 の Solid 2.0 正式版(solid-js / @solidjs/web 2.0.0)を受けて、core(`@ishibashi0112/spreadsheet-grid-core`)の上に
Solid のシェルを載せられるか・どれくらいの作業になるかを確かめるための試作です。**npm には出しません**(`private: true`)。
ルートのゲート(`tsc -b` / `tsc -p tsconfig.vitest.json` / `vp test`)の対象外で、eslint は React の hooks の規則だけを外して検査します。

## 動くもの

React 版と同じ DOM・class で描くので、React 版の `styles.css` をそのまま使っています。段階 1 の範囲は React 版の機能なしの構成
(`/lite` の `createSpreadsheetGrid({ features: {} })`)で、`src/parity/` のテストで React 版と DOM と通知が同じかを比べています。

- 表示: 行の縦の仮想化(core の `resolveVerticalLayout`)、列の横の仮想化(`@tanstack/virtual-core` を自前でつなぐ)、左右の固定列、
  上下のバー(`renderTopBar` / `renderBottomBar` も)、空の表示、テーマ・密度・モーション・`classNames`、ツールチップ
- 見出し: `renderHeader`、Shift+クリックで並べ替え(印と優先度)、列幅のドラッグ、列の選択、左上の角で全選択
- セル: `renderCell`・`valueFormatter`・`cellClassName`・`getRowClassName`・メモ(`cellNote`)・入力の検査の印(`validate`)・checkbox のセル
- 選択とキー操作: core の keyboardController / pointerInteractionsController(範囲選択・行番号・矢印 / Ctrl+矢印 / Home / End /
  PageUp / PageDown / Ctrl+A / Delete / Ctrl+Z / Ctrl+Y、最後の列の Tab でグリッドの外へ)
- 編集: text のエディタだけ(打ち始め / ダブルクリック / F2 / Enter / Tab / Esc / 外をクリックで確定)、元に戻す
- コピー・貼り付け: core の clipboardController(Excel と同じ TSV、範囲いっぱいの貼り付け)
- 命令的 API: core の gridApi のハンドルをそのまま(`ref` は関数で受ける)
- 通知: `onActiveCellChange` / `onCellClick` / `onCellDoubleClick` / `onStateChange` / `onSortChange` / `onFiltersChange` / `onScroll` /
  `onColumnsChange` / `onUndoRedoStateChange` / `onHoveredRowChange`

無いもの(段階 1-2 / 1-3): text 以外のエディタ、入力の検査の reject とエラーの吹き出し、行の選択、展開行。段階 2: `/lite` の 21 の機能
(ラベル行・SSRM・行のグループ・合計行・固定行などを含む)。

`renderCell` / `renderHeader` は Solid の部品と同じく、行・値・列・位置が変わったときだけ呼び直します(アクティブセルや選択が変わる
たびには呼びません)。`ctx.isActive` などの状態は JSX の中で読めば追従します。

## 使い方

```sh
pnpm --filter ./packages/solid dev          # デモ(10,000 行 × 37 列)
pnpm --filter ./packages/solid test         # jsdom のテスト(Solid の JSX 変換の vitest 設定。React 版と並べて比べるテストも)
pnpm --filter ./packages/solid typecheck
pnpm --filter ./packages/solid spike:build  # 大きさを測るためのライブラリビルド(dist/)
```

## 作り

| React 版 | 試作 |
| --- | --- |
| `hooks/useGridStore.ts`(useSyncExternalStore) | `primitives/gridStoreSignals.ts`(store を signal に。購読は `onSettled`) |
| `hooks/useController.ts` | `primitives/controller.ts`(`createRenderEffect` / `createEffect` で `update`) |
| `hooks/useVirtualizerCore.ts` | `primitives/columnVirtualizer.ts` |
| `GridShell.tsx`(5,420 行) | `SpreadsheetGrid.tsx`(約 1,370 行) |
| `view/GridHeaderRow.tsx` / `view/GridBodyLayer.tsx` | 同じ名前(`view/`) |
| `view/DefaultGridTopBar.tsx` / `DefaultGridBottomBar.tsx` / `RowSelectionCheckbox.tsx` / `editors/CheckboxCell.tsx` | 同じ名前(`view/`) |
| `hooks/useGridLocaleText.ts`(Context) | `context/localeText.ts` |
| (React の `useSyncExternalStore`) | `primitives/externalStore.ts`(OS の配色 / 視差効果を減らす設定) |
| `editors/TextCellEditor.tsx` | `view/TextEditor.tsx` |

## 試作で分かったこと

1. **最初の update は描き終わった後に**: Solid の `createRenderEffect` の最初の実行は JSX の要素を作る前で、ref がまだ入っていない
   (React のレイアウト effect はコミット後)。core のコントローラは最初の `update` で DOM を掴む(scrollSync の attach など)ので、
   `connectController` で最初の `update` を `onSettled` まで遅らせた。これを忘れると縦スクロールが追従しない。
2. **同じタスクの中の続けたイベントで、コントローラが古い状態を読む**: Solid 2.0 は書き込みをマイクロタスクでまとめて反映する。
   キー操作などのコントローラは `update(args)` で受けた `uiState`(signal の値)を読むので、JS から続けて dispatch したイベント
   (テストの `fireEvent` など)では 2 回目以降が古い位置から動く(`ArrowDown` 3 回で 1 行。`src/timing.test.tsx`)。実際の
   キー入力はイベントごとにマイクロタスクが回るので起きない(Playwright で確認)。命令的 API は store を直接読むので起きない。
   → 段階 0-1 で core のコントローラがイベントの時点の store を読む形(`getUiState`。core `controllers/liveUiState`)にして直した
   (React 版も同じ形)。
3. **Solid の開発ビルドの診断が役に立つ**: 部品の本体での読み取り(STRICT_READ_UNTRACKED)、ref の中の onCleanup
   (CLEANUP_IN_FORBIDDEN_SCOPE)を開発ビルドが止めてくれた(直した)。残っているのは列の幅が変わったときの
   EFFECT_RELAY_TEAR(列の仮想化の測り直しで見出しを 2 回描く。React 版にも同じ 2 回目の描画がある)。
4. **core へ寄せたもの(段階 0-2〜0-4)**: React 版の層にフレームワークに依らないファイルはほぼ残っていなかったが、`GridShell.tsx`
   の useCallback / useMemo の中に Solid でも同じことを書く処理があったので core へ移した: セルの操作(編集を始めてよいかの判断・
   チェックボックス・選択したセルの削除・全選択・`renderCell` の `setValue` = `engine/cellCommands`)、オーバーレイの矩形と
   `aria-activedescendant` の判断(`logic/cellPlacement`)、エディタのキーの割り当て(`logic/editorKeys`)、密度の既定の高さ
   (`logic/density`)。残り: セルの既定の表示(valueFormatter。数行)、固定ペインの style、core の `resolveGridHeightLayout` が
   React 向けの style(camelCase・数値)を返すので変換が要る(`primitives/style.ts`)。
5. **テスト**: core の `installJsdomLayoutStubs` は Solid の jsdom テストでもそのまま使えた。`@solidjs/testing-library` はまだ
   1.0.0-rc.2。イベントの後に DOM を見るときは `flush()` を挟む。
6. **pnpm**: Solid 2.0 の各パッケージは公開されたばかりで pnpm 11 の `minimumReleaseAge` に止められるので、
   `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` に入れてある(しばらくしたら外せる)。

## 大きさ(2026-11-17)

`size:check` と同じ条件(esbuild / minify / フレームワークは外部化 / gzip level 9 / core は公開 dist)。

| 構成 | gzip |
| --- | --- |
| 試作(シェルだけ。core と virtual-core を除く) | 9.28 KB |
| 試作(core と virtual-core 込み) | 57.11 KB |
| React `/lite` 機能なし(シェルだけ) | 33.25 KB |
| React `/lite` 機能なし(core 込み) | 85.66 KB |
| React 全部入り(シェルだけ) | 58.89 KB |
| Solid の実行時(試作が使う範囲。外部化しているぶん) | 15.66 KB |
| React + ReactDOM の実行時(同上) | 67.36 KB |

試作は React の `/lite` より機能が少ないので、シェルどうしの比は参考までです。