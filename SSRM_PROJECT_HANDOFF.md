# SSRM_PROJECT_HANDOFF — SpreadsheetGrid プロジェクト引き継ぎ

> **注記**: 本ドキュメントは 2026-07-13 に再作成したものです。オリジナルは旧 Windows 環境にのみ存在し
> git 履歴に含まれていなかったため(リンク切れ状態)、現行コードベースから検証可能な事実だけを起こして
> 再構成しました。規約・ワークフロー・ゲートは `CLAUDE.md` が正本です(本書は現状とアーキテクチャの詳細)。

## §1 プロジェクト概要

- React 19 + TypeScript + Vite 製のカスタム AG Grid 風・仮想化データグリッドのライブラリ化プロジェクト。
- 公開パッケージ: `@ishibashi0112/spreadsheet-grid`(npm)。現行 **v0.13.0**。
- ツールチェーンは vite+(VoidZero 統合、`vp` コマンド)。仮想化は `@tanstack/react-virtual` v3、テストは Vitest。
- 消費側 UI 例: Mantine / HeroUI / Tailwind(v3・v4)。共存が設計要件。
- 公開 API の詳細は `src/components/spreadsheet-grid/API_REFERENCE.md` を参照。

## §2 アーキテクチャ

### 2.1 状態管理

- **reducer(`model/gridReducer.ts`)は UI 状態のみ**を持つ: `activeCell / selection / rowSelection /
  editingCell / dragState / columnWidths / filters / sort`。
- **rows は外部 controlled**(`rows` prop + `onRowsChange`)で、グリッド内部には持たない。
  データ変更経路は「セル編集 commit(`useGridEditController`)/ ペースト(`useGridClipboardController`)/
  Delete クリア(`logic/clearCells`)/ `renderCell` の `setValue`」の 4 つで、すべて
  **history controller(`useGridHistoryController`)のラッパ経由で `onRowsChange` に集約**される
  (undo/redo の履歴化ポイント。§5 参照)。
- 列も controlled(`columns` + `onColumnsChange`)。列メタ(可視 / 順序 / ピン)は consumer 所有。

### 2.2 レイヤ構成(`src/components/spreadsheet-grid/`)

| ディレクトリ | 役割 |
| --- | --- |
| `model/` | 型(`gridTypes.ts`)・アクション・reducer・セレクタ。 |
| `logic/` | 純粋ロジック(~30 モジュール、colocated `*.test.ts` 付き)。geometry / filtering / sorting / exportCsv / serverSideCache / history / clearCells など。 |
| `hooks/` | 薄いオーケストレーション層(clipboard / edit / keyboard / history / pointer / SSRM row model / autosize など)。 |
| `view/` | ヘッダー行・ボディ・ポータル系(popover / panel / bar)コンポーネント。 |
| `utils/` | permissions(編集可否・セル値 get/set)・clipboard(TSV)・scheduler。 |

### 2.3 レイアウトと仮想化

- 3 ペイン固定列レイアウト(左右ピン + 中央)。縦横スクロールは 1 本の共有スクロールコンテナで、
  固定列は `position: sticky`(10-G)。
- 行仮想化は `@tanstack/react-virtual`。auto-height 行(可変行高)対応(行数 ≤ 50,000 のゲート付き、
  超過時は uniform へフォールバック)。大規模行数では論理→物理スクロールの圧縮(scroll-space 仮想化)。
- 仮想化 DOM 上のドラッグは window レベルのリスナ + `pointerId` フィルタ(要素直付けは capture 対象の
  unmount で壊れるため)。

### 2.4 rowModel シーム

- ビュー行アクセスは `RowModel<T>` シーム(`getRow(viewIndex)` / `getRowCount()` /
  `getSourceIndex(viewIndex)` / `getRowKey(viewIndex)`)に統一(DS-3 系)。
- clientSide はフィルター/ソート後の `order` 配列ベース、serverSide はスパースキャッシュベースで、
  consumer(copy / paste / edit / keyboard / export)はモードを意識しない。
- `getSourceIndex` は範囲外で `undefined` を返し、書き込み系は早期 return / skip で吸収する
  (view index を source index に誤代入しない契約。DS-3-9)。

### 2.5 命令的 API(ref ハンドル)

- React 19 の ref-as-prop(`forwardRef` 不使用)。`SpreadsheetGridHandle<T>` はスクロール / 選択操作 /
  CSV・整形データエクスポート / 状態の保存・復元(`getState` / `applyState`)/ 行選択 / undo・redo /
  UI パネル開閉を公開。
- ハンドルは 1 回だけ生成(`useImperativeHandle` deps `[]`)し、最新値は毎レンダー更新の
  `apiStateRef`(latest-ref)越しに読む。

### 2.6 God component の現状

- `SpreadsheetGrid.tsx` は既知の God component(**~5,100 行**)。リファクタは保留(react-doctor
  `no-giant-component` 指摘。§8)。デモの `src/App.tsx`(~1,200 行)も同様。

## §3 CSS / テーマ戦略

- **未レイヤー単一クラス基底**(Tailwind / Mantine / HeroUI 共存のため `@layer` は使わない ──
  未レイヤーはレイヤー付きに特異度無関係で勝つため)。基底 class の特異度は (0,1,0)。
- Portal 系(popover / tooltip / panel)は `.ssg-root` 外に描画されるためリテラル色を使う。
- テーマ: `theme`(light / dark / auto)+ `density`(compact / standard / comfortable)。トークン
  (`--ssg-*`)上書きで個別調整可。Tailwind v4 向けに `style.layer.css` も出力する。

## §4 SSRM(サーバーサイド行モデル)の現状

**骨格は動作するが未完成**(CLAUDE.md の「SSRM は骨格のみ」)。

実装済み:

- `dataSource`(`ServerSideDataSource<T>`)指定で serverSide モードへ分岐(`rows` と排他)。
- `useServerSideRowModel` + スパース LRU キャッシュ(`logic/serverSideCache.ts`)+ ブロック要求
  (`logic/serverSideBlocks.ts`)で可視レンジ近傍のみ `getRows` 取得。
- フィルター / ソート / グローバルフィルターの `ServerSideQuery` 化(300ms debounce)と、
  クエリ不変のキャッシュ破棄 + 取り直し(`serverSideRefreshToken`)。
- set / select フィルター候補の供給、エクスポート(ロード済み範囲)、行選択。

未実装(残タスク):

- `refreshServerSide()` 命令的ハンドル(現状は prop トークン方式のみ)。
- `getRows` 失敗時のエラー表示・リトライ UI(現状は console 警告どまり)。
- サーバーサイド変更(セル編集 / 行追加削除の書き戻し)。編集系は clientSide 専用
  (SSRM では `onRowsChange` の適用先 rows が存在しない)。undo/redo も SSRM では無効。

## §5 編集系サブシステム(2026-07 追加分)

- **undo/redo**: `logic/history.ts`(純粋スタック)+ `useGridHistoryController`。
  「変更前 rows 配列」の参照スナップショット + 編集時の selection / activeCell を履歴化し、
  undo/redo で rows と選択位置を復元(復元先セルが画面外なら scrollToCell 'auto' 相当で
  可視化まで追従)。外部からの rows 差し替えは参照比較で検知して履歴を自動破棄。
  `Ctrl/Cmd+Z / Shift+Z / Y`、ハンドル `undo()/redo()/canUndo()/canRedo()/clearUndoHistory()`、
  props `enableUndoRedo` / `undoHistoryLimit` / `onUndoRedoStateChange`。
- **セル値クリア**: `Delete` / `Backspace` で選択セル(なければアクティブセル)をクリア
  (`logic/clearCells.ts`)。クリア値は「空文字のペースト」と同じ規則。変更ゼロなら no-op。
- **IME**: 編集エディタ(`CellEditorLayer`)は `isComposing` 中の Enter / Escape / Tab を
  無視(日本語変換の確定 Enter がセル確定を巻き込まない)。グリッド側ショートカットも同様。
- **クリップボード**: TSV コピー / ペースト。ペーストは行不足を `createRow`、列不足を
  `createOverflowColumn` で自動拡張。readOnly ではペースト自体が no-op。

## §6 テストとゲート

- ゲート(tsc build / tsc test / eslint / test / build)と期待値は `CLAUDE.md` の表が正本。
- テストは「logic の colocated 単体 + ルートの結合テスト(jsdom)」の 2 層。結合テストは
  `SpreadsheetGrid.integration.test.tsx`(状態 API)/ `*.export.integration.test.tsx` /
  `*.undoRedo.integration.test.tsx`(編集履歴・クリア)。
- jsdom では仮想化行の DOM が出ないため、結合テストはハンドル操作 + ルート要素へのイベント発火
  (paste / keydown)で編集経路を駆動する。

## §7 残タスク(大きい順)

1. **行グルーピング + 集計**(AG Grid 競合上の最大の欠落)。
2. **SSRM 完成**(§4 の未実装 3 点)。
3. 多段カラムヘッダー(ヘッダーグループ)。
4. ピン留め行(上下固定行)。
5. フィルハンドル(セル右下ドラッグでの連続コピー/連番)。
6. プレーンテキスト以外のエディタ種別(select / date / checkbox など)。

## §8 既知の保留(react-doctor 由来)

- `no-giant-component`: `App.tsx` + `SpreadsheetGrid.tsx`(§2.6)。リファクタ保留中。
- `require-pnpm-hardening`: `pnpm-workspace.yaml` の判断待ち。
- `prefer-module-scope-pure-function`: ハンドラ巻き上げ Batch A 未実行。