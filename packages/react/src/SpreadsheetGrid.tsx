// 注記(非依存化 ②〜本体分解 E-6): 旧 @tanstack/react-virtual 時代に Compiler 系 lint の解析対象外だった本ファイルは、
//   非依存化 ②で latest-ref イディオム(レンダー中の ref.current 参照 / 代入)16 件が表面化し file 単位で
//   react-hooks/refs・immutability・set-state-in-effect を無効化していました。本体分解 E-1〜E-6 でエンジン /
//   コントローラへ移設して全件解消したため、ディレクティブはすべて外しています(新規の latest-ref は増やさないこと)。
// 追加: 列フィルター UI 整備 + ソート/フィルター見た目強化を反映します。
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  // 追加(11-B7): グローバルフィルタ評価の遅延化(Transition 化)に使います。
  useDeferredValue,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type MouseEvent as ReactMouseEvent,
  // 追加(UP-1): 統合ツールパネルのタブ別コンテンツテーブルの型に使います。
  type ReactNode,
} from 'react';

// 追加(UI CSS移行): 基底スタイル(トークン + .ssg-* クラス)を読み込みます(THEME-1 で未レイヤー化)。
import './styles.css';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import { mergeStyles } from '@ishibashi0112/spreadsheet-grid-core/logic/slotProps';
import {
  useResolvedGridSlot,
  useResolvedGridSlots,
} from './hooks/useResolvedGridSlots';

import { useVirtualizerCore } from './hooks/useVirtualizerCore';
// 追加(本体分解 E-7): グリッドエンジン(リゾルバ / コマンド / 通知 / DOM コントローラ / store の束ね。React 非依存)。
import { createGridEngine } from '@ishibashi0112/spreadsheet-grid-core/engine/createGridEngine';
import { useControllerLifecycle } from './hooks/useController';

import { gridActions } from '@ishibashi0112/spreadsheet-grid-core/model/gridActions';
import { useGridStore, useGridViewState } from './hooks/useGridStore';
import {
  buildSelectionSnapshot,
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
} from '@ishibashi0112/spreadsheet-grid-core/model/gridSelectors';
import SelectionOverlay, {
  type SelectionOverlayRect,
} from './SelectionOverlay';
import ActiveCellOverlay, {
  type ActiveCellOverlayRect,
} from './ActiveCellOverlay';
import CellEditorLayer from './CellEditorLayer';
import { useFilterPopoverController } from './hooks/useFilterPopoverController';
// 追加(13-A): 列メニュー(「⋮」+ 右クリック)の popover controller です。
import { useGridClipboardController } from './hooks/useGridClipboardController';
import { useGridBarContext } from './hooks/useGridBarContext';
import { useGridEditController } from './hooks/useGridEditController';
import { useGridHistoryController } from './hooks/useGridHistoryController';
import { useGridKeyboardInteractions } from './hooks/useGridKeyboardInteractions';
import { useGridPointerInteractions } from './hooks/useGridPointerInteractions';
import { useGridViewportSync } from './hooks/useGridViewportSync';
// 追加(TT-1): title 属性置き換えのカスタムツールチップ(data-ssg-tooltip 委譲)です。
import { useGridTooltip } from './hooks/useGridTooltip';
// 追加(TH-DK-2): theme prop('light' | 'dark' | 'auto')の実効テーマ解決フックです。
import { useResolvedGridTheme } from './hooks/useResolvedGridTheme';
// 追加(13-B3-2): ヘッダー D&D 列並べ替え controller です。
import { useColumnHeaderDragController } from './hooks/useColumnHeaderDragController';
// 追加(row-drag ③): 行ドラッグ並び替え controller です。
import { useRowDragController } from './hooks/useRowDragController';
import {
  // 追加(12-A): set フィルター値の判定 / 構築に使います。
  isSetColumnFilterValue,
  // 追加(記述子化 / number): number 記述子の判定に使います。
  //   ※構築は filter-ext A で構造化 draft 経由(buildNumberColumnFilterValueFromDraft)へ
  //     移行したため、式テキストの buildNumberColumnFilterValue はここでは不要になりました。
  isNumberColumnFilterValue,
  // 追加(filter-ext B/C/D): 複合(条件 AND 選択)記述子の判定に使います。
  // 追加(filter-ext B): B-2 Float64 key の構築対象判定です(comparison / range を持つ
  //   number 系のみ。number / numberSet の両 kind を単一実装で判定します)。
  // 追加(記述子化): 現在値表示の text 整形に使います(記述子 → 表示文字列)。
  columnFilterValueToDraftText,
  // 追加(FM-1): フィルター管理パネルの一覧行(有効フィルターの抽出)に使います。
  isActiveColumnFilterValue,
  // 行モデルチェーンは order(Int32Array)ベースに一本化しています
  //   (DS-2 で差し替え、旧オブジェクト配列版は DS-3-8 で削除)。
  // 追加(filter-ext A): number フィルターの数値化規則(空白 = NaN)です。B-2 の
  //   Float64 key 構築で predicate 側と同一規則を共有します。
} from '@ishibashi0112/spreadsheet-grid-core/logic/filtering';
// 追加(FM-1): 列フィルター値 → 人間可読要約(フィルター管理パネルの一覧行)です。
import { describeColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core/logic/filterSummary';
// 追加(preset-opt): dateSet プリセット構成(列定義 dateFilterPresets)の正規化です
//   (popover のチップ描画 / 候補連動 / 要約ラベルへ同じ正規形を渡します)。
import { normalizeDateFilterPresets } from '@ishibashi0112/spreadsheet-grid-core/logic/dateFilterPresets';
// 追加(filter-ext E): filterType: 'auto' の実効種別推定(editor ヒント + 値サンプリング)です。
import { inferColumnFilterType } from '@ishibashi0112/spreadsheet-grid-core/logic/inferFilterType';
// 変更(10-C): 3ペインレイアウト構築用の helper / 型を追加インポートします。
// 変更理由: reorderColumnsByPane / buildGridPaneLayout を SpreadsheetGrid で使い、
//           PaneColumnEntry 型を各ペインの描画エントリ受け渡しに使うためです。
// 変更(10-D): Overlay / Editor をペイン別座標系で配置するための helper / 型を追加インポートします。
// 変更理由: SelectionOverlay / ActiveCellOverlay / CellEditorLayer を各ペイン内へ
//           ペインローカル座標で描画するため、論理列 index 範囲 → 各ペイン extent の
//           変換 helper（computePaneColumnExtents 等）が必要になりました。
// 変更(11-B4): paneLayout の一括構築(buildGridPaneLayout)をやめ、
//             ペイン別 useMemo 用の helper（splitOrderedColumnsByPane /
//             buildPaneWidthsKey / buildPaneGeometryFromWidthsKey）へ切り替えます。
// 変更理由: ライブリサイズ中は columnWidths が毎 pointermove で参照更新されるため、
//           一括 useMemo では 3 ペイン全ての entries 参照が毎回作り直され、
//           幅が変わっていない固定ペインの全行まで memo を突破していました。
//           ペインごとに「列ソース + そのペインの幅 join キー」だけへ依存を絞ることで、
//           中央列リサイズ中も固定ペインの renderEntries 参照を不変に保ちます。
import {
  buildColumnMeasurements,
  computePaneColumnExtents,
  computeFullWidthPaneExtents,
  computeSinglePaneColumnExtent,
  // 追加(13-B3-1.5): 列の所属ペイン(pinned 由来)を columnChooserItems へ付与するために使います。
  getColumnPane,
  type PaneColumnEntry,
  type ColumnPane,
  type PaneColumnExtentMap,
} from '@ishibashi0112/spreadsheet-grid-core/logic/geometry';
// 追加(B3): center 列の JS 算出 flex(利用可能幅を比率配分)。
import { isFlexingColumn } from '@ishibashi0112/spreadsheet-grid-core/logic/columnFlex';
import { buildClearCellEdits, clearCellsInSelection } from '@ishibashi0112/spreadsheet-grid-core/logic/clearCells';
// 追加: データ投入時の列幅自動フィットの発火判定(純関数)です。
// 追加(13-B2-5): 列リセットの再構成純ロジック(幅 / 固定 / 表示 / 並び順の完全復元)です。
// 追加(scroll-space 仮想化): 縦ジオメトリのシーム(uniform window + pixel scaling)です。
//   1M 行で innerRowStyle.height がブラウザ要素高さ上限を超える機能ブロッカーを解消します。
import {
  MAX_BODY_PX,
  AUTO_HEIGHT_MAX_ROWS,
  clipRowRangeToWindow,
  // 追加(imperative API #1): 命令的スクロールの論理↔物理換算に使います。
} from '@ishibashi0112/spreadsheet-grid-core/logic/verticalGeometry';
// 追加(detail ③): 展開行(Master/Detail)の純ロジック(トグル列キー / rowKey→view index 解決 / 選択帯分割)です。
import {
  DEFAULT_DETAIL_ROW_HEIGHT,
  DETAIL_TOGGLE_COLUMN_KEY,
  isInsideDetailCardOf,
  isSyntheticColumnKey,
  seedDetailIndexCache,
  splitRowBandByDetail,
} from '@ishibashi0112/spreadsheet-grid-core/logic/detailRow';
// 追加(label-row ②): ラベル行(見出し / 区切り行)の SSRM ラッパです。
import { wrapRowModelWithLabelRows } from '@ishibashi0112/spreadsheet-grid-core/logic/labelRows';
import type { GridBodyLabelRowLayer } from './view/GridBodyLayer';
// 追加(row-drag ③): 行ドラッグ並び替えの純ロジック(ハンドル列キー / 配列移動 / ゲート判定)です。
import {
  ROW_DRAG_DISABLED_TOOLTIP,
  ROW_DRAG_HANDLE_COLUMN_KEY,
  ROW_DRAG_HANDLE_TOOLTIP,
  moveArrayItem,
} from '@ishibashi0112/spreadsheet-grid-core/logic/rowReorder';
// 追加(imperative API #1): CSV エクスポート / スクロール先算出の純ロジックです。
// 追加(export-scope 再編): 旧 'all' / 'visible' エイリアスの正規化に使います。
// 追加(行選択): チェックボックス行選択の純ロジックです。
import {
  getSelectAllState,
} from '@ishibashi0112/spreadsheet-grid-core/logic/rowSelection';
// 追加(state #1): 列状態 get/apply の純ロジックです(snapshot 組み立て / 外部入力の正規化)。
// 追加(state #2): onStateChange の発火可否判定(decideStateChangeEmit)も同モジュールから読みます。
// 追加(state v2): 列メタ(可視 / 順序 / ピン)の抽出 / 適用(extractColumnState / applyColumnState)。
import {
  computeHorizontalScrollTarget,
} from '@ishibashi0112/spreadsheet-grid-core/logic/scrollTargets';
// 追加(DS-4 ①-(2)): 列幅自動調整を時間分割(async・単一経路)で実行するランナーです。
//   計測ロジック本体(logic/columnAutosize)はランナー内部で使うため、ここでの直 import は不要です。
import useColumnAutosizeRunner from './hooks/useColumnAutosizeRunner';
// 追加(DS-4 #1): select / set 候補を「通常規模=同期 / 大規模=時間分割の非同期」で収集します。
import useColumnSelectOptionsCollector from './hooks/useColumnSelectOptionsCollector';
// 追加(F-async): グローバルフィルタの時間分割(非ブロック)適用フックです。
import { useGlobalFilteredOrder } from './hooks/useGlobalFilteredOrder';
// 追加(①-3): serverSide(SSRM)の RowModel を供給するフックです(dataSource 指定時に使用)。
import { useServerSideRowModel } from './hooks/useServerSideRowModel';
import type {
  ServerSideLoadErrorState,
  ServerSideWriteErrorState,
} from './hooks/useServerSideRowModel';
// 追加(grouping ②): 行グルーピングの純ロジック(ツリー構築 / 開閉適用 flatten / エンコード)です。
import type {
  CellCoord,
  CellRenderState,
  GridColumn,
  CellRenderContext,
  // 追加(THEME-2): 密度プリセットの型です。
  GridDensity,
  // 追加(C1): auto-height 実測キャッシュのキー型です。
  GridRowKey,
  // 追加(detail ③): 展開行の描画コンテキスト / セルへ渡す detail コンテキスト型です。
  CellDetailContext,
  DetailRowRenderContext,
  // 追加(label-row ②): ラベル行の記述子 / スロット値の型です。
  GridLabelRow,
  GridSlotProps,
  // 追加(DS-3-0): 行モデルのシーム契約型です(rowModel の構築に使います)。
  // 追加(記述子化): commit 経路で text/date/select/custom を記述子化する際の型です。
  // 追加(12-A): set フィルター値の構築に使います。
  // 追加(filter-ext E): 'auto' を解決した後の実効フィルター種別です。
  ColumnFilterUiType,
  // 追加(imperative API #1): ref ハンドルと関連型です。
  // 追加(行選択): 公開記述子と内部状態型です。
  RowSelectionModel,
  // 追加(imperative API: getExportData): scope 解決と整形済みデータ型に使います。
  // 追加(proposals ⑧): onScroll 通知パラメータの型です。
  SpreadsheetGridProps,
  // 追加(state #2): onStateChange の lastEmitted 保持 / snapshot 型に使います。
  // 追加(バッチ②/コンテキストメニュー): 対象/params/項目の公開型。
  GridContextMenuTarget,
  GridContextMenuParams,
  GridContextMenuItem,
} from './model/gridTypes';
import { getCellValue, isCellEditable } from '@ishibashi0112/spreadsheet-grid-core/utils/permissions';
import { writeRowsCell } from '@ishibashi0112/spreadsheet-grid-core/logic/editorValues';
import { isCheckboxChecked, toggleCheckboxValue } from '@ishibashi0112/spreadsheet-grid-core/logic/checkboxEditor';
import { CheckboxCell } from './editors/CheckboxCell';
import { decideCellWrite } from '@ishibashi0112/spreadsheet-grid-core/logic/validation';
import ColumnFilterPopover from './view/ColumnFilterPopover';
// 追加(13-A): 列メニュー popover(列固定の切替 UI)です。
import DefaultGridBottomBar from './view/DefaultGridBottomBar';
import DefaultGridTopBar from './view/DefaultGridTopBar';
import { resolveGridSlot } from './view/gridBarHelpers';
import GridBodyLayer from './view/GridBodyLayer';
// 追加(detail ③): 展開行の帯 + カードを各ペインへ描くレイヤーです。
import GridDetailLayer from './view/GridDetailLayer';
import type { GridDetailLayerEntry } from './view/GridDetailLayer';
import GridHeaderRow from './view/GridHeaderRow';
import useColumnMenuController from './hooks/useColumnMenuController';
import ColumnMenuPopover from './view/ColumnMenuPopover';
// 変更(UP-1): フィルター管理 / 列の表示 / 並び替えの独立 3 パネルを統合ツールパネル
//   (ToolPanel + useToolPanelController)へ集約しました。旧 3 controller
//   (useColumnChooserController / useSortManagementController / useFilterManagementController)
//   は削除し、各 view はタブコンテンツ(フレームなし)として ToolPanel の children に入ります。
import useToolPanelController from './hooks/useToolPanelController';
import type { ToolPanelTab } from './hooks/useToolPanelController';
import ToolPanel, { type ToolPanelTabDescriptor } from './view/ToolPanel';
import ColumnChooserPanel, { type ColumnChooserItem } from './view/ColumnChooserPanel';
import SortManagementPanel, {
  type SortManagementColumn,
} from './view/SortManagementPanel';
import FilterManagementPanel, {
  type FilterManagementEntry,
  type FilterManagementAddableColumn,
} from './view/FilterManagementPanel';
// 追加(FM-2): フィルターチップバー(適用中の列フィルターの常時表示 / opt-in)です。
import GridFilterChipBar from './view/GridFilterChipBar';
// 追加(scrollHint): スクロール位置インジケーター(行番号バブル)のオーバーレイです。
import { GridScrollHint } from './view/GridScrollHint';
import { resolveScrollHintOptions } from '@ishibashi0112/spreadsheet-grid-core/logic/scrollHint';
// 追加(バッチ②/コンテキストメニュー): 対象解決(純ロジック)/ controller / portal popover。
import {
  resolveContextMenuColIndex,
  isContextMenuCellSelected,
  isContextMenuRowSelected,
} from '@ishibashi0112/spreadsheet-grid-core/logic/contextMenuTarget';
import useCellContextMenuController from './hooks/useCellContextMenuController';
import CellContextMenuPopover from './view/CellContextMenuPopover';
import type { ReactGridTypes } from './model/gridTypes';
// import ColumnChooserPanel, {
//   type ColumnChooserItem,
// } from './view/ColumnChooserPanel';

// 追加(①-3): rows 未指定(serverSide 等)時の安定既定値です。参照同一を保ち、order パイプ
//   ライン / rowModel など既存 memo を不要に揺らさないよう module スコープで 1 つだけ持ちます。
//   never[] は任意の T[] に代入可能で、destructure 既定値として rows の型を T[] に保ちます。
const EMPTY_ROWS: never[] = [];

// 追加(stage ②): serverSide query 構築/debounce 用の安定既定値・定数です。
//   clientSide では query を空に保ち(フックは inert)、参照同一で memo/effect を不要に揺らしません。

// 追加(THEME-2): density プリセット別の既定寸法です(明示 rowHeight / headerHeight prop が優先)。
//   'standard' は従来既定(36 / 40)と同値。CSS 側の寸法トークン切替は styles.css の
//   ssg-root--density-* 修飾子を参照。
const DENSITY_DIMENSIONS: Record<
  GridDensity,
  { rowHeight: number; headerHeight: number }
> = {
  compact: { rowHeight: 28, headerHeight: 32 },
  standard: { rowHeight: 36, headerHeight: 40 },
  comfortable: { rowHeight: 44, headerHeight: 48 },
};
// 追加(B3): flex 非適用時(未計測 / flex 列なし)に返す共有の空 map です。参照同一性で
//   「flex 素通し(= effectiveColumnWidths は uiState.columnWidths そのまま)」を判定します。
// 追加(バッチ②): コンテキストメニュー closed 時に popover へ渡す空 items(参照不変)。
const EMPTY_CONTEXT_MENU_ITEMS: GridContextMenuItem[] = [];
// 追加(detail ③): 展開行なし時の安定な空配列(参照同一で再計算を誘発しない)。
// 追加(#2): リサイズハンドルのダブルクリック判定しきい値です。native dblclick は pointerdown の
//   preventDefault でブラウザ差により抑止されることがあるため、時刻 + 位置で自前判定します
//   (native と同じ「短時間 + 近接位置」の 2 条件)。位置チェックは「リサイズ直後の再ドラッグ」を
//   ダブルクリックと誤検知しないために必要です(リサイズで境界が動けば位置差で弾けます)。
// query(filter/sort)変更をサーバへ送る前の debounce(ms)です。入力欄の即時反映とは別系統で、
//   キーストロークごとの再フェッチ(block 0 取り直し)を合体します。フック内の 120ms(レンジ要求
//   debounce)とは役割が異なり併存します。

// 追加: Grid 本体です。
// 追加(本体分解 E-1): 展開行トグル列(T1)のセル本体です。列定義自体は engine/columnLayout.ts が合成し、
//   フレームワーク依存のセル描画だけをここから渡します(モジュールレベルで参照安定)。
const renderDetailToggleCell = (ctx: CellRenderContext<unknown>) => {
  const detail = ctx.detail;
  if (!detail || !detail.expandable) {
    return null;
  }
  return (
    <button
      type="button"
      className="ssg-detail-toggle"
      aria-expanded={detail.expanded}
      aria-label={detail.expanded ? '詳細を閉じる' : '詳細を開く'}
      onClick={detail.toggle}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {detail.expanded ? '▾' : '▸'}
    </button>
  );
};

export function SpreadsheetGrid<T extends object>({
  // 変更(①-3): rows に安定既定値(EMPTY_ROWS)を当てます。rows が optional でも全 consumer は
  //   従来どおり T[] を見ます(serverSide 時は dataSource を使い rows は空のまま)。
  rows: rowsProp = EMPTY_ROWS,
  // 追加(①-3): serverSide データ供給口。指定時に serverSide モードへ分岐します(rows と排他)。
  dataSource,
  // 追加(stage ③): serverSide ソフトリフレッシュ用トークン。値を増やすと query 不変のまま
  //   キャッシュ破棄+可視レンジ取り直し(スクロール保持)。フックへ refreshToken として渡します。
  serverSideRefreshToken,
  // 追加(batch 9): getRows 失敗の外部通知です(内蔵エラーバーとは独立)。フックへ渡します。
  onServerSideLoadError,
  onServerSideWriteError,
  columns: columnsProp,
  onRowsChange,
  onColumnsChange,
  rowKeyGetter,
  // 追加(proposals ⑪): コピー / CSV / getExportData の対象行フィルタです。
  isRowExportable,
  createRow,
  createOverflowColumn,
  // 変更(THEME-2): rowHeight / headerHeight の既定は density プリセットから解決します(本体冒頭)。
  rowHeight: rowHeightProp,
  autoHeight = false,
  estimateRowHeight,
  headerHeight: headerHeightProp,
  density = 'standard',
  theme = 'light',
  rowHeaderWidth = 56,
  // 追加: スクロールコンテナ高さの外部制御。height で明示高さ('100%'=親追従)、maxHeight で上限。
  //   両者未指定時は CSS 既定(.ssg-scroll-container max-height:480px)に委ねます。
  height,
  maxHeight,
  readOnly = false,
  // 追加(THEME-3): readonly セルの組み込み淡色表示の opt-in(既定 false = 色変化なし)。
  dimReadOnlyCells = false,
  // 変更(SSRM 書き戻し): 生 prop は canEditCellProp として受け、serverSide の書き戻し可否と
  //   合成した canEditCell を下(serverSide フック直後)で再定義します(下流の consumer は従来名のまま)。
  canEditCell: canEditCellProp,
  // 追加(undo/redo): 編集の取り消し/やり直しです(既定 on)。clientSide + onRowsChange 時のみ実効。
  enableUndoRedo = true,
  // 追加(clear opt-out): Delete / Backspace の選択セル値クリアです(既定 on = 現行どおり)。
  enableClearOnDelete = true,
  // 追加(enter-move ②): 組み込みエディタの Enter 確定後の移動先です(既定 'down' = 従来どおり)。
  editorEnterMove = 'down',
  undoHistoryLimit = 100,
  onUndoRedoStateChange,
  enableRangeSelection = true,
  // ── 追加(行選択): チェックボックス行選択(既定 false=完全無効) ──
  enableRowSelection = false,
  rowSelectionMode = 'multiple',
  // enableSelectAllRows は既定を後段で解決します(enableRowSelection && multiple)。
  enableSelectAllRows: enableSelectAllRowsProp,
  rowSelection: rowSelectionProp,
  selectedRowKeys: selectedRowKeysProp,
  onRowSelectionChange,
  enableGlobalFilter = true,
  enableColumnFilter = true,
  // 追加(date-input): dateSet 条件の日付入力を利用側コンポーネントへ差し替えるスロットです。
  renderFilterDateInput,
  enableSorting = true,
  // 追加(①): 列リサイズのグリッド既定(既定 true=現行挙動)。列の resizable で個別上書き可。
  enableColumnResize = true,
  // 追加: データ投入時に全列幅を内容へ自動フィットさせるモード(既定 false)。
  //   詳細は gridTypes の AutoSizeColumnsMode。列個別の除外は列の suppressAutoSize で行います。
  autoSizeColumns = false,
  // 追加: セル省略(…)時にホバーで全文ツールチップを表示(既定 false)。既定テキストセルのみ対象。
  showCellOverflowTooltip = false,
  // 追加(validation 表示制御): invalid マークの表示可否(既定 true=現行の常時表示)。
  //   false でマーク非表示 + 可視セルの validate 評価スキップ。getInvalidCells / reject は不変。
  showValidationMarks = true,
  // 追加(UI hover): 行ホバー(既定 true) / 列ヘッダーホバー(既定 true)。
  enableRowHover = true,
  enableColumnHeaderHover = true,
  // 追加(proposals ⑩): 行ホバーの controlled 値と変更通知です(optionally controlled)。
  hoveredRowIndex: hoveredRowIndexProp,
  onHoveredRowChange,
  // 追加(13-A): 列メニュー(「⋮」+ 右クリック)の有効化フラグです(既定 true)。
  enableColumnMenu = true,
  // 追加(12-B): 0 行時の空状態テキストです(AG Grid のオーバーレイ相当)。
  noMatchingRowsText = '一致する行がありません',
  noRowsText = '表示する行がありません',
  // 追加: top/bottom バーの表示有無です(既定 true)。false で当該バーを一切描画しません
  //   (renderTopBar / renderBottomBar / enableGlobalFilter より優先のマスタースイッチ)。
  showTopBar = true,
  showBottomBar = true,
  // 追加: 既定トップバーの内訳(summary chips / グローバルフィルター入力)の表示有無です(既定 true)。
  //   renderTopBar 未指定時のみ効きます。フィルター入力は enableGlobalFilter=true が前提です。
  showTopBarSummary = true,
  showTopBarFilter = true,
  // 追加: 既定トップバーのグローバルフィルター入力の placeholder / 左アイコンです。
  //   既定はバー側(DefaultGridTopBar)で解決します(placeholder='グローバルフィルター'・icon=検索)。
  globalFilterPlaceholder,
  globalFilterIcon,
  // 追加: 各バーの Rows / Columns 件数 chips セットの表示有無です(既定 true)。
  //   トップは showTopBarSummary=true のとき内側で効き、ボトムは左側の件数グループを制御します。
  showTopBarCounts = true,
  showBottomBarCounts = true,
  // 追加(FM-2): フィルターチップバー(適用中の列フィルターの常時表示)。既定 false(opt-in)。
  showFilterChipBar = false,
  renderTopBar,
  renderBottomBar,
  className,
  // 追加(slot-props): ルート要素のインライン style(classNames.root の style と合成、こちらが後勝ち)。
  style,
  // 追加(UI CSS移行): パーツ別の追加 className スロット。
  classNames,
  // 追加(UI CSS移行): 行ごとの条件付き className。
  getRowClassName,
  // 追加(detail ②): 展開行(Master/Detail)。未指定なら機能は完全に休眠します。
  detailRow,
  onExpandedDetailRowKeysChange,
  // 追加(label-row ②): ラベル行(見出し / 区切り行)。未指定なら機能は完全に休眠します。
  labelRow,
  // 追加(row-drag ③): 行ドラッグ並び替え(既定 OFF)。
  enableRowDrag = false,
  isRowDraggable,
  onRowMove,
  // 追加(バッチ②/コンテキストメニュー): 有効化フラグ(既定 false=OFF)+ 項目供給 / 開通知。
  //   他機能の enable* と同じく既定無効。true かつ getContextMenuItems 指定時のみ発火します。
  enableContextMenu = false,
  getContextMenuItems,
  onContextMenuOpen,
  // 追加(scrollHint): スクロール位置インジケーターです(既定 undefined = 完全無効)。
  scrollHint,
  // 追加(imperative API #1): React 19 の ref-as-prop。命令的ハンドルを受け取ります。
  ref,
  // 追加(state #2): 永続スライス変化の通知口(保存タイミング signal)。発火規約は型定義のコメント参照。
  onStateChange,
  // 追加(proposals ⑧): スクロール位置の変化通知です(rAF 間引き・source 付き)。
  onScroll,
}: SpreadsheetGridProps<T>) {
  // 変更(proposals ②): rows / columns は readonly 配列も受け付けます。グリッドは入力配列を
  //   破壊的に変更しない設計(編集は onRowsChange / onColumnsChange が新配列を返す)のため、
  //   内部の既存シグネチャ(mutable T[])へはこの境界で 1 回だけ型を絞って渡します
  //   (実行時コピーはせず、参照同一性・memo 化はすべて従来どおり)。
  const rows = rowsProp as T[];
  const columns = columnsProp as GridColumn<T>[];

  // 追加(THEME-2): density プリセットの既定寸法を解決します(明示 prop が常に優先)。
  const rowHeight = rowHeightProp ?? DENSITY_DIMENSIONS[density].rowHeight;
  const headerHeight = headerHeightProp ?? DENSITY_DIMENSIONS[density].headerHeight;

  // 追加(scrollHint): スクロール位置インジケーターのオプション解決です。
  //   null = 完全無効(オーバーレイ自体を描画しない)。boolean / オブジェクトの両形を吸収します。
  const resolvedScrollHint = useMemo(
    () => resolveScrollHintOptions<T, ReactGridTypes>(scrollHint),
    [scrollHint],
  );

  // ── refs ──────────────────────────────────────────────
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const editorActionGuardRef = useRef(false);

  // 追加(10-G): 縦横ともにネイティブスクロールする「共有スクロールコンテナ」の ref です。
  // 変更理由: 中央ペインだけをネイティブスクロールさせ、左右固定ペインを JS の transform で
  //           追従させる方式では、コンポジタ(中央)とメインスレッド(固定)が同一フレームで
  //           一致せず、固定列がチカチカ（ティアリング）します。縦横スクロールを 1 つの要素へ
  //           集約し、固定列は position: sticky で横方向だけ留めることで、全ペインが同一
  //           ネイティブスクロールで動き、ズレが原理的に発生しなくなります。
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 追加(10-B): 左固定ペインの要素 ref です（clientX のペイン判定に使います）。
  const leftPaneScrollRef = useRef<HTMLDivElement | null>(null);
  // 追加(10-B): 右固定ペインの要素 ref です（clientX のペイン判定に使います）。
  const rightPaneScrollRef = useRef<HTMLDivElement | null>(null);

  // ── local state ───────────────────────────────────────
  // 変更(11-B6): editorValue(毎キーストロークで更新されるドラフト state)を廃止し、
  //   「編集開始時の初期値」だけを持つ editorInitialValue へ置き換えます。
  // 変更理由: 旧実装はドラフトを SpreadsheetGrid の state として持ち、
  //   CellEditorLayer×3 ペインへ value/onChange を渡していたため、編集中の
  //   毎キーストロークで親全体（3 ペインのヘッダー/ボディ含む）が再レンダーして
  //   いました。ドラフトを CellEditorLayer ローカル state へ移すことで、
  //   タイピング中は editor の input だけが更新されます。
  //   本 state が更新されるのは編集開始時のみで、同一イベント内の
  //   dispatch(startEdit) と React が自動バッチするため、編集開始時の
  //   親レンダー回数は従来どおり 1 回です。
  const [editorInitialValue, setEditorInitialValue] = useState('');


  // ── columns ───────────────────────────────────────────
  // 追加(grouping ③): 行グルーピングの列解決です。rowGroup 列(columns 出現順 = 階層順)と
  //   aggFunc 列は「全列定義」から導出します(visible の影響を受けません)。
  //   グルーピングは clientSide 限定です(SSRM は v1 対象外。stage 側の開発時警告参照)。
  // 変更(本体分解 E-1): 合成列の注入 / 可視列 / ペイン順の解決は engine/columnLayout.ts(React 非依存)へ
  //   移設しました。展開行トグル列のセル本体(JSX)だけを描画側から渡します。
  const detailToggleColumnActive =
    detailRow != null && detailRow.showToggleColumn !== false;
  // 変更(本体分解 E-7): リゾルバ / コマンド群 / 通知 / DOM コントローラ / 外部 store は engine/createGridEngine.ts が
  //   1 インスタンスとして生成します(React 非依存)。本シェルはレンダーごとにリゾルバへ入力を渡し、各コントローラへは
  //   useControllerLifecycle(update / dispose)で接続します。初期 store 状態(初回 visibleColumns)もエンジン側で作ります。
  const [engine] = useState(() =>
    createGridEngine<T>({
      columnInputs: {
        columns,
        isServerSide: dataSource != null,
        enableRowDrag,
        hasRowsChange: onRowsChange != null,
        detailToggleColumnActive,
        renderDetailToggleCell: renderDetailToggleCell as NonNullable<
          GridColumn<T>['renderCell']
        >,
      },
      serverSide: {
        isServerSide: dataSource != null,
        enableGlobalFilter,
        enableColumnFilter,
        enableSorting,
      },
    }),
  );
  const { resolveColumns } = engine;
  const {
    groupColumns,
    aggColumns,
    rowGroupingActive,
    rowDragAvailable,
    visibleColumns,
    orderedColumns,
  } = useMemo(
    () =>
      resolveColumns({
        columns,
        isServerSide: dataSource != null,
        enableRowDrag,
        hasRowsChange: onRowsChange != null,
        detailToggleColumnActive,
        renderDetailToggleCell: renderDetailToggleCell as NonNullable<
          GridColumn<T>['renderCell']
        >,
      }),
    // 注記: useMemo は React Compiler の lint(preserve-manual-memoization)向けの外皮で、細粒度の参照安定は
    //   リゾルバ内の createMemo が担います。
    [
      resolveColumns,
      columns,
      dataSource,
      enableRowDrag,
      onRowsChange,
      detailToggleColumnActive,
    ],
  );

  const resolvedRowKeyGetter = useMemo(
    () => rowKeyGetter ?? ((_row: T, index: number) => index),
    [rowKeyGetter],
  );

  // ── serverSide(SSRM)モード分岐(①-3 / stage ②) ───────────
  // dataSource 指定で serverSide モードへ切り替えます。clientSide(dataSource 不在)は従来
  //   経路を一切変えません(以降の各 consumer は rowModel シーム越しで透過に動きます)。
  const isServerSide = dataSource != null;
  // 変更(stage ②): serverSide でも sort/filter/global-filter の UI を有効化します。ローカル並べ替えは
  //   行わず(serverSide 時は rows=空のため clientSide パイプラインは空走行=ゼロコストでバイパス)、
  //   状態を下の ServerSideQuery に載せて getRows へ送出します。利用者がサーバ非対応の操作を塞ぎたい
  //   場合は enableSorting / enableColumnFilter / enableGlobalFilter を false にできます。
  //   serverSide query / queryKey は uiState 確定後に下方(rowModel シーム付近)で構築します。
  const sortingEnabled = enableSorting;
  const columnFilterEnabled = enableColumnFilter;
  const globalFilterEnabled = enableGlobalFilter;

  // ── store(非依存化 ④-1)──────────────────────────────
  // 変更: useReducer → React 非依存の外部 store(model/gridStore)+ useSyncExternalStore 購読。
  //   reducer / 初期 state / dispatch の呼び出し形は従来どおりで挙動不変。store はマウント時に
  //   1 回だけ生成します(useState 初期化子。初期 state は従来と同じく初回の visibleColumns)。
  const gridStore = engine.store;
  const [uiState, dispatch] = useGridStore(gridStore);
  // 追加(非依存化 ④-2): view スライス(ビューポート計測 / ホバー)。旧 useState 6 個の置き換えで、
  //   setter の呼び出し形(値 or 関数)と参照安定性は従来どおりです。
  const [
    {
      scrollTop,
      viewportWidth,
      viewportHeight,
      hoveredRowIndex,
      hoveredColumnIndex,
      isCornerHovered,
    },
    {
      // 注記: viewportWidth / viewportHeight は scroll / resize effect が gridStore.setViewState で
      //   まとめて更新するため、個別 setter はここでは使いません。
      setScrollTop,
      setHoveredRowIndex,
      setHoveredColumnIndex,
      setIsCornerHovered,
    },
  ] = useGridViewState(gridStore);

  // 追加(proposals ⑩): 行ホバーの optionally controlled 化です。pointer 由来の現在値は
  //   pointerHoveredRowRef を正本にして同値抑止し(pointerenter は同一行内のセル跨ぎでも来る)、
  //   変化時のみ内部 state(uncontrolled 表示用)の更新と onHoveredRowChange の通知を行います。
  //   setter は恒久安定([] deps)にします — 本 setter は handleCellPointerEnter(GridBodyRow の
  //   memo prop)の依存に入るため、利用側がインライン arrow の onHoveredRowChange を渡すと
  //   参照が毎レンダー変わって全行 memo が破れるためです。不安定値は useEffect で同期する
  //   latest-ref(RS-AS 方式)越しに読みます。
  const isHoverControlled = hoveredRowIndexProp !== undefined;
  // 変更(本体分解 E-6a): ホバー行の正本(同値抑止)/ 内部 state 更新 / onHoveredRowChange 通知は
  //   engine/notifiers.ts の createHoverRowNotifier へ(旧 latest-ref 3 本 + 同期 effect を解消)。
  useControllerLifecycle(engine.hoverRowNotifier, {
    enableRowHover,
    isHoverControlled,
    onHoveredRowChange,
    setHoveredRowIndex,
  });
  const applyHoveredRowChange = engine.hoverRowNotifier.applyHoveredRowChange;
  // 表示に使うホバー行です(controlled 優先 / enableRowHover: false は常に null)。
  const resolvedHoveredRowIndex = !enableRowHover
    ? null
    : hoveredRowIndexProp !== undefined
      ? hoveredRowIndexProp
      : hoveredRowIndex;

  // 追加(detail ②): 展開行キー集合の変更通知です。初回マウント(空集合)は通知しません。
  //   コールバックは useEffect で同期する latest-ref(RS-AS 方式)越しに読み、通知 effect の deps は
  //   集合の参照だけにします(コールバック識別子の変化で再通知しない)。
  // 変更(本体分解 E-6a): 通知は engine/notifiers.ts の createDetailKeysNotifier へ(passive = ペイント後、旧 effect と同じ)。
  useControllerLifecycle(
    engine.detailKeysNotifier,
    {
      expandedKeys: uiState.expandedDetailRowKeys,
      onChange: onExpandedDetailRowKeysChange,
    },
    'passive',
  );

  // 追加(detail ③): 展開行の有効判定と rowKey → view index 解決キャッシュです。
  //   セル側のトグルは「そのセルの view index」でキャッシュを seed してから dispatch します
  //   (serverSide でも全行走査なしで帯の位置が決まる)。
  const detailRowEnabled = detailRow != null;
  // 変更(本体分解 E-6c): useRef → 差し替え可能なホルダー(logic/detailRow.createDetailIndexCacheHolder)。
  const detailIndexCacheHolder = engine.detailIndexCache;
  const toggleDetailRowAt = useCallback(
    (rowKey: GridRowKey, viewIndex: number) => {
      seedDetailIndexCache(detailIndexCacheHolder.current, rowKey, viewIndex);
      dispatch(gridActions.toggleDetailRow(rowKey));
    },
    [dispatch, detailIndexCacheHolder],
  );
  const setDetailRowExpandedAt = useCallback(
    (rowKey: GridRowKey, viewIndex: number, expanded: boolean) => {
      seedDetailIndexCache(detailIndexCacheHolder.current, rowKey, viewIndex);
      dispatch(gridActions.setDetailRowExpanded(rowKey, expanded));
    },
    [dispatch, detailIndexCacheHolder],
  );
  // 追加(label-row ②): ラベル行(見出し / 区切り行)のオプションを分解します(下流の memo 依存を
  //   プリミティブ / 関数参照にするため。labelRow オブジェクトをインラインで渡しても各段は揺れません)。
  const labelIsLabelRow = labelRow?.isLabelRow;
  const labelGetLabel = labelRow?.getLabel;
  const labelRender = labelRow?.render;
  const labelRowClassName = labelRow?.className;
  const labelRowHeightOption = labelRow?.height;
  const labelSortMode = labelRow?.sortMode ?? 'section';
  const labelKeepEmptySections = labelRow?.keepEmptySections ?? false;
  const labelRowEnabled = labelIsLabelRow != null && labelGetLabel != null;



  // 注記(13-B2-2 → 本体分解 E-4a): 列リセット用の「初期 column defs スナップショット」は engine/columnCommands が
  //   最初の update で退避します(以後 columns が変わっても更新しない = ユーザー操作後の状態を「初期」と誤認しない)。

  // 追加(11-A): GridBodyLayer / GridHeaderRow へ uiState を渡さないための
  //             正規化済み選択スナップショットです。
  // 変更理由: uiState を丸ごと子へ渡すと、selection / dragState 等のあらゆる更新で
  //           GridBodyRow(memo) の比較が全行不一致になっていました。
  //           selection が変わったときだけ参照が変わる小さなオブジェクトに畳み込み、
  //           行側はここから導出したプリミティブ値だけを受け取ります。
  const selectionSnapshot = useMemo(
    () => buildSelectionSnapshot(uiState.selection),
    [uiState.selection],
  );

  // ── 3ペイン geometry（10-B → 11-B4） ──────────────────
  // 変更(11-B4): paneLayout を「一括 useMemo」から「3 ペイン独立の useMemo」へ分割します。
  // 変更理由: ライブリサイズ中は uiState.columnWidths が毎 pointermove で参照更新されるため、
  //           一括構築では幅が変わっていないペインまで entries 参照が毎回作り直され、
  //           固定ペイン全行（GridBodyRow の memo）が renderEntries 不一致で再レンダーして
  //           いました。各ペインの依存を「そのペインの列ソース + そのペインの幅 join キー」
  //           へ絞ることで、中央列のリサイズ中は左右固定ペインの geometry / entries 参照が
  //           完全に不変になります。

  // 追加(11-B4): orderedColumns を 3 ペインの列ソース（列 + 論理 index）へ分割します。
  //             columnWidths に依存しないため、列構成が変わらない限り参照は不変です。
  // 変更(本体分解 E-1): flex 解決と 3 ペイン geometry は engine/columnLayout.ts(React 非依存)へ移設しました
  //   (メモ単位は旧 useMemo と同じ = ライブリサイズ中に幅が変わらないペインの参照は不変)。
  const { resolvePaneLayout } = engine;
  const {
    effectiveColumnWidths,
    paneLayout,
    hasLeftPane,
    hasRightPane,
    centerOwnsRowHeader,
    leftLeadingWidth,
    centerLeadingWidth,
    rightLeadingWidth,
    leftPaneTotalWidth,
    rightPaneTotalWidth,
    centerContentWidth,
    totalScrollWidth,
  } = useMemo(
    () =>
      resolvePaneLayout({
        orderedColumns,
        columnWidths: uiState.columnWidths,
        viewportWidth,
        rowHeaderWidth,
      }),
    [
      resolvePaneLayout,
      orderedColumns,
      uiState.columnWidths,
      viewportWidth,
      rowHeaderWidth,
    ],
  );


  // ── filter popover ────────────────────────────────────
  // 追加(filter-ext E): filterType: 'auto' の解決結果キャッシュです(列キー → 実効種別)。
  //   合意仕様「初回オープン時に推定して以後固定」を担保します。行の追加 / 編集で推定が
  //   揺れると、適用済み記述子(kind)と UI が食い違うためです。
  //   判定材料が無かった回(conclusive=false: まだ行が空 等)はキャッシュせず、次回再推定します。
  const autoFilterTypeCacheRef = useRef(new Map<string, ColumnFilterUiType>());

  // 追加(filter-ext E): 'auto' 列の実効フィルター種別を解決します(popover の open 時に 1 回)。
  //   優先順位: 適用済み記述子の kind > キャッシュ > editor ヒント / 値サンプリング。
  //   「適用済み記述子が最優先」は applyState で復元された状態(popover を一度も開いていない
  //   列にフィルターが載っている)でも UI と記述子を一致させるためです。
  const resolveAutoColumnFilterType = useCallback(
    (column: GridColumn<T>): ColumnFilterUiType => {
      const currentValue = uiState.filters.columnFilters[column.key];
      if (
        currentValue?.kind === 'numberSet' ||
        currentValue?.kind === 'textSet' ||
        currentValue?.kind === 'dateSet' ||
        currentValue?.kind === 'text'
      ) {
        return currentValue.kind;
      }
      const cached = autoFilterTypeCacheRef.current.get(column.key);
      if (cached) {
        return cached;
      }
      const result = inferColumnFilterType({
        editorType: column.editor?.type,
        isServerSide,
        rowCount: rows.length,
        getRawValueAt: (index) => getCellValue(rows[index], column),
      });
      if (result.conclusive) {
        autoFilterTypeCacheRef.current.set(column.key, result.filterType);
      }
      return result.filterType;
    },
    [uiState.filters.columnFilters, isServerSide, rows],
  );

  const {
    filterPopoverState,
    filterPopoverLayout,
    filterPopoverRef,
    filterTextInputRef,
    filterSelectRef,
    isFilterPopoverOpen,
    openedFilterColumn,
    openedFilterType,
    openColumnFilterPopover,
    closeColumnFilterPopover,
    updateFilterPopoverDraft,
    updateFilterPopoverNumberDraft,
    updateFilterPopoverTextDraft,
    updateFilterPopoverDateDraft,
  } = useFilterPopoverController({
    visibleColumns,
    columnFilterValues: uiState.filters.columnFilters,
    enableColumnFilter: columnFilterEnabled,
    gridRootRef,
    resolveColumnFilterType: resolveAutoColumnFilterType,
  });

  // ── column menu(13-A) ────────────────────────────────
  // 追加(13-A): 列メニュー(「⋮」ボタン + ヘッダー右クリック)の controller です。
  //             filter popover と独立した popover ですが、open / close / outside click /
  //             layout の作法は useFilterPopoverController と同型です。
  //             相互排他は両 controller の outside-pointerdown close が自然に担います
  //             (片方を開く操作はもう片方にとって outside click になるためです)。
  const {
    columnMenuLayout,
    columnMenuRef,
    isColumnMenuOpen,
    openedMenuColumnKey,
    openedMenuColumn,
    openColumnMenuFromButton,
    openColumnMenuFromButtonClick,
    openColumnMenuFromContextMenu,
    closeColumnMenu,
  } = useColumnMenuController({
    visibleColumns,
    enableColumnMenu,
    gridRootRef,
  });

  // ── tool panel(UP-1) ─────────────────────────────────
  // 変更(UP-1): フィルター管理 / 列の表示 / 並び替えの独立 3 パネルを、SegmentedControl で
  //             タブ切替する統合ツールパネル 1 枚へ集約しました。controller も 1 本です。
  //             タブ可用性は各機能フラグに紐づきます(filter=enableColumnFilter /
  //             columns=enableColumnMenu / sort=enableSorting)。
  //             フィルター popover との共存(旧 FM-1 拡張)はパネル全体へ引き継ぎます:
  //               - outside-close: alliedRef(filterPopoverRef)内の pointerdown では閉じない
  //               - Escape: popover open 中はパネルを閉じず popover の close へ委譲
  //                 (1 押し目 = popover / 2 押し目 = パネル。フォーカス位置に依りません)
  const {
    activeToolPanelTab,
    availableToolPanelTabs,
    toolPanelLayout,
    toolPanelFlashTick,
    toolPanelRef,
    openToolPanel,
    closeToolPanel,
    moveToolPanel,
  } = useToolPanelController({
    canUseFilterTab: columnFilterEnabled,
    canUseColumnsTab: enableColumnMenu,
    canUseSortTab: sortingEnabled,
    gridRootRef,
    alliedRef: filterPopoverRef,
    suppressEscape: isFilterPopoverOpen,
    onSuppressedEscape: closeColumnFilterPopover,
  });

  // ── cell context menu(バッチ②) ──────────────────────
  // 追加(バッチ②): セル/行の汎用コンテキストメニュー(完全カスタム)の controller です。
  //             配置(右クリック座標)/ outside click / Escape / scroll close を管理します。
  //             対象解決・項目供給は下の handleBodyContextMenu(委譲)で行い、確定 params + items を
  //             openContextMenu へ渡します。相互排他は他 popover と同じく outside-pointerdown が担います。
  const {
    contextMenuState,
    contextMenuLayout,
    contextMenuRef,
    isContextMenuOpen,
    openContextMenu,
    closeContextMenu,
  } = useCellContextMenuController<T>({ gridRootRef });

  // ── column widths sync ────────────────────────────────
  // 変更(B3): merge(syncColumnWidths)→ フル置換(resetColumnWidths)へ変更し、flex 列(center かつ
  //   flex>0)はエントリを作りません。これにより (1) flex 列が固定エントリを持って flex が無効化される
  //   のを防ぎ、(2) 実行時に fixed→flex へ切替えた列の古い固定エントリを一掃します。非 flex 列の手動
  //   リサイズ幅は、pin/表示/並べ替えの書き戻しで column.width に焼かれてからここへ来るため保全されます
  //   (merge 版と同じ挙動)。autosize は別経路(merge=syncColumnWidths)なので影響しません。
  useEffect(() => {
    const nextWidths = visibleColumns.reduce<Record<string, number>>(
      (acc, column) => {
        if (isFlexingColumn(column)) {
          return acc;
        }
        acc[column.key] = column.width;
        return acc;
      },
      {},
    );
    dispatch(gridActions.resetColumnWidths(nextWidths));
    // 注記(非依存化 ④-1): dispatch は store のメソッドで参照安定ですが、useReducer 由来ではなくなった
    //   ため exhaustive-deps が安定と判定できません。deps に明示します(再実行は起きません)。
  }, [visibleColumns, dispatch]);

  // ── row models (source → filtered → sorted) ──────────
  // 変更(DS-4 #1): 候補収集は logic/selectOptions の共有コレクタへ移管しました。
  //   開いている列の候補は useColumnSelectOptionsCollector が「通常規模=同期 / 大規模=
  //   時間分割の非同期」で出し分けます(下部 filter popover actions 参照)。

  // 変更(11-A3): 依存を uiState 丸ごと → filters.globalText(string) へ縮小します。
  // 変更理由: これが「全行 memo が毎親レンダーで破られる」症状の根本原因でした。
  //   旧実装は依存配列に uiState を丸ごと持っていたため、selection 更新などの
  //   あらゆる dispatch のたびにこの useMemo が再計算され、行モデルチェーン全体
  //   (globallyFiltered → columnFiltered → sorted → filteredRows /
  //    filteredRowSourceIndexes / filteredRowKeys)が毎回新しい配列参照になって
  //   いました。その結果、filteredRowSourceIndexes を依存に持つ renderCellContent と
  //   filteredRows を依存に持つ onCellDoubleClick の参照が毎 dispatch で変わり、
  //   GridBodyRow(memo) の props 比較が全行で不一致になっていました(11-A / 11-A2 の
  //   修正が効かなかった理由)。あわせて 5000 行のフィルター/ソート再計算が
  //   毎 dispatch 走る CPU 浪費も解消されます。
  //   なお下流の columnFiltered / sorted は元から狭い依存
  //   (uiState.filters.columnFilters / uiState.sort)になっており、起点のここだけが
  //   丸ごと依存でした。
  const globalFilterText = uiState.filters.globalText;

  // 注記(F-async): グローバルフィルタの「入力非ブロック化」は useGlobalFilteredOrder へ移しました
  //   (旧 11-B7 の useDeferredValue は同フック内部へ内包)。同フックは評価値の遅延化(連続入力の
  //   合体)に加え、しきい値超では時間分割(yieldToMain)で適用するため、1M 行 × 多列でも入力/
  //   スクロールが詰まりません。入力欄の value は従来どおり即時値 globalFilterText
  //   (useGridBarContext → slotContext 経由)を参照します。pending 表示も同フックの status/
  //   progress を slotContext へ載せて実現します(下記参照)。

  // 追加(12-B): 列フィルター評価値を useDeferredValue で遅延化します(11-B7 と同型)。
  // 変更理由: 12-A で set フィルターが「チェック操作ごとの即時適用」になったため、
  //   columnFilters の更新頻度が popover の Apply 押下時代より大きく上がりました。
  //   従来はチェック 1 回ごとの同期レンダー内で filterOrderByColumns(最大 5,000 行)と
  //   下流チェーン(sorted → filteredRows / SourceIndexes / Keys → 仮想行再構築)が
  //   走り、連続クリック時にチェックボックスの応答がブロックされ得ます。
  //   依存を deferred 値へ差し替えることで、クリック直後の緊急レンダーでは
  //   チェックボックス表示(openedSetSelection は即時値 uiState を参照)・
  //   ヘッダーバッジ・bar 件数だけが即時更新され、行の再フィルタは低優先度の
  //   遅延レンダーへ移ります。連続クリック中の中間値計算は中断・破棄され、
  //   最終値での 1 回に収束します。
  // 注記: text / number フィルターの Apply 押下や「クリア」も同じ経路ですが、
  //   これらは単発操作のため体感差はなく、挙動は等価です。
  const columnFilters = uiState.filters.columnFilters;
  const deferredColumnFilters = useDeferredValue(columnFilters);

  // ── row order pipeline (DS-2) ─────────────────────────
  // 変更(DS-2): オブジェクト配列チェーン(source→global→column→sort の {row,...}[])を
  //   order(RowOrder = Int32Array)チェーンへ差し替えます。各段は DS-1 で追加・検証済みの
  //   純関数で、ビュー順は旧オブジェクト版と厳密に等価です(39 アサーション PASS)。
  //   旧チェーンと同じ依存構造を踏襲するため、no-op dispatch(selection 等)では
  //   全 useMemo がスキップされ、order 参照が不変に保たれます
  //   (= 11-A3 / 11-B7 / 12-B の最適化を維持)。
  //
  //   filteredRows / filteredRowSourceIndexes / filteredRowKeys は order からの
  //   「派生ビュー」として materialize し続けます(全 consumer をバイト等価で無改修に保つため)。
  //   この materialize は DS-3 で consumer を rowModel.getRow 等へ移行後に撤去予定です。
  //
  //   baseOrder は恒等 order [0..n-1]。長さのみ依存のため、rows の identity が変わっても
  //   同一長なら参照が安定します(下流の filterOrder* は rows 依存で再計算)。
  // 変更(本体分解 E-2): order パイプライン / グルーピング / RowModel シーム / serverSide query の派生値計算は
  //   engine/rowPipeline.ts(React 非依存)へ移設しました。useMemo は React Compiler lint 向けの外皮で、
  //   細粒度の参照安定はリゾルバ内の createMemo が担います。
  const { rowPipeline } = engine;
  // 追加(label-row ②): ラベル行の配置(rows / 述語が変わったときだけ 1 パス)。clientSide のみ
  //   (serverSide はブロック内の行を述語で判定するラッパへ = 下の rowModel)。
  const labelLayout = useMemo(
    () => rowPipeline.resolveLabelRowLayout(rows, isServerSide ? undefined : labelIsLabelRow),
    [rowPipeline, rows, isServerSide, labelIsLabelRow],
  );
  // 変更(label-row ②): ラベル行があるときはラベル行を除いた恒等 order(データ行のみ)。無ければ従来どおり
  //   長さのみ依存の恒等 order。
  const baseOrder = useMemo(
    () => rowPipeline.resolveBaseOrder(rows.length, labelLayout),
    [rowPipeline, rows.length, labelLayout],
  );

  // 変更(F-async): globalFilteredOrder の同期 useMemo を時間分割フックへ差し替えます。
  //   返り値の order は「現在表示すべきビュー順」で、計算中は前回確定 order を維持します
  //   (= 下流 columnFiltered / sorted / rowModel は order 参照が安定する限りスキップ＝
  //   進捗 tick では本体行は再描画されず、トップバーの進捗表示だけが更新されます)。
  //   status / progress は下のバーコンテキストへ渡してローディング表示に使います。
  const {
    order: globalFilteredOrder,
    status: globalFilterStatus,
    progress: globalFilterProgress,
  } = useGlobalFilteredOrder({
    rows,
    baseOrder,
    columns: visibleColumns,
    globalText: globalFilterText,
    enabled: globalFilterEnabled,
  });

  const { order, rowDragOperable } = useMemo(
    () =>
      rowPipeline.resolveOrder({
        rows,
        labelLayout,
        visibleColumns,
        columnFilters: deferredColumnFilters,
        globalFilteredOrder,
        sort: uiState.sort,
        rowDragAvailable,
      }),
    [
      rowPipeline,
      rows,
      labelLayout,
      visibleColumns,
      deferredColumnFilters,
      globalFilteredOrder,
      uiState.sort,
      rowDragAvailable,
    ],
  );

  // ── 行グルーピング stage(grouping ②) ───────────────────
  // sorted order の後段に挿す表示変換です。groupColumns / aggColumns / rowGroupingActive は
  //   columns 節(grouping ③)で導出済みです。rowGroup 列が無ければ groupedDisplay は null に
  //   なり、下の clientSideRowModel は従来の order 直参照へフォールバックします
  //   (非グルーピング経路はバイト等価)。
  // SSRM で rowGroup 列が指定されたときの開発時警告です(例外は投げず、グルーピングを
  //   無視して通常表示を継続します)。
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    if (isServerSide && groupColumns.length > 0) {
      console.warn(
        '[SpreadsheetGrid] serverSide(dataSource)では行グルーピング(rowGroup)は未対応です。rowGroup 指定を無視して通常表示します。',
      );
    }
  }, [isServerSide, groupColumns.length]);

  // 追加(label-row ②): 行グルーピングとラベル行の併用は未対応(rowGroup 有効時はラベル行を非表示)の開発時警告。
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    if (rowGroupingActive && labelRowEnabled) {
      console.warn(
        '[SpreadsheetGrid] 行グルーピング(rowGroup)とラベル行(labelRow)は併用できません。rowGroup 有効中はラベル行を表示しません。',
      );
    }
  }, [rowGroupingActive, labelRowEnabled]);

  const sortActive = uiState.sort.length > 0;
  const {
    groupTree,
    groupedDisplay,
    labelDisplay,
    rowModel: clientSideRowModel,
  } = useMemo(
    () =>
      rowPipeline.resolveClientSideRowModel({
        rows,
        order,
        rowGroupingActive,
        labelLayout,
        labelSortMode,
        keepEmptySections: labelKeepEmptySections,
        sortActive,
        getLabel: labelGetLabel,
        groupColumns,
        aggColumns,
        collapsedGroupKeys: uiState.collapsedGroupKeys,
        rowKeyGetter: resolvedRowKeyGetter,
      }),
    [
      rowPipeline,
      rows,
      order,
      rowGroupingActive,
      labelLayout,
      labelSortMode,
      labelKeepEmptySections,
      sortActive,
      labelGetLabel,
      groupColumns,
      aggColumns,
      uiState.collapsedGroupKeys,
      resolvedRowKeyGetter,
    ],
  );

  // 追加(grouping ③): グループ開閉のトグルです(GridBodyLayer のシェブロン / グループ行
  //   ダブルクリックから呼ばれます)。dispatch は安定参照のため本ハンドラも恒久安定です。
  const handleGroupToggle = useCallback(
    (groupKey: string) => {
      dispatch(gridActions.toggleGroupCollapsed(groupKey));
    },
    [dispatch],
  );

  // 注記(DS-3-0): order を直接触る consumer は rowModel シーム(getRowCount / getRow / getSourceIndex /
  //   getRowKey / getGroupRow)越しに参照します。実装は engine/rowPipeline.ts。

  // ── serverSide query 配線(stage ②) ───────────────────
  // clientSide の UI 状態(sort / 列フィルター / グローバルフィルター)から ServerSideQuery を組み立て、
  //   安定 queryKey を導出します。clientSide(isServerSide=false)では空 query 固定です(フックは inert の
  //   ため値は無視されますが、debounce effect を不発にして無駄な再描画を避けます)。
  //   入力欄の value は従来どおり即時 uiState を参照するため、タイピングは即時反映されます。ここで作る
  //   live 値はそのまま渡さず、下で debounce してからフックへ供給します(サーバ送出の合体)。
  const liveServerSideQuery = useMemo(
    () =>
      rowPipeline.resolveServerSideQuery({
        isServerSide,
        globalFilterEnabled,
        globalText: globalFilterText,
        columnFilterEnabled,
        columnFilters,
        sortingEnabled,
        sort: uiState.sort,
      }),
    [
      rowPipeline,
      isServerSide,
      globalFilterEnabled,
      globalFilterText,
      columnFilterEnabled,
      columnFilters,
      sortingEnabled,
      uiState.sort,
    ],
  );

  // debounce 済みの query / queryKey です(これをフックへ渡します)。live が変化しても
  //   SERVER_SIDE_QUERY_DEBOUNCE_MS の静止後に一度だけ反映し、キーストロークごとのキャッシュ破棄+
  //   block 0 取り直しを抑止します。初期値は live の初回値で seed し、mount 時のフック queryKey と
  //   一致させて初回 debounce 後の余計な再設定を避けます。
  // 変更(本体分解 E-2): useState × 2 + setTimeout effect を controllers/debouncedValueStore(React 非依存)へ。
  const serverSideQueryStore = engine.serverSideQueryStore;
  useControllerLifecycle(serverSideQueryStore, {
    value: liveServerSideQuery,
    enabled: isServerSide,
  });
  const { query: serverSideQuery, queryKey: serverSideQueryKey } =
    useSyncExternalStore(
      serverSideQueryStore.subscribe,
      serverSideQueryStore.getSnapshot,
      serverSideQueryStore.getSnapshot,
    );

  // 追加(①-3): serverSide(SSRM)の RowModel を供給します。React Hooks 規則によりフックは
  //   無条件に呼びます。dataSource 不在(clientSide)では hook が inert(件数 0 / 取得 no-op)に
  //   なるよう実装済みのため、clientSide 経路は完全に不変です。
  const serverSide = useServerSideRowModel<T>({
    dataSource,
    rowKeyGetter: resolvedRowKeyGetter,
    query: serverSideQuery,
    queryKey: serverSideQueryKey,
    // 追加(stage ③): ソフトリフレッシュ signal。queryKey と独立にキャッシュ破棄+可視レンジ取り直しを起こす。
    refreshToken: serverSideRefreshToken,
    // 追加(batch 9): getRows 失敗の外部通知(abort 除く)。hook 内 latest-ref で読むため
    //   インライン関数でも fetch 系の再生成は起きません。
    onLoadError: onServerSideLoadError,
    // 追加(SSRM 書き戻し): updateRows 失敗(ロールバック済み)の外部通知です(同じく latest-ref)。
    onWriteError: onServerSideWriteError,
  });
  // 追加(batch 9): 内蔵エラーバーの「閉じる」状態です。閉じた時点の loadError 参照を記録し、
  //   同一参照の間だけ非表示にします(失敗集合が変わる = 新しい失敗イベントで新参照になり
  //   再表示。クエリ変化 / retry / 全回復で loadError が null に戻れば記録は自然に無効化)。
  const [dismissedLoadError, setDismissedLoadError] =
    useState<ServerSideLoadErrorState | null>(null);
  // 追加(SSRM 書き戻し): 保存失敗バーの「閉じる」状態です(loadError と同じ参照比較の契約。
  //   新しい書き戻し失敗のたびに writeError が新参照になり再表示されます)。
  const [dismissedWriteError, setDismissedWriteError] =
    useState<ServerSideWriteErrorState | null>(null);
  // 可視レンジ通知に使う stable 参照(useCallback)だけを抜き出します。serverSide オブジェクト
  //   自体は毎 render 生成のため、effect 依存にはこの requestRange のみを使います。
  const requestServerSideRange = serverSide.requestRange;
  // 以降の全 consumer(rowModelRef / viewRowCount / keyboard / edit / clipboard / body /
  //   rowHeightStore)はこの rowModel シーム越しで透過に動きます。
  // 変更(label-row ②): serverSide では述語ラッパ(ラベル行の viewIndex で getRow を undefined に倒し
  //   getLabelRow が記述子を返す)を被せます。labelRow 未指定なら従来どおり素の rowModel です。
  const serverSideRowModel = serverSide.rowModel;
  const rowModel = useMemo(() => {
    if (!isServerSide) {
      return clientSideRowModel;
    }
    if (labelIsLabelRow && labelGetLabel) {
      return wrapRowModelWithLabelRows(serverSideRowModel, labelIsLabelRow, labelGetLabel);
    }
    return serverSideRowModel;
  }, [isServerSide, clientSideRowModel, serverSideRowModel, labelIsLabelRow, labelGetLabel]);

  // 追加(SSRM 書き戻し): 編集可否の合成です。serverSide で dataSource.updateRows が無い間は
  //   全セルを編集不可へ倒します(書き戻し先が無い編集セッションは commit 時に静かに破棄される
  //   だけのため、そもそも開かせない)。編集開始の全経路(dblclick / Enter / F2 / 印字キー /
  //   checkbox トグル / clear / paste)と cellState.readOnly(表示)がこの 1 箇所で揃います。
  const canEditCell = useMemo(() => {
    if (isServerSide && !serverSide.canUpdateRows) {
      return () => false;
    }
    return canEditCellProp;
  }, [isServerSide, serverSide.canUpdateRows, canEditCellProp]);

  // 追加(SSRM 書き戻し): serverSide のセル書き込み口です(dataSource.updateRows 指定時のみ定義)。
  //   定義時、各編集経路(エディタ commit / paste / clear / setValue / checkbox)は rows 再構築
  //   (onRowsChange)の代わりにここへ書きます(楽観更新・ロールバック・失敗通知はフック側)。
  //   undefined = clientSide または書き戻し不可で、各経路は従来どおりです。
  const applyServerSideCellEdits =
    isServerSide && serverSide.canUpdateRows
      ? serverSide.applyCellEdits
      : undefined;


  // ── body context menu(バッチ②) ──────────────────────
  // 追加(バッチ②): ボディ右クリックの委譲ハンドラです。ssg-shell 上の 1 ハンドラで対象セル/行を
  //   DOM(data-row-index / data-ssg-col-key)から逆引きし、getContextMenuItems の項目でメニューを
  //   開きます(memo 済みの行/セルへ props を足さない設計)。opt-in はこの prop の指定そのもので、
  //   未指定・項目空・SSRM 未ロード行ではブラウザ標準メニューへフォールスルーします(空パネルは出さない)。
  //   ヘッダーは [data-row-index] を持たないため必ず早期 return し、列メニューと自然排他になります。
  //   本ハンドラは常時再レンダーされる shell 上に置くため latest-ref 不要(参照安定は不問)です。
  const handleBodyContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      // opt-in 判定: マスタースイッチ OFF(既定)/ getContextMenuItems 未指定なら何もしません
      //   (= ブラウザ標準メニュー)。両方そろって初めて独自メニューの検討に入ります。
      if (!enableContextMenu || !getContextMenuItems) {
        return;
      }
      const targetEl = event.target as HTMLElement | null;
      if (!targetEl) {
        return;
      }
      // ボディ行コンテナ(行NO ガター含む)。ヘッダーはこれを持たないため null → 早期 return。
      const rowEl = targetEl.closest<HTMLElement>('[data-row-index]');
      if (!rowEl) {
        return;
      }
      const rowIndexRaw = rowEl.dataset.rowIndex;
      if (rowIndexRaw === undefined) {
        return;
      }
      const rowIndex = Number(rowIndexRaw);
      if (!Number.isInteger(rowIndex)) {
        return;
      }
      const row = rowModel.getRow(rowIndex);
      // SSRM 未ロード / OOB は開きません(標準メニューへ)。
      if (!row) {
        return;
      }
      const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;

      // セル(data-ssg-col-key あり)か、行NO ガター(なし)かで target を分けます。
      let target: GridContextMenuTarget<T>;
      let isTargetSelected: boolean;
      const cellEl = targetEl.closest<HTMLElement>('[data-ssg-col-key]');
      const colKey = cellEl?.dataset.ssgColKey;
      if (cellEl && colKey !== undefined) {
        const colIndex = resolveContextMenuColIndex(orderedColumns, colKey);
        if (colIndex < 0) {
          return;
        }
        const column = orderedColumns[colIndex];
        target = {
          type: 'cell',
          rowIndex,
          colIndex,
          rowKey,
          row,
          column,
          value: getCellValue(row, column),
        };
        isTargetSelected = isContextMenuCellSelected(
          uiState.selection,
          rowIndex,
          colIndex,
        );
      } else {
        target = { type: 'rowHeader', rowIndex, rowKey, row };
        isTargetSelected = isContextMenuRowSelected(uiState.selection, rowIndex);
      }

      const params: GridContextMenuParams<T> = {
        target,
        clientX: event.clientX,
        clientY: event.clientY,
        selection: uiState.selection,
        activeCell: uiState.activeCell,
        isTargetSelected,
      };

      const items = getContextMenuItems(params);
      // 空(または未定義)なら標準メニューへフォールスルー(空パネルは出さない)。
      if (!items || items.length === 0) {
        return;
      }

      // ここで初めて標準メニューを抑止し、独自メニューを開きます。
      event.preventDefault();
      onContextMenuOpen?.(params);
      openContextMenu(params, items);
    },
    [
      enableContextMenu,
      getContextMenuItems,
      onContextMenuOpen,
      rowModel,
      orderedColumns,
      uiState.selection,
      uiState.activeCell,
      openContextMenu,
    ],
  );

  // 追加(DS-4 ①-(2)): autosize 計測を「単一経路の時間分割(async)」で実行するランナーです。
  //   overlay は遅延表示で、重い時だけ Pending を出し、メインスレッドを塞ぎません
  //   (小規模は overlay 発火前に完了し、体感は従来の同期計測と同一です)。
  const { isAutosizing, runAutosize } = useColumnAutosizeRunner<T>({
    rowModel,
    gridRootRef,
    columnWidths: effectiveColumnWidths,
    dispatch,
  });

  // ── autoSize on data(データ投入時の列幅自動フィット)────────────
  // 変更(本体分解 E-6c): 宣言的トリガー(autoSizeColumns × rows 変化)は controllers/columnAutosizeRunner の
  //   createAutoSizeOnDataTrigger へ(passive = 旧 effect と同じくコミット後・パイプライン再計算済みで計測)。
  useControllerLifecycle(
    engine.autoSizeOnData,
    {
      mode: autoSizeColumns,
      isServerSide,
      rows,
      visibleColumns,
      runAutosize,
    },
    'passive',
  );

  // 追加(DS-3-6): ビュー行数の単一ソースを seam(getRowCount)経由へ移します。
  //   値は order.length(= 旧 filteredRows.length)で常に等価。プリミティブ number のため
  //   deps では値比較され、no-op dispatch(order 不変)では同値となり、これを依存に持つ
  //   memo/callback の参照を維持します(11-A 系の参照安定方針に整合)。rowModel を直接 deps に
  //   入れる方式と違い、resolvedRowKeyGetter 変化(order/rows 不変)では再評価されません
  //   (行数は order.length のみに依存するため)。DS-3-1 keyboard / DS-3-3 clipboard と同型です。
  const viewRowCount = rowModel.getRowCount();

  // 追加(grouping ④): leaf 行数(グループ行を除くデータ行数)です。行選択の件数・bar summary の
  //   「Rows: X / Y」はこちらを使います(viewRowCount はグループ行込みの表示行数で、仮想化・
  //   ヒットテスト・キーボード境界はそちらが正)。グルーピング無効時は常に同値です。
  // 変更(label-row ②): ラベル行有効時もデータ行数(order.length)です(serverSide のラベル行はサーバー総数に
  //   含まれるため viewRowCount のまま)。
  const leafRowCount = groupedDisplay || labelDisplay ? order.length : viewRowCount;

  // 追加(scrollHint minRows): データ量ゲートの適用です。表示行数(viewRowCount)が minRows 未満の
  //   間は scrollHint 全体を待機(null 扱い)にし、ネイティブスクロールバー表示のまま保ちます。
  //   バブルの「行 N / 総行数」やルーラーと同じ行数(グループ行込み・SSRM はサーバー総数)で
  //   判定します。既定 minRows=0 では常に resolvedScrollHint と同値(従来挙動)。
  const activeScrollHint =
    resolvedScrollHint !== null && viewRowCount >= resolvedScrollHint.minRows
      ? resolvedScrollHint
      : null;

  // 派生ビュー: order[i] が「ビュー位置 i の元 rows index(= source index)」です。
  // 変更(DS-3-7): eager な filteredRows 配列 materialize を撤去し、遅延キャッシュ factory に
  //   置き換えます。唯一残る consumer は公開 slotContext.filteredRows(外部スロット契約)のみで、
  //   内部の bar summary は viewRowCount(件数)へ移行済み(DS-3-7)。よって全行配列は外部スロットが
  //   実際に読んだ時だけ materialize すれば足ります(pay-per-use)。
  //   - getFilteredRows は [order, rows] で memo 化され、初回呼び出し時に Array.from を 1 度だけ
  //     実行してキャッシュ。同一世代では参照も安定(従来 eager memo の identity 契約を維持)。
  //   - no-op dispatch(order/rows 不変)では factory 参照が不変 → slotContext memo も安定。
  //   公開型 SpreadsheetGridSlotContext.filteredRows: T[] は不変(getter は透過、consumer 不可視)。
  // 撤去済み(DS-3-0): filteredRowKeys は唯一の consumer だった GridBodyLayer を
  //   rowModel.getRowKey へ移行したため撤去しました(行キーは seam が供給)。
  // 撤去済み(DS-3-3): filteredRowSourceIndexes は最後の source-index consumer だった
  //   clipboard を rowModel.getSourceIndex へ移行したため撤去しました
  //   (edit=DS-3-2 / renderCellContent.setValue=DS-3-2b は移行済み)。source-index 解決は
  //   全て seam の getSourceIndex(i)(= order[i])経由になりました。
  const getFilteredRows = useMemo(() => {
    let cache: T[] | null = null;
    return () => (cache ??= Array.from(order, (sourceIndex) => rows[sourceIndex]));
  }, [order, rows]);

  // ── column measurements ───────────────────────────────
  // 変更(B3): columnVirtualizer の再計測トリガーも flex 解決済み幅で作ります(flex 変化 = viewport
  //   リサイズ等で列幅が変わったとき、仮想化の再計測を確実に発火させるため)。
  const columnMeasurements = useMemo(
    () => buildColumnMeasurements(visibleColumns, effectiveColumnWidths),
    [visibleColumns, effectiveColumnWidths],
  );

  // 注記(10-E): columnMeasurements は columnVirtualizer の再計測トリガーとしてのみ使います。
  //             水平座標の実計算は paneLayout（ペインローカル座標）側へ移行しました。

  // ── 縦スクロール計測(scroll-space 仮想化の駆動) ───────────
  // 変更(scroll-space 仮想化): 縦の行窓出しを @tanstack/react-virtual から、uniform 行高
  //   専用の手書きジオメトリ(logic/verticalGeometry)へ移行しました。
  // 変更理由: 1M 行で innerRowStyle.height = headerHeight + viewRowCount*rowHeight が
  //   ブラウザの要素高さ上限(Chrome ≈ 33.5M px)を超え、scrollHeight がクランプされて
  //   末尾行が到達不能になる機能ブロッカーがありました。物理 DOM 高さを上限内へ圧縮し
  //   (pixel scaling)、物理 scrollTop ↔ 論理オフセットを線形写像します。行高が一様なので
  //   窓出しは純粋な算術に潰れ、実測/二分探索は不要です(横の columnVirtualizer は可変幅で
  //   本当に効くため据え置き)。圧縮不要な行数(論理高さ <= MAX_BODY_PX)では scaleFactor=1 と
  //   なり、行の配置・各種写像は現状と数値的に一致します。
  //   旧 rowVirtualizer はスクロールごとの再レンダー駆動も担っていたため、その役割を
  //   下記の scroll/resize リスナーへ移管します(発火頻度は同等)。

  // 変更(本体分解 E-6b): 初期計測 / scroll リスナー / ResizeObserver / onScroll の rAF 間引き通知は
  //   controllers/scrollSyncController.ts へ(旧 latest-ref 3 本 + effect 2 個を解消)。命令的 API 由来の
  //   スクロール判定(markApiScroll)もコントローラが持ちます。
  const scrollSync = engine.scrollSync;
  useControllerLifecycle(scrollSync, {
    scrollContainerRef,
    setViewState: gridStore.setViewState,
    onScroll,
  });

  // 変更(10-C): 列の仮想化は「中央ペインの列エントリ」に対して行います。
  // 変更理由: 固定列は中央スクロール対象外。中央ペインの水平スクロール範囲＝
  //           center.totalWidth に合わせ、virtual item の index は
  //           centerEntries 上の index になります。
  //           固定列なしのときは centerEntries が visibleColumns と同順・同座標のため、
  //           従来の列仮想化と完全に一致します。
  const centerEntries = paneLayout.center.entries;

  const columnVirtualizer = useVirtualizerCore({
    horizontal: true,
    count: centerEntries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      centerEntries[index]?.paneLocalSize ??
      centerEntries[index]?.column.width ??
      120,
    // 変更(A-2): 横方向も同様に overscan を 4 → 8 に増やし、useFlushSync は false に戻します。
    //   （縦スクロールが主訴ですが、挙動を縦横で揃えておきます。横スクロールが速い場合も
    //     端の列が一瞬抜けるのを overscan で吸収します。）
    overscan: 8,
    useFlushSync: false,
    // 変更(10-G): 中央ペインは左固定ペインぶん右にずれて始まるため、その先頭オフセットを
    //             scrollMargin で補正します（左固定なし時は 0 で従来と一致）。
    scrollMargin: leftPaneTotalWidth,
  });

  const virtualColumns = columnVirtualizer.getVirtualItems();

  // ── auto-height / 縦ジオメトリ ───────────
  // 変更(本体分解 E-3): auto-height の gate / 行高ストア / 行メトリクス / 展開行の帯 / 縦ジオメトリの派生値計算は
  //   engine/verticalLayout.ts(React 非依存)へ、測定フロー(DOM 実測 + ResizeObserver + アンカー補正)は
  //   controllers/autoHeightMeasurer.ts へ移設しました。測定側の version(prefix 更新)/ nonce(内容変化)を
  //   購読し、再計算 / 再測定のトリガーにします。実測キャッシュ(rowKey 単位)も測定側が持ちます。
  const autoHeightMeasurer = engine.autoHeightMeasurer;
  const { version: autoHeightVersion, nonce: autoHeightMeasureNonce } =
    useSyncExternalStore(
      autoHeightMeasurer.subscribe,
      autoHeightMeasurer.getSnapshot,
      autoHeightMeasurer.getSnapshot,
    );
  // 未測定行の推定高さ。未指定時は rowHeight。
  const estimateRowHeightValue = estimateRowHeight ?? rowHeight;
  const detailHeightValue = detailRow?.height ?? DEFAULT_DETAIL_ROW_HEIGHT;
  const detailIsExpandable = detailRow?.isExpandable;
  const { resolveVerticalLayout } = engine;
  const {
    hasAutoHeightColumn,
    autoHeightActive,
    rowHeightStore,
    detailExtras,
    detailActive,
    rowMetrics,
    virtualRows,
    virtualRowIndexes,
    detailEntries,
    windowFirstRow,
    windowLastRow,
    physicalBodyHeight,
    bodyLayerTransform,
    verticalScaleFactor,
    overlayBaseOffset,
  } = useMemo(
    () =>
      resolveVerticalLayout({
        isServerSide,
        autoHeight,
        visibleColumns,
        viewRowCount,
        estimateRowHeight: estimateRowHeightValue,
        rowHeight,
        headerHeight,
        viewportHeight,
        scrollTop,
        rowModel,
        measuredHeights: autoHeightMeasurer.measuredHeights,
        autoHeightVersion,
        detailRowEnabled,
        expandedDetailRowKeys: uiState.expandedDetailRowKeys,
        detailHeight: detailHeightValue,
        detailIsExpandable,
        detailIndexCacheRef: detailIndexCacheHolder,
        labelDisplay,
        labelRowHeight: labelRowHeightOption,
      }),
    [
      resolveVerticalLayout,
      isServerSide,
      autoHeight,
      visibleColumns,
      viewRowCount,
      estimateRowHeightValue,
      rowHeight,
      headerHeight,
      viewportHeight,
      scrollTop,
      rowModel,
      autoHeightMeasurer,
      autoHeightVersion,
      detailRowEnabled,
      uiState.expandedDetailRowKeys,
      detailHeightValue,
      detailIsExpandable,
      detailIndexCacheHolder,
      labelDisplay,
      labelRowHeightOption,
    ],
  );
  // gate 外フォールバック時の開発時警告(例外は投げず uniform にフォールバック)。
  // 変更(①-3): serverSide では行数に関わらず未対応の旨を警告します(行数上限とは別理由のため
  //   メッセージを分けます)。
  useEffect(() => {
    if (!import.meta.env.DEV || !autoHeight || !hasAutoHeightColumn) {
      return;
    }
    if (isServerSide) {
      console.warn(
        '[SpreadsheetGrid] serverSide(dataSource)では auto-height は未対応です(未ロード行の高さが不明なため)。uniform 行高にフォールバックします。',
      );
      return;
    }
    if (viewRowCount > AUTO_HEIGHT_MAX_ROWS) {
      console.warn(
        `[SpreadsheetGrid] auto-height は ${AUTO_HEIGHT_MAX_ROWS} 行までです(現在 ${viewRowCount} 行)。uniform 行高にフォールバックします。`,
      );
    }
  }, [autoHeight, hasAutoHeightColumn, viewRowCount, isServerSide]);
  // gate 外フォールバックの開発時警告(auto-height と同方針。例外は投げない)。
  useEffect(() => {
    if (!import.meta.env.DEV || !detailRowEnabled) {
      return;
    }
    if (detailExtras.length > 0 && !detailActive) {
      console.warn(
        `[SpreadsheetGrid] 展開行は論理全高(行高合計 + 帯高)が ${MAX_BODY_PX}px 以内のときだけ描画します(行数上限超過)。展開状態は保持されますが帯は描かれません。`,
      );
    }
  }, [detailRowEnabled, detailExtras, detailActive]);
  // 追加(detail ③): カードの描画(consumer の render へ DetailRowRenderContext を渡す)と、
  //   カードの sticky 左オフセット / 幅(ビューポートの中央可視幅。列合計がそれより狭ければ列合計)。
  const detailRender = detailRow?.render;
  const renderDetailCard = useCallback(
    (entry: GridDetailLayerEntry) => {
      if (!detailRender) {
        return null;
      }
      const rowIndex = entry.virtualRow.index;
      const row = rowModel.getRow(rowIndex) as T | undefined;
      if (row === undefined) {
        return null;
      }
      const ctx: DetailRowRenderContext<T> = {
        row,
        rowKey: entry.rowKey,
        rowIndex,
        sourceRowIndex: rowModel.getSourceIndex(rowIndex) ?? rowIndex,
        collapse: () => setDetailRowExpandedAt(entry.rowKey, rowIndex, false),
      };
      return detailRender(ctx);
    },
    [detailRender, rowModel, setDetailRowExpandedAt],
  );
  const detailCardStickyLeft = leftPaneTotalWidth + centerLeadingWidth;
  const detailCardWidth = Math.max(
    Math.min(
      viewportWidth - detailCardStickyLeft - rightPaneTotalWidth,
      paneLayout.center.totalWidth,
    ),
    0,
  );
  // 追加(label-row ②): ラベル行の中身の描画(labelRow.render に LabelRowRenderContext を渡す。未指定は
  //   getLabel の文字列を既定スタイルで)と、ペインごとの描画設定(中央ペインだけ中身を描く)。
  //   sticky 左オフセット / 幅は展開行カードと同じ値です。
  const renderLabelRowContent = useCallback(
    (descriptor: GridLabelRow<T>, rowIndex: number, rowKey: GridRowKey): ReactNode => {
      if (labelRender) {
        return labelRender({
          row: descriptor.row,
          rowKey,
          rowIndex,
          sourceRowIndex: descriptor.sourceIndex,
          label: descriptor.label,
          sectionRowCount: descriptor.sectionRowCount,
        });
      }
      return (
        <span className="ssg-label-row-content--default ssg-label-row-default">
          <span className="ssg-label-row-text">{descriptor.label}</span>
        </span>
      );
    },
    [labelRender],
  );
  const resolveLabelRowSlot = useCallback(
    (descriptor: GridLabelRow<T>): GridSlotProps | undefined =>
      typeof labelRowClassName === 'function' ? labelRowClassName(descriptor.row) : labelRowClassName,
    [labelRowClassName],
  );
  const labelRowLayerCenter = useMemo<GridBodyLabelRowLayer<T> | undefined>(
    () =>
      labelRowEnabled
        ? {
            renderContent: renderLabelRowContent,
            contentStickyLeft: detailCardStickyLeft,
            contentWidth: detailCardWidth,
            resolveRowSlot: resolveLabelRowSlot,
          }
        : undefined,
    [labelRowEnabled, renderLabelRowContent, detailCardStickyLeft, detailCardWidth, resolveLabelRowSlot],
  );
  const labelRowLayerBand = useMemo<GridBodyLabelRowLayer<T> | undefined>(
    () =>
      labelRowEnabled
        ? { renderContent: null, contentStickyLeft: 0, contentWidth: 0, resolveRowSlot: resolveLabelRowSlot }
        : undefined,
    [labelRowEnabled, resolveLabelRowSlot],
  );
  // 追加(stage ②): serverSide で query(debounced queryKey)が変わったら先頭へスクロールを戻します。
  //   フィルター/ソートで結果セットが総入れ替えされるため、同一 index に別行が来る違和感を避けます。
  //   mount 時は scrollTop が既に 0 のため無害です。clientSide では queryKey が安定空のため不発です。
  useEffect(() => {
    if (!isServerSide) {
      return;
    }
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = 0;
    }
    // 物理 scrollTop の即時 0 化に React state も追従させます(scroll イベント待ちの 1 フレーム遅延回避)。
    setScrollTop(0);
  }, [isServerSide, serverSideQueryKey, setScrollTop]);
  // 追加(detail ④): serverSide で query が変わったら展開行を全て閉じます。
  //   結果セットが総入れ替えされるうえ、serverSide では rowKey の全行走査ができず(未ロード行)、
  //   古い view index のまま別行の下に帯が残る恐れがあるためです。空→空は reducer が no-op に
  //   するので mount 時や clientSide(queryKey 安定空)では何も起きません。
  useEffect(() => {
    if (!isServerSide || !detailRowEnabled) {
      return;
    }
    detailIndexCacheHolder.reset();
    dispatch(gridActions.setExpandedDetailRowKeys(new Set<GridRowKey>()));
  }, [isServerSide, detailRowEnabled, serverSideQueryKey, dispatch, detailIndexCacheHolder]);

  // 追加(①-3 / stage ②): serverSide のとき、描画窓(overscan 込み)の可視レンジを hook へ通知します。
  //   requestRange は即時 touchBlocks + debounce fetch。空窓(末尾 < 先頭)では何もしません。
  //   clientSide では isServerSide=false で早期 return(requestRange 自体も inert で no-op)。
  //   [start, end) の end は排他のため windowLastRow + 1 を渡します。
  //   依存に serverSideQueryKey を含めます: query 変化でフックがキャッシュ破棄した直後、窓 index が
  //   不変でも(画面最上部で件数も不変など)再要求を発火させ、未ロード固着を防ぐためです。
  useEffect(() => {
    if (!isServerSide) {
      return;
    }
    if (windowLastRow < windowFirstRow) {
      return;
    }
    requestServerSideRange(windowFirstRow, windowLastRow + 1);
  }, [
    isServerSide,
    windowFirstRow,
    windowLastRow,
    requestServerSideRange,
    serverSideQueryKey,
  ]);

  // 変更(本体分解 E-3): auto-height の測定フローは controllers/autoHeightMeasurer へ。update はレイアウト effect
  //   (コミット後・ペイント前)で呼ばれ、旧 effect と同じ deps 組が変わったときだけ実測します。
  useControllerLifecycle(autoHeightMeasurer, {
    scrollContainerRef,
    autoHeightActive,
    rowHeightStore,
    rowMetrics,
    rowModel,
    virtualRows,
    viewportHeight,
    version: autoHeightVersion,
    nonce: autoHeightMeasureNonce,
  });

  // 追加(10-C): 各ペインで実際に描画する列エントリ群です。
  //             中央ペインは仮想化済みの部分集合、固定ペインは全エントリを描画します。
  const centerRenderEntries = useMemo<PaneColumnEntry<T>[]>(
    () =>
      virtualColumns
        .map((item) => centerEntries[item.index])
        .filter((entry): entry is PaneColumnEntry<T> => Boolean(entry)),
    [virtualColumns, centerEntries],
  );

  const leftRenderEntries = paneLayout.left.entries;
  const rightRenderEntries = paneLayout.right.entries;

  // ── active cell placement（10-D: ペイン別座標系） ──────
  // 追加(10-D): active cell が属するペインと、そのペインローカル矩形を求めます。
  //             col は logicalIndex（orderedColumns 空間）として扱い、
  //             computeSinglePaneColumnExtent で所属ペイン + ローカル extent を取得します。
  //             left は leadingWidth 非含有のローカル列座標で、描画側で leadingWidth を加算します。
  const activeCellPlacement = useMemo<{
    pane: ColumnPane;
    rect: ActiveCellOverlayRect;
  } | null>(() => {
    if (!uiState.activeCell) {
      return null;
    }
    const { row, col } = uiState.activeCell;
    if (row < 0 || row >= viewRowCount) {
      return null;
    }
    const single = computeSinglePaneColumnExtent(paneLayout, col);
    if (!single) {
      return null;
    }
    return {
      pane: single.pane,
      rect: {
        left: single.extent.start,
        top: rowMetrics.rowTop(row),
        width: single.extent.width,
        // 変更(detail ③): 展開行の帯を含まないセル行の高さ(展開行なしでは rowsHeight(row, row) と一致)。
        height: rowMetrics.cellHeight(row),
      },
    };
  }, [uiState.activeCell, viewRowCount, paneLayout, rowMetrics]);

  // 追加(10-E): viewport sync（中央ペインの自動スクロール）専用の active cell 矩形です。
  //             active cell が中央ペインにあるときだけ「中央ペインローカル座標」で返します。
  //             固定ペイン（left / right）にある場合は横スクロール不要なので null を返し、
  //             誤って中央ペインを横スクロールさせないようにします。
  const centerViewportActiveRect = useMemo<ActiveCellOverlayRect | null>(
    () =>
      activeCellPlacement && activeCellPlacement.pane === 'center'
        ? activeCellPlacement.rect
        : null,
    [activeCellPlacement],
  );

  // 追加(10-D): 指定ペインに active cell があればそのローカル矩形を、無ければ null を返します。
  const activeCellRectForPane = useCallback(
    (pane: ColumnPane): ActiveCellOverlayRect | null =>
      activeCellPlacement && activeCellPlacement.pane === pane
        ? activeCellPlacement.rect
        : null,
    [activeCellPlacement],
  );

  // 追加(10-D): editor は editingCell があるときだけ、active cell と同じペイン・同じ矩形に出します。
  const editorRectForPane = useCallback(
    (pane: ColumnPane): ActiveCellOverlayRect | null =>
      uiState.editingCell ? activeCellRectForPane(pane) : null,
    [uiState.editingCell, activeCellRectForPane],
  );

  // ── viewport sync ────────────────────────────────────
  // 変更(10-G): スクロールのマスターを中央ペインから「共有スクロールコンテナ」へ移行しました。
  //   - totalScrollWidth: コンテンツ全幅（左固定 + 中央 + 右固定）
  //   - leftPaneWidth / rightPaneWidth: sticky 固定ペインに隠れない領域へ active cell を収めるため
  //   - centerLeadingWidth: 中央ペインの先頭幅（左固定なし=rowHeaderWidth / 左固定あり=0）
  // 追加(TH-DK-2): theme prop を実効テーマへ解決します('auto' は prefers-color-scheme 追従)。
  //   ダーク時は root と全ポータル root へ .ssg-theme-dark を付与し、ダークプリセット
  //   (styles.css のトークン一括上書き)を効かせます。ゴースト / ツールチップは各自が
  //   DOM(root への closest / scrollContainer の祖先)から解決するため props 伝播は不要です。
  const resolvedTheme = useResolvedGridTheme(theme);
  const themeClassName =
    resolvedTheme === 'dark' ? 'ssg-theme-dark' : undefined;

  // 追加(slot-props): classNames / detailRow.className を解決済みスロットへ変換します(署名 memo で
  //   参照安定。利用側がレンダー毎に新しいオブジェクトを渡しても memo 済み子の props は揺れません)。
  const slots = useResolvedGridSlots(classNames);
  const detailCardSlot = useResolvedGridSlot(detailRow?.className);

  // 追加(TT-1): カスタムツールチップの表示制御です(body 直下シングルトン + window 委譲。
  //   複数グリッド同居時はフック内の refCount で共有されます)。
  useGridTooltip(slots.tooltip);

  useGridViewportSync({
    scrollRef: scrollContainerRef,
    columnVirtualizer,
    columnMeasurements,
    totalScrollWidth,
    // 変更(scroll-space 仮想化): content-shrink clamp は物理高さ基準にします。
    physicalBodyHeight,
    headerHeight,
    leftPaneWidth: leftPaneTotalWidth,
    rightPaneWidth: rightPaneTotalWidth,
    centerLeadingWidth,
    activeCellRect: centerViewportActiveRect,
    // 追加(scroll-jump 対策): 可視化スクロールを「座標が変わったとき」に限定するための座標です
    //   (フィルター確定等のレイアウト再計算による rect 参照変化だけでは発火させない)。
    activeCell: uiState.activeCell,
    // 追加(scroll-space 仮想化): active cell 自動スクロールの論理↔物理換算に使います。
    verticalScaleFactor,
  });

  // 注記(10-G): 旧実装にあった「中央ペインの scrollTop を transform で固定ペインへ同期する
  //             useEffect」と「固定ペイン上の wheel を中央ペインへ転送する useEffect」は、
  //             縦横スクロールの 1 本化により不要になったため削除しました。
  //             固定列は position: sticky で横方向だけ留まり、縦は共有スクロールで一緒に動きます。

  // ── 行選択(チェックボックス選択)─────────────────────────
  //   controlled の記述子を解決します(rowSelection 優先、無ければ selectedRowKeys の糖衣)。
  const controlledRowSelectionModel = useMemo<RowSelectionModel | undefined>(
    () => {
      if (rowSelectionProp !== undefined) {
        return rowSelectionProp;
      }
      if (selectedRowKeysProp !== undefined) {
        return { type: 'include', rowKeys: selectedRowKeysProp };
      }
      return undefined;
    },
    [rowSelectionProp, selectedRowKeysProp],
  );

  // enableSelectAllRows の既定解決(未指定なら enableRowSelection && multiple)。
  const enableSelectAllRows =
    enableSelectAllRowsProp ??
    (enableRowSelection && rowSelectionMode === 'multiple');

  // 現在の行選択状態(reducer が単一の作業状態。controlled では下の effect で prop を反映)。
  const rowSelectionState = uiState.rowSelection;
  // ヘッダ全選択チェックの 3 状態(none/some/all)。件数は O(1) で求まります。
  // 変更(grouping ④): 総数は leafRowCount(グループ行を除くデータ行数)です。
  const selectAllRowsState = getSelectAllState(rowSelectionState, leafRowCount);

  // 変更(本体分解 E-4c): 選択コミット / ガター選択 / ドラッグ範囲 / 全選択トグル / controlled 同期は
  //   engine/rowSelectionCommands.ts(React 非依存)へ移設しました(旧 latest-ref 4 本 + アンカー ref を解消)。
  const rowSelectionCommands = engine.rowSelectionCommands;
  useControllerLifecycle(
    rowSelectionCommands,
    {
      rowModel,
      rowSelectionState,
      rowSelectionMode,
      onRowSelectionChange,
      controlledRowSelectionModel,
      leafRowCount,
      dispatch,
    },
  );
  const { handleGutterRowSelect, handleGutterRowSelectDrag, handleToggleSelectAllRows } =
    rowSelectionCommands;

  // ── pointer interactions ──────────────────────────────
  // 追加(touch): セルダブルクリック処理の latest-ref(定義は下方。useEffect で同期)。
  const cellDoubleClickRef = useRef<(cell: CellCoord) => void>(() => {});

  const {
    updateSelectionFromPointer,
    handleCellPointerDown,
    // 追加(touch): タッチ由来の native dblclick を無視するラッパ(参照恒久安定)。
    handleCellDoubleClick: handleCellDoubleClickGuarded,
    handleCellPointerEnter,
    handleNativeDragStart,
    handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter,
  } = useGridPointerInteractions({
    gridRootRef,
    bodyScrollRef,
    // 追加(touch): セルのダブルクリック処理(handleCellDoubleClickWithController)は本フックより
    //   後ろで定義されるため、useEffect 同期の latest-ref(RS-AS 方式)で渡します。
    onCellDoubleClickRef: cellDoubleClickRef,
    // 追加(10-G): 自動スクロールは共有スクロールコンテナを動かします。
    scrollContainerRef,
    // 追加(10-E): 固定ペインの ref を渡し、clientX のペイン判定に使います。
    leftPaneScrollRef,
    rightPaneScrollRef,
    pointerClientRef,
    autoScrollFrameRef,
    uiState,
    dispatch,
    enableRangeSelection,
    // 追加(MS-2): ヘッダー Shift+click ソート(発火口 a)用です。
    //             enableSorting=false 時はガード、orderedColumns で colIndex→key 解決。
    enableSorting: sortingEnabled,
    orderedColumns,
    filteredRowsLength: viewRowCount,
    visibleColumnsLength: visibleColumns.length,
    // 変更(10-E): グローバル columnMeasurements / rowHeaderWidth から
    //             ペイン別 geometry + 各ペインの leadingWidth へ切り替えます。
    paneLayout,
    leftLeadingWidth,
    centerLeadingWidth,
    rightLeadingWidth,
    headerHeight,
    // 変更(auto-height シーム): ヒットテストの行解決は rowMetrics 経由(uniform で従来式と一致)。
    rowMetrics,
    // 追加(scroll-space 仮想化): ヒットテスト clientY→row の物理→論理換算に使います。
    verticalScaleFactor,
    // 追加(UI hover): 行/列ヘッダーホバーの設定 setter と有効化フラグ(行=既定 true / 列=既定 true)。
    // 変更(proposals ⑩): 行の setter は optionally controlled の applyHoveredRowChange(恒久安定)。
    setHoveredRowIndex: applyHoveredRowChange,
    setHoveredColumnIndex,
    enableRowHover,
    enableColumnHeaderHover,
    // 追加(行選択): ガター行選択の有効化とコールバックです。
    enableRowSelection,
    onGutterRowSelect: handleGutterRowSelect,
    onGutterRowSelectDrag: handleGutterRowSelectDrag,
  });

  // ── undo/redo 復元先セルのスクロール追従 ───────────────
  // 追加(undo/redo scroll): undo/redo の復元先アクティブセルを可視化するスクロールです。
  //   スクロール計算の実体(scrollToCellInternal)は imperative handle 部(下方)で定義されるため、
  //   useEffect で同期する latest-ref(RS-AS 方式)越しに rAF tick から読みます。復元の dispatch /
  //   onRowsChange と同一イベント内ではレイアウト(rowMetrics / ペイン幅)が復元後の値へ確定して
  //   いないため、rAF で 1 フレーム遅らせてから align 'auto'(最小スクロール・可視中は no-op)で
  //   可視化します。
  //   既存の activeCell 可視化 effect(useGridViewportSync)との関係: あちらは activeCell 座標の
  //   「変化」にしか反応しない(scroll-jump 対策で座標不変時はスキップ)ため、(a) 復元前後で
  //   activeCell が同一のままスクロール位置だけ遠くにあるケース(編集 → スクロール → Ctrl+Z の
  //   典型動線)、(b) 固定列セル(rect=null)の縦追従、をカバーしません。本追従はその補完で、
  //   既に可視の場合は 'auto' 計算が no-op になるため二重スクロールの実害はありません。
  // 変更(本体分解 E-5): 命令的 API の実体(engine/gridApi)はここで生成し、接続(update)は全 args が揃う下流で
  //   行います。scrollToCellInternal は参照安定で、呼び出し時点の最新 args を読みます(旧 latest-ref 同期 effect は不要)。
  const gridApi = engine.gridApi;
  const scrollRestoredCellIntoView = useCallback(
    (activeCell: CellCoord | null) => {
      if (!activeCell) {
        return;
      }
      requestAnimationFrame(() => {
        gridApi.scrollToCellInternal(activeCell.row, activeCell.col, 'auto');
      });
    },
    [gridApi],
  );

  // ── undo/redo(編集履歴)───────────────────────────────
  // 追加(undo/redo): grid 起点の全データ変更(セル編集 commit / ペースト / renderCell の setValue)を
  //   handleRowsChange(生 onRowsChange のラッパ)へ集約し、変更前 rows の参照スナップショットを
  //   履歴に積みます。以降の各 controller へは onRowsChange の代わりに handleRowsChange を配ります
  //   (onRowsChange 未指定時は undefined のままで、各所の `if (!onRowsChange)` ガード挙動は不変)。
  //   serverSide は rows 配列を持たず undo の適用先がないため無効です。
  const undoRedoEnabled = enableUndoRedo && !readOnly && !isServerSide;
  const {
    handleRowsChange,
    undo: undoRows,
    redo: redoRows,
    canUndo: canUndoRows,
    canRedo: canRedoRows,
    clearHistory: clearUndoHistory,
  } = useGridHistoryController({
    rows,
    // 追加(undo/redo 復元): 履歴エントリへ同梱する現在の UI 状態です。undo/redo 時に
    //   「その編集をしていた場所」へ選択とアクティブセルを戻します。
    selection: uiState.selection,
    activeCell: uiState.activeCell,
    onRowsChange,
    dispatch,
    enabled: undoRedoEnabled,
    limit: undoHistoryLimit,
    onUndoRedoStateChange,
    // 追加(undo/redo scroll): 復元後に復元先アクティブセルを可視化します。
    onAfterRestore: scrollRestoredCellIntoView,
  });

  // ── clear(Delete / Backspace)─────────────────────────
  // 追加(clear): 選択セル(なければアクティブセル)の値クリアです。書き込みは paste と同じ
  //   view→source 解決 + isCellEditable ガードで、変更が 1 セルも無ければ emit しません
  //   (undo 履歴に no-op を積まない)。クリア値は「空文字のペースト」と同じ規則
  //   (parseClipboardValue('') 経由、未定義なら '')です。
  const clearSelectedCells = useCallback(() => {
    // 追加(SSRM 書き戻し): serverSide はビュー走査でセル編集集合を作り、書き戻しへ流します
    //   (全件 rows が無いため rows 再構築は不可)。未ロード行(スケルトン)はスキップされます。
    if (applyServerSideCellEdits) {
      const edits = buildClearCellEdits({
        getRow: (viewIndex) => rowModel.getRow(viewIndex),
        columns: orderedColumns,
        selection: uiState.selection,
        activeCell: uiState.activeCell,
        viewRowCount,
        canWriteCell: (viewIndex, colIndex, row, column) =>
          isCellEditable(
            { readOnly, canEditCell },
            viewIndex,
            colIndex,
            row,
            column,
          ),
      });
      if (edits.length > 0) {
        applyServerSideCellEdits(edits);
      }
      return;
    }
    if (!handleRowsChange) {
      return;
    }
    const { nextRows, changed } = clearCellsInSelection({
      rows,
      resolveSourceIndex: (viewIndex) => rowModel.getSourceIndex(viewIndex),
      columns: orderedColumns,
      selection: uiState.selection,
      activeCell: uiState.activeCell,
      viewRowCount,
      canWriteCell: (originalRowIndex, colIndex, row, column) =>
        isCellEditable(
          { readOnly, canEditCell },
          originalRowIndex,
          colIndex,
          row,
          column,
        ),
    });
    if (!changed) {
      return;
    }
    handleRowsChange(nextRows);
  }, [
    applyServerSideCellEdits,
    canEditCell,
    handleRowsChange,
    orderedColumns,
    readOnly,
    rowModel,
    rows,
    uiState.activeCell,
    uiState.selection,
    viewRowCount,
  ]);

  // ── clipboard ─────────────────────────────────────────
  const { isWholeGridSelected, handleCopy, handlePaste } =
    useGridClipboardController({
      rows,
      // 変更(DS-3-3): filteredRows / filteredRowSourceIndexes 配列 → rowModel シームを渡します
      //   (clipboard consumer 移行)。copy=getRow(i) / paste source 解決=getSourceIndex(i) /
      //   範囲判定=getRowCount() を controller 内で使い分けます。rowModel は DS-3-0 構築済み memo を再利用。
      rowModel,
      // 変更(10-E): copy/paste/TSV は視覚順（論理 index 空間）で扱うため orderedColumns を渡します。
      //             selection の col は論理 index なので、indexing も orderedColumns に揃える必要があります。
      visibleColumns: orderedColumns,
      uiState,
      readOnly,
      canEditCell,
      createRow,
      createOverflowColumn,
      // 変更(undo/redo): paste の変更前 rows を履歴へ積むため、生の onRowsChange ではなく
      //   history controller のラッパを渡します(未指定時は undefined 素通しで挙動不変)。
      onRowsChange: handleRowsChange,
      onColumnsChange,
      // 追加(SSRM 書き戻し): serverSide の paste 書き込み口です(updateRows 指定時のみ定義)。
      applyServerSideCellEdits,
      // 追加(proposals ⑪): コピー(TSV)の出力対象行フィルタです。
      isRowExportable,
      dispatch,
    });

  const selectEntireGrid = useCallback(() => {
    if (viewRowCount === 0 || visibleColumns.length === 0) {
      return;
    }
    const startCell = { row: 0, col: 0 };
    const endCell = {
      row: viewRowCount - 1,
      col: visibleColumns.length - 1,
    };
    dispatch(gridActions.startSelection(startCell));
    dispatch(gridActions.updateSelection(endCell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(startCell));
  }, [dispatch, viewRowCount, visibleColumns.length]);

  // ── double click → edit ───────────────────────────────
  const handleCellDoubleClick = useCallback(
    (cell: CellCoord) => {
      // 変更(DS-3-5): filteredRows[cell.row] → rowModel.getRow 経由(double-click consumer 移行)。
      //   getRow(i)=rows[order[i]] で旧 filteredRows[i] と参照同一。OOB は getRow が undefined を
      //   返し、下の `if (!row …) return` ガードで吸収するため挙動等価です。
      const row = rowModel.getRow(cell.row);
      // 変更(10-E): cell.col は論理 index 空間（orderedColumns）です。
      const column = orderedColumns[cell.col];
      if (!row || !column) {
        return;
      }
      if (
        !isCellEditable(
          { readOnly, canEditCell },
          cell.row,
          cell.col,
          row,
          column,
        )
      ) {
        return;
      }
      // 追加(editor: checkbox): checkbox 列は直接トグル方式のため編集セッションを開きません
      //   (Enter / F2 もここを通るため、このガード 1 箇所で済みます)。
      if (column.editor?.type === 'checkbox') {
        return;
      }
      const currentValue = getCellValue(row, column);
      // 変更(11-B6): ドラフト setter → 初期値 setter へ置き換え（挙動等価）。
      setEditorInitialValue(String(currentValue ?? ''));
      dispatch(gridActions.startEdit(cell));
    },
    [canEditCell, dispatch, rowModel, readOnly, orderedColumns],
  );

  // 追加(editor: checkbox): checkbox セルの直接トグルです(クリック / Space 共通の集約点)。
  //   isCellEditable ガードを通し、履歴ラッパ(handleRowsChange)経由で undo/redo 対象にします。
  const toggleCheckboxCell = useCallback(
    (cell: CellCoord) => {
      // 変更(SSRM 書き戻し): 書き込み口はどちらか(clientSide=handleRowsChange /
      //   serverSide=applyServerSideCellEdits)があれば進みます。
      if (!handleRowsChange && !applyServerSideCellEdits) {
        return;
      }
      const row = rowModel.getRow(cell.row);
      const column = orderedColumns[cell.col];
      if (!row || !column || column.editor?.type !== 'checkbox') {
        return;
      }
      if (
        !isCellEditable(
          { readOnly, canEditCell },
          cell.row,
          cell.col,
          row,
          column,
        )
      ) {
        return;
      }
      const nextValue = toggleCheckboxValue(
        getCellValue(row, column),
        column.editor,
      );
      // 追加(validation): reject 列は検証 NG のトグルを no-op に倒します(経路 D)。
      if (decideCellWrite(column, row, nextValue).action === 'reject') {
        return;
      }
      // 追加(SSRM 書き戻し): serverSide は書き戻しへ流します(楽観更新はフック側)。
      if (applyServerSideCellEdits) {
        applyServerSideCellEdits([
          { viewIndex: cell.row, column, value: nextValue },
        ]);
        return;
      }
      if (!handleRowsChange) {
        return;
      }
      const originalRowIndex = rowModel.getSourceIndex(cell.row);
      if (originalRowIndex === undefined) {
        return;
      }
      handleRowsChange(writeRowsCell(rows, originalRowIndex, column, nextValue));
    },
    [
      applyServerSideCellEdits,
      canEditCell,
      handleRowsChange,
      orderedColumns,
      readOnly,
      rowModel,
      rows,
    ],
  );

  // ── keyboard ──────────────────────────────────────────
  const { handleKeyDown } = useGridKeyboardInteractions({
    uiState,
    // 変更(DS-3-1): filteredRows 配列 → rowModel シームを渡します(keyboard consumer 移行)。
    rowModel,
    // 変更(10-E): キーボード移動/編集開始の col は論理 index 空間。
    //             clamp は同数なので不変、indexing 整合のため orderedColumns を渡します。
    visibleColumns: orderedColumns,
    readOnly,
    canEditCell,
    setEditorInitialValue,
    dispatch,
    handleCopy,
    handleCellDoubleClick,
    isWholeGridSelected,
    selectEntireGrid,
    // 追加(undo/redo): Ctrl/Cmd+Z / Shift+Z / Y のショートカット配線です。無効条件は
    //   history controller 側で吸収します(無効時は no-op)。
    onUndo: undoRows,
    onRedo: redoRows,
    // 追加(clear): Delete / Backspace の選択セルクリア配線です。
    onClearSelection: clearSelectedCells,
    // 追加(clear opt-out): false で Delete / Backspace を素通しにします(既定 true)。
    enableClearOnDelete,
    // 追加(editor: checkbox): checkbox 列の Space 直接トグル配線です。
    onToggleCheckboxCell: toggleCheckboxCell,
    // 追加(grouping ④): グループ行の Enter / Space 開閉トグル配線です。
    onToggleGroup: handleGroupToggle,
  });

  // ── edit controller ───────────────────────────────────
  const { startEditWithValue, commitEdit, cancelEdit } = useGridEditController({
    uiState,
    rows,
    // 変更(10-E): editingCell.col は論理 index 空間のため orderedColumns で indexing します。
    visibleColumns: orderedColumns,
    // 変更(DS-3-2): filteredRowSourceIndexes 配列 → rowModel シームを渡します(edit consumer 移行)。
    //   rowModel は DS-3-0 で構築済みの memo を再利用。source-index 解決は seam の getSourceIndex(i)
    //   に統一され、materialize 済み filteredRowSourceIndexes は DS-3-3(clipboard 移行)で撤去済みです。
    rowModel,
    setEditorInitialValue,
    // 変更(undo/redo): commit の変更前 rows を履歴へ積むため、生の onRowsChange ではなく
    //   history controller のラッパを渡します(未指定時は undefined 素通しで挙動不変)。
    onRowsChange: handleRowsChange,
    // 追加(SSRM 書き戻し): serverSide の commit 書き込み口です(updateRows 指定時のみ定義)。
    applyServerSideCellEdits,
    dispatch,
    gridRootRef,
    editorActionGuardRef,
  });

  // 追加(③): 編集中セルの列(編集 input の text-align=align を反映)。editingCell.col は orderedColumns 空間。
  const editingColumn = uiState.editingCell
    ? orderedColumns[uiState.editingCell.col]
    : undefined;

  // 追加(editor: select): 編集中セルのセッション情報(行 / ビュー座標 / 生値)です。
  //   CellEditorLayer へ渡し、select の動的 options 解決・初期ハイライトに使います(編集中のみ非 null)。
  const editingRow = uiState.editingCell
    ? rowModel.getRow(uiState.editingCell.row)
    : undefined;
  const editorSession =
    uiState.editingCell && editingColumn && editingRow
      ? {
          row: editingRow,
          rowIndex: uiState.editingCell.row,
          // 追加(context 拡張): custom エディタの CellEditorContext 用に source 行 index / rowKey
          //   も解決します(editingRow が非 undefined と確定済みのため in-bounds)。
          sourceRowIndex:
            rowModel.getSourceIndex(uiState.editingCell.row) ??
            uiState.editingCell.row,
          rowKey:
            rowModel.getRowKey(uiState.editingCell.row) ??
            uiState.editingCell.row,
          colIndex: uiState.editingCell.col,
          column: editingColumn,
          value: getCellValue(editingRow, editingColumn),
        }
      : null;

  const handleCellDoubleClickWithController = useCallback(
    (cell: CellCoord) => {
      // 変更(DS-3-5): filteredRows[cell.row] → rowModel.getRow 経由(double-click consumer 移行)。
      //   getRow(i)=rows[order[i]] で旧 filteredRows[i] と参照同一。OOB は getRow が undefined を
      //   返し、下の `if (!row …) return` ガードで吸収するため挙動等価です。
      const row = rowModel.getRow(cell.row);
      // 変更(10-E): cell.col は論理 index 空間（orderedColumns）です。
      const column = orderedColumns[cell.col];
      if (!row || !column) {
        return;
      }
      if (
        !isCellEditable(
          { readOnly, canEditCell },
          cell.row,
          cell.col,
          row,
          column,
        )
      ) {
        return;
      }
      // 追加(editor: checkbox): checkbox 列は直接トグル方式のため編集セッションを開きません
      //   (トグルはクリック / Space。ダブルクリックは click 2 回として扱われます)。
      if (column.editor?.type === 'checkbox') {
        return;
      }
      const currentValue = getCellValue(row, column);
      startEditWithValue(cell, String(currentValue ?? ''));
    },
    [canEditCell, rowModel, readOnly, startEditWithValue, orderedColumns],
  );
  // 追加(touch): pointer フック(タッチのダブルタップ / native dblclick ラッパ)から読む latest-ref を
  //   同期します(render 中の ref 代入を増やさないため useEffect 同期 = RS-AS 方式)。
  useEffect(() => {
    cellDoubleClickRef.current = handleCellDoubleClickWithController;
  }, [handleCellDoubleClickWithController]);

  // ── selection overlay placement（10-D: ペイン別座標系 / 可視帯クリップ） ─
  // 変更(10-D): 選択範囲を「論理列 index 範囲 + 行範囲」に正規化し、
  //             computePaneColumnExtents / computeFullWidthPaneExtents で
  //             各ペインのローカル水平 extent に分解します。
  //             これにより選択がペインをまたいでも、各ペイン内に正しくクリップされた
  //             矩形セグメントが描画されます（AG Grid と同様のペイン別レンダリング）。
  //             固定列なしのときは center のみに extent が出て従来と一致します。
  // 変更(可視帯クリップ): 横 extent(スクロール非依存)と縦帯(描画窓クリップでスクロール依存)を
  //             別の useMemo へ分離します。横 extent はスクロール経路から外し、縦帯だけ窓へ追従させます
  //             (RowMetrics=スクロール非依存 / verticalGeometry=スクロール依存 の軸分離に準拠)。
  //             旧実装は col / グリッド全選択を top:0 / height:totalBodyHeight の単一巨大 div で描き、
  //             1M 行で ≈38,000,000px に達してブラウザの要素高さ上限 / float32 域を超え一部しか
  //             描けませんでした(列全選択ハイライトの途中切れ)。選択の縦範囲を窓へクリップすることで、
  //             全選択タイプ(col / グリッド全選択 / 巨大 cell・row)が小さな帯になりペイント安全になります。
  //             窓は overscan を含み viewport より広いため、可視域に映るピクセルは旧巨大 div と同一で、
  //             no-op(scaleFactor=1)でも可視域等価です。

  // 横 extent + 生の選択行範囲(スクロール非依存)。
  const selectionExtents = useMemo<{
    extents: PaneColumnExtentMap;
    startRow: number;
    endRow: number;
  } | null>(() => {
    if (!uiState.selection) {
      return null;
    }

    if (uiState.selection.type === 'cell') {
      const normalizedRange = normalizeCellRange(uiState.selection.range);
      const extents = computePaneColumnExtents(
        paneLayout,
        normalizedRange.start.col,
        normalizedRange.end.col,
      );
      return {
        extents,
        startRow: normalizedRange.start.row,
        endRow: normalizedRange.end.row,
      };
    }

    if (uiState.selection.type === 'row') {
      const normalizedRange = normalizeRowRange(
        uiState.selection.startRow,
        uiState.selection.endRow,
      );
      // 行選択は全ペインの全列を覆います。
      const extents = computeFullWidthPaneExtents(paneLayout);
      return {
        extents,
        startRow: normalizedRange.startRow,
        endRow: normalizedRange.endRow,
      };
    }

    // col selection: 縦は全行が対象(窓クリップ側で帯に畳む)。
    const normalizedRange = normalizeColumnRange(
      uiState.selection.startCol,
      uiState.selection.endCol,
    );
    const extents = computePaneColumnExtents(
      paneLayout,
      normalizedRange.startCol,
      normalizedRange.endCol,
    );
    return {
      extents,
      startRow: 0,
      endRow: Math.max(viewRowCount - 1, 0),
    };
  }, [uiState.selection, paneLayout, viewRowCount]);

  // 縦帯(スクロール依存): 選択行範囲を描画窓へクリップし、rowMetrics で top/height を求めます。
  //   窓と交差しない(画面外へ完全にスクロールアウトした)選択は null で描画しません。
  const selectionBand = useMemo<{ top: number; height: number } | null>(() => {
    if (!selectionExtents) {
      return null;
    }
    const clipped = clipRowRangeToWindow(
      selectionExtents.startRow,
      selectionExtents.endRow,
      windowFirstRow,
      windowLastRow,
    );
    if (!clipped) {
      return null;
    }
    return {
      top: rowMetrics.rowTop(clipped.start),
      height: rowMetrics.rowsHeight(clipped.start, clipped.end),
    };
  }, [selectionExtents, rowMetrics, windowFirstRow, windowLastRow]);
  // 追加(detail ③): 展開行があるとき、選択の縦帯を detail 帯を避けた複数セグメントへ分割します。
  //   展開行なし(detailActive=false)では null で、従来の selectionBand 1 本のままです。
  const selectionBandSegments = useMemo<
    ReadonlyArray<{ top: number; height: number }> | null
  >(() => {
    if (!detailActive || !selectionExtents) {
      return null;
    }
    const clipped = clipRowRangeToWindow(
      selectionExtents.startRow,
      selectionExtents.endRow,
      windowFirstRow,
      windowLastRow,
    );
    if (!clipped) {
      return null;
    }
    return splitRowBandByDetail(
      clipped.start,
      clipped.end,
      rowMetrics,
      detailExtras,
    );
  }, [
    detailActive,
    selectionExtents,
    rowMetrics,
    detailExtras,
    windowFirstRow,
    windowLastRow,
  ]);

  // 追加(10-D): 指定ペインの選択矩形（ペインローカル）を返します。該当列が無い / 窓外なら null です。
  const selectionRectForPane = useCallback(
    (pane: ColumnPane): SelectionOverlayRect | null => {
      if (!selectionExtents || !selectionBand) {
        return null;
      }
      const extent = selectionExtents.extents[pane];
      if (!extent) {
        return null;
      }
      return {
        left: extent.start,
        top: selectionBand.top,
        width: extent.width,
        height: selectionBand.height,
      };
    },
    [selectionExtents, selectionBand],
  );
  // 追加(detail ③): 展開行あり時のペイン別選択矩形リスト(detail 帯を避けたセグメント群)。
  //   展開行なしでは null を返し、呼び出し側は従来の selectionRectForPane を使います。
  const selectionRectsForPane = useCallback(
    (pane: ColumnPane): SelectionOverlayRect[] | null => {
      if (!selectionBandSegments || !selectionExtents) {
        return null;
      }
      const extent = selectionExtents.extents[pane];
      if (!extent) {
        return null;
      }
      return selectionBandSegments.map((segment) => ({
        left: extent.start,
        top: segment.top,
        width: extent.width,
        height: segment.height,
      }));
    },
    [selectionBandSegments, selectionExtents],
  );

  // ── corner header ─────────────────────────────────────
  const handleCornerHeaderPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      if (viewRowCount === 0 || visibleColumns.length === 0) {
        return;
      }
      gridRootRef.current?.focus({ preventScroll: true }); // proposals ⑨(セル押下と同方針)
      // 追加(行選択): 全選択チェック有効時はコーナーで行選択の全選択/解除をトグルします
      //   (従来のグリッド全体セル選択より優先)。
      if (enableSelectAllRows) {
        handleToggleSelectAllRows();
        return;
      }
      if (isWholeGridSelected) {
        dispatch(gridActions.clearSelection());
        dispatch(gridActions.activateCell(null));
        return;
      }
      selectEntireGrid();
    },
    [
      dispatch,
      viewRowCount,
      isWholeGridSelected,
      selectEntireGrid,
      visibleColumns.length,
      enableSelectAllRows,
      handleToggleSelectAllRows,
    ],
  );

  // ── hover handlers（11-A2: 参照安定化） ────────────────
  // 追加(11-A2): JSX 内のインライン arrow だった hover 系ハンドラを useCallback へ
  //              引き上げます。
  // 変更理由: インライン arrow は毎レンダー新しい参照になります。とくに
  //           onRowHeaderPointerLeave は GridBodyRow(memo) の props のため、
  //           親が再レンダーするたびに全行の shallow 比較が不一致になり、
  //           A-1 / 11-A の memo 化を事実上無効化していました(全行 ×N 再レンダーの主因)。
  const handleRowHeaderPointerLeaveStable = useCallback(
    (rowIndex: number) => {
      applyHoveredRowChange((current) =>
        current === rowIndex ? null : current,
      );
    },
    [applyHoveredRowChange],
  );

  const handleColumnHeaderPointerLeaveStable = useCallback(
    (colIndex: number) => {
      setHoveredColumnIndex((current) =>
        current === colIndex ? null : current,
      );
    },
    [setHoveredColumnIndex],
  );

  const handleCornerPointerEnterStable = useCallback(() => {
    setIsCornerHovered(true);
  }, [setIsCornerHovered]);

  const handleCornerPointerLeaveStable = useCallback(() => {
    setIsCornerHovered(false);
  }, [setIsCornerHovered]);


  // ── column commands(本体分解 E-4a) ────────────────────
  // 変更(本体分解 E-4a): 列メニュー / 列チューザー / 並び替え管理 / フィルター管理(クリア系)/ 列リセットの
  //   コマンド群は engine/columnCommands.ts(React 非依存)へ移設しました。update(レイアウト effect)で最新の
  //   props / state を渡し、各コマンドは呼び出し時点の値を読みます。参照は恒久安定です。
  const columnCommands = engine.columnCommands;
  useControllerLifecycle(columnCommands, {
    columns,
    visibleColumns,
    orderedColumns,
    columnWidths: effectiveColumnWidths,
    onColumnsChange,
    dispatch,
    enableSorting,
    sort: uiState.sort,
    globalFilterText,
    closeColumnMenu,
    openToolPanel,
    openColumnFilterPopover,
    runAutosize,
  });
  const {
    handleColumnMenuPinnedChange,
    handleColumnMenuAutosizeColumn,
    handleColumnMenuAutosizeAllColumns,
    handleColumnMenuOpenChooser,
    handleColumnMenuOpenSortManager,
    handleColumnMenuOpenFilter,
    handleColumnMenuOpenFilterManager,
    handleColumnMenuResetColumns,
    handleColumnMenuSortChange,
    handleFilterManagerClearFilter,
    handleFilterManagerClearAll,
    handleFilterManagerClearGlobal,
    handleColumnChooserToggleVisibility,
    handleColumnChooserShowAll,
    handleColumnChooserHideAll,
    handleColumnChooserReorder,
    handleColumnChooserReset,
    applyColumnOrderAndPin,
    handleSortManagerAddLevel,
    handleSortManagerChangeDirection,
    handleSortManagerChangeColumn,
    handleSortManagerRemoveLevel,
    handleSortManagerClearAll,
    handleSortManagerMove,
    handleColumnResizePointerDown,
  } = columnCommands;

  // ── column chooser actions(13-B2-1) ──────────────────
  // 追加(13-B2-1): パネルへ渡す列一覧です。visibleColumns ではなく columns(全列)から
  //             作ります(非表示列も一覧して再表示できるようにするため)。
  //             title 未指定は key を表示名にします。
  // 変更(13-B3-1.5): 各列の所属ペイン(pinned 由来)を付与します。パネルは pane ごとに
  //             セクション化して表示するため、画面の列順(reorderColumnsByPane 後)と
  //             パネル順が一致します(固定列ありでの体感ズレ解消)。pane は visible とは
  //             無関係に pinned から決まるため、非表示列も正しいセクションへ入ります。
  const columnChooserItems = useMemo<ColumnChooserItem[]>(
    () =>
      columns.map((column) => ({
        key: column.key,
        title: column.title ?? column.key,
        visible: column.visible !== false,
        pane: getColumnPane(column),
      })),
    [columns],
  );

  // 追加(MS-3-1): 並び替え管理パネルへ渡す「並び替え可能な列」一覧です。
  //             visibleColumns を母集合にします(見えている列だけを並び替え対象に出す＝
  //             挙動が驚かない)。title 未指定は key を表示名にします(chooser と同じ)。
  // 変更(detail ③): 展開行トグル列(合成列・値なし)は一覧から外します。
  const sortManagerColumns = useMemo<SortManagementColumn[]>(
    () =>
      visibleColumns
        .filter(
          (column) =>
            column.key !== DETAIL_TOGGLE_COLUMN_KEY &&
            column.key !== ROW_DRAG_HANDLE_COLUMN_KEY,
        )
        .map((column) => ({
          key: column.key,
          title: column.title ?? column.key,
        })),
    [visibleColumns],
  );

  // ── filter management panel actions(FM-1) ────────────
  // 追加(FM-1): パネルへ渡す「適用中フィルター」一覧です。可視列(視覚順)→ 非表示列
  //   (columns 定義順)の順で、isActiveColumnFilterValue な値だけを載せます。非表示列も
  //   出すのは「見えない列に絞り込みが残っている」という発見性の穴を塞ぐのが本機能の主目的
  //   のためです(非表示列はジャンプ先が無いため ✎ 不可・× のみ可 = isHidden で view が判別)。
  const filterManagerEntries = useMemo<FilterManagementEntry[]>(() => {
    const entries: FilterManagementEntry[] = [];
    const pushEntry = (column: GridColumn<T>, isHidden: boolean) => {
      const value = columnFilters[column.key];
      if (!value || !isActiveColumnFilterValue(value)) {
        return;
      }
      entries.push({
        columnKey: column.key,
        title: column.title || column.key,
        // 変更(preset-opt): dateSet はカスタムプリセットのラベル逆引き用に列のプリセット
        //   構成を渡します(他 kind は未使用のため従来どおり)。
        summaryText: describeColumnFilterValue(
          value,
          value.kind === 'dateSet'
            ? normalizeDateFilterPresets(column.dateFilterPresets)
            : undefined,
        ),
        isHidden,
      });
    };
    for (const column of orderedColumns) {
      pushEntry(column, false);
    }
    for (const column of columns) {
      if (column.visible === false) {
        pushEntry(column, true);
      }
    }
    return entries;
  }, [columnFilters, columns, orderedColumns]);

  // 追加(FM-1): 「フィルターを追加」の候補列です(可視・filterType あり・未適用)。
  //   非表示列は除外します(追加 = ✎ と同じ「ジャンプ + popover」で、非表示列は開けないため)。
  //   filterType 条件は列メニューの「フィルター…」項目(canFilter)と同じ規約です。
  const filterManagerAddableColumns = useMemo<
    FilterManagementAddableColumn[]
  >(
    () =>
      visibleColumns
        .filter(
          (column) =>
            Boolean(column.filterType) &&
            !isActiveColumnFilterValue(columnFilters[column.key]),
        )
        .map((column) => ({
          key: column.key,
          title: column.title || column.key,
        })),
    [columnFilters, visibleColumns],
  );

  // 追加(FM-3): 既定トップバーの Filters chip クリックでパネルをトグルします。
  //   chip 側は onPointerDown を stopPropagation して window の outside-close へ届かせない
  //   ため(DefaultGridTopBar 参照)、ここは click 時点の開閉状態で素直に分岐できます。
  // 変更(UP-1): トグル判定は「フィルタータブが表示中か」です(別タブ表示中のクリックは
  //   タブ切替として振る舞います = 閉じずにフィルタータブへ)。
  const handleFilterSummaryChipClick = useCallback(() => {
    if (activeToolPanelTab === 'filter') {
      closeToolPanel();
    } else {
      openToolPanel('filter');
    }
  }, [activeToolPanelTab, closeToolPanel, openToolPanel]);

  // 追加(FM-1): 対象列まで横スクロールしてからフィルター popover を開きます(パネルの
  //   ✎ 編集 / フィルターを追加)。openColumnFilterPopover は anchor(ヘッダーセル
  //   data-ssg-col-key)を開いた時点の DOM から解決するため、列仮想化で対象列が未描画の
  //   まま開くと layout=null で表示されません。そこで
  //     ① 横スクロール(center ペインのみ。固定列は常時可視のためスクロール不要)
  //     ② rAF リトライ(上限 8 フレーム)でヘッダーセルの出現を待つ
  //     ③ open + ジャンプ先ヘッダーのフラッシュ(ssg-header-cell--jump-flash)
  //   の順に組み立てます。リトライは上限付きの有限ループでゾンビ化しません(13-B3-7 の
  //   自己停止ガードと同趣旨)。上限まで出現しなければ開かず終了します(非表示化直後など。
  //   無表示 popover 状態を作らないため)。
  const jumpToColumnFilter = useCallback(
    (columnKey: string) => {
      const el = scrollContainerRef.current;
      const colIndex = orderedColumns.findIndex(
        (column) => column.key === columnKey,
      );
      if (colIndex < 0) {
        return;
      }
      const column = orderedColumns[colIndex];
      if (el) {
        const single = computeSinglePaneColumnExtent(paneLayout, colIndex);
        if (single && single.pane === 'center') {
          const target = computeHorizontalScrollTarget({
            cellLeft:
              leftPaneTotalWidth + centerLeadingWidth + single.extent.start,
            cellWidth: single.extent.width,
            leftPaneWidth: leftPaneTotalWidth,
            rightPaneWidth: rightPaneTotalWidth,
            viewportWidth: el.clientWidth,
            currentScrollLeft: el.scrollLeft,
            align: 'auto',
            maxScrollLeft: el.scrollWidth - el.clientWidth,
          });
          if (target !== el.scrollLeft) {
            el.scrollTo({ left: target, behavior: 'auto' });
          }
        }
      }
      const findHeaderCell = (): HTMLElement | null => {
        const root = gridRootRef.current;
        const cells = root?.querySelectorAll<HTMLElement>('[data-ssg-col-key]');
        if (!root || !cells) {
          return null;
        }
        return (
          Array.from(cells).find(
            (cell) =>
              cell.dataset.ssgColKey === columnKey &&
              // 追加(detail ④): 展開行カード内にネストしたグリッドの同名列は対象外です。
              !isInsideDetailCardOf(root, cell),
          ) ?? null
        );
      };
      const tryOpen = (attempt: number) => {
        // unmount 後の遅延実行ガードです(root が消えていたら何もしません)。
        if (!gridRootRef.current) {
          return;
        }
        const cell = findHeaderCell();
        if (cell === null) {
          if (attempt < 8) {
            requestAnimationFrame(() => tryOpen(attempt + 1));
          }
          return;
        }
        openColumnFilterPopover(column);
        // ジャンプ先の視認補助フラッシュです。React はヘッダーセルの className prop が
        //   変化したときだけ属性を書き戻すため、直付けクラスは通常アニメ完了まで残ります
        //   (途中で hover 等により書き戻されても視認補助が早く消えるだけで実害なし)。
        cell.classList.remove('ssg-header-cell--jump-flash');
        // reflow を挟み、連続ジャンプでも再アニメーションさせます。
        void cell.offsetWidth;
        cell.classList.add('ssg-header-cell--jump-flash');
        cell.addEventListener(
          'animationend',
          () => {
            cell.classList.remove('ssg-header-cell--jump-flash');
          },
          { once: true },
        );
      };
      requestAnimationFrame(() => {
        tryOpen(0);
      });
    },
    // 変更(本体分解 E-5): 旧 apiStateRef 経由の読みを直接参照へ(列レイアウト変化で参照が変わるが、
    //   渡し先はパネル / バーのコールバックのみでコールドパス)。
    [
      gridRootRef,
      openColumnFilterPopover,
      orderedColumns,
      paneLayout,
      leftPaneTotalWidth,
      centerLeadingWidth,
      rightPaneTotalWidth,
    ],
  );

  // 追加(13-B3-2): ヘッダー D&D 並べ替え controller(ドロップインジケータ ref + 安定ハンドラ)。
  //   enabled は controlled columns(onColumnsChange あり)のときだけ true。
  const {
    onColumnDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    // 追加(案A): 並べ替え確定後に呼ぶ settle アニメ発火関数です。
    applyReorderSettle,
  } = useColumnHeaderDragController<T>({
    enabled: Boolean(onColumnsChange),
    columns,
    paneLayout,
    leftPaneScrollRef,
    rightPaneScrollRef,
    bodyScrollRef,
    scrollContainerRef,
    leftLeadingWidth,
    centerLeadingWidth,
    rightLeadingWidth,
    applyColumnOrderAndPin,
    ghostSlot: slots.dragGhost,
  });

  // 追加(案A): 列レイアウト確定(並べ替え commit を含む)後に settle アニメを発火します。
  //   applyReorderSettle は「直前のドラッグが same-pane 並べ替えで armed のとき」だけ動き、
  //   それ以外(初回 / リサイズ / ピン / 非表示)は即 return するため本 effect が走っても無害です。
  //   useLayoutEffect は paint 前に走るため、瞬間移動は見えず最初から「元位置→新位置」へ滑ります。
  useLayoutEffect(() => {
    applyReorderSettle();
  }, [paneLayout, applyReorderSettle]);

  // ── 追加(row-drag ③): 行ドラッグ並び替え ──────────────────
  // 行移動の共通 commit です(ドロップ確定 / 命令的 moveRow)。moveArrayItem が no-op(同一位置 /
  //   範囲外)なら onRowsChange も onRowMove も呼びません。履歴ラッパ(handleRowsChange)経由のため
  //   undo/redo 対象になります(controller は latest-ref 越しに読むため参照変化は無害)。
  const commitRowMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!handleRowsChange) {
        return;
      }
      const next = moveArrayItem(rows, fromIndex, toIndex);
      if (next === rows) {
        return;
      }
      const movedRow = rows[fromIndex];
      const nextRows = next as T[];
      handleRowsChange(nextRows);
      onRowMove?.({
        rowKey: resolvedRowKeyGetter(movedRow, fromIndex),
        fromIndex,
        toIndex,
        rows: nextRows,
      });
    },
    [rows, handleRowsChange, onRowMove, resolvedRowKeyGetter],
  );
  // 命令的 API moveRow(rowKey, toIndex) の実体です(apiStateRef 経由で最新参照を読みます)。
  const moveRowByKey = useCallback(
    (rowKey: GridRowKey, toIndex: number) => {
      if (isServerSide) {
        console.warn(
          '[SpreadsheetGrid] moveRow() は clientSide(rows + onRowsChange)専用です。serverSide では無効です。',
        );
        return;
      }
      const fromIndex = rows.findIndex(
        (row, index) => resolvedRowKeyGetter(row, index) === rowKey,
      );
      if (fromIndex < 0) {
        return;
      }
      commitRowMove(fromIndex, toIndex);
    },
    [isServerSide, rows, resolvedRowKeyGetter, commitRowMove],
  );
  // ゴーストのラベル: 先頭の(合成列でない)表示列の表示値。空なら「行 N」。
  const getRowDragLabel = useCallback(
    (viewIndex: number): string => {
      const fallback = `行 ${viewIndex + 1}`;
      const row = rowModel.getRow(viewIndex);
      if (!row) {
        return fallback;
      }
      const column = visibleColumns.find(
        (candidate) => !isSyntheticColumnKey(candidate.key),
      );
      if (!column) {
        return fallback;
      }
      const value = getCellValue(row, column);
      const text = column.valueFormatter
        ? column.valueFormatter({ value, row, column })
        : String(value ?? '');
      return text.trim().length > 0 ? text : fallback;
    },
    [rowModel, visibleColumns],
  );
  const {
    onRowDragHandlePointerDown,
    leftIndicatorRef: leftRowDropIndicatorRef,
    centerIndicatorRef: centerRowDropIndicatorRef,
    rightIndicatorRef: rightRowDropIndicatorRef,
    applyReorderSettle: applyRowReorderSettle,
  } = useRowDragController({
    enabled: rowDragOperable,
    rowMetrics,
    headerHeight,
    verticalScaleFactor,
    windowBaseOffsetPx: overlayBaseOffset,
    scrollContainerRef,
    bodyScrollRef,
    getRowDragLabel,
    commitRowMove,
    ghostSlot: slots.dragGhost,
  });
  // 行の並び替え確定(rowModel 差し替え)後に settle アニメを発火します。直前のドロップで armed の
  //   ときだけ動き、それ以外(編集 / フィルター等の rowModel 変化)は即 return するため無害です。
  useLayoutEffect(() => {
    applyRowReorderSettle();
  }, [rowModel, applyRowReorderSettle]);

  // 追加(13-B3-2): reorder 可能(controlled columns)なときだけバッジを grip 化します。
  //   未指定時はバッジが通常表示になり、列範囲選択など既存挙動は完全に従来どおりです。
  const headerDragHandler = onColumnsChange
    ? onColumnDragHandlePointerDown
    : undefined;

  // 追加(13-B3-2): ドロップインジケータ(縦線)の共通 style です。display は controller が
  //   ref 経由で 'block'/'none' を切替え、left はペインローカル境界 x を px で設定します。
  //   zIndex は sticky ヘッダー(6/7)より前面。
  // 変更(13-B3-3): ホストが 2 種(中央=relative コンテナ / 左右=sticky wrapper)になったため、
  //   height を百分率から数値(headerHeight + physicalBodyHeight)へ確定させ、どちらのホストでも
  //   ヘッダー〜ボディを貫く縦線になるようにしました(空ペイン wrapper は alignSelf:stretch で
  //   同じ高さ。relative コンテナも同じ高さを明示しているため値は不変です)。
  // 変更(scroll-space 仮想化): scaling 起動時はコンテナ高さが物理ボディ高さに揃うため、
  //   インジケータも physicalBodyHeight 基準にします(縦線は transform 外＝動かしません)。
  // 変更(モノトーン): 色/幅/端ダイヤは CSS クラス .ssg-col-drop-indicator へ移行しました。
  //   ここでは動的値(height)と位置/表示制御(transform/zIndex/display)のみ持ちます。
  //   display/left は controller が ref 経由で imperative に切り替えます。
  const columnDropIndicatorStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    height: headerHeight + physicalBodyHeight,
    transform: 'translateX(-1px)',
    pointerEvents: 'none',
    zIndex: 8,
    display: 'none',
  };

  // ── filter popover actions ────────────────────────────
  // 追加(DS-4 #1): rows[index] の対象列セル値アクセサです。identity は rows/openedFilterColumn に
  //   連動し、これが変わったときだけ候補収集をやり直します(旧 getColumnSelectOptions の [rows]
  //   依存と等価)。set 即時適用の再レンダー(uiState 変化)では rows/openedFilterColumn とも不変の
  //   ため identity が保たれ、収集の再実行は起きません(open 中の再収集なしを維持)。
  const getOpenedColumnRawValueAt = useCallback(
    (index: number): unknown =>
      openedFilterColumn
        ? getCellValue(rows[index], openedFilterColumn)
        : undefined,
    [rows, openedFilterColumn],
  );

  // 変更(DS-4 #1): 候補収集を「通常規模=同期 / 大規模(>閾値)=時間分割の非同期」へ。
  //   旧実装は open レンダーで同期 useMemo を 1 回走らせる eager 方式で、500k/1M では
  //   その 1 回(reduce + ソート ≈ 0.4〜1s)が主スレッドを塞いでいました(deferred 化は
  //   thrash のため不可)。通常規模はフック内の同期 useMemo で従来どおり即時確定し(チラつき無・
  //   バイト等価)、大規模のみ yieldToMain で時間分割し、収集中は popover を収集中表示にします。
  //   options 配列は同期/非同期いずれも logic/selectOptions の共有コレクタ経由でバイト等価です。
  const {
    options: openedFilterSelectOptions,
    allValues: openedFilterAllValues,
    status: openedFilterOptionsStatus,
    progress: openedFilterOptionsProgress,
  } = useColumnSelectOptionsCollector({
    column: openedFilterColumn,
    rowCount: rows.length,
    getRawValueAt: getOpenedColumnRawValueAt,
  });

  // 変更(本体分解 E-4b): popover の派生値(dateSet 正規化候補 / 全値集合 / set 選択状態 / 反転可否 / 複合列か)と
  //   コマンド群(set のチェック・すべて選択・検索確定・クリア、複合列の条件編集と個別クリア、適用 / クリア)は
  //   engine/filterPopoverCommands.ts(React 非依存)へ移設しました。
  const { resolveFilterPopoverDerived } = engine;
  const filterPopoverDerived = useMemo(
    () =>
      resolveFilterPopoverDerived({
        openedFilterColumn,
        openedFilterType,
        openedFilterSelectOptions,
        openedFilterAllValues,
        columnFilters: uiState.filters.columnFilters,
      }),
    [
      resolveFilterPopoverDerived,
      openedFilterColumn,
      openedFilterType,
      openedFilterSelectOptions,
      openedFilterAllValues,
      uiState.filters.columnFilters,
    ],
  );
  const {
    openedPopoverSelectOptions,
    openedSetFilterValue,
    openedSetSelection,
  } = filterPopoverDerived;
  const filterPopoverCommands = engine.filterPopoverCommands;
  useControllerLifecycle(
    filterPopoverCommands,
    {
      filterPopoverState,
      openedFilterColumn,
      openedFilterType,
      columnFilters: uiState.filters.columnFilters,
      derived: filterPopoverDerived,
      dispatch,
      closeColumnFilterPopover,
      updateNumberDraft: updateFilterPopoverNumberDraft,
      updateTextDraft: updateFilterPopoverTextDraft,
      updateDateDraft: updateFilterPopoverDateDraft,
    },
  );
  const {
    handleSetFilterValueToggle,
    handleSetFilterSelectAllChange,
    handleSetFilterReplaceSelection,
    clearSetFilterPopoverValue,
    handleNumberConditionDraftChange,
    handleTextConditionDraftChange,
    handleDateConditionDraftChange,
    handleComboConditionClear,
    handleComboSelectionClear,
    applyFilterPopoverValue,
    clearFilterPopoverValue,
  } = filterPopoverCommands;

  // 変更(UI CSS移行): getHeaderActionButtonStyle(インライン)を撤去しました。
  //   ヘッダーアイコンボタンのスタイルは styles.css(.ssg-icon-btn / --active / :hover)へ移行。

  // 追加(detail ③): renderCellContent の deps 用ローカル束縛(detailRow 未指定では初期 Set で安定)。
  const expandedDetailRowKeys = uiState.expandedDetailRowKeys;

  // ── cell content renderer ─────────────────────────────
  // 変更(11-A): isActive / isSelected / isEditing / readOnly の判定を GridBodyRow 側へ
  //             移し、ここでは算出済みの cellState を受け取るだけにします。
  // 変更理由: 旧実装は uiState に依存しており、選択ドラッグ・active cell 移動・編集開始の
  //           たびにこの useCallback の参照が変わり、props として受け取る GridBodyRow(memo)
  //           の比較が全行で不一致になっていました(=毎 pointermove で全行×3ペイン再構築)。
  //           依存を rows / rowModel / onRowsChange のみへ縮小したことで、
  //           uiState がどう変わっても本関数は同一参照を保ちます(rows 変更=編集 commit 時
  //           とフィルター/ソート変更時だけ参照が変わりますが、それらは行内容自体が変わる
  //           ため再レンダーが必要なケースです)。
  // 変更(DS-3-2b): filteredRowSourceIndexes 依存を rowModel へ置換しました。rowModel
  //   deps=[order, rows, keyGetter] のうち keyGetter は安定 prop のため、実質の再生成条件は
  //   旧版(deps=[order])と等価です(no-op dispatch では order 不変 → 参照安定=11-A 維持)。
  const renderCellContent = useCallback(
    (
      row: T,
      rowIndex: number,
      column: GridColumn<T>,
      colIndex: number,
      cellState: CellRenderState,
    ) => {
      const value = getCellValue(row, column);

      // 追加(row-drag ③): 行ドラッグハンドル列(合成列)の本体です。掴み手の pointerdown だけで
      //   ドラッグを開始し(セル選択へは伝播させない)、ソート / フィルター中は淡色 + 理由の
      //   ツールチップにします。isRowDraggable が false の行にはハンドルを出しません。
      if (column.key === ROW_DRAG_HANDLE_COLUMN_KEY) {
        if (isRowDraggable) {
          const sourceRowIndex = rowModel.getSourceIndex(rowIndex) ?? rowIndex;
          const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
          if (!isRowDraggable(row, { rowKey, sourceRowIndex })) {
            return null;
          }
        }
        return (
          <span
            className={cx(
              'ssg-row-drag-handle',
              !rowDragOperable && 'ssg-row-drag-handle--disabled',
            )}
            data-ssg-tooltip={
              rowDragOperable ? ROW_DRAG_HANDLE_TOOLTIP : ROW_DRAG_DISABLED_TOOLTIP
            }
            aria-hidden="true"
            onPointerDown={
              rowDragOperable
                ? (event) => onRowDragHandlePointerDown(rowIndex, event)
                : undefined
            }
          >
            <svg
              width="8"
              height="14"
              viewBox="0 0 8 14"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="2" cy="3" r="1" />
              <circle cx="6" cy="3" r="1" />
              <circle cx="2" cy="7" r="1" />
              <circle cx="6" cy="7" r="1" />
              <circle cx="2" cy="11" r="1" />
              <circle cx="6" cy="11" r="1" />
            </svg>
          </span>
        );
      }

      if (column.renderCell) {
        // 追加(context 拡張): source 行 index / rowKey を公開します(view の rowIndex は
        //   ソート / フィルターで source と別空間のため。setValue の解決と同じ seam を使い、
        //   ここは描画対象=ロード済み行のため in-bounds で undefined は実際には発生しません)。
        const sourceRowIndex = rowModel.getSourceIndex(rowIndex) ?? rowIndex;
        const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
        // 追加(detail ③): detailRow 指定時だけ ctx.detail(T2: 任意セルからのトグル口)を渡します。
        //   未指定ではキー自体を付けず、既存の renderCell 引数を不変に保ちます。
        const detail: CellDetailContext | undefined = detailRowEnabled
          ? {
              expanded: expandedDetailRowKeys.has(rowKey),
              expandable: detailIsExpandable
                ? detailIsExpandable(row, { rowKey, sourceRowIndex })
                : true,
              toggle: () => toggleDetailRowAt(rowKey, rowIndex),
              setExpanded: (expanded) =>
                setDetailRowExpandedAt(rowKey, rowIndex, expanded),
            }
          : undefined;
        return column.renderCell({
          row,
          rowIndex,
          sourceRowIndex,
          rowKey,
          colIndex,
          ...(detail ? { detail } : null),
          value,
          column,
          isActive: cellState.isActive,
          isSelected: cellState.isSelected,
          isEditing: cellState.isEditing,
          readOnly: cellState.readOnly,
          // 追加: 実編集は CellEditorLayer で行いますが、将来の API 互換のため setValue も残します。
          // 変更(undo/redo): 変更前 rows を履歴へ積むため handleRowsChange(ラッパ)経由にします。
          setValue: (nextValue) => {
            // 追加(validation): reject 列は検証 NG の書き込みを no-op に倒します(経路 D。
            //   setValue はパースを通らないドメイン値直書きのため、ここが唯一のガードです)。
            if (decideCellWrite(column, row, nextValue).action === 'reject') {
              return;
            }
            // 追加(SSRM 書き戻し): serverSide は書き戻しへ流します(楽観更新はフック側)。
            if (applyServerSideCellEdits) {
              applyServerSideCellEdits([
                { viewIndex: rowIndex, column, value: nextValue },
              ]);
              return;
            }
            if (!handleRowsChange) {
              return;
            }
            // 変更(DS-3-9): レガシーの ?? rowIndex フォールバックを撤去します。
            //   getSourceIndex(viewIndex) = order[viewIndex]。ここで rowIndex は virtualizer の
            //   描画レンジ ⊂ [0, viewRowCount) のため常に in-bounds で、OOB(undefined)は実際には
            //   発生しません。万一 undefined の場合は誤行(rows[viewIndex])への書き込みを避けるため
            //   早期 return で no-op に倒します(旧 ?? は view index を source index に誤代入していた)。
            const originalRowIndex = rowModel.getSourceIndex(rowIndex);
            if (originalRowIndex === undefined) {
              return;
            }
            // 変更(editor 基盤): rows 再構築を logic/editorValues.ts の writeRowsCell へ集約しました。
            const nextRows = writeRowsCell(rows, originalRowIndex, column, nextValue);
            handleRowsChange(nextRows);
          },
        });
      }
      // 追加(editor: checkbox): checkbox 列の既定セルは組み込みのトグルセルを描画します
      //   (renderCell 指定時は上の分岐が優先)。書き込みは toggleCheckboxCell(履歴ラッパ経由)。
      if (column.editor?.type === 'checkbox') {
        return (
          <CheckboxCell
            slot={slots.checkbox}
            checked={isCheckboxChecked(value, column.editor)}
            readOnly={cellState.readOnly}
            onToggle={() =>
              toggleCheckboxCell({ row: rowIndex, col: colIndex })
            }
          />
        );
      }
      // 変更(③): valueFormatter 指定時はその返り値を表示します(UI 表示のみ・生値は不変)。
      const formattedText = column.valueFormatter
        ? column.valueFormatter({ value, row, column })
        : String(value ?? '');
      return <span>{formattedText}</span>;
    },
    [
      rowModel,
      handleRowsChange,
      rows,
      toggleCheckboxCell,
      slots.checkbox,
      applyServerSideCellEdits,
      detailRowEnabled,
      expandedDetailRowKeys,
      detailIsExpandable,
      toggleDetailRowAt,
      setDetailRowExpandedAt,
      isRowDraggable,
      rowDragOperable,
      onRowDragHandlePointerDown,
    ],
  );

  // ── global filter setter ──────────────────────────────
  // 追加: topBar / bottomBar 用に global filter setter を公開します。
  const setGlobalFilterText = useCallback(
    (value: string) => {
      dispatch(gridActions.setGlobalFilter(value));
    },
    [dispatch],
  );

  // ── bar context ───────────────────────────────────────
  // 追加: bar 用 context / derived summary は hook へ逃がします。
  const { slotContext } = useGridBarContext({
    rows,
    // 変更(DS-3-7): filteredRows(配列)→ viewRowCount(件数)+ getFilteredRows(遅延 factory)。
    //   bar summary は件数のみ、公開 slotContext.filteredRows は外部スロットが読んだ時だけ生成。
    // 変更(grouping ④): summary の件数はグループ行を除く leafRowCount です(slotContext.filteredRows
    //   = leaf 行配列と整合)。
    viewRowCount: leafRowCount,
    getFilteredRows,
    columns,
    visibleColumns,
    uiState,
    setGlobalFilterText,
    // 追加(F-async): グローバルフィルタの適用状態/進捗を slotContext へ渡します(ローディング表示用)。
    globalFilterStatus,
    globalFilterProgress,
  });

  // ── styles ────────────────────────────────────────────
  // 変更(UI CSS移行): 外枠 frame(境界/角丸/影/クリップ)は styles.css の .ssg-root へ、
  //   本体シェル(overflow/bg/position)は .ssg-shell へ移行しました。shell の cursor
  //   (autosize 計測中 progress)だけ動的なので、使用箇所で inline 指定します。

  // 変更(A-1): style オブジェクトを useMemo で安定化します。
  //   これらは GridBodyRow(memo) に props として渡るため、毎レンダーで新しい参照を作ると
  //   memo の shallow 比較が必ず不一致になり、行のスキップが効かなくなります。
  // 変更(UI CSS移行): ヘッダーセルの静的スタイルは styles.css(.ssg-header-cell)へ移行しました。
  //   行ヘッダー「#」セル / コーナーが必要とする動的な幅だけを rowHeaderCellStyle に残します。
  const rowHeaderCellStyle: CSSProperties = useMemo(
    () => ({
      width: rowHeaderWidth,
      minWidth: rowHeaderWidth,
    }),
    [rowHeaderWidth],
  );

  // 追加(10-G): 共有スクロールコンテナ（縦横ともにネイティブスクロール）の style です。
  // 変更理由: スクロールを 1 つの要素に集約し、固定列は position: sticky で横方向だけ留めます。
  //           これにより全ペインが同一スクロールで動き、固定列のチカチカ（ティアリング）が
  //           原理的に消えます。

  // 追加(10-G): スクロールコンテンツ本体（3 ペインを横並びにする flex 行）の style です。
  //             width=コンテンツ全幅 / height=ヘッダー+ボディ全高 を明示し、
  //             縦横のスクロール範囲を確定させます。

  // 追加(12-B): フィルター結果 0 行時の空状態表示(AG Grid の "No Matching Rows" 相当)です。
  // 変更理由: 従来は totalBodyHeight=0 でボディが高さごと潰れ、空白だけが残っていました。
  //           sticky ヘッダーの下に固定高の案内領域を確保し、メッセージを表示します。
  // 配置のポイント:
  //   - inner flex row(幅 totalScrollWidth)の「後ろ」に通常フローで置くことで、
  //     ブロック要素の auto 幅はスクロールコンテナの clientWidth に一致します
  //     (兄弟のはみ出し幅には引っ張られません)。
  //   - position: sticky; left: 0 により、横スクロールしてもメッセージが
  //     ビューポート中央に留まります(ヘッダーは従来どおり横スクロール可能)。
  const isBodyEmpty = viewRowCount === 0;


  // 追加(DS-4 ①-(2)): autosize 計測中の Pending overlay です。12-B の空状態と同じ
  //   「中央寄せの案内層」ですが、本層は body 上へ重ねる必要があるため、gridShell
  //   (position: relative)への絶対配置 + pointer-events: none にし、計測中もスクロール /
  //   選択などの操作を素通しで生かします(時間分割の意味を保つため)。表示するのは遅延
  //   overlay(OVERLAY_DELAY_MS)が発火した「本当に重い時」だけで、短時間で終わる規模では
  //   一度も出ません(チラつき防止)。

  // 追加(10-B): 固定ペイン共通の style です。
  // 変更(10-G): position: sticky で横方向だけ留めます（縦は共有スクロールで一緒に動きます）。
  //   - side: 'left' は left:0、'right' は right:0 でビューポート端へ貼り付きます。
  //   - 固定ペイン自身には overflow を付けません。overflow を付けると独自のスクロール
  //     コンテナ化／sticky 破綻を招くためです。固定列は内容幅ぴったりで横へはみ出さないので
  //     clip は不要です。
  //   - frozen shadow（影）＋ ペイン境界線は従来どおり付けます（hasContent のときのみ）。
  //   - zIndex で中央ペイン(zIndex:1)より前面に描画し、影が中央ペインのセルに重なって
  //     「浮いた固定列」に見えるようにします。
  const pinnedPaneStyle = (
    side: 'left' | 'right',
    width: number,
    hasContent: boolean,
  ): CSSProperties => ({
    position: 'sticky',
    ...(side === 'left' ? { left: 0 } : { right: 0 }),
    width,
    minWidth: width,
    flexShrink: 0,
    alignSelf: 'stretch',
    zIndex: 2,
    ...(hasContent
      ? side === 'left'
        ? {
            // 変更(TH-DK-1): 境界/影はトークン参照(要素は .ssg-root 内のため var() が解決されます)。
            borderRight: '1px solid var(--ssg-pane-border)',
            boxShadow: 'var(--ssg-pane-shadow-left)',
          }
        : {
            borderLeft: '1px solid var(--ssg-pane-border)',
            boxShadow: 'var(--ssg-pane-shadow-right)',
          }
      : {}),
  });

  // 追加(10-B): 中央ペインの style です。
  // 変更(10-G): 自前のスクロールは持たず、固定幅(centerContentWidth)で並べます。
  //           縦横スクロールは外側の共有コンテナが担うため overflow は指定しません。
  //           固定ペインの影が重なるよう position: relative + zIndex: 1（固定ペインより背面）。

  // ── filter popover ────────────────────────────────────
  // 変更(12-A): set フィルター値はオブジェクトのため String() 直書きを避け、
  //             現在値テキストをここで type 別に整形します(set は popover 側で
  //             件数カウンタを表示するため参考表示のみです)。
  const openedFilterCurrentValueText = (() => {
    if (!openedFilterColumn) {
      return '（なし）';
    }
    const rawValue = uiState.filters.columnFilters[openedFilterColumn.key];
    if (isSetColumnFilterValue(rawValue)) {
      // 変更(反転set): exclude は「除外中」表示にします(total 非依存で正確)。
      return rawValue.mode === 'exclude'
        ? `${rawValue.values.length}件を除外中`
        : `${rawValue.values.length}件を選択中`;
    }
    // 追加(記述子化 / number): number 記述子は raw(式そのもの)を現在値表示にします。
    if (isNumberColumnFilterValue(rawValue)) {
      return rawValue.raw;
    }
    // 変更(記述子化): text/date/select は記述子のため String() 直書きでは "[object Object]" に
    //   なります。表示文字列は columnFilterValueToDraftText 経由で取り出します(custom は空 → なし)。
    const text = columnFilterValueToDraftText(rawValue);
    return text.trim() ? text : '（なし）';
  })();

  // 追加(preset-opt): 開いている列のプリセット構成(正規形)です。popover のチップ描画・
  //   候補連動・サマリーのラベル逆引きが共有します(dateSet 以外の列では実質未使用)。
  const openedDatePresets = openedFilterColumn
    ? normalizeDateFilterPresets(openedFilterColumn.dateFilterPresets)
    : undefined;

  // 追加(filter-ext B/C): 複合(numberSet / textSet)popover のフッター上サマリーです
  //   (「10 以上 かつ 3 件を選択」)。即時適用モデルのため、適用済み記述子からそのまま
  //   生成すれば表示と結果が常に一致します。
  const openedComboSummaryText =
    openedSetFilterValue && isActiveColumnFilterValue(openedSetFilterValue)
      ? describeColumnFilterValue(openedSetFilterValue, openedDatePresets)
      : 'フィルターなし';

  const renderedFilterPopover = openedFilterColumn ? (
    <ColumnFilterPopover
      popoverSlot={slots.popover}
      themeClassName={themeClassName}
      isOpen={Boolean(filterPopoverState)}
      title={openedFilterColumn.title || openedFilterColumn.key}
      filterType={openedFilterType ?? 'text'}
      // 追加(stage ②): serverSide では set/select 候補をクライアントが自動収集できないため、
      //   候補空時の空表示文言を出し分けます(filterOptions 指定列は従来どおり候補が出ます)。
      isServerSide={isServerSide}
      draftValue={filterPopoverState?.draftValue ?? ''}
      numberConditionDraft={filterPopoverState?.numberDraft ?? null}
      onNumberConditionDraftChange={handleNumberConditionDraftChange}
      textConditionDraft={filterPopoverState?.textDraft ?? null}
      onTextConditionDraftChange={handleTextConditionDraftChange}
      dateConditionDraft={filterPopoverState?.dateDraft ?? null}
      onDateConditionDraftChange={handleDateConditionDraftChange}
      datePresets={openedDatePresets}
      // 追加(date-input): 公開契約(FilterDateInputContext)の columnKey はここで付与します
      //   (popover は列を知らないため)。未指定はネイティブ input(従来挙動)。
      renderDateInput={
        renderFilterDateInput
          ? (ctx) =>
              renderFilterDateInput({
                ...ctx,
                columnKey: openedFilterColumn.key,
              })
          : undefined
      }
      onComboConditionClear={handleComboConditionClear}
      onComboSelectionClear={handleComboSelectionClear}
      comboSummaryText={openedComboSummaryText}
      currentValueText={openedFilterCurrentValueText}
      layout={filterPopoverLayout}
      selectOptions={openedPopoverSelectOptions}
      setSelection={openedSetSelection}
      optionsStatus={openedFilterOptionsStatus}
      optionsProgress={openedFilterOptionsProgress}
      popoverRef={filterPopoverRef}
      textInputRef={filterTextInputRef}
      selectRef={filterSelectRef}
      onRequestClose={closeColumnFilterPopover}
      onDraftChange={updateFilterPopoverDraft}
      onApply={applyFilterPopoverValue}
      onClear={clearFilterPopoverValue}
      onSetValueToggle={handleSetFilterValueToggle}
      onSetSelectAllChange={handleSetFilterSelectAllChange}
      onSetClear={clearSetFilterPopoverValue}
      onSetReplaceSelection={handleSetFilterReplaceSelection}
    />
  ) : null;

  // ── column menu popover(13-A) ────────────────────────
  // 追加(13-A): 列メニュー popover の描画です(portal で body 直下へ出します)。
  const renderedColumnMenuPopover = openedMenuColumn ? (
    <ColumnMenuPopover
      slots={slots}
      themeClassName={themeClassName}
      isOpen={isColumnMenuOpen}
      title={openedMenuColumn.title || openedMenuColumn.key}
      columnKey={openedMenuColumn.key}
      canFilter={columnFilterEnabled && Boolean(openedMenuColumn.filterType)}
      onOpenFilter={() => handleColumnMenuOpenFilter(openedMenuColumn)}
      canSort={sortingEnabled}
      sortDirection={
        // 変更(MS-1): 配列からこの列のエントリ方向を引きます(未ソートなら null)。
        uiState.sort.find((entry) => entry.columnKey === openedMenuColumn.key)
          ?.direction ?? null
      }
      onSortChange={(direction) =>
        handleColumnMenuSortChange(openedMenuColumn.key, direction)
      }
      onOpenSortManager={handleColumnMenuOpenSortManager}
      canManageFilters={columnFilterEnabled}
      onOpenFilterManager={handleColumnMenuOpenFilterManager}
      pinned={openedMenuColumn.pinned}
      canChangePinned={Boolean(onColumnsChange)}
      layout={columnMenuLayout}
      popoverRef={columnMenuRef}
      onPinnedChange={handleColumnMenuPinnedChange}
      onAutosizeColumn={handleColumnMenuAutosizeColumn}
      onAutosizeAllColumns={handleColumnMenuAutosizeAllColumns}
      onOpenColumnChooser={handleColumnMenuOpenChooser}
      canResetColumns={Boolean(onColumnsChange)}
      onResetColumns={handleColumnMenuResetColumns}
      onRequestClose={closeColumnMenu}
    />
  ) : null;

  // ── tool panel(UP-1) ─────────────────────────────────
  // 変更(UP-1): 旧 3 パネル(列の表示 / 並び替え / フィルター管理)の描画を統合ツール
  //   パネル 1 本へ集約しました(portal で body 直下へ出すのはシェル ToolPanel の責務)。
  //   コンテンツはアクティブタブに応じて選んで children へ渡します(非アクティブタブは
  //   アンマウント = タブ内の一時状態はタブ切替でリセット)。
  //   SegmentedControl のバッジ: フィルター = 適用中の列フィルター数 + グローバル(適用時 1)/
  //   並び替え = 基準数。0 件は非表示です。
  const showGlobalFilterRow =
    globalFilterEnabled && globalFilterText.trim().length > 0;
  const filterTabBadge =
    filterManagerEntries.length + (showGlobalFilterRow ? 1 : 0);
  const toolPanelTabs: ToolPanelTabDescriptor[] = availableToolPanelTabs.map(
    (tab): ToolPanelTabDescriptor => {
      if (tab === 'filter') {
        return { tab, label: 'フィルター', badge: filterTabBadge };
      }
      if (tab === 'sort') {
        return { tab, label: '並び替え', badge: uiState.sort.length };
      }
      return { tab, label: '列' };
    },
  );

  // アクティブタブのコンテンツです。✎(編集)と「フィルターを追加」は同じジャンプ経路
  // (jumpToColumnFilter)です(FM-1 から不変)。
  const toolPanelContent: Record<ToolPanelTab, () => ReactNode> = {
    filter: () => (
      <FilterManagementPanel
        entries={filterManagerEntries}
        addableColumns={filterManagerAddableColumns}
        showGlobalFilterRow={showGlobalFilterRow}
        globalFilterText={globalFilterText}
        canFilter={columnFilterEnabled}
        onEditFilter={jumpToColumnFilter}
        onAddFilter={jumpToColumnFilter}
        onClearFilter={handleFilterManagerClearFilter}
        onClearAllFilters={handleFilterManagerClearAll}
        onClearGlobalFilter={handleFilterManagerClearGlobal}
      />
    ),
    columns: () => (
      <ColumnChooserPanel
        items={columnChooserItems}
        canToggle={Boolean(onColumnsChange)}
        onToggleColumnVisibility={handleColumnChooserToggleVisibility}
        onShowAllColumns={handleColumnChooserShowAll}
        onHideAllColumns={handleColumnChooserHideAll}
        onResetColumns={handleColumnChooserReset}
        onReorderColumns={handleColumnChooserReorder}
      />
    ),
    sort: () => (
      <SortManagementPanel
        entries={uiState.sort}
        columns={sortManagerColumns}
        canSort={sortingEnabled}
        onAddLevel={handleSortManagerAddLevel}
        onChangeDirection={handleSortManagerChangeDirection}
        onChangeColumn={handleSortManagerChangeColumn}
        onRemoveLevel={handleSortManagerRemoveLevel}
        onClearAll={handleSortManagerClearAll}
        onMove={handleSortManagerMove}
      />
    ),
  };

  const renderedToolPanel = (
    <ToolPanel
      popoverSlot={slots.popover}
      themeClassName={themeClassName}
      activeTab={activeToolPanelTab}
      flashTick={toolPanelFlashTick}
      tabs={toolPanelTabs}
      layout={toolPanelLayout}
      panelRef={toolPanelRef}
      onSelectTab={openToolPanel}
      onRequestClose={closeToolPanel}
      onPanelMove={moveToolPanel}
    >
      {activeToolPanelTab !== null
        ? toolPanelContent[activeToolPanelTab]()
        : null}
    </ToolPanel>
  );

  // ── cell context menu popover(バッチ②) ───────────────
  // 追加(バッチ②): コンテキストメニュー popover の描画です(portal で body 直下へ出します)。
  //             closed 時はコンポーネント側が null を返すため、常時この 1 要素を tail に置きます。
  const renderedCellContextMenuPopover = (
    <CellContextMenuPopover
      slots={slots}
      themeClassName={themeClassName}
      isOpen={isContextMenuOpen}
      items={contextMenuState?.items ?? EMPTY_CONTEXT_MENU_ITEMS}
      layout={contextMenuLayout}
      popoverRef={contextMenuRef}
      onRequestClose={closeContextMenu}
    />
  );

  // 追加(13-A): いずれかの popup(フィルター / 列メニュー)表示中かどうかです。
  //             grid root の tab フォーカス / keyboard / paste handler の一時停止に使います
  //             (従来は isFilterPopoverOpen のみで判定していました)。
  // 変更(13-B2-1): 列の表示/非表示パネルも含めます(パネル表示中も grid の
  //             keyboard/paste を止めます。パネルの検索入力にフォーカスが入るため)。
  // 変更(MS-3-1): 並び替え管理パネルも含めます(パネル内の <select> 等にフォーカスが
  //             入るため、grid の keyboard/paste を止めます)。
  const isAnyGridPopupOpen =
    isFilterPopoverOpen ||
    isColumnMenuOpen ||
    // 変更(UP-1): 統合ツールパネル(旧: 列の表示 / 並び替えパネル)表示中も止めます
    //             (パネル内の検索入力 / <select> 等にフォーカスが入るため)。
    activeToolPanelTab !== null ||
    // 追加(バッチ②): コンテキストメニュー表示中も grid の tab/keyboard/paste を止めます。
    isContextMenuOpen;

  // ── slot bars ─────────────────────────────────────────
  // 追加: slot helper を使って top/bottom の描画を解決します。
  // 変更: showTopBar / showBottomBar(既定 true)を最優先のマスタースイッチにします。
  //   false のときは renderTopBar / renderBottomBar / enableGlobalFilter に関わらず当該バーを
  //   一切描画しません(矛盾指定時はキルスイッチ勝ち)。true のときは従来どおり
  //   「カスタム renderer → 既定バー」の順で解決します。
  // 変更(バー内訳): 既定トップバーの中身を 2 パート(summary / filter)に分け、show* で出し分けます。
  //   - summary: showTopBarSummary に従う。
  //   - filter : showTopBarFilter かつ globalFilterEnabled(機能有効)が前提
  //              (無効な機能の入力欄は出さない)。
  //   両方とも非表示(中身が空)になる場合は既定バー自体を描画しません(空バーを出さない)。
  //   なお renderTopBar 指定時はカスタム側が中身を全て決めるため show* 内訳は関与しません。
  const showDefaultTopSummary = showTopBarSummary;
  const showDefaultTopFilter = showTopBarFilter && globalFilterEnabled;
  const defaultTopBar =
    showDefaultTopSummary || showDefaultTopFilter ? (
      <DefaultGridTopBar
        slot={slots.toolbar}
        context={slotContext}
        showSummary={showDefaultTopSummary}
        showFilter={showDefaultTopFilter}
        showCounts={showTopBarCounts}
        globalFilterPlaceholder={globalFilterPlaceholder}
        globalFilterIcon={globalFilterIcon}
        // 追加(FM-3): Filters chip クリックでフィルター管理パネルをトグルします
        //   (フィルター機能が無効なら渡さない = chip は従来どおり非クリックの span)。
        onFilterSummaryClick={
          columnFilterEnabled ? handleFilterSummaryChipClick : undefined
        }
      />
    ) : null;

  const resolvedTopBar = !showTopBar
    ? null
    : resolveGridSlot(renderTopBar, slotContext, defaultTopBar);

  // 追加: bottom は未指定時に既定ステータスバーを表示します。
  const resolvedBottomBar = !showBottomBar
    ? null
    : resolveGridSlot(
        renderBottomBar,
        slotContext,
        <DefaultGridBottomBar
          slot={slots.statusBar}
          context={slotContext}
          showCounts={showBottomBarCounts}
        />,
      );

  // ── render ────────────────────────────────────────────
  // 追加: スクロールコンテナの高さ。height/maxHeight props を inline style で当て、
  //   CSS 既定(.ssg-scroll-container max-height:480px)を必要時のみ上書きします。
  //   - 両者未指定: inline を付けず CSS 既定 480px に委ねる(従来挙動・後方互換)。
  //   - height 指定: 明示高さを採用('100%' で親要素に追従。親が確定高さを持つ前提)。
  //     maxHeight 未指定時は CSS 既定 480 を打ち消すため max-height:'none' にします
  //     (height をクリップさせない)。
  //   - maxHeight 指定: その値を高さ上限に(height と併用可)。
  const scrollContainerStyle: CSSProperties | undefined =
    height === undefined && maxHeight === undefined
      ? undefined
      : {
          ...(height !== undefined ? { height } : {}),
          maxHeight: maxHeight ?? (height !== undefined ? 'none' : undefined),
        };

  // ── imperative API(ref ハンドル)──────────────────────
  // 変更(本体分解 E-5): 実体は engine/gridApi.ts(React 非依存)。update(レイアウト effect)で最新の状態 / 派生値 /
  //   連携先を渡し、ハンドルは 1 回だけ生成した参照安定なオブジェクトをそのまま返します(旧 apiStateRef =
  //   30 フィールドのレンダー中 ref 代入を解消)。
  useControllerLifecycle(gridApi, {
    scrollContainerRef,
    dispatch,
    rowModel,
    viewRowCount,
    leafRowCount,
    groupTree,
    rowMetrics,
    paneLayout,
    orderedColumns,
    columns,
    onColumnsChange,
    uiState,
    headerHeight,
    verticalScaleFactor,
    leftPaneTotalWidth,
    rightPaneTotalWidth,
    centerLeadingWidth,
    windowFirstRow,
    windowLastRow,
    physicalBodyHeight,
    rows,
    isServerSide,
    serverSideRefresh: serverSide.refresh,
    resolvedRowKeyGetter,
    isRowExportable,
    activeToolPanelTab,
    openToolPanel,
    closeToolPanel,
    undoRows,
    redoRows,
    canUndoRows,
    canRedoRows,
    clearUndoHistory,
    detailRowEnabled,
    detailIsExpandable,
    detailIndexCacheRef: detailIndexCacheHolder,
    moveRowByKey,
    commitRowSelection: rowSelectionCommands.commitRowSelection,
    markApiScroll: scrollSync.markApiScroll,
  });
  useImperativeHandle(ref, () => gridApi.handle, [gridApi]);

  // ── onStateChange(永続スライス + 列メタ変化の通知)──────
  // 設計: 純ロジック decideStateChangeEmit に判定を委ね、ここは「現在 snapshot を作って判定 → 必要なら
  //   通知 → lastEmitted を更新」の薄い配線に留めます。effect は永続 3 スライス + 列メタ(columns)+
  //   dragState の参照変化でのみ走ります(activeCell / selection 等の一時 UI 変化では監視対象の参照が
  //   変わらないため走りません)。判定詳細(ドラッグ中保留 / 初回非発火 / 同値非発火)は純ロジック側。
  //   列メタ(可視 / 順序 / ピン)は columns prop なので、変化検出のため columns を監視 + snapshot に含め、
  //   isSameGridState の列メタ比較で no-op 参照変化(同値の新配列)を握りつぶします。
  //   onStateChange は latest-ref 経由で読み、毎レンダーで新しいインライン関数が渡されても effect を
  //   再実行しません(deps から外します)。先頭ガードで onStateChange 未使用時は snapshot+比較すら
  //   行いません(計算ゼロ)。未使用時は lastEmitted が null のままですが、後から付いた初回は prev=null で
  //   非発火→baseline 記録となり整合的です。
  // 変更(本体分解 E-6a): 判定 / 通知は engine/notifiers.ts の createStateChangeNotifier へ(passive = 旧 effect と同じ)。
  useControllerLifecycle(
    engine.stateChangeNotifier,
    {
      columnWidths: uiState.columnWidths,
      filters: uiState.filters,
      sort: uiState.sort,
      dragState: uiState.dragState,
      columns,
      onStateChange,
    },
    'passive',
  );

  return (
    <div
      className={cx(
        'ssg-root',
        // 追加(THEME-2): density プリセット修飾子(standard は付与なし=既定寸法のまま)。
        density !== 'standard' && `ssg-root--density-${density}`,
        // 追加(TH-DK-2): ダークテーマ修飾子(light は付与なし=既定トークンのまま)。
        themeClassName,
        // 追加(THEME-3): readonly 淡色表示の opt-in 修飾子(styles.css 側で :where ゲート)。
        dimReadOnlyCells && 'ssg-root--dim-readonly',
        className,
        slots.root?.className,
      )}
      style={mergeStyles(slots.root?.style, style)}
    >
      {resolvedTopBar}

      {/* 追加(FM-2): フィルターチップバー(opt-in)。適用中の列フィルターをチップで常時表示します。
          entries / ハンドラはフィルター管理パネル(FM-1)と完全共用です(要約・非表示列の扱いが
          自動で一致)。0 件時はコンポーネント側が null を返すため、条件は prop のみで判定します。 */}
      {showFilterChipBar && (
        <GridFilterChipBar
          slot={slots.filterChipBar}
          entries={filterManagerEntries}
          canFilter={columnFilterEnabled}
          onEditFilter={jumpToColumnFilter}
          onClearFilter={handleFilterManagerClearFilter}
          onClearAllFilters={handleFilterManagerClearAll}
        />
      )}

      <div
        ref={gridRootRef}
        className="ssg-shell"
        style={{ cursor: isAutosizing ? 'progress' : undefined }}
        onDragStart={handleNativeDragStart}
        // 追加(UI hover): grid 本体(ヘッダー+ボディ)から出たら行ホバーをクリアします。
        onPointerLeave={() => applyHoveredRowChange(null)}
        onPointerMoveCapture={(event) => {
          pointerClientRef.current = { x: event.clientX, y: event.clientY };
          updateSelectionFromPointer(event.clientX, event.clientY);
        }}
        // 追加: popup(フィルター / 列メニュー)open 中は grid root を tab フォーカス対象から外します。
        tabIndex={isAnyGridPopupOpen ? -1 : 0}
        // 追加: popup open 中は root の keyboard/paste handler 自体を外します。
        onKeyDown={isAnyGridPopupOpen ? undefined : handleKeyDown}
        onPaste={isAnyGridPopupOpen ? undefined : handlePaste}
        // 追加(バッチ②): ボディ右クリックの委譲。未 opt-in / 対象外は素通しで標準メニューになります。
        onContextMenu={handleBodyContextMenu}
      >
        {/* ── 変更(10-G): 縦横スクロールを 1 本化した共有スクロールコンテナ ── */}
        {/*   旧: 中央ペインのみ overflow:auto + 左右ペインを JS の transform で同期     */}
        {/*   新: 外側コンテナが縦横ともネイティブスクロール / 固定列は position: sticky  */}
        {/*   pinned 列がない場合は左右ペインが width:0 で非表示、中央ペインのみ表示。     */}
        <div
          ref={scrollContainerRef}
          className={cx(
            'ssg-scroll-container',
            // 追加(scrollHint): カスタムスクロールバー有効時はネイティブ縦バーを隠し、
            //   右端にガターぶんの余白(margin-right)を空けます(GridScrollHint が描画)。
            //   minRows 未達時(activeScrollHint=null)はネイティブバーのままにします。
            activeScrollHint?.scrollbar === true &&
              'ssg-scroll-container--custom-scrollbar',
          )}
          style={scrollContainerStyle}
        >
          <div
            className="ssg-inner-row"
            style={{
              width: totalScrollWidth,
              minWidth: totalScrollWidth,
              height: headerHeight + physicalBodyHeight,
            }}
          >

          {/* ── 左固定ペイン ── */}
          {/* 変更(10-C): 左固定列があるときだけヘッダー・ボディ・行ヘッダーを描画します。*/}
          {/*   固定列が無いときは hasLeftPane=false で width:0 の空ペイン（従来どおり）。*/}
          <div
            ref={leftPaneScrollRef}
            style={pinnedPaneStyle('left', leftPaneTotalWidth, hasLeftPane)}
          >
            {hasLeftPane && (
              <div
                style={{
                  position: 'relative',
                  // 追加(scroll-space 仮想化 修正2): scaling 時の wrapper translateY は正値
                  //   (最大 ≈ physicalBodyHeight)になり、CSS transform はスクロールコンテナの
                  //   scrollable-overflow を下方向へ広げます。その結果、最終行の下に余分な
                  //   スクロール領域(余白)が生じます。overflow: clip でこの relative ボックス
                  //   ([0, headerHeight+physicalBodyHeight])外への波及を遮断します。
                  //   overflow: clip はスクロールコンテナを生成しないため sticky ヘッダーには
                  //   影響せず、ヘッダー/行/オーバーレイはいずれもこのボックス内に収まるため
                  //   視覚的なクリップも起きません。
                  overflow: 'clip',
                  width: leftPaneTotalWidth,
                  minWidth: leftPaneTotalWidth,
                  height: headerHeight + physicalBodyHeight,
                }}
              >
                <GridHeaderRow
                  pane="left"
                  ownsRowHeader
                  leadingWidth={leftLeadingWidth}
                  headerHeight={headerHeight}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  slots={slots}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  showSelectAllCheckbox={enableSelectAllRows}
                  selectAllState={selectAllRowsState}
                  filteredRowsLength={viewRowCount}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={leftRenderEntries}
                  hoveredColumnIndex={hoveredColumnIndex}
                  selectionSnapshot={selectionSnapshot}
                  columnFilterValues={uiState.filters.columnFilters}
                  sortState={uiState.sort}
                  onCornerPointerDown={handleCornerHeaderPointerDown}
                  onCornerPointerEnter={handleCornerPointerEnterStable}
                  onCornerPointerLeave={handleCornerPointerLeaveStable}
                  onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
                  onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
                  onColumnHeaderPointerLeave={handleColumnHeaderPointerLeaveStable}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
                  enableColumnMenu={enableColumnMenu}
                  enableColumnResize={enableColumnResize}
                  openedMenuColumnKey={openedMenuColumnKey}
                  onColumnMenuButtonPointerDown={openColumnMenuFromButton}
                  onColumnMenuButtonClick={openColumnMenuFromButtonClick}
                  onColumnHeaderContextMenu={openColumnMenuFromContextMenu}
                  onColumnDragHandlePointerDown={headerDragHandler}
                />

                {/* 追加(10-D): 左固定ペイン内の overlay（ペインローカル座標）。*/}
                {/*   active cell / 選択範囲が左固定列にあるときだけ矩形が出ます。*/}
                {/* 変更(10-G): overlay + body をまとめる絶対配置レイヤーです。       */}
                {/*   transform 同期は廃止し、縦スクロールは共有コンテナが担います。  */}
                {/*   この div が絶対配置子の containing block となり、中のセルは        */}
                {/*   headerHeight + start で配置され、sticky ヘッダーの背面を流れます。*/}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: leftPaneTotalWidth,
                    height: headerHeight + physicalBodyHeight,
                    // 追加(scroll-space 仮想化): 行/overlay を物理ウィンドウへ引き込む変換。
                    transform: bodyLayerTransform,
                  }}
                >
                {(
                  selectionRectsForPane('left') ?? [selectionRectForPane('left')]
                ).map((rect, segmentIndex) => (
                  <SelectionOverlay
                    slot={slots.selectionOverlay}
                    key={segmentIndex}
                    rect={rect}
                    headerHeight={headerHeight}
                    baseOffset={overlayBaseOffset}
                    leadingWidth={leftLeadingWidth}
                  />
                ))}

                <ActiveCellOverlay
                  slot={slots.activeCellOverlay}
                  rect={activeCellRectForPane('left')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={leftLeadingWidth}
                />

                <CellEditorLayer
                  slots={slots}
                  rect={editorRectForPane('left')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={leftLeadingWidth}
                  initialValue={editorInitialValue}
                  editor={editingColumn?.editor}
                  editorSession={editorSession}
                  themeClassName={themeClassName}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  align={editingColumn?.align}
                  enterMove={editorEnterMove}
                />

                <GridBodyLayer
                  pane="left"
                  ownsRowHeader
                  leadingWidth={leftLeadingWidth}
                  rowModel={rowModel}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={leftRenderEntries}
                  rowHeight={rowHeight}
                  autoHeight={autoHeightActive}
                  showCellOverflowTooltip={showCellOverflowTooltip}
                  showValidationMarks={showValidationMarks}
                  isServerSide={isServerSide}
                  collapsedGroupKeys={uiState.collapsedGroupKeys}
                  onGroupToggle={handleGroupToggle}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  hoveredRowIndex={resolvedHoveredRowIndex}
                  isWholeGridSelected={isWholeGridSelected}
                  enableRowSelection={enableRowSelection}
                  rowSelectionState={rowSelectionState}
                  activeCell={uiState.activeCell}
                  editingCell={uiState.editingCell}
                  selectionSnapshot={selectionSnapshot}
                  readOnly={readOnly}
                  canEditCell={canEditCell}
                  onRowHeaderPointerDown={handleRowHeaderPointerDown}
                  onRowHeaderPointerEnter={handleRowHeaderPointerEnter}
                  onRowHeaderPointerLeave={handleRowHeaderPointerLeaveStable}
                  onCellPointerDown={handleCellPointerDown}
                  onCellPointerEnter={handleCellPointerEnter}
                  onCellDoubleClick={handleCellDoubleClickGuarded}
                  renderCellContent={renderCellContent}
                  getRowClassName={getRowClassName}
                  labelRowLayer={labelRowLayerBand}
                  slots={slots}
                />

                {/* 追加(detail ③): 展開行の帯(左固定ペイン幅ぶんの背景だけ。カードは中央ペイン)。 */}
                <GridDetailLayer
                  slots={slots}
                  entries={detailEntries}
                  mode="band"
                  paneWidth={leftPaneTotalWidth}
                  baseOffset={overlayBaseOffset}
                  cardStickyLeft={0}
                  cardWidth={0}
                  renderCard={renderDetailCard}
                />
                {/* 追加(row-drag ③): 行ドロップ位置のガイド線(左固定ペイン分)。 */}
                {rowDragAvailable && (
                  <div
                    ref={leftRowDropIndicatorRef}
                    className="ssg-row-drop-indicator ssg-row-drop-indicator--cap"
                  />
                )}
                </div>
              </div>
            )}

            {/* 追加(13-B3-3): 左固定ペインのドロップインジケータ(縦線)。
                変更点: 旧来は hasLeftPane 内の relative コンテナ直下に置いていましたが、
                空ペイン(pinned-left 0 本)時にも線を出せるよう、常時レンダーされる
                wrapper(sticky;left:0 = absolute 子の containing block)直下へ移しました。
                非空時は wrapper と内側 relative コンテナが原点(0,0)・高さ共通のため、
                leftPx の意味・縦線位置は従来と不変です。 */}
            <div ref={leftIndicatorRef} className="ssg-col-drop-indicator" style={columnDropIndicatorStyle} />
          </div>

          {/* ── 中央ペイン ── */}
          {/* 変更(10-G): 自前のスクロールは持たず、共有コンテナのスクロールに乗ります。   */}
          {/*   bodyScrollRef はヒットテストの基準矩形としてのみ使用します（scrollTop/Left は 0）。*/}
          {/* 変更(10-C): 行ヘッダーは左固定列が無いときだけ中央が持ちます（従来と同一）。*/}
          <div
            ref={bodyScrollRef}
            className="ssg-center-pane"
            style={{ width: centerContentWidth, minWidth: centerContentWidth }}
          >
            <div
              style={{
                position: 'relative',
                // 追加(scroll-space 仮想化 修正2): wrapper の正値 translateY による
                //   scrollable-overflow 拡張(末尾下の余白)を遮断するクリップ(詳細は左ペイン参照)。
                overflow: 'clip',
                width: centerContentWidth,
                minWidth: centerContentWidth,
                height: headerHeight + physicalBodyHeight,
              }}
            >
              <GridHeaderRow
                pane="center"
                ownsRowHeader={centerOwnsRowHeader}
                leadingWidth={centerLeadingWidth}
                headerHeight={headerHeight}
                rowHeaderCellStyle={rowHeaderCellStyle}
                slots={slots}
                isCornerHovered={isCornerHovered}
                isWholeGridSelected={isWholeGridSelected}
                showSelectAllCheckbox={enableSelectAllRows}
                selectAllState={selectAllRowsState}
                filteredRowsLength={viewRowCount}
                visibleColumnsLength={visibleColumns.length}
                renderEntries={centerRenderEntries}
                hoveredColumnIndex={hoveredColumnIndex}
                selectionSnapshot={selectionSnapshot}
                columnFilterValues={uiState.filters.columnFilters}
                sortState={uiState.sort}
                onCornerPointerDown={handleCornerHeaderPointerDown}
                onCornerPointerEnter={handleCornerPointerEnterStable}
                onCornerPointerLeave={handleCornerPointerLeaveStable}
                onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
                onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
                onColumnHeaderPointerLeave={handleColumnHeaderPointerLeaveStable}
                onColumnResizePointerDown={handleColumnResizePointerDown}
                enableColumnMenu={enableColumnMenu}
                enableColumnResize={enableColumnResize}
                openedMenuColumnKey={openedMenuColumnKey}
                onColumnMenuButtonPointerDown={openColumnMenuFromButton}
                  onColumnMenuButtonClick={openColumnMenuFromButtonClick}
                onColumnHeaderContextMenu={openColumnMenuFromContextMenu}
                onColumnDragHandlePointerDown={headerDragHandler}
              />

              {/* 変更(10-D): 中央ペインの overlay をペインローカル座標に切替。*/}
              {/*   leadingWidth は centerLeadingWidth（固定列なしのとき rowHeaderWidth）。*/}
              {/* 追加(scroll-space 仮想化): 行/overlay を物理ウィンドウへ引き込む transform 層
                  (左右ペインと同型)。header と drop indicator は transform 外に置き、
                  ヘッダーは sticky のまま動かしません。原点(0,0)・同サイズの wrapper のため
                  overlay 内部のペインローカル座標は不変で、transform のみ加わります。*/}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: centerContentWidth,
                  height: headerHeight + physicalBodyHeight,
                  transform: bodyLayerTransform,
                }}
              >
                {(
                  selectionRectsForPane('center') ?? [selectionRectForPane('center')]
                ).map((rect, segmentIndex) => (
                  <SelectionOverlay
                    slot={slots.selectionOverlay}
                    key={segmentIndex}
                    rect={rect}
                    headerHeight={headerHeight}
                    baseOffset={overlayBaseOffset}
                    leadingWidth={centerLeadingWidth}
                  />
                ))}

                <ActiveCellOverlay
                  slot={slots.activeCellOverlay}
                  rect={activeCellRectForPane('center')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={centerLeadingWidth}
                />

                <CellEditorLayer
                  slots={slots}
                  rect={editorRectForPane('center')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={centerLeadingWidth}
                  initialValue={editorInitialValue}
                  editor={editingColumn?.editor}
                  editorSession={editorSession}
                  themeClassName={themeClassName}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  align={editingColumn?.align}
                  enterMove={editorEnterMove}
                />

                <GridBodyLayer
                  pane="center"
                  ownsRowHeader={centerOwnsRowHeader}
                  leadingWidth={centerLeadingWidth}
                  rowModel={rowModel}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={centerRenderEntries}
                  rowHeight={rowHeight}
                  autoHeight={autoHeightActive}
                  showCellOverflowTooltip={showCellOverflowTooltip}
                  showValidationMarks={showValidationMarks}
                  isServerSide={isServerSide}
                  collapsedGroupKeys={uiState.collapsedGroupKeys}
                  onGroupToggle={handleGroupToggle}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  hoveredRowIndex={resolvedHoveredRowIndex}
                  isWholeGridSelected={isWholeGridSelected}
                  enableRowSelection={enableRowSelection}
                  rowSelectionState={rowSelectionState}
                  activeCell={uiState.activeCell}
                  editingCell={uiState.editingCell}
                  selectionSnapshot={selectionSnapshot}
                  readOnly={readOnly}
                  canEditCell={canEditCell}
                  onRowHeaderPointerDown={handleRowHeaderPointerDown}
                  onRowHeaderPointerEnter={handleRowHeaderPointerEnter}
                  onRowHeaderPointerLeave={handleRowHeaderPointerLeaveStable}
                  onCellPointerDown={handleCellPointerDown}
                  onCellPointerEnter={handleCellPointerEnter}
                  onCellDoubleClick={handleCellDoubleClickGuarded}
                  renderCellContent={renderCellContent}
                  getRowClassName={getRowClassName}
                  labelRowLayer={labelRowLayerCenter}
                  slots={slots}
                />

                {/* 追加(detail ③): 展開行の帯 + カード。カードは sticky でビューポート中央可視幅に留まります。 */}
                <GridDetailLayer
                  slots={slots}
                  entries={detailEntries}
                  mode="center"
                  paneWidth={centerContentWidth}
                  baseOffset={overlayBaseOffset}
                  cardStickyLeft={detailCardStickyLeft}
                  cardWidth={detailCardWidth}
                  cardSlot={detailCardSlot}
                  renderCard={renderDetailCard}
                />
                {/* 追加(row-drag ③): 行ドロップ位置のガイド線(中央ペイン分)。 */}
                {rowDragAvailable && (
                  <div
                    ref={centerRowDropIndicatorRef}
                    className={cx(
                      'ssg-row-drop-indicator',
                      // 左固定ペインが無いときは中央が最左 = キャップ付き。
                      centerOwnsRowHeader && 'ssg-row-drop-indicator--cap',
                    )}
                  />
                )}
              </div>

              {/* 追加(13-B3-2): 中央ペインのドロップインジケータ(縦線)。
                  controller が ref 経由で display/left を imperative に制御します
                  (ドラッグ中の再レンダーなし → GridHeaderRow の memo を維持)。 */}
              <div ref={centerIndicatorRef} className="ssg-col-drop-indicator" style={columnDropIndicatorStyle} />
            </div>
          </div>

          {/* ── 右固定ペイン ── */}
          {/* 変更(10-C): 右固定列があるときだけ描画します。行ヘッダーは持ちません。*/}
          <div
            ref={rightPaneScrollRef}
            style={pinnedPaneStyle('right', rightPaneTotalWidth, hasRightPane)}
          >
            {hasRightPane && (
              <div
                style={{
                  position: 'relative',
                  // 追加(scroll-space 仮想化 修正2): wrapper の正値 translateY による
                  //   scrollable-overflow 拡張(末尾下の余白)を遮断するクリップ(詳細は左ペイン参照)。
                  overflow: 'clip',
                  width: rightPaneTotalWidth,
                  minWidth: rightPaneTotalWidth,
                  height: headerHeight + physicalBodyHeight,
                }}
              >
                <GridHeaderRow
                  pane="right"
                  ownsRowHeader={false}
                  leadingWidth={rightLeadingWidth}
                  headerHeight={headerHeight}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  slots={slots}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  showSelectAllCheckbox={enableSelectAllRows}
                  selectAllState={selectAllRowsState}
                  filteredRowsLength={viewRowCount}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={rightRenderEntries}
                  hoveredColumnIndex={hoveredColumnIndex}
                  selectionSnapshot={selectionSnapshot}
                  columnFilterValues={uiState.filters.columnFilters}
                  sortState={uiState.sort}
                  onCornerPointerDown={handleCornerHeaderPointerDown}
                  onCornerPointerEnter={handleCornerPointerEnterStable}
                  onCornerPointerLeave={handleCornerPointerLeaveStable}
                  onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
                  onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
                  onColumnHeaderPointerLeave={handleColumnHeaderPointerLeaveStable}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
                  enableColumnMenu={enableColumnMenu}
                  enableColumnResize={enableColumnResize}
                  openedMenuColumnKey={openedMenuColumnKey}
                  onColumnMenuButtonPointerDown={openColumnMenuFromButton}
                  onColumnMenuButtonClick={openColumnMenuFromButtonClick}
                  onColumnHeaderContextMenu={openColumnMenuFromContextMenu}
                  onColumnDragHandlePointerDown={headerDragHandler}
                />

                {/* 追加(10-D): 右固定ペイン内の overlay（ペインローカル座標）。*/}
                {/* 変更(10-G): 左ペインと同様、overlay + body をまとめる絶対配置レイヤーです。*/}
                {/*   transform 同期は廃止し、縦スクロールは共有コンテナが担います。         */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: rightPaneTotalWidth,
                    height: headerHeight + physicalBodyHeight,
                    // 追加(scroll-space 仮想化): 行/overlay を物理ウィンドウへ引き込む変換。
                    transform: bodyLayerTransform,
                  }}
                >
                {(
                  selectionRectsForPane('right') ?? [selectionRectForPane('right')]
                ).map((rect, segmentIndex) => (
                  <SelectionOverlay
                    slot={slots.selectionOverlay}
                    key={segmentIndex}
                    rect={rect}
                    headerHeight={headerHeight}
                    baseOffset={overlayBaseOffset}
                    leadingWidth={rightLeadingWidth}
                  />
                ))}

                <ActiveCellOverlay
                  slot={slots.activeCellOverlay}
                  rect={activeCellRectForPane('right')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={rightLeadingWidth}
                />

                <CellEditorLayer
                  slots={slots}
                  rect={editorRectForPane('right')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={rightLeadingWidth}
                  initialValue={editorInitialValue}
                  editor={editingColumn?.editor}
                  editorSession={editorSession}
                  themeClassName={themeClassName}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  align={editingColumn?.align}
                  enterMove={editorEnterMove}
                />

                <GridBodyLayer
                  pane="right"
                  ownsRowHeader={false}
                  leadingWidth={rightLeadingWidth}
                  rowModel={rowModel}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={rightRenderEntries}
                  rowHeight={rowHeight}
                  autoHeight={autoHeightActive}
                  showCellOverflowTooltip={showCellOverflowTooltip}
                  showValidationMarks={showValidationMarks}
                  isServerSide={isServerSide}
                  collapsedGroupKeys={uiState.collapsedGroupKeys}
                  onGroupToggle={handleGroupToggle}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  hoveredRowIndex={resolvedHoveredRowIndex}
                  isWholeGridSelected={isWholeGridSelected}
                  enableRowSelection={enableRowSelection}
                  rowSelectionState={rowSelectionState}
                  activeCell={uiState.activeCell}
                  editingCell={uiState.editingCell}
                  selectionSnapshot={selectionSnapshot}
                  readOnly={readOnly}
                  canEditCell={canEditCell}
                  onRowHeaderPointerDown={handleRowHeaderPointerDown}
                  onRowHeaderPointerEnter={handleRowHeaderPointerEnter}
                  onRowHeaderPointerLeave={handleRowHeaderPointerLeaveStable}
                  onCellPointerDown={handleCellPointerDown}
                  onCellPointerEnter={handleCellPointerEnter}
                  onCellDoubleClick={handleCellDoubleClickGuarded}
                  renderCellContent={renderCellContent}
                  getRowClassName={getRowClassName}
                  labelRowLayer={labelRowLayerBand}
                  slots={slots}
                />

                {/* 追加(detail ③): 展開行の帯(右固定ペイン幅ぶんの背景だけ)。 */}
                <GridDetailLayer
                  slots={slots}
                  entries={detailEntries}
                  mode="band"
                  paneWidth={rightPaneTotalWidth}
                  baseOffset={overlayBaseOffset}
                  cardStickyLeft={0}
                  cardWidth={0}
                  renderCard={renderDetailCard}
                />
                {/* 追加(row-drag ③): 行ドロップ位置のガイド線(右固定ペイン分)。 */}
                {rowDragAvailable && (
                  <div ref={rightRowDropIndicatorRef} className="ssg-row-drop-indicator" />
                )}
                </div>
              </div>
            )}

            {/* 追加(13-B3-3): 右固定ペインのドロップインジケータ(縦線)。
                左と同様、空ペイン(pinned-right 0 本)時にも線を出せるよう、常時レンダーされる
                wrapper(sticky;right:0 = absolute 子の containing block)直下へ移しました。
                非空時は leftPx の意味・位置とも従来と不変です。空時は wrapper 原点が
                ビューポート右端のため、controller が leftPx を負値(-inset)にして端の内側へ寄せます。 */}
            <div ref={rightIndicatorRef} className="ssg-col-drop-indicator" style={columnDropIndicatorStyle} />
          </div>

          </div>
          {/* ── /スクロールコンテンツ本体（inner flex row） ── */}

          {/* 追加(12-B): 0 行時の空状態表示です。rows 自体が 0 件か、
              フィルターで 0 件になったかでメッセージを切り替えます。 */}
          {isBodyEmpty && (
            <div
              className={cx('ssg-empty-state', slots.emptyState?.className)}
              style={slots.emptyState?.style}
            >
              {rows.length === 0 ? noRowsText : noMatchingRowsText}
            </div>
          )}
        </div>
        {/* ── /共有スクロールコンテナ ── */}

        {/* 追加(scrollHint): スクロール位置インジケーター(行番号バブル)です。autosize /
            filter overlay と同じくシェルへの絶対配置・pointer-events: none の装飾オーバーレイ。
            「スクロール中か」の活動状態はコンポーネント内部(自前 passive リスナー)が持ち、
            位置・行番号は親の scrollTop / 縦ジオメトリから毎レンダー導出します。 */}
        {activeScrollHint !== null && (
          <GridScrollHint
            slot={slots.scrollHint}
            options={activeScrollHint}
            scrollContainerRef={scrollContainerRef}
            scrollTop={scrollTop}
            viewportHeight={viewportHeight}
            headerHeight={headerHeight}
            physicalBodyHeight={physicalBodyHeight}
            verticalScaleFactor={verticalScaleFactor}
            rowMetrics={rowMetrics}
            rowModel={rowModel}
          />
        )}

        {/* 追加(DS-4 ①-(2)): autosize 計測中の Pending overlay です。
            遅延表示(OVERLAY_DELAY_MS 経過後)・pointer-events: none で操作素通し。 */}
        {isAutosizing && (
          <div className="ssg-autosize-overlay">
            <span className="ssg-autosize-pill">列幅を計算中…</span>
          </div>
        )}

        {/* 追加(F-async): グローバルフィルタ適用中のローディング overlay です。autosize overlay と
            同じ作法(シェルに absolute で重ねる・中央配置・pointer-events:none)で、バーのフロー外に
            z 方向で配置します。これによりトップバーのレイアウト/幅から独立します。
            globalFilterStatus は大規模データ(しきい値超)の時間分割中のみ 'filtering' です。 */}
        {globalFilterStatus === 'filtering' && (
          <div className="ssg-filter-overlay">
            <span
              className="ssg-filter-overlay-chip"
              role="status"
              aria-live="polite"
            >
              <span className="ssg-filter-spinner" aria-hidden="true" />
              <span className="ssg-filter-overlay-text">
                適用中 {Math.round(globalFilterProgress * 100)}%
              </span>
            </span>
          </div>
        )}

        {/* 追加(batch 9): SSRM エラーバー(getRows 失敗の再試行 UI)です。autosize / filter overlay と
            同じくシェルへの絶対配置ですが、下部中央に浮かべ、ボタン操作のため pointer-events は
            生かします(バー自身のみ。行操作は遮りません)。「閉じる」は同一 loadError 参照の間だけ
            有効で、新しい失敗(参照変化)で再表示されます。
            変更(SSRM 書き戻し): 保存失敗バー(writeError)と同時表示できるよう、絶対配置を
            縦積みコンテナ(.ssg-ssrm-error-bars)へ移しました(単独表示の見た目は従来と同一)。 */}
        {isServerSide &&
          ((serverSide.loadError !== null &&
            serverSide.loadError !== dismissedLoadError) ||
            (serverSide.writeError !== null &&
              serverSide.writeError !== dismissedWriteError)) && (
            <div className="ssg-ssrm-error-bars">
              {serverSide.loadError !== null &&
                serverSide.loadError !== dismissedLoadError && (
                  <div
                    className={cx('ssg-ssrm-error-bar', slots.errorBar?.className)}
                    style={slots.errorBar?.style}
                    role="alert"
                  >
                    <span className="ssg-ssrm-error-bar-dot" aria-hidden="true" />
                    <span className="ssg-ssrm-error-bar-msg">
                      行の取得に失敗しました(
                      {serverSide.loadError.failedBlockCount} ブロック)
                    </span>
                    <button
                      type="button"
                      className="ssg-ssrm-error-bar-retry"
                      onClick={serverSide.retryFailedBlocks}
                    >
                      再試行
                    </button>
                    <button
                      type="button"
                      className="ssg-ssrm-error-bar-close"
                      aria-label="エラー通知を閉じる"
                      onClick={() => setDismissedLoadError(serverSide.loadError)}
                    >
                      ×
                    </button>
                  </div>
                )}
              {/* 追加(SSRM 書き戻し): 保存失敗バーです。フック側でロールバック済みのため再試行は
                  提供しません(値は既に元へ戻っている)。「閉じる」は同一 writeError 参照の間だけ
                  有効で、新しい書き戻し失敗(参照変化)で再表示されます。 */}
              {serverSide.writeError !== null &&
                serverSide.writeError !== dismissedWriteError && (
                  <div
                    className={cx('ssg-ssrm-error-bar', slots.errorBar?.className)}
                    style={slots.errorBar?.style}
                    role="alert"
                  >
                    <span className="ssg-ssrm-error-bar-dot" aria-hidden="true" />
                    <span className="ssg-ssrm-error-bar-msg">
                      変更の保存に失敗しました(
                      {serverSide.writeError.failedRowCount} 行)。値を元に戻しました
                    </span>
                    <button
                      type="button"
                      className="ssg-ssrm-error-bar-close"
                      aria-label="保存エラー通知を閉じる"
                      onClick={() => setDismissedWriteError(serverSide.writeError)}
                    >
                      ×
                    </button>
                  </div>
                )}
            </div>
          )}
      </div>

      {resolvedBottomBar}
      {renderedFilterPopover}
      {/* 追加(13-A): 列メニュー popover(列固定の切替 UI)です。*/}
      {renderedColumnMenuPopover}
      {/* 変更(UP-1): 統合ツールパネル(フィルター管理 / 列の表示 / 並び替えのタブ切替)です。*/}
      {renderedToolPanel}
      {/* 追加(バッチ②): セル/行の汎用コンテキストメニュー(完全カスタム)です。*/}
      {renderedCellContextMenuPopover}
    </div>
  );
}