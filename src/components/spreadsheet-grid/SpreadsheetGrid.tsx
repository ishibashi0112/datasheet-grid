// 追加: 列フィルター UI 整備 + ソート/フィルター見た目強化を反映します。
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  // 追加(11-B7): グローバルフィルタ評価の遅延化(Transition 化)に使います。
  useDeferredValue,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';

// 追加(UI CSS移行): 基底スタイル(トークン + @layer ssg-base)を読み込みます。
import './styles.css';
import { cx } from './logic/cx';

import { useVirtualizer } from '@tanstack/react-virtual';

import { gridActions } from './model/gridActions';
import { createInitialGridUiState, gridUiReducer } from './model/gridReducer';
import {
  buildSelectionSnapshot,
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
} from './model/gridSelectors';
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
import { useGridKeyboardInteractions } from './hooks/useGridKeyboardInteractions';
import { useGridPointerInteractions } from './hooks/useGridPointerInteractions';
import { useGridViewportSync } from './hooks/useGridViewportSync';
// 追加(13-B3-2): ヘッダー D&D 列並べ替え controller です。
import { useColumnHeaderDragController } from './hooks/useColumnHeaderDragController';
import {
  // 追加(12-A): set フィルター値の判定 / 構築に使います。
  isSetColumnFilterValue,
  // 追加(記述子化 / number): number 記述子の判定 / 構築に使います。
  isNumberColumnFilterValue,
  buildNumberColumnFilterValue,
  // 追加(記述子化): 現在値表示の text 整形に使います(記述子 → 表示文字列)。
  columnFilterValueToDraftText,
  // 行モデルチェーンは order(Int32Array)ベースに一本化しています
  //   (DS-2 で差し替え、旧オブジェクト配列版は DS-3-8 で削除)。
  createSourceOrder,
  filterOrderByColumns,
} from './logic/filtering';
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
  reorderColumnsByPane,
  splitOrderedColumnsByPane,
  buildPaneWidthsKey,
  buildPaneGeometryFromWidthsKey,
  computePaneColumnExtents,
  computeFullWidthPaneExtents,
  computeSinglePaneColumnExtent,
  // 追加(13-B3-1.5): 列の所属ペイン(pinned 由来)を columnChooserItems へ付与するために使います。
  getColumnPane,
  type GridPaneLayout,
  type PaneColumnEntry,
  type ColumnPane,
  type PaneColumnExtentMap,
} from './logic/geometry';
// 追加(B3): center 列の JS 算出 flex(利用可能幅を比率配分)。
import { isFlexingColumn, computeCenterFlexWidths } from './logic/columnFlex';
// 追加(scroll-space 仮想化): 縦ジオメトリのシーム(uniform window + pixel scaling)です。
//   1M 行で innerRowStyle.height がブラウザ要素高さ上限を超える機能ブロッカーを解消します。
import {
  MAX_BODY_PX,
  AUTO_HEIGHT_MAX_ROWS,
  clipRowRangeToWindow,
  computeAutoHeightVerticalGeometry,
  computeVerticalGeometry,
  createUniformRowMetrics,
  shouldUseAutoHeight,
  // 追加(imperative API #1): 命令的スクロールの論理↔物理換算に使います。
  logicalToPhysicalScrollTop,
  physicalToLogicalScrollTop,
} from './logic/verticalGeometry';
import type { RowMetrics } from './logic/verticalGeometry';
// 追加(imperative API #1): CSV エクスポート / スクロール先算出の純ロジックです。
import { serializeRowsToCsv } from './logic/exportCsv';
import { buildGridExportData } from './logic/exportData';
// 追加(state #1): 列状態 get/apply の純ロジックです(snapshot 組み立て / 外部入力の正規化)。
// 追加(state #2): onStateChange の発火可否判定(decideStateChangeEmit)も同モジュールから読みます。
// 追加(state v2): 列メタ(可視 / 順序 / ピン)の抽出 / 適用(extractColumnState / applyColumnState)。
import {
  buildGridState,
  migrateGridState,
  decideStateChangeEmit,
  extractColumnState,
  applyColumnState,
} from './logic/gridState';
import {
  computeVerticalScrollTarget,
  computeHorizontalScrollTarget,
} from './logic/scrollTargets';
import {
  buildRowHeightStore,
  createAutoHeightRowMetrics,
  rebuildPrefixFrom,
  setMeasuredRowHeight,
} from './logic/rowHeightStore';
import type { RowHeightStore } from './logic/rowHeightStore';
import {
  // ソートは order(Int32Array)版に一本化しています
  //   (DS-2 で差し替え、旧オブジェクト配列版は DS-3-8 で削除)。
  sortOrder,
  nextSortEntries,
  // 追加(MS-3-1): 並び替え管理パネルの明示編集用の純関数群です。
  addSortEntry,
  setSortEntryDirection,
  setSortEntryColumn,
  removeSortEntryAt,
  // 追加(MS-3-2): 優先順位 DnD の配列 move 純関数です。
  moveSortEntry,
} from './logic/sorting';
// 追加(DS-4 ①-(2)): 列幅自動調整を時間分割(async・単一経路)で実行するランナーです。
//   計測ロジック本体(logic/columnAutosize)はランナー内部で使うため、ここでの直 import は不要です。
import useColumnAutosizeRunner from './hooks/useColumnAutosizeRunner';
// 追加(DS-4 #1): select / set 候補を「通常規模=同期 / 大規模=時間分割の非同期」で収集します。
import useColumnSelectOptionsCollector from './hooks/useColumnSelectOptionsCollector';
// 追加(F-async): グローバルフィルタの時間分割(非ブロック)適用フックです。
import { useGlobalFilteredOrder } from './hooks/useGlobalFilteredOrder';
// 追加(①-3): serverSide(SSRM)の RowModel を供給するフックです(dataSource 指定時に使用)。
import { useServerSideRowModel } from './hooks/useServerSideRowModel';
// 追加(stage ②): serverSide query の構築 / queryKey 直列化(純ロジック)です。
import {
  buildServerSideQuery,
  serializeServerSideQuery,
} from './logic/serverSideQuery';
import type {
  CellCoord,
  CellRenderState,
  GridColumn,
  // 追加(13-A): 列メニューからの固定切替に使います。
  GridColumnPinned,
  // 追加(C1): auto-height 実測キャッシュのキー型です。
  GridRowKey,
  // 追加(DS-3-0): 行モデルのシーム契約型です(rowModel の構築に使います)。
  RowModel,
  // 追加(記述子化): commit 経路で text/date/select/custom を記述子化する際の型です。
  ColumnFilterValue,
  // 追加(12-A): set フィルター値の構築に使います。
  SetColumnFilterValue,
  // 追加(①-3 / stage ②): serverSide query 用の型です。
  ServerSideQuery,
  // 追加(stage ②): serverSide query の sort 既定値の型です。
  GridSortState,
  // 追加(imperative API #1): ref ハンドルと関連型です。
  GridUiState,
  SpreadsheetGridHandle,
  CsvExportOptions,
  // 追加(imperative API: getExportData): scope 解決と整形済みデータ型に使います。
  CsvExportScope,
  GridExportOptions,
  GridExportData,
  ScrollAlign,
  SpreadsheetGridProps,
  // 追加(state #2): onStateChange の lastEmitted 保持 / snapshot 型に使います。
  GridState,
} from './model/gridTypes';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import ColumnFilterPopover, {
  // 追加(反転set): set 選択状態 { mode, values } 型と mode 判定ヘルパです。
  type ColumnFilterSetSelection,
  isSetValueSelected,
} from './view/ColumnFilterPopover';
// 追加(13-A): 列メニュー popover(列固定の切替 UI)です。
import DefaultGridBottomBar from './view/DefaultGridBottomBar';
import DefaultGridTopBar from './view/DefaultGridTopBar';
import { resolveGridSlot } from './view/gridBarHelpers';
import GridBodyLayer from './view/GridBodyLayer';
import GridHeaderRow from './view/GridHeaderRow';
import useColumnMenuController from './hooks/useColumnMenuController';
import ColumnMenuPopover from './view/ColumnMenuPopover';
// 追加(13-B2-1): 列の表示/非表示パネル(AG Grid の Choose Columns 相当)です。
import useColumnChooserController from './hooks/useColumnChooserController';
import ColumnChooserPanel, { type ColumnChooserItem } from './view/ColumnChooserPanel';
// 追加(MS-3-1): 並び替え管理パネル(Excel の「並べ替え」ダイアログ相当)です。
import useSortManagementController from './hooks/useSortManagementController';
import SortManagementPanel, {
  type SortManagementColumn,
} from './view/SortManagementPanel';
// import ColumnChooserPanel, {
//   type ColumnChooserItem,
// } from './view/ColumnChooserPanel';

// 追加(反転set): 小さい側の集合に 1 件 / 複数件を加減する純ヘルパです(巨大側は作りません)。
const setWith = (base: ReadonlySet<string>, value: string): Set<string> => {
  const next = new Set(base);
  next.add(value);
  return next;
};
const setWithout = (base: ReadonlySet<string>, value: string): Set<string> => {
  const next = new Set(base);
  next.delete(value);
  return next;
};
const setUnion = (base: ReadonlySet<string>, add: string[]): Set<string> => {
  const next = new Set(base);
  for (const value of add) {
    next.add(value);
  }
  return next;
};
const setDifference = (
  base: ReadonlySet<string>,
  remove: string[],
): Set<string> => {
  const next = new Set(base);
  for (const value of remove) {
    next.delete(value);
  }
  return next;
};

// 追加(①-3): rows 未指定(serverSide 等)時の安定既定値です。参照同一を保ち、order パイプ
//   ライン / rowModel など既存 memo を不要に揺らさないよう module スコープで 1 つだけ持ちます。
//   never[] は任意の T[] に代入可能で、destructure 既定値として rows の型を T[] に保ちます。
const EMPTY_ROWS: never[] = [];

// 追加(stage ②): serverSide query 構築/debounce 用の安定既定値・定数です。
//   clientSide では query を空に保ち(フックは inert)、参照同一で memo/effect を不要に揺らしません。
const EMPTY_SERVER_QUERY: ServerSideQuery = {};
const EMPTY_COLUMN_FILTERS: Record<string, ColumnFilterValue> = {};
const EMPTY_SORT: GridSortState = [];
// 追加(B3): flex 非適用時(未計測 / flex 列なし)に返す共有の空 map です。参照同一性で
//   「flex 素通し(= effectiveColumnWidths は uiState.columnWidths そのまま)」を判定します。
const EMPTY_FLEX_WIDTHS: Record<string, number> = {};
// 追加(#2): リサイズハンドルのダブルクリック判定しきい値です。native dblclick は pointerdown の
//   preventDefault でブラウザ差により抑止されることがあるため、時刻 + 位置で自前判定します
//   (native と同じ「短時間 + 近接位置」の 2 条件)。位置チェックは「リサイズ直後の再ドラッグ」を
//   ダブルクリックと誤検知しないために必要です(リサイズで境界が動けば位置差で弾けます)。
const RESIZE_HANDLE_DOUBLE_CLICK_MS = 300;
const RESIZE_HANDLE_DOUBLE_CLICK_DIST = 4;
// query(filter/sort)変更をサーバへ送る前の debounce(ms)です。入力欄の即時反映とは別系統で、
//   キーストロークごとの再フェッチ(block 0 取り直し)を合体します。フック内の 120ms(レンジ要求
//   debounce)とは役割が異なり併存します。
const SERVER_SIDE_QUERY_DEBOUNCE_MS = 300;

// 追加: Grid 本体です。
export function SpreadsheetGrid<T extends object>({
  // 変更(①-3): rows に安定既定値(EMPTY_ROWS)を当てます。rows が optional でも全 consumer は
  //   従来どおり T[] を見ます(serverSide 時は dataSource を使い rows は空のまま)。
  rows = EMPTY_ROWS,
  // 追加(①-3): serverSide データ供給口。指定時に serverSide モードへ分岐します(rows と排他)。
  dataSource,
  // 追加(stage ③): serverSide ソフトリフレッシュ用トークン。値を増やすと query 不変のまま
  //   キャッシュ破棄+可視レンジ取り直し(スクロール保持)。フックへ refreshToken として渡します。
  serverSideRefreshToken,
  columns,
  onRowsChange,
  onColumnsChange,
  rowKeyGetter,
  createRow,
  createOverflowColumn,
  rowHeight = 36,
  autoHeight = false,
  estimateRowHeight,
  headerHeight = 40,
  rowHeaderWidth = 56,
  // 追加: スクロールコンテナ高さの外部制御。height で明示高さ('100%'=親追従)、maxHeight で上限。
  //   両者未指定時は CSS 既定(.ssg-scroll-container max-height:480px)に委ねます。
  height,
  maxHeight,
  readOnly = false,
  canEditCell,
  enableRangeSelection = true,
  enableGlobalFilter = true,
  enableColumnFilter = true,
  enableSorting = true,
  // 追加(①): 列リサイズのグリッド既定(既定 true=現行挙動)。列の resizable で個別上書き可。
  enableColumnResize = true,
  // 追加(UI hover): 行ホバー(既定 true) / 列ヘッダーホバー(既定 true)。
  enableRowHover = true,
  enableColumnHeaderHover = true,
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
  // 追加: 各バーの Rows / Columns 件数 chips セットの表示有無です(既定 true)。
  //   トップは showTopBarSummary=true のとき内側で効き、ボトムは左側の件数グループを制御します。
  showTopBarCounts = true,
  showBottomBarCounts = true,
  renderTopBar,
  renderBottomBar,
  className,
  // 追加(UI CSS移行): パーツ別の追加 className スロット。
  classNames,
  // 追加(UI CSS移行): 行ごとの条件付き className。
  getRowClassName,
  // 追加(imperative API #1): React 19 の ref-as-prop。命令的ハンドルを受け取ります。
  ref,
  // 追加(state #2): 永続スライス変化の通知口(保存タイミング signal)。発火規約は型定義のコメント参照。
  onStateChange,
}: SpreadsheetGridProps<T>) {
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
  const [isCornerHovered, setIsCornerHovered] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(
    null,
  );

  // ── columns ───────────────────────────────────────────
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible !== false),
    [columns],
  );

  // 追加(10-B): pinned 属性に応じて列を視覚順序（left → center → right）に並べ替えます。
  //             pinned 列がない現時点では visibleColumns と同じ順序になります。
  const orderedColumns = useMemo(
    () => reorderColumnsByPane(visibleColumns),
    [visibleColumns],
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

  // ── reducer ───────────────────────────────────────────
  const [uiState, dispatch] = useReducer(
    gridUiReducer,
    visibleColumns,
    createInitialGridUiState,
  );

  // 追加(11-B5): columnWidths の latest-ref です（dragStateRef と同じパターン）。
  // 変更理由: handleColumnResizePointerDown が uiState.columnWidths を依存に持つと、
  //           ライブリサイズ中（columnWidths が毎 pointermove で参照更新）に
  //           ハンドラ参照も毎フレーム変わり、GridHeaderRow(memo) の props 比較が
  //           3 ペインすべてで不一致になります。pointerdown 時点の「現在幅」さえ
  //           読めれば十分なので、ref 経由の読み出しに置き換えて依存から外します。
  // 変更(B3): 指す対象を uiState.columnWidths → effectiveColumnWidths(flex 解決済み)へ変更します。
  //           flex 列のリサイズ開始幅(handleColumnResizePointerDown)や pin/表示/並べ替え時の
  //           幅書き戻しが「現在レンダリングされている幅(= flex 算出幅)」を拾えるようにするためです。
  //           実際の代入は effectiveColumnWidths を算出した後(下の flex 算出ブロック末尾)で行います。
  const columnWidthsRef = useRef(uiState.columnWidths);

  // 追加(#2): リサイズハンドルの直近 pointerdown(ダブルクリック autoSize 判定用)。
  //   key / 時刻 / clientX を保持し、次の pointerdown が短時間・近接位置なら「内容幅へ autoSize」。
  const lastResizeHandleDownRef = useRef<{
    key: string;
    time: number;
    x: number;
  } | null>(null);

  // 追加(13-B2-2): 列リセット用の「初期 column defs スナップショット」です。
  // 設計メモ(スナップショット保持の方針 = (A) 内部 ref / 自己完結):
  //   - 初回マウント時の columns から key ごとの {width, pinned, visible} を退避します。
  //     遅延初期化(current が null のときだけ構築)なので構築は一度きりで、以後は
  //     columns prop が変わっても更新しません(= ユーザー操作後の状態を「初期」と
  //     誤認しないため)。リセットはここに退避した値へ戻します。
  //   - 明示 API(initialColumns prop / onResetColumns)による consumer 制御リセット
  //     (方針 (B))は、将来必要になればこの ref を prop 優先へ差し替えるだけで載せ替え
  //     可能です。現時点では追加 props を増やさず自己完結を優先します。
  //   - StrictMode の二重 invoke / 二重 mount では columns がいずれも初期値のため、
  //     退避内容は同一になります(再 mount 時は再構築されますが結果は不変)。
  //   - マウント後に追加された列(createOverflowColumn)は本スナップショットに存在せず、
  //     リセット対象外になります(handleColumnChooserReset 側で対象外扱い)。
  const initialColumnStateRef = useRef<Map<
    string,
    { width: number; pinned: GridColumn<T>['pinned']; visible: boolean | undefined }
  > | null>(null);
  if (initialColumnStateRef.current === null) {
    initialColumnStateRef.current = new Map(
      columns.map((column) => [
        column.key,
        { width: column.width, pinned: column.pinned, visible: column.visible },
      ]),
    );
  }

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
  const paneSourceColumns = useMemo(
    () => splitOrderedColumnsByPane(orderedColumns),
    [orderedColumns],
  );

  // ── center 列の JS 算出 flex(B3) ───────────────────────
  // 追加(B3): flex 列(center かつ flex>0)へ「利用可能幅 − 固定列合計」を比率配分します。
  //   利用可能幅 = スクロールコンテナ可視幅 − 左固定ペイン幅 − 右固定ペイン幅 − center 先頭幅。
  //   左右ペインは pinned(= flex 非対象)なので center 列幅に依存せず先に確定でき、循環しません。
  //   ここでの固定ペイン幅は下流(§3ペイン派生値)の leftPaneTotalWidth 等と同値です
  //   (左右ペインは columnWidths のみで解決され flex を含まないため)。
  //
  // viewportWidth: スクロールコンテナの clientWidth です。0 は未計測(初回レンダー前)を表し、その間は
  //   flex を適用せず column.width にフォールバックします(計測は縦窓出しと同じ ResizeObserver に
  //   相乗り。下の「縦スクロール計測」参照)。
  const [viewportWidth, setViewportWidth] = useState(0);

  // 左右固定ペインの「解決済み幅合計」です(flex 非対象なので uiState.columnWidths で解決)。
  const leftPaneFixedWidth = paneSourceColumns.left.reduce(
    (acc, { column }) => acc + (uiState.columnWidths[column.key] ?? column.width),
    0,
  );
  const rightPaneFixedWidth = paneSourceColumns.right.reduce(
    (acc, { column }) => acc + (uiState.columnWidths[column.key] ?? column.width),
    0,
  );
  // 左固定列があれば行ヘッダーは左ペインが内包し、center 先頭幅は 0 になります(§3ペイン派生値と同判定)。
  const hasLeftPinnedForFlex = paneSourceColumns.left.length > 0;
  const flexLeftPaneTotalWidth = hasLeftPinnedForFlex
    ? rowHeaderWidth + leftPaneFixedWidth
    : 0;
  const flexCenterLeadingWidth = hasLeftPinnedForFlex ? 0 : rowHeaderWidth;

  // center 列(列のみ)と flex 列の有無です。flex 列が 1 本も無ければ flex 算出を完全にスキップします
  //   (= 既存挙動・ゼロオーバーヘッド)。
  const centerColumnsForFlex = useMemo(
    () => paneSourceColumns.center.map(({ column }) => column),
    [paneSourceColumns.center],
  );
  const hasFlexColumn = useMemo(
    () => centerColumnsForFlex.some(isFlexingColumn),
    [centerColumnsForFlex],
  );

  // 利用可能幅(center 列が使える幅)です。
  const availableCenterFlexWidth =
    viewportWidth -
    flexLeftPaneTotalWidth -
    rightPaneFixedWidth -
    flexCenterLeadingWidth;

  // flex 解決幅 map(flex 列のキーのみ)。未計測 / flex 列なしのときは共有の空 map(参照不変)です。
  const centerFlexWidths = useMemo(() => {
    if (!hasFlexColumn || viewportWidth <= 0) {
      return EMPTY_FLEX_WIDTHS;
    }
    return computeCenterFlexWidths(
      centerColumnsForFlex,
      uiState.columnWidths,
      availableCenterFlexWidth,
    );
  }, [
    hasFlexColumn,
    viewportWidth,
    centerColumnsForFlex,
    uiState.columnWidths,
    availableCenterFlexWidth,
  ]);

  // 既存の columnWidths 解決の前段に flex を挟みます:
  //   columnWidths[key] ?? flex算出[key] ?? column.width。
  //   columnWidths が常に優先されるため、手動リサイズした列は固定になります。
  //   flex 列が無いときは uiState.columnWidths をそのまま使い、参照を不変に保ちます。
  const effectiveColumnWidths = useMemo(
    () =>
      centerFlexWidths === EMPTY_FLEX_WIDTHS
        ? uiState.columnWidths
        : { ...centerFlexWidths, ...uiState.columnWidths },
    [centerFlexWidths, uiState.columnWidths],
  );

  // 変更(B3): latest-ref を effectiveColumnWidths(flex 解決済み)へ更新します(宣言は上、代入はここ)。
  columnWidthsRef.current = effectiveColumnWidths;

  // 追加(11-B4): ペインごとの「解決済み幅 join キー」です。
  //             毎 render 計算しますが、列数ぶんの lookup + join のみで軽量です。
  //             columnWidths の参照が変わっても、そのペインの幅が実際に変わらない限り
  //             同一文字列になるため、下の useMemo の依存値として機能します。
  const leftPaneWidthsKey = buildPaneWidthsKey(
    paneSourceColumns.left,
    uiState.columnWidths,
  );
  // 変更(B3): center は flex 解決済み(effectiveColumnWidths)で幅キーを作ります
  //   (left/right は flex 非対象なので uiState.columnWidths のまま)。
  const centerPaneWidthsKey = buildPaneWidthsKey(
    paneSourceColumns.center,
    effectiveColumnWidths,
  );
  const rightPaneWidthsKey = buildPaneWidthsKey(
    paneSourceColumns.right,
    uiState.columnWidths,
  );

  // 追加(11-B4): ペイン別 geometry です。依存は「列ソース + 幅キー」のみ。
  //             幅キー文字列から解決済み幅を復元するため、columnWidths 本体には依存しません。
  const leftPaneGeometry = useMemo(
    () =>
      buildPaneGeometryFromWidthsKey(
        'left',
        paneSourceColumns.left,
        leftPaneWidthsKey,
      ),
    [paneSourceColumns.left, leftPaneWidthsKey],
  );

  const centerPaneGeometry = useMemo(
    () =>
      buildPaneGeometryFromWidthsKey(
        'center',
        paneSourceColumns.center,
        centerPaneWidthsKey,
      ),
    [paneSourceColumns.center, centerPaneWidthsKey],
  );

  const rightPaneGeometry = useMemo(
    () =>
      buildPaneGeometryFromWidthsKey(
        'right',
        paneSourceColumns.right,
        rightPaneWidthsKey,
      ),
    [paneSourceColumns.right, rightPaneWidthsKey],
  );

  // 変更(11-B4): 下流互換のため paneLayout 合成オブジェクトは維持します。
  //             合成オブジェクト自体の参照はいずれかのペイン変更で変わりますが、
  //             paneLayout.left.entries 等の「ペイン単位の参照」は当該ペインの
  //             幅・列構成が変わらない限り不変です（これが 11-B4 の狙いです）。
  const paneLayout = useMemo<GridPaneLayout<T>>(
    () => ({
      left: leftPaneGeometry,
      center: centerPaneGeometry,
      right: rightPaneGeometry,
    }),
    [leftPaneGeometry, centerPaneGeometry, rightPaneGeometry],
  );

  // 追加(10-C): 左／右固定ペインが存在するか（= 固定列があるか）です。
  const hasLeftPane = paneLayout.left.entries.length > 0;
  const hasRightPane = paneLayout.right.entries.length > 0;

  // 追加(10-C): 行ヘッダー（#・行番号）を持つペインです。
  //             左固定列があれば左ペイン、無ければ従来どおり中央ペインが持ちます。
  //             これにより固定列なしのときは見た目・挙動が従来と完全に一致します。
  const centerOwnsRowHeader = !hasLeftPane;

  // 追加(10-C): 各ペインで列の前に確保する先頭幅です。
  //             行ヘッダーを持つペインは rowHeaderWidth、それ以外は 0 になります。
  const leftLeadingWidth = rowHeaderWidth; // 左ペインは行ヘッダーを内包します
  const centerLeadingWidth = centerOwnsRowHeader ? rowHeaderWidth : 0;
  const rightLeadingWidth = 0;

  // 追加(10-B→10-C): 左固定ペインの合計幅です（row header + left-pinned 列）。
  //             pinned 列がなければ 0 でペインは非表示になります。
  const leftPaneTotalWidth = hasLeftPane
    ? leftLeadingWidth + paneLayout.left.totalWidth
    : 0;

  // 追加(10-B): 右固定ペインの合計幅です。
  const rightPaneTotalWidth = paneLayout.right.totalWidth;

  // 追加(10-C): 中央ペインの内側コンテンツ幅です。
  //             固定列なしのときは rowHeaderWidth + totalColumnWidth となり従来と同一です。
  const centerContentWidth = centerLeadingWidth + paneLayout.center.totalWidth;

  // 追加(10-G): 共有スクロールコンテナの内側コンテンツ全幅です。
  //             = 左固定ペイン幅 + 中央ペイン幅 + 右固定ペイン幅。
  //             横スクロール範囲・scroll clamp・active cell 可視化に使います。
  const totalScrollWidth =
    leftPaneTotalWidth + centerContentWidth + rightPaneTotalWidth;

  // ── filter popover ────────────────────────────────────
  const {
    filterPopoverState,
    filterPopoverLayout,
    filterPopoverRef,
    filterTextInputRef,
    filterSelectRef,
    isFilterPopoverOpen,
    openedFilterColumn,
    openColumnFilterPopover,
    closeColumnFilterPopover,
    updateFilterPopoverDraft,
  } = useFilterPopoverController({
    visibleColumns,
    columnFilterValues: uiState.filters.columnFilters,
    enableColumnFilter: columnFilterEnabled,
    gridRootRef,
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
    openColumnMenuFromContextMenu,
    closeColumnMenu,
  } = useColumnMenuController({
    visibleColumns,
    enableColumnMenu,
    gridRootRef,
  });

  // ── column chooser(13-B2-1) ──────────────────────────
  // 追加(13-B2-1): 列の表示/非表示パネルの controller です。列メニューの項目
  //             「列の表示」から開きます(その際メニューは閉じます)。
  //             相互排他は各 controller の outside-pointerdown close が自然に担います。
  const {
    isColumnChooserOpen,
    columnChooserLayout,
    columnChooserRef,
    openColumnChooser,
    closeColumnChooser,
  } = useColumnChooserController({
    enableColumnMenu,
    gridRootRef,
  });

  // ── sort management(MS-3-1) ──────────────────────────
  // 追加(MS-3-1): 並び替え管理パネルの controller です。列メニューの項目
  //             「並び替えを管理…」から開きます(その際メニューは閉じます)。
  //             相互排他は各 controller の outside-pointerdown close が自然に担います。
  const {
    isSortManagerOpen,
    sortManagerLayout,
    sortManagerRef,
    openSortManager,
    closeSortManager,
  } = useSortManagementController({
    enableSorting: sortingEnabled,
    gridRootRef,
  });

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
  }, [visibleColumns]);

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
  const baseOrder = useMemo(() => createSourceOrder(rows.length), [rows.length]);

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

  // 追加(B-2): number 記述子が当たっている可視列の「集合シグネチャ」です。
  //   値編集(>50 → >500 等)では同一列のままなので signature 不変 → 下の numericFilterKeys を保持し、
  //   Float64 key をフィルタ値編集をまたいで再利用します(B-2 の本旨)。number の ON/OFF(列の出入り)
  //   でだけ signature が変わり key を作り直します。NUL 区切りは列キーへの混入が実質ありえないため。
  const numberFilteredColumnSignature = useMemo(() => {
    const keys: string[] = [];
    for (const column of visibleColumns) {
      if (isNumberColumnFilterValue(deferredColumnFilters[column.key])) {
        keys.push(column.key);
      }
    }
    return keys.join('\u0000');
  }, [visibleColumns, deferredColumnFilters]);

  // 追加(B-2): number(comparison/range)用に、列ごとの Number(セル値) を rows 全長・
  //   sourceIndex 添字の Float64Array へ前計算したキャッシュです。
  //   - 構築は signature に載った列ぶんだけ(number 未使用なら空 Map ＝実質ゼロコスト)。
  //   - deps は [rows, visibleColumns, signature]。値編集では signature 不変のため参照を保ち、
  //     毎キーストロークの再 coercion を回避します(rows identity 変化＝編集時のみ全長再構築)。
  //   - 対象列は signature を split して特定するため、deferredColumnFilters を deps から外せます
  //     (signature は同一 render で deferredColumnFilters から導出済み＝stale 読みなし)。
  //   compileSingleColumnFilter は key があれば key[sourceIndex] を、無ければ
  //   Number(getCellValue(...)) を使うため、空 Map のときは現状とバイト等価です。
  const numericFilterKeys = useMemo(() => {
    const keyMap = new Map<string, Float64Array>();
    if (numberFilteredColumnSignature.length === 0) {
      return keyMap;
    }
    const targetKeys = new Set(numberFilteredColumnSignature.split('\u0000'));
    const rowCount = rows.length;
    for (const column of visibleColumns) {
      if (!targetKeys.has(column.key)) {
        continue;
      }
      const keys = new Float64Array(rowCount);
      for (let i = 0; i < rowCount; i += 1) {
        keys[i] = Number(getCellValue(rows[i], column));
      }
      keyMap.set(column.key, keys);
    }
    return keyMap;
  }, [rows, visibleColumns, numberFilteredColumnSignature]);

  const columnFilteredOrder = useMemo(
    () =>
      filterOrderByColumns(
        rows,
        globalFilteredOrder,
        visibleColumns,
        deferredColumnFilters,
        numericFilterKeys,
      ),
    [
      rows,
      globalFilteredOrder,
      visibleColumns,
      deferredColumnFilters,
      numericFilterKeys,
    ],
  );

  const order = useMemo(
    () => sortOrder(rows, columnFilteredOrder, visibleColumns, uiState.sort),
    [rows, columnFilteredOrder, visibleColumns, uiState.sort],
  );

  // ── row model seam (DS-3-0) ───────────────────────────
  // 変更(DS-3-0): order(Int32Array)を直接触る consumer を、この rowModel 越しの参照へ
  //   段階移行します(DS-3 で 1 consumer = 1 コミット)。本バッチでは GridBodyLayer が
  //   getRow / getRowKey を読みます(getRowCount = virtualizer 移行 / getSourceIndex =
  //   edit 移行で後続 consumer が読むため、シーム契約として 4 メソッドを今まとめて確定します)。
  //   deps は order / rows / resolvedRowKeyGetter のみ。no-op dispatch(selection 等)では
  //   order 参照が不変(DS-2)のため rowModel 参照も不変に保たれ、将来 memo 化される consumer の
  //   props 安定(11-A 系)を壊しません。
  //   viewIndex は表示上の行 index、getSourceIndex の返り値(= order[viewIndex])は元 rows の
  //   index です。getRow / getRowKey は内部でこの対応付け rows[order[viewIndex]] を使います。
  const clientSideRowModel = useMemo<RowModel<T>>(
    () => ({
      getRowCount: () => order.length,
      getRow: (viewIndex) => rows[order[viewIndex]],
      getSourceIndex: (viewIndex) => order[viewIndex],
      getRowKey: (viewIndex) =>
        resolvedRowKeyGetter(rows[order[viewIndex]], order[viewIndex]),
    }),
    [order, rows, resolvedRowKeyGetter],
  );

  // ── serverSide query 配線(stage ②) ───────────────────
  // clientSide の UI 状態(sort / 列フィルター / グローバルフィルター)から ServerSideQuery を組み立て、
  //   安定 queryKey を導出します。clientSide(isServerSide=false)では空 query 固定です(フックは inert の
  //   ため値は無視されますが、debounce effect を不発にして無駄な再描画を避けます)。
  //   入力欄の value は従来どおり即時 uiState を参照するため、タイピングは即時反映されます。ここで作る
  //   live 値はそのまま渡さず、下で debounce してからフックへ供給します(サーバ送出の合体)。
  const liveServerSideQuery = useMemo<ServerSideQuery>(
    () =>
      isServerSide
        ? buildServerSideQuery({
            globalText: globalFilterEnabled ? globalFilterText : '',
            columnFilters: columnFilterEnabled
              ? columnFilters
              : EMPTY_COLUMN_FILTERS,
            sort: sortingEnabled ? uiState.sort : EMPTY_SORT,
          })
        : EMPTY_SERVER_QUERY,
    [
      isServerSide,
      globalFilterEnabled,
      globalFilterText,
      columnFilterEnabled,
      columnFilters,
      sortingEnabled,
      uiState.sort,
    ],
  );
  const liveServerSideQueryKey = useMemo(
    () => (isServerSide ? serializeServerSideQuery(liveServerSideQuery) : ''),
    [isServerSide, liveServerSideQuery],
  );

  // debounce 済みの query / queryKey です(これをフックへ渡します)。live が変化しても
  //   SERVER_SIDE_QUERY_DEBOUNCE_MS の静止後に一度だけ反映し、キーストロークごとのキャッシュ破棄+
  //   block 0 取り直しを抑止します。初期値は live の初回値で seed し、mount 時のフック queryKey と
  //   一致させて初回 debounce 後の余計な再設定を避けます。
  const [serverSideQuery, setServerSideQuery] =
    useState<ServerSideQuery>(liveServerSideQuery);
  const [serverSideQueryKey, setServerSideQueryKey] = useState<string>(
    liveServerSideQueryKey,
  );

  useEffect(() => {
    // clientSide では反映しません(live は空のまま)。serverSide 時のみ debounce 反映します。
    if (!isServerSide) {
      return;
    }
    const timer = setTimeout(() => {
      // setState は timer コールバック内(非同期)のため set-state-in-effect には該当しません。
      setServerSideQuery(liveServerSideQuery);
      setServerSideQueryKey(liveServerSideQueryKey);
    }, SERVER_SIDE_QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isServerSide, liveServerSideQueryKey, liveServerSideQuery]);

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
  });
  // 可視レンジ通知に使う stable 参照(useCallback)だけを抜き出します。serverSide オブジェクト
  //   自体は毎 render 生成のため、effect 依存にはこの requestRange のみを使います。
  const requestServerSideRange = serverSide.requestRange;
  // 以降の全 consumer(rowModelRef / viewRowCount / keyboard / edit / clipboard / body /
  //   rowHeightStore)はこの rowModel シーム越しで透過に動きます。
  const rowModel = isServerSide ? serverSide.rowModel : clientSideRowModel;

  // 追加(DS-4 ①-(2)): 最新 rowModel を指す latest-ref です。autosize ランナーが run 開始時に
  //   キャプチャし、実行中に参照が変わった(= order/rows 変化)ら計測を中断するために使います。
  const rowModelRef = useRef(rowModel);
  rowModelRef.current = rowModel;

  // 追加(DS-4 ①-(2)): autosize 計測を「単一経路の時間分割(async)」で実行するランナーです。
  //   overlay は遅延表示で、重い時だけ Pending を出し、メインスレッドを塞ぎません
  //   (小規模は overlay 発火前に完了し、体感は従来の同期計測と同一です)。
  const { isAutosizing, runAutosize } = useColumnAutosizeRunner<T>({
    rowModelRef,
    gridRootRef,
    columnWidthsRef,
    dispatch,
  });

  // 追加(DS-3-6): ビュー行数の単一ソースを seam(getRowCount)経由へ移します。
  //   値は order.length(= 旧 filteredRows.length)で常に等価。プリミティブ number のため
  //   deps では値比較され、no-op dispatch(order 不変)では同値となり、これを依存に持つ
  //   memo/callback の参照を維持します(11-A 系の参照安定方針に整合)。rowModel を直接 deps に
  //   入れる方式と違い、resolvedRowKeyGetter 変化(order/rows 不変)では再評価されません
  //   (行数は order.length のみに依存するため)。DS-3-1 keyboard / DS-3-3 clipboard と同型です。
  const viewRowCount = rowModel.getRowCount();

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
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    // 追加(B3): center 列 flex の利用可能幅算出に使う可視幅も同じ effect で計測します。
    setViewportWidth(el.clientWidth);
    const handleScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', handleScroll, { passive: true });
    // viewport サイズ変化(リサイズ/レイアウト変動)で窓・倍率・flex 配分を再計算するためです。
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
      // 追加(B3): 幅変化で flex を再配分します。
      setViewportWidth(el.clientWidth);
    });
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  // 変更(10-C): 列の仮想化は「中央ペインの列エントリ」に対して行います。
  // 変更理由: 固定列は中央スクロール対象外。中央ペインの水平スクロール範囲＝
  //           center.totalWidth に合わせ、virtual item の index は
  //           centerEntries 上の index になります。
  //           固定列なしのときは centerEntries が visibleColumns と同順・同座標のため、
  //           従来の列仮想化と完全に一致します。
  const centerEntries = paneLayout.center.entries;

  const columnVirtualizer = useVirtualizer({
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

  // ── auto-height gate / 行高ストア(C1) ───────────
  // 未測定行の推定高さ。未指定時は rowHeight。
  const estimateRowHeightValue = estimateRowHeight ?? rowHeight;
  // 駆動列(autoHeight:true)の有無。
  const hasAutoHeightColumn = useMemo(
    () => visibleColumns.some((column) => column.autoHeight === true),
    [visibleColumns],
  );
  // gate: props 有効 + 駆動列あり + 行数が上限内。超過時は uniform 行高へフォールバックします。
  // 変更(①-3): serverSide(dataSource)では auto-height を常に無効化します。未ロード行の高さが
  //   不明で prefix-sum を構築できないため、uniform 行高に固定します(下の effect で開発時警告)。
  const autoHeightActive =
    !isServerSide &&
    shouldUseAutoHeight(
      autoHeight,
      hasAutoHeightColumn,
      viewRowCount,
      AUTO_HEIGHT_MAX_ROWS,
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

  // 実測高さの永続キャッシュ(rowKey 単位)。store を作り直しても引き継ぎます
  //   (filter/sort で view 順が変わっても再測定不要)。
  const measuredHeightsRef = useRef<Map<GridRowKey, number>>(new Map());
  // 測定 flush で store の prefix が更新されたことを伝える version(geometry/rowMetrics 再計算用)。
  const [autoHeightVersion, setAutoHeightVersion] = useState(0);
  // ResizeObserver(内容変化=編集等)による再測定トリガー。
  const [autoHeightMeasureNonce, setAutoHeightMeasureNonce] = useState(0);
  // 内容変化監視の永続 ResizeObserver と現在の観測セル集合。描画窓更新ごとに作り直さず、
  //   窓差分(新規セルのみ observe / 消失セルのみ unobserve)だけを反映するために ref 保持します。
  const measureObserverRef = useRef<ResizeObserver | null>(null);
  const observedCellsRef = useRef<Set<HTMLElement>>(new Set());

  // 行高ストア。order(view 順)/ 行数 / estimate が変わったときだけ作り直します(rowModel は
  //   order 変化で identity が変わるため、これを依存に持てば reorder で再構築されます)。
  //   autoHeight 無効時は null(uniform 経路)。
  const rowHeightStore = useMemo<RowHeightStore | null>(
    () =>
      autoHeightActive
        ? buildRowHeightStore(
            viewRowCount,
            estimateRowHeightValue,
            rowModel.getRowKey,
            measuredHeightsRef.current,
          )
        : null,
    [autoHeightActive, viewRowCount, estimateRowHeightValue, rowModel],
  );

  // 行メトリクス(スクロール非依存)。auto-height では prefix-sum 版、uniform では従来版。
  //   overlay(active cell / selection)の top/height とヒットテストの行解決が共有します。
  //   autoHeightVersion: 測定 flush で store.prefix が変わったら作り直します(store は in-place 更新)。
  const rowMetrics: RowMetrics = useMemo(
    () =>
      autoHeightActive && rowHeightStore
        ? createAutoHeightRowMetrics(rowHeightStore)
        : createUniformRowMetrics(viewRowCount, rowHeight),
    // autoHeightVersion は測定 flush(store の in-place prefix 更新)後に再計算させるための
    //   意図的なトリガー依存です(body では直接参照しないため exhaustive-deps を抑止)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoHeightActive, rowHeightStore, autoHeightVersion, viewRowCount, rowHeight],
  );

  // 縦ジオメトリ。auto-height は prefix-sum 版(sf=1 / offset=0 / translateY=0)、uniform は従来版。
  //   uniform 経路は rowMetrics 非依存で従来と数値一致します。
  const verticalGeometry = useMemo(
    () =>
      autoHeightActive
        ? computeAutoHeightVerticalGeometry(
            { headerHeight, viewportHeight, scrollTop, overscan: 20 },
            rowMetrics,
          )
        : computeVerticalGeometry({
            rowCount: viewRowCount,
            rowHeight,
            headerHeight,
            viewportHeight,
            scrollTop,
            // 旧 rowVirtualizer overscan=20 を踏襲します。
            overscan: 20,
            maxBodyPx: MAX_BODY_PX,
          }),
    [
      autoHeightActive,
      rowMetrics,
      viewRowCount,
      rowHeight,
      headerHeight,
      viewportHeight,
      scrollTop,
    ],
  );
  const virtualRows = verticalGeometry.rows;
  const virtualRowIndexes = verticalGeometry.rowIndexSet;
  // 描画窓の先頭/末尾行 index(可視帯クリップ用)。virtualRows は computeVerticalGeometry が返す
  //   [start, end) の窓で、overscan を含み viewport より広い。選択オーバーレイの縦範囲をこの窓へ
  //   クリップして巨大 div を避けます(列全選択ハイライトの途中切れ修正)。空窓(0 行)では
  //   末尾 < 先頭 となり、clipRowRangeToWindow が null を返してオーバーレイを描きません。
  const windowFirstRow = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const windowLastRow =
    virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : -1;
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
  }, [isServerSide, serverSideQueryKey]);

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
  // コンテナ/wrapper/indicator 高さに使う物理ボディ高さ(<= ブラウザ要素高さ上限)。
  const physicalBodyHeight = verticalGeometry.physicalBodyHeight;
  // overlay+body wrapper の transform。scaleFactor=1 のとき undefined(= 現状と同一 DOM)。
  const bodyLayerTransform =
    verticalGeometry.translateY !== 0
      ? `translateY(${verticalGeometry.translateY}px)`
      : undefined;
  // ヒットテスト/viewport-sync の物理↔論理換算に渡す倍率です。
  const verticalScaleFactor = verticalGeometry.scaleFactor;
  // overlay の絶対論理 top から差し引く描画ウィンドウ基準オフセット(px)。no-op では 0。
  //   行 start には verticalGeometry 側で反映済み。auto-scroll の目標計算は絶対論理 top を
  //   用いるため activeCellPlacement(下記)はオフセットせず、描画オーバーレイにのみ渡します。
  const overlayBaseOffset = verticalGeometry.windowBaseOffsetPx;

  // ── auto-height 測定フロー(ResizeObserver + アンカー補正)(C1) ───────────
  //   描画済みの [data-autoheight-cell](C1-2 マーカー)を実測し、行ごと(同一 rowKey の 3 ペイン分は
  //   max)に store へ反映 → 最小変更 index から prefix を 1 回前方再構築 → version bump で geometry を
  //   更新します。view index は行 div の data-row-index から逆引きします。
  //   ★アンカー補正: 測定で上方の行高が変わると基準行の論理 top がずれて画面がジャンプするため、
  //     viewport 上端の行を anchor とし、prefix 再構築と同じ layout フレーム内(ペイント前)で
  //     scrollTop を同量ずらして見た目のジャンプを消します。
  //   再測定トリガー: 描画窓(virtualRows)変化 / version / nonce(ResizeObserver=内容変化)/ viewport。
  //     高さが収束すると setMeasuredRowHeight が false を返し version が動かず、ループは止まります。
  useLayoutEffect(() => {
    // 無効時(toggle OFF 等)は永続 observer を破棄して終了します。
    if (!autoHeightActive || !rowHeightStore) {
      measureObserverRef.current?.disconnect();
      measureObserverRef.current = null;
      observedCellsRef.current.clear();
      return;
    }
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    const cells = el.querySelectorAll<HTMLElement>('[data-autoheight-cell]');

    // 行ごとの実測 max 高さ(3 ペイン分)を store へ反映します(セルがある場合のみ)。
    if (cells.length > 0) {
      const perRow = new Map<number, number>();
      cells.forEach((cell) => {
        const rowEl = cell.closest<HTMLElement>('[data-row-index]');
        if (!rowEl) {
          return;
        }
        const idx = Number(rowEl.dataset.rowIndex);
        if (!Number.isFinite(idx)) {
          return;
        }
        const height = Math.ceil(cell.getBoundingClientRect().height);
        const prev = perRow.get(idx);
        if (prev === undefined || height > prev) {
          perRow.set(idx, height);
        }
      });

      let changed = false;
      let minChanged = Number.POSITIVE_INFINITY;
      perRow.forEach((height, idx) => {
        const key = rowModel.getRowKey(idx) ?? idx;
        if (setMeasuredRowHeight(rowHeightStore, idx, key, height)) {
          changed = true;
          if (idx < minChanged) {
            minChanged = idx;
          }
        }
      });

      if (changed) {
        // 旧 prefix のまま anchor(viewport 上端行)と offset を数値で捕捉してから再構築します。
        const beforeScrollTop = el.scrollTop;
        const anchorRow = rowMetrics.rowAtContentY(beforeScrollTop);
        const anchorTopBefore = rowMetrics.rowTop(anchorRow);
        const offset = beforeScrollTop - anchorTopBefore;
        rebuildPrefixFrom(rowHeightStore, minChanged);
        const anchorTopAfter = rowHeightStore.prefix[anchorRow];
        // ペイント前(layout フレーム内)に同期適用してジャンプを消します。
        el.scrollTop = anchorTopAfter + offset;
        // 測定収束のための version bump(ペイント前に geometry を更新)。
        setAutoHeightVersion((v) => v + 1);
      }
    }

    // 内容変化(編集等)を拾う永続 ResizeObserver。描画窓更新ごとに作り直さず、窓差分のみ
    //   反映します(新規セルだけ observe / 消失セルだけ unobserve)。初回 active 時に遅延生成。
    const observer =
      measureObserverRef.current ??
      new ResizeObserver(() => setAutoHeightMeasureNonce((n) => n + 1));
    measureObserverRef.current = observer;
    const observed = observedCellsRef.current;
    const current = new Set<HTMLElement>();
    cells.forEach((cell) => {
      current.add(cell);
      if (!observed.has(cell)) {
        observer.observe(cell);
        observed.add(cell);
      }
    });
    // 描画窓から外れた(=DOM から消えた)セルは監視解除して参照を手放します。
    const goneCells: HTMLElement[] = [];
    observed.forEach((cell) => {
      if (!current.has(cell)) {
        goneCells.push(cell);
      }
    });
    goneCells.forEach((cell) => {
      observer.unobserve(cell);
      observed.delete(cell);
    });
  }, [
    autoHeightActive,
    rowHeightStore,
    rowMetrics,
    rowModel,
    virtualRows,
    viewportHeight,
    autoHeightVersion,
    autoHeightMeasureNonce,
  ]);

  // アンマウント時に永続 observer を破棄します(toggle OFF は上の測定 effect 冒頭で破棄)。
  //   observedCells は生成後に再代入しない安定 Set なので、ローカルへ退避して cleanup から参照します。
  useEffect(() => {
    const observedCells = observedCellsRef.current;
    return () => {
      measureObserverRef.current?.disconnect();
      measureObserverRef.current = null;
      observedCells.clear();
    };
  }, []);

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
        height: rowMetrics.rowsHeight(row, row),
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
    // 追加(scroll-space 仮想化): active cell 自動スクロールの論理↔物理換算に使います。
    verticalScaleFactor,
  });

  // 注記(10-G): 旧実装にあった「中央ペインの scrollTop を transform で固定ペインへ同期する
  //             useEffect」と「固定ペイン上の wheel を中央ペインへ転送する useEffect」は、
  //             縦横スクロールの 1 本化により不要になったため削除しました。
  //             固定列は position: sticky で横方向だけ留まり、縦は共有スクロールで一緒に動きます。

  // ── pointer interactions ──────────────────────────────
  const {
    updateSelectionFromPointer,
    handleCellPointerDown,
    handleCellPointerEnter,
    handleNativeDragStart,
    handleRowHeaderPointerDown,
    handleRowHeaderPointerEnter,
    handleColumnHeaderPointerDown,
    handleColumnHeaderPointerEnter,
  } = useGridPointerInteractions({
    gridRootRef,
    bodyScrollRef,
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
    setHoveredRowIndex,
    setHoveredColumnIndex,
    enableRowHover,
    enableColumnHeaderHover,
  });

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
      onRowsChange,
      onColumnsChange,
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
      const currentValue = getCellValue(row, column);
      // 変更(11-B6): ドラフト setter → 初期値 setter へ置き換え（挙動等価）。
      setEditorInitialValue(String(currentValue ?? ''));
      dispatch(gridActions.startEdit(cell));
    },
    [canEditCell, dispatch, rowModel, readOnly, orderedColumns],
  );

  // ── keyboard ──────────────────────────────────────────
  const { getMovedCell, handleKeyDown } = useGridKeyboardInteractions({
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
    onRowsChange,
    dispatch,
    getMovedCell,
    gridRootRef,
    editorActionGuardRef,
  });

  // 追加(③): 編集中セルの列(編集 input の text-align=align を反映)。editingCell.col は orderedColumns 空間。
  const editingColumn = uiState.editingCell
    ? orderedColumns[uiState.editingCell.col]
    : undefined;

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
      const currentValue = getCellValue(row, column);
      startEditWithValue(cell, String(currentValue ?? ''));
    },
    [canEditCell, rowModel, readOnly, startEditWithValue, orderedColumns],
  );

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
      gridRootRef.current?.focus();
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
    ],
  );

  // ── hover handlers（11-A2: 参照安定化） ────────────────
  // 追加(11-A2): JSX 内のインライン arrow だった hover 系ハンドラを useCallback へ
  //              引き上げます。
  // 変更理由: インライン arrow は毎レンダー新しい参照になります。とくに
  //           onRowHeaderPointerLeave は GridBodyRow(memo) の props のため、
  //           親が再レンダーするたびに全行の shallow 比較が不一致になり、
  //           A-1 / 11-A の memo 化を事実上無効化していました(全行 ×N 再レンダーの主因)。
  const handleRowHeaderPointerLeaveStable = useCallback((rowIndex: number) => {
    setHoveredRowIndex((current) => (current === rowIndex ? null : current));
  }, []);

  const handleColumnHeaderPointerLeaveStable = useCallback(
    (colIndex: number) => {
      setHoveredColumnIndex((current) =>
        current === colIndex ? null : current,
      );
    },
    [],
  );

  const handleCornerPointerEnterStable = useCallback(() => {
    setIsCornerHovered(true);
  }, []);

  const handleCornerPointerLeaveStable = useCallback(() => {
    setIsCornerHovered(false);
  }, []);

  // ── column resize ─────────────────────────────────────
  // 変更(11-B5): 依存を uiState.columnWidths → latest-ref(columnWidthsRef) 読みへ
  //             置き換え、ハンドラ参照を恒久安定化します(11-A3 の続き)。
  // 変更理由: GridHeaderRow を memo 化するにあたり、columnWidths 依存が残っていると
  //           ライブリサイズの毎 pointermove で本ハンドラの参照が変わり、
  //           幅が変わっていない固定ペインのヘッダーまで memo を突破していました。
  //           開始幅は pointerdown 時点の最新値を ref から読むため挙動は等価です。
  const handleColumnResizePointerDown = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      // 追加(#2): リサイズハンドルのダブルクリックで、その列を内容幅へ autoSize します
      //   (AG Grid の境界ダブルクリック相当)。native dblclick は上の preventDefault で
      //   ブラウザにより抑止され得るため、直近 pointerdown との時刻差(<300ms)+ 位置差(<4px)で
      //   自前判定します。確定時はリサイズを開始せず autoSize に振り替えます。位置差の条件により
      //   「リサイズで境界を動かした直後の再ドラッグ」は誤検知しません(境界が動けば位置差で弾く)。
      const now = event.timeStamp;
      const last = lastResizeHandleDownRef.current;
      if (
        last &&
        last.key === column.key &&
        now - last.time < RESIZE_HANDLE_DOUBLE_CLICK_MS &&
        Math.abs(event.clientX - last.x) < RESIZE_HANDLE_DOUBLE_CLICK_DIST
      ) {
        lastResizeHandleDownRef.current = null;
        void runAutosize([column]);
        return;
      }
      lastResizeHandleDownRef.current = {
        key: column.key,
        time: now,
        x: event.clientX,
      };

      dispatch(
        gridActions.startColumnResize(
          column.key,
          event.clientX,
          columnWidthsRef.current[column.key] ?? column.width,
          column.minWidth ?? 60,
          // 変更(②-S4 仕上げ): 旧 `?? 1000` を撤廃。maxWidth 未指定列は上限なし
          //   (reducer で Number.POSITIVE_INFINITY)になり、autoSize で 1000px を
          //   超えた幅から手動リサイズを始めても 1000 へスナップしなくなります
          //   (autoSize は元から上限なしのため、両者の上限規則が一致します)。
          column.maxWidth,
        ),
      );
    },
    [dispatch, runAutosize],
  );

  // ── column pinning(13-A) ─────────────────────────────
  // 追加(13-A): 列メニューからの固定切替(AG Grid の Pin Left / Pin Right / No Pin 相当)です。
  // 設計メモ:
  //   - columns は controlled props のため、反映は onColumnsChange 経由で行います
  //     (columnWidths のような内部 state は持ちません。Grid 外から pinned を変えた場合と
  //      同じ経路に一本化し、状態の二重管理を避けます)。
  //   - その際、columnWidthsRef の「現在の解決済み幅」を column defs の width へ書き戻します。
  //     columns prop が変わると columnWidths/sync が column.width で state を上書きするため、
  //     書き戻さないと手動リサイズ済みの幅が固定切替のたびにリセットされてしまいます。
  //   - 固定切替で orderedColumns の視覚順(= selection / activeCell の論理 index 空間)が
  //     変わるため、選択・アクティブセル・編集は破棄します(AG Grid も pin 変更で
  //     range selection をクリアします)。index を持ち越すと無関係な列が選択された
  //     ように見えるためです。3 dispatch は同一イベント内で自動バッチされます。
  const handleColumnMenuPinnedChange = useCallback(
    (columnKey: string, nextPinned: GridColumnPinned | undefined) => {
      closeColumnMenu();

      if (!onColumnsChange) {
        return;
      }

      const targetColumn = columns.find((column) => column.key === columnKey);
      if (!targetColumn) {
        return;
      }

      const currentPinned = targetColumn.pinned ?? undefined;
      if (currentPinned === nextPinned) {
        // 追加: 現在値と同じ項目の選択は閉じるだけの no-op にします。
        return;
      }

      const nextColumns = columns.map((column) => {
        const resolvedWidth =
          columnWidthsRef.current[column.key] ?? column.width;
        if (column.key === columnKey) {
          return { ...column, width: resolvedWidth, pinned: nextPinned };
        }
        // 追加: 対象外の列も、リサイズ済みなら幅を defs へ書き戻して保全します。
        return resolvedWidth === column.width
          ? column
          : { ...column, width: resolvedWidth };
      });

      onColumnsChange(nextColumns);

      dispatch(gridActions.stopEdit());
      dispatch(gridActions.clearSelection());
      dispatch(gridActions.activateCell(null));
    },
    [closeColumnMenu, columns, dispatch, onColumnsChange],
  );

  // ── column autosize(13-B1) ───────────────────────────
  // 追加(13-B1): 列メニューからの幅自動調整(AG Grid の Autosize This Column /
  //             Autosize All Columns 相当)です。
  // 設計メモ:
  //   - 幅は手動リサイズと同じく内部 state(columnWidths)で管理されるため、
  //     pinned と違い onColumnsChange は不要です。columnWidths/sync(merge)で反映します。
  //     columnWidthsRef にも即時反映されるため、その後の固定切替時の幅書き戻し
  //     (handleColumnMenuPinnedChange)でも自動調整後の幅が保全されます。
  //   - 計測対象行は rowModel 越しのビュー順全行(getRow(i)・グローバル / 列フィルター適用後)です。
  //     AG Grid 本家は「描画済みセルのみ」計測しますが、本実装は全表示行を対象にし、
  //     ユニーク文字列 dedupe で計測コストを抑えます(詳細は logic/columnAutosize.ts)。
  //   - 計測結果が現在幅と同じ場合は dispatch しません(no-op。再レンダー抑止)。
  //   - 選択・アクティブセル・編集は破棄しません(幅変更は論理 index 空間を
  //     変えないため。手動リサイズと同じ扱いです)。
  //   - 変更(DS-4 ①-(2)): 計測は時間分割ランナー(useColumnAutosizeRunner)へ委譲しました。
  //     ハンドラ deps から rowModel / dispatch が外れ(ランナーが latest-ref で読むため)、
  //     closeColumnMenu / runAutosize / visibleColumns のみになりました(runAutosize は安定参照)。
  const handleColumnMenuAutosizeColumn = useCallback(
    (columnKey: string) => {
      closeColumnMenu();

      const targetColumn = visibleColumns.find(
        (column) => column.key === columnKey,
      );
      if (!targetColumn) {
        return;
      }

      // 変更(DS-4 ①-(2)): 同期計測を撤去し、時間分割ランナーへ委譲します(単一経路)。
      //   getRow / viewRowCount / gridRoot / currentWidths は run 開始時にランナーが
      //   latest-ref 群からキャプチャするため、ここでは対象列だけを渡します。
      void runAutosize([targetColumn]);
    },
    [closeColumnMenu, runAutosize, visibleColumns],
  );

  const handleColumnMenuAutosizeAllColumns = useCallback(() => {
    closeColumnMenu();
    // 変更(DS-4 ①-(2)): 全列経路もランナーへ委譲します(単一経路・時間分割)。
    void runAutosize(visibleColumns);
  }, [closeColumnMenu, runAutosize, visibleColumns]);

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

  // 追加(13-B2-1): 列メニューの「列の表示」項目からパネルを開きます
  //             (メニューを閉じてからパネルを開きます)。
  const handleColumnMenuOpenChooser = useCallback(() => {
    closeColumnMenu();
    openColumnChooser();
  }, [closeColumnMenu, openColumnChooser]);

  // 追加(MS-3-1): 並び替え管理パネルへ渡す「並び替え可能な列」一覧です。
  //             visibleColumns を母集合にします(見えている列だけを並び替え対象に出す＝
  //             挙動が驚かない)。title 未指定は key を表示名にします(chooser と同じ)。
  const sortManagerColumns = useMemo<SortManagementColumn[]>(
    () =>
      visibleColumns.map((column) => ({
        key: column.key,
        title: column.title ?? column.key,
      })),
    [visibleColumns],
  );

  // 追加(MS-3-1): 列メニューの「並び替えを管理…」項目からパネルを開きます
  //             (メニューを閉じてからパネルを開きます。chooser と同型)。
  const handleColumnMenuOpenSortManager = useCallback(() => {
    closeColumnMenu();
    openSortManager();
  }, [closeColumnMenu, openSortManager]);

  // 追加(③): 列メニューの「フィルター…」項目からフィルター popover を開きます
  //          (メニューを閉じてから開きます。sort manager / chooser と同型)。
  //          openColumnFilterPopover は anchor を列ヘッダーセル(data-ssg-col-key)から解決するため、
  //          起点ボタンが無くても column だけで開けます。
  const handleColumnMenuOpenFilter = useCallback(
    (column: GridColumn<T>) => {
      closeColumnMenu();
      openColumnFilterPopover(column);
    },
    [closeColumnMenu, openColumnFilterPopover],
  );

  // 追加(13-B2-1): パネルでの 1 列の表示/非表示トグルです。
  // 設計メモ(handleColumnMenuPinnedChange と同型):
  //   - columns は controlled props のため onColumnsChange 経由で反映します。
  //   - 対象外の列も columnWidthsRef の解決済み幅を defs へ書き戻して保全します
  //     (visible 変更 → visibleColumns 変化 → columnWidths/sync が走るため。
  //      書き戻さないと手動リサイズ幅がトグルのたびにリセットされます)。
  //   - 表示/非表示で orderedColumns の視覚順(= selection / activeCell の論理 index 空間)
  //     が変わるため、選択・アクティブセル・編集は破棄します(pin と同じ理由)。
  //   - 最後の 1 列は非表示にできません(パネル側でも disabled ですが二重ガード)。
  const handleColumnChooserToggleVisibility = useCallback(
    (columnKey: string, nextVisible: boolean) => {
      if (!onColumnsChange) {
        return;
      }

      const targetColumn = columns.find((column) => column.key === columnKey);
      if (!targetColumn) {
        return;
      }

      const currentVisible = targetColumn.visible !== false;
      if (currentVisible === nextVisible) {
        // 現在値と同じトグルは no-op。
        return;
      }

      if (!nextVisible) {
        const visibleCount = columns.filter(
          (column) => column.visible !== false,
        ).length;
        if (visibleCount <= 1) {
          // 最後の 1 列は非表示にしません(空グリッド回避)。
          return;
        }
      }

      const nextColumns = columns.map((column) => {
        const resolvedWidth =
          columnWidthsRef.current[column.key] ?? column.width;
        if (column.key === columnKey) {
          return { ...column, width: resolvedWidth, visible: nextVisible };
        }
        return resolvedWidth === column.width
          ? column
          : { ...column, width: resolvedWidth };
      });

      onColumnsChange(nextColumns);

      dispatch(gridActions.stopEdit());
      dispatch(gridActions.clearSelection());
      dispatch(gridActions.activateCell(null));
    },
    [columns, dispatch, onColumnsChange],
  );

  // 追加(13-B2-1): パネルの全選択(= すべて表示)です。非表示列がなければ no-op。
  //             幅書き戻し・選択破棄の作法はトグルと同じです。
  const handleColumnChooserShowAll = useCallback(() => {
    if (!onColumnsChange) {
      return;
    }

    const hasHidden = columns.some((column) => column.visible === false);
    if (!hasHidden) {
      return;
    }

    const nextColumns = columns.map((column) => {
      const resolvedWidth =
        columnWidthsRef.current[column.key] ?? column.width;
      const needsWidth = resolvedWidth !== column.width;
      const needsShow = column.visible === false;
      if (!needsWidth && !needsShow) {
        return column;
      }
      return needsShow
        ? { ...column, width: resolvedWidth, visible: true }
        : { ...column, width: resolvedWidth };
    });

    onColumnsChange(nextColumns);

    dispatch(gridActions.stopEdit());
    dispatch(gridActions.clearSelection());
    dispatch(gridActions.activateCell(null));
  }, [columns, dispatch, onColumnsChange]);

  // 追加(13-B3-1): パネルのドラッグ並べ替えの commit です。
  // 設計メモ(pin / 表示トグルと同型の作法):
  //   - columns は controlled props のため onColumnsChange 経由で反映します。
  //   - パネルから渡される orderedKeys は「全列キーの permutation」です(検索中は
  //     ドラッグ不可なので、絞り込み部分集合のキーが来ることはありません)。orderedKeys の
  //     順序で columns を再構築します。集合不一致(長さ違い / 未知キー)のときは安全側に
  //     倒して no-op にします。
  //   - 【幅の保全】並べ替えで columns 配列が変わると visibleColumns も変わり、
  //     既存の「columns → columnWidths/sync」effect が走ります。書き戻さないと手動リサイズ幅が
  //     並べ替えのたびに defs 幅へ戻ってしまうため、全列について解決済み幅(columnWidthsRef)を
  //     defs へ書き戻します(pin / 表示ハンドラと同じ"保全"方向)。
  //   - 【no-op】順序が実際に変わらず、かつ幅の書き戻しも不要なら dispatch も
  //     onColumnsChange も行いません(mutated フラグ)。
  //   - 並べ替えは orderedColumns の視覚順(= selection / activeCell の論理 index 空間)を
  //     変えるため、選択・アクティブセル・編集は破棄します(pin / 表示と同理由)。
  //   - 注記: 本バッチでは pinned は変更しません。pinned 混在時は配列順を動かすだけで、
  //     画面側は従来どおり reorderColumnsByPane が pane(left/center/right)へ再グループ化します
  //     (ペイン跨ぎ・pinned 変更はヘッダー D&D の 13-B3-2 で扱います)。
  // 変更(13-B3-2): 旧 handleColumnChooserReorder を「並べ替え + 任意の pin 変更」を 1 経路に
  //   集約した共通 commit ヘルパ applyColumnOrderAndPin へ一般化しました。
  // 設計メモ:
  //   - orderedKeys は「全列キーの permutation」。長さ・集合が columns と一致しなければ no-op。
  //   - pinOverride: 列キー → 'left'|'right'|undefined。指定列だけ pinned を上書きします
  //     (ヘッダー D&D 用。チューザー並べ替えは未指定で従来どおり pinned 不変)。
  //   - 【幅の保全】全列について解決済み幅(columnWidthsRef)を defs へ書き戻します。書き戻さないと
  //     columns 変化 → columnWidths/sync effect で手動リサイズ幅が defs 幅へ戻ってしまうためです。
  //   - 【正規化】reorderColumnsByPane で pane 連結正規化します(合意①・冪等)。pinOverride で
  //     pinned が変わってもこの正規化が視覚順(= 論理 index 空間)を確定させます。チューザーの
  //     orderedKeys は computeSectionReorderedKeys で既に pane 連結済みのため、ここでの正規化は
  //     冪等で従来挙動と不変です。
  //   - 【no-op】正規化結果が現在の columns と「順序・幅・pinned」すべて一致なら dispatch も
  //     onColumnsChange も行いません(無駄な再レンダー抑止)。
  //   - 並べ替え / pin 変更は orderedColumns の視覚順(= selection / activeCell の論理 index 空間)
  //     を変え得るため、選択・アクティブセル・編集は破棄します(pin / 表示と同理由)。
  const applyColumnOrderAndPin = useCallback(
    (
      orderedKeys: string[],
      pinOverride?: Map<string, GridColumnPinned | undefined>,
    ) => {
      if (!onColumnsChange) {
        return;
      }
      if (orderedKeys.length !== columns.length) {
        return;
      }
      const byKey = new Map(columns.map((column) => [column.key, column]));
      // 集合不一致(未知キー)は安全側に倒して no-op。
      if (!orderedKeys.every((key) => byKey.has(key))) {
        return;
      }

      const reordered = orderedKeys.map((key) => {
        const column = byKey.get(key)!;
        const resolvedWidth =
          columnWidthsRef.current[column.key] ?? column.width;
        const nextPinned = pinOverride?.has(key)
          ? pinOverride.get(key)
          : column.pinned;
        const widthChanged = resolvedWidth !== column.width;
        const pinnedChanged =
          (column.pinned ?? undefined) !== (nextPinned ?? undefined);
        return widthChanged || pinnedChanged
          ? { ...column, width: resolvedWidth, pinned: nextPinned }
          : column;
      });

      const normalized = reorderColumnsByPane(reordered);

      const isNoOp =
        normalized.length === columns.length &&
        normalized.every((column, index) => {
          const prev = columns[index];
          return (
            !!prev &&
            prev.key === column.key &&
            prev.width === column.width &&
            (prev.pinned ?? undefined) === (column.pinned ?? undefined)
          );
        });
      if (isNoOp) {
        return;
      }

      onColumnsChange(normalized);

      dispatch(gridActions.stopEdit());
      dispatch(gridActions.clearSelection());
      dispatch(gridActions.activateCell(null));
    },
    [columns, dispatch, onColumnsChange],
  );

  // 変更(13-B3-2): チューザー並べ替えは applyColumnOrderAndPin(pinOverride なし)へ委譲します。
  //   ColumnChooserPanel へ渡す参照を安定させるため薄い useCallback で包みます。
  const handleColumnChooserReorder = useCallback(
    (orderedKeys: string[]) => {
      applyColumnOrderAndPin(orderedKeys);
    },
    [applyColumnOrderAndPin],
  );

  // 追加(13-B3-2): ヘッダー D&D 並べ替え controller(ドロップインジケータ ref + 安定ハンドラ)。
  //   enabled は controlled columns(onColumnsChange あり)のときだけ true。
  const {
    onColumnDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
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
  });

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
  const columnDropIndicatorStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    height: headerHeight + physicalBodyHeight,
    width: 2,
    backgroundColor: '#2563eb',
    transform: 'translateX(-1px)',
    pointerEvents: 'none',
    zIndex: 8,
    display: 'none',
  };

  // 追加(13-B2-2): 全列を初期 column defs の値(幅 / 固定 / 表示)へ戻します。
  // 設計メモ:
  //   - columns は controlled props のため onColumnsChange 経由で反映します
  //     (pin / 表示トグルと同じ経路。内部 state は持ちません)。
  //   - 【幅の戻し方】対象列は column.width を初期幅へセットするだけでよく、
  //     syncColumnWidths は呼びません。columns prop の変化で visibleColumns が
  //     変わり、既存の「columns → columnWidths/sync」effect が
  //     columnWidths[key] = column.width(= 初期幅) で上書きするため、手動リサイズ済みの
  //     live 幅は自動的に破棄され初期幅へ戻ります。
  //     ※ pin / 表示ハンドラが「対象外の列の live 幅を defs へ書き戻して"保全"」するのと
  //       ちょうど逆向きの操作です(リセットは live 幅を意図的に"破棄"します)。
  //   - 【スナップショット外の列】マウント後に追加された列(createOverflowColumn)は
  //     初期スナップショットを持たないためリセット対象外です。ただし commit する場合は
  //     その列の live 幅を defs へ書き戻して保全します(他ハンドラと同型。書き戻さないと
  //     上記 sync effect でそれらの列の手動リサイズも巻き添えで消えるため)。
  //   - 【no-op】初期スナップショットを持つ列がどれも初期状態と差分なしなら dispatch も
  //     onColumnsChange も行いません(changed フラグ。無駄な再レンダー抑止)。
  //   - 固定 / 表示の復元で orderedColumns の視覚順(= selection / activeCell の論理 index
  //     空間)が変わり得るため、選択・アクティブセル・編集は破棄します(pin / 表示と同理由)。
  //   - 追加(13-B2-3 / gpt5.5対応): 列メニュー root の「列のリセット」からも
  //     本ハンドラを再利用します。列メニュー側では薄い wrapper で menu close だけを
  //     追加し、ColumnChooserPanel 側の挙動(押下後もパネルを残す)とは分離します。
  const handleColumnChooserReset = useCallback(() => {
    if (!onColumnsChange) {
      return;
    }
    const snapshot = initialColumnStateRef.current;
    if (!snapshot) {
      return;
    }

    let changed = false;
    const nextColumns = columns.map((column) => {
      const resolvedWidth =
        columnWidthsRef.current[column.key] ?? column.width;
      const initial = snapshot.get(column.key);

      if (!initial) {
        // マウント後に追加された列はリセット対象外。解決済み幅だけ defs へ
        // 書き戻して保全します(commit される場合の sync effect による消失を防止)。
        return resolvedWidth === column.width
          ? column
          : { ...column, width: resolvedWidth };
      }

      const initialPinned = initial.pinned ?? undefined;
      const widthDiff = resolvedWidth !== initial.width;
      const pinnedDiff = (column.pinned ?? undefined) !== initialPinned;
      const visibleDiff =
        (column.visible !== false) !== (initial.visible !== false);

      if (widthDiff || pinnedDiff || visibleDiff) {
        changed = true;
      }

      // 注記: 初期幅を column.width にセットするのが重要です。これにより commit 後の
      //       sync effect が columnWidths を初期幅で上書きし、live 幅が破棄されます。
      //       差分なしの列も同じ正規化を行い、column.width と初期幅の不整合
      //       (過去の書き戻しで def 幅がずれているケース)による幅ジャンプを防ぎます。
      return {
        ...column,
        width: initial.width,
        pinned: initial.pinned,
        visible: initial.visible,
      };
    });

    if (!changed) {
      // どの初期列も初期状態のまま → 何もしません(再レンダー抑止)。
      return;
    }

    onColumnsChange(nextColumns);

    dispatch(gridActions.stopEdit());
    dispatch(gridActions.clearSelection());
    dispatch(gridActions.activateCell(null));
  }, [columns, dispatch, onColumnsChange]);

  // 追加(13-B2-3 / gpt5.5対応): 列メニュー root の「列のリセット」用 wrapper です。
  //   - reset 本体は ColumnChooserPanel フッターと同じ handleColumnChooserReset を再利用します。
  //   - 列メニューから実行した場合だけ、先に列メニューを閉じます。
  //   - handleColumnChooserReset 側に close 処理を混ぜないことで、パネル内フッターから
  //     押した場合の「パネルを開いたまま状態を確認できる」挙動を維持します。
  const handleColumnMenuResetColumns = useCallback(() => {
    closeColumnMenu();
    handleColumnChooserReset();
  }, [closeColumnMenu, handleColumnChooserReset]);

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

  // 追加(12-A): popover を開いている列の set フィルター選択状態です。
  //             null = 全選択(フィルター未設定)を意味します。
  const openedSetFilterValue = openedFilterColumn
    ? uiState.filters.columnFilters[openedFilterColumn.key]
    : undefined;

  // 追加(反転set): popover を開いている列の set 選択状態 { mode, values }(null = 全選択)。
  //   values は常に小さい側のみ(include=選択値 / exclude=非選択値)。巨大側は作りません。
  const openedSetSelection = useMemo<ColumnFilterSetSelection | null>(() => {
    if (!isSetColumnFilterValue(openedSetFilterValue)) {
      return null;
    }
    return {
      mode: openedSetFilterValue.mode === 'exclude' ? 'exclude' : 'include',
      values: new Set(openedSetFilterValue.values),
    };
  }, [openedSetFilterValue]);

  // 追加(反転set): filterOptions を明示指定した列は universe が全行値を覆わない可能性があるため
  //   exclude(反転)を選ばず include 固定にします(集合が小さく反転不要・挙動差も防止)。
  //   スキャン収集列は universe=全行値で include≡exclude が保証されるため反転可。
  const openedColumnCanInvert = !(
    openedFilterColumn?.filterOptions &&
    openedFilterColumn.filterOptions.length > 0
  );

  // 追加(反転set): set 選択結果を reducer へ反映します。全選択→clearColumn / 0 件→include{} /
  //   中間→ハンドラが選んだ mode の小さい側。ハンドラが mode を確定済みのため complement
  //   (O(total))はここで計算しません。total は候補総数(=universe サイズ)です。
  const commitSetFilterSelection = useCallback(
    (columnKey: string, next: ColumnFilterSetSelection, total: number) => {
      const selectedCount =
        next.mode === 'include' ? next.values.size : total - next.values.size;
      if (selectedCount >= total) {
        // 全選択(exclude{} 等)は保存せずフィルターなしへ正規化します。
        dispatch(gridActions.clearColumnFilter(columnKey));
        return;
      }
      if (selectedCount <= 0) {
        // 何も選択されていない状態は include{}(小さい)で表現します(exclude{universe} を作らない)。
        dispatch(
          gridActions.setColumnFilter(columnKey, {
            kind: 'set',
            mode: 'include',
            values: [],
          }),
        );
        return;
      }
      const nextValue: SetColumnFilterValue = {
        kind: 'set',
        mode: next.mode,
        values: Array.from(next.values),
      };
      dispatch(gridActions.setColumnFilter(columnKey, nextValue));
    },
    [dispatch],
  );

  // 追加(反転set): チェックボックス 1 件のトグルです(即時適用)。現在の選択 mode を保ったまま
  //   小さい側へ ±1 します(巨大側を作りません)。null(全選択)からの解除は canInvert 列なら
  //   exclude{value}、非invert 列(universe が小)なら include{universe∖value} になります。
  const handleSetFilterValueToggle = useCallback(
    (value: string) => {
      if (!filterPopoverState) {
        return;
      }
      const total = openedFilterSelectOptions.length;
      const selection = openedSetSelection;
      let next: ColumnFilterSetSelection;
      if (isSetValueSelected(selection, value)) {
        // value を解除します。
        if (selection === null) {
          next = openedColumnCanInvert
            ? { mode: 'exclude', values: new Set([value]) }
            : {
                mode: 'include',
                values: setWithout(openedFilterAllValues, value),
              };
        } else if (selection.mode === 'include') {
          next = { mode: 'include', values: setWithout(selection.values, value) };
        } else {
          next = { mode: 'exclude', values: setWith(selection.values, value) };
        }
      } else {
        // value を選択します(selection は null ではない: null は全選択)。
        next =
          selection!.mode === 'include'
            ? { mode: 'include', values: setWith(selection!.values, value) }
            : { mode: 'exclude', values: setWithout(selection!.values, value) };
      }
      commitSetFilterSelection(filterPopoverState.columnKey, next, total);
    },
    [
      filterPopoverState,
      openedSetSelection,
      openedColumnCanInvert,
      openedFilterAllValues,
      openedFilterSelectOptions,
      commitSetFilterSelection,
    ],
  );

  // 追加(反転set): (すべて選択) の一括トグルです。非検索は scope='all'(全候補)、検索中は
  //   表示中候補(=小さい側)の values が渡ります。いずれも巨大側を作らず mode 空間で更新します。
  const handleSetFilterSelectAllChange = useCallback(
    (scope: 'all' | string[], nextChecked: boolean) => {
      if (!filterPopoverState) {
        return;
      }
      const columnKey = filterPopoverState.columnKey;
      const total = openedFilterSelectOptions.length;
      if (scope === 'all') {
        // 非検索: 全候補対象。全選択→clear / 全解除→include{}。
        if (nextChecked) {
          dispatch(gridActions.clearColumnFilter(columnKey));
        } else {
          commitSetFilterSelection(
            columnKey,
            { mode: 'include', values: new Set() },
            total,
          );
        }
        return;
      }
      // 検索中: scope = 表示中候補(小さい側)。現在 selection に ±scope を mode 空間で適用。
      const selection = openedSetSelection;
      let next: ColumnFilterSetSelection;
      if (nextChecked) {
        if (selection === null) {
          // 全選択のまま(表示中を選択しても変化なし)→ フィルターなし。
          dispatch(gridActions.clearColumnFilter(columnKey));
          return;
        }
        next =
          selection.mode === 'include'
            ? { mode: 'include', values: setUnion(selection.values, scope) }
            : { mode: 'exclude', values: setDifference(selection.values, scope) };
      } else {
        if (selection === null) {
          next = openedColumnCanInvert
            ? { mode: 'exclude', values: new Set(scope) }
            : {
                mode: 'include',
                values: setDifference(openedFilterAllValues, scope),
              };
        } else if (selection.mode === 'include') {
          next = { mode: 'include', values: setDifference(selection.values, scope) };
        } else {
          next = { mode: 'exclude', values: setUnion(selection.values, scope) };
        }
      }
      commitSetFilterSelection(columnKey, next, total);
    },
    [
      filterPopoverState,
      openedSetSelection,
      openedColumnCanInvert,
      openedFilterAllValues,
      openedFilterSelectOptions,
      commitSetFilterSelection,
      dispatch,
    ],
  );

  // 追加(12-A): set フィルターの「クリア」です。即時適用 UI のため popover は閉じず、
  //             全選択(フィルターなし)へ戻して結果を見ながら操作を続けられるようにします。
  const clearSetFilterPopoverValue = useCallback(() => {
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
  }, [dispatch, filterPopoverState]);

  const applyFilterPopoverValue = useCallback(() => {
    if (!filterPopoverState) {
      return;
    }
    const targetColumn = visibleColumns.find(
      (column) => column.key === filterPopoverState.columnKey,
    );
    const filterType = targetColumn?.filterType ?? 'text';
    // 追加(12-A): set フィルターは即時適用のため、ここでは閉じるだけにします
    //             (Enter 等で誤って draftValue が書き込まれるのを防ぎます)。
    if (filterType === 'set') {
      closeColumnFilterPopover();
      return;
    }
    // 追加(記述子化 / number): number は生文字列ではなく { kind:'number', raw, parsed }
    //   記述子で commit します(parse は build 内で 1 回)。空入力は従来どおり clearColumn。
    //   挙動は旧「trim → 空なら clear / 非空なら setColumnFilter(生文字列)」と等価で、
    //   違いは保存値の形(生文字列 → 記述子)だけです。
    if (filterType === 'number') {
      const descriptor = buildNumberColumnFilterValue(
        filterPopoverState.draftValue,
      );
      if (!descriptor) {
        dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
        closeColumnFilterPopover();
        return;
      }
      dispatch(
        gridActions.setColumnFilter(filterPopoverState.columnKey, descriptor),
      );
      closeColumnFilterPopover();
      return;
    }
    const normalized =
      filterType === 'select'
        ? filterPopoverState.draftValue
        : filterPopoverState.draftValue.trim();
    if (!normalized) {
      dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
      closeColumnFilterPopover();
      return;
    }
    // 変更(記述子化): text / date / select / custom も生文字列ではなくタグ付き記述子で commit します。
    //   ここは列定義(filterType)を持つ唯一の境界なので、filterType → kind の対応付けはここで行います
    //   (合否は旧・生文字列時代と等価: text/date=部分一致 / select=完全一致 / custom=filterFn or 部分一致)。
    const descriptor: ColumnFilterValue =
      filterType === 'select'
        ? { kind: 'select', value: normalized }
        : filterType === 'date'
          ? { kind: 'date', value: normalized }
          : filterType === 'custom'
            ? { kind: 'custom', value: normalized }
            : { kind: 'text', value: normalized };
    dispatch(
      gridActions.setColumnFilter(filterPopoverState.columnKey, descriptor),
    );
    closeColumnFilterPopover();
  }, [closeColumnFilterPopover, dispatch, filterPopoverState, visibleColumns]);

  const clearFilterPopoverValue = useCallback(() => {
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    closeColumnFilterPopover();
  }, [closeColumnFilterPopover, dispatch, filterPopoverState]);

  // ── sort ──────────────────────────────────────────────
  // 変更(13-B4): ヘッダーのソートボタンを廃止し、ソート操作を列メニュー(と
  //             コンテキストメニュー)へ集約しました。メニューの「昇順/降順で並び替え」
  //             から呼ばれるハンドラです。AG Grid と同様、現在と同じ方向を再選択したら
  //             解除(clearSort)します。reducer / actions は不変(setSort/clearSort 再利用)。
  // 注記: 他の列メニュー操作(pin/autosize/…)と同じく、まず closeColumnMenu() してから
  //       dispatch します。enableSorting=false の列ではメニュー項目自体を出さないため
  //       (ColumnMenuPopover の canSort)、ここでのガードは保険です。
  const handleColumnMenuSortChange = useCallback(
    (columnKey: string, direction: 'asc' | 'desc') => {
      closeColumnMenu();

      if (!enableSorting) {
        return;
      }

      // 変更(MS-2): 単一置換ロジックを純関数 nextSortEntries(additive=false) へ一本化
      //   します。挙動は MS-1 と完全同値(現在がちょうど『この列・同方向の単一ソート』
      //   なら解除、それ以外はこの列だけの単一ソートへ置換)。マルチソート中に押した
      //   場合は、その時点のマルチを破棄してこの列の単一ソートへ切り替わります
      //   (メニューは単一置換のまま = 合意済み方針。複数追加はヘッダー Shift+click 経路)。
      const next = nextSortEntries(uiState.sort, columnKey, direction, false);
      dispatch(
        next.length === 0 ? gridActions.clearSort() : gridActions.setSort(next),
      );
    },
    [closeColumnMenu, dispatch, enableSorting, uiState.sort],
  );

  // ── sort management panel actions(MS-3-1) ────────────
  // 追加(MS-3-1): 並び替え管理パネルからのライブ編集ハンドラ群です。
  //   いずれも logic/sorting.ts の純関数で次状態を算出し、setSort / clearSort へ流します
  //   (reducer / actions は不変)。パネルは編集後も開いたままにします
  //   (closeSortManager は混ぜません。× / outside / Escape でのみ閉じます)。
  //   メニュー経路(handleColumnMenuSortChange)と違い closeColumnMenu はしません
  //   (この時点でメニューは既に閉じ、パネルだけが開いています)。
  const handleSortManagerAddLevel = useCallback(
    (columnKey: string, direction: 'asc' | 'desc') => {
      if (!enableSorting) {
        return;
      }
      const next = addSortEntry(uiState.sort, columnKey, direction);
      // 追加は常に 1 件以上になるため setSort 固定です。
      dispatch(gridActions.setSort(next));
    },
    [dispatch, enableSorting, uiState.sort],
  );

  const handleSortManagerChangeDirection = useCallback(
    (index: number, direction: 'asc' | 'desc') => {
      if (!enableSorting) {
        return;
      }
      const next = setSortEntryDirection(uiState.sort, index, direction);
      // 冪等セット(変化なし)のときは next === 現配列のため、setSort でも参照同一で実害なし。
      dispatch(gridActions.setSort(next));
    },
    [dispatch, enableSorting, uiState.sort],
  );

  const handleSortManagerChangeColumn = useCallback(
    (index: number, columnKey: string) => {
      if (!enableSorting) {
        return;
      }
      const next = setSortEntryColumn(uiState.sort, index, columnKey);
      dispatch(gridActions.setSort(next));
    },
    [dispatch, enableSorting, uiState.sort],
  );

  const handleSortManagerRemoveLevel = useCallback(
    (index: number) => {
      if (!enableSorting) {
        return;
      }
      const next = removeSortEntryAt(uiState.sort, index);
      dispatch(
        next.length === 0 ? gridActions.clearSort() : gridActions.setSort(next),
      );
    },
    [dispatch, enableSorting, uiState.sort],
  );

  const handleSortManagerClearAll = useCallback(() => {
    if (!enableSorting) {
      return;
    }
    dispatch(gridActions.clearSort());
  }, [dispatch, enableSorting]);

  // 追加(MS-3-2): 優先順位 DnD の確定ハンドラです。パネル側で補正済みの from / to を
  //   受け取り、moveSortEntry で次状態を算出して setSort へ流します。move は長さ不変
  //   (ドラッグは 2 件以上のときのみ可能)なので空配列にはならず、setSort 固定です。
  //   no-op ドラッグ(from === to / 範囲外)は moveSortEntry が同一参照を返すため、
  //   setSort へ流しても参照同一で再レンダーを誘発しません。
  const handleSortManagerMove = useCallback(
    (from: number, to: number) => {
      if (!enableSorting) {
        return;
      }
      const next = moveSortEntry(uiState.sort, from, to);
      dispatch(gridActions.setSort(next));
    },
    [dispatch, enableSorting, uiState.sort],
  );

  // 変更(UI CSS移行): getHeaderActionButtonStyle(インライン)を撤去しました。
  //   ヘッダーアイコンボタンのスタイルは styles.css(.ssg-icon-btn / --active / :hover)へ移行。

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

      if (column.renderCell) {
        return column.renderCell({
          row,
          rowIndex,
          colIndex,
          value,
          column,
          isActive: cellState.isActive,
          isSelected: cellState.isSelected,
          isEditing: cellState.isEditing,
          readOnly: cellState.readOnly,
          // 追加: 実編集は CellEditorLayer で行いますが、将来の API 互換のため setValue も残します。
          setValue: (nextValue) => {
            if (!onRowsChange) {
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
            const nextRows = rows.map((currentRow, index) =>
              index === originalRowIndex
                ? setCellValue(currentRow, column, nextValue)
                : currentRow,
            );
            onRowsChange(nextRows);
          },
        });
      }
      // 変更(③): valueFormatter 指定時はその返り値を表示します(UI 表示のみ・生値は不変)。
      const formattedText = column.valueFormatter
        ? column.valueFormatter({ value, row, column })
        : String(value ?? '');
      return <span>{formattedText}</span>;
    },
    [rowModel, onRowsChange, rows],
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
    viewRowCount,
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
            borderRight: '1px solid #cbd5e1',
            boxShadow: '6px 0 8px -6px rgba(15, 23, 42, 0.35)',
          }
        : {
            borderLeft: '1px solid #cbd5e1',
            boxShadow: '-6px 0 8px -6px rgba(15, 23, 42, 0.35)',
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

  const renderedFilterPopover = openedFilterColumn ? (
    <ColumnFilterPopover
      isOpen={Boolean(filterPopoverState)}
      title={openedFilterColumn.title || openedFilterColumn.key}
      filterType={openedFilterColumn.filterType ?? 'text'}
      // 追加(stage ②): serverSide では set/select 候補をクライアントが自動収集できないため、
      //   候補空時の空表示文言を出し分けます(filterOptions 指定列は従来どおり候補が出ます)。
      isServerSide={isServerSide}
      draftValue={filterPopoverState?.draftValue ?? ''}
      currentValueText={openedFilterCurrentValueText}
      layout={filterPopoverLayout}
      selectOptions={openedFilterSelectOptions}
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
    />
  ) : null;

  // ── column menu popover(13-A) ────────────────────────
  // 追加(13-A): 列メニュー popover の描画です(portal で body 直下へ出します)。
  const renderedColumnMenuPopover = openedMenuColumn ? (
    <ColumnMenuPopover
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

  // ── column chooser panel(13-B2-1) ────────────────────
  // 追加(13-B2-1): 列の表示/非表示パネルの描画です(portal で body 直下へ出します)。
  const renderedColumnChooserPanel = (
    <ColumnChooserPanel
      isOpen={isColumnChooserOpen}
      items={columnChooserItems}
      canToggle={Boolean(onColumnsChange)}
      layout={columnChooserLayout}
      panelRef={columnChooserRef}
      onToggleColumnVisibility={handleColumnChooserToggleVisibility}
      onShowAllColumns={handleColumnChooserShowAll}
      onResetColumns={handleColumnChooserReset}
      onReorderColumns={handleColumnChooserReorder}
      onRequestClose={closeColumnChooser}
    />
  );

  // ── sort management panel(MS-3-1) ────────────────────
  // 追加(MS-3-1): 並び替え管理パネルの描画です(portal で body 直下へ出します)。
  const renderedSortManagementPanel = (
    <SortManagementPanel
      isOpen={isSortManagerOpen}
      entries={uiState.sort}
      columns={sortManagerColumns}
      canSort={sortingEnabled}
      layout={sortManagerLayout}
      panelRef={sortManagerRef}
      onAddLevel={handleSortManagerAddLevel}
      onChangeDirection={handleSortManagerChangeDirection}
      onChangeColumn={handleSortManagerChangeColumn}
      onRemoveLevel={handleSortManagerRemoveLevel}
      onClearAll={handleSortManagerClearAll}
      onMove={handleSortManagerMove}
      onRequestClose={closeSortManager}
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
    isColumnChooserOpen ||
    isSortManagerOpen;

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
        context={slotContext}
        showSummary={showDefaultTopSummary}
        showFilter={showDefaultTopFilter}
        showCounts={showTopBarCounts}
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
  // 設計: 状態は controlled のまま、prop で表せない一発操作だけをハンドルで提供します。
  //   メソッドは最新値を latest-ref(apiStateRef)越しに読み、ハンドル自体は1回だけ生成して参照を
  //   安定させます(スクロール等の度に作り直しません)。useImperativeHandle の factory は ref /
  //   module import しか参照しないため deps [] で exhaustive-deps もクリーンです。
  const apiStateRef = useRef<{
    dispatch: typeof dispatch;
    rowModel: RowModel<T>;
    viewRowCount: number;
    rowMetrics: RowMetrics;
    paneLayout: GridPaneLayout<T>;
    orderedColumns: GridColumn<T>[];
    // 追加(state v2): getState の列メタ抽出 / applyState の列メタ適用に使う生 columns(consumer 宣言順)
    //   と onColumnsChange(controlled 反映口)です。未指定時 applyState は列メタをスキップします。
    columns: GridColumn<T>[];
    onColumnsChange: ((nextColumns: GridColumn<T>[]) => void) | undefined;
    uiState: GridUiState;
    headerHeight: number;
    verticalScaleFactor: number;
    leftPaneTotalWidth: number;
    rightPaneTotalWidth: number;
    centerLeadingWidth: number;
    windowFirstRow: number;
    windowLastRow: number;
    physicalBodyHeight: number;
  } | null>(null);
  apiStateRef.current = {
    dispatch,
    rowModel,
    viewRowCount,
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
  };

  useImperativeHandle(
    ref,
    (): SpreadsheetGridHandle<T> => {
      // 論理 scrollTop を物理へ戻してスクロールコンテナへ適用します(横は圧縮対象外で物理=論理)。
      const applyScroll = (logicalTop: number | null, left: number | null) => {
        const el = scrollContainerRef.current;
        const s = apiStateRef.current;
        if (!el || !s) {
          return;
        }
        el.scrollTo({
          top:
            logicalTop === null
              ? el.scrollTop
              : logicalToPhysicalScrollTop(logicalTop, s.verticalScaleFactor),
          left: left === null ? el.scrollLeft : left,
          behavior: 'auto',
        });
      };

      // 縦の scroll target(論理)を求めます。範囲外 index はクランプします。
      const verticalTargetFor = (
        viewRowIndex: number,
        align: ScrollAlign,
      ): number | null => {
        const el = scrollContainerRef.current;
        const s = apiStateRef.current;
        if (!el || !s || s.viewRowCount === 0) {
          return null;
        }
        const clamped = Math.min(Math.max(viewRowIndex, 0), s.viewRowCount - 1);
        return computeVerticalScrollTarget({
          rowTop: s.rowMetrics.rowTop(clamped),
          rowHeight: s.rowMetrics.rowsHeight(clamped, clamped),
          headerHeight: s.headerHeight,
          viewportHeight: el.clientHeight,
          currentScrollTop: physicalToLogicalScrollTop(
            el.scrollTop,
            s.verticalScaleFactor,
          ),
          align,
        });
      };

      // 横の scroll target(物理=論理)を求めます。中央ペインの列のみ対象(固定列は常に可視)。
      const horizontalTargetFor = (
        colIndex: number,
        align: ScrollAlign,
      ): number | null => {
        const el = scrollContainerRef.current;
        const s = apiStateRef.current;
        if (!el || !s) {
          return null;
        }
        const single = computeSinglePaneColumnExtent(s.paneLayout, colIndex);
        if (!single || single.pane !== 'center') {
          return null;
        }
        return computeHorizontalScrollTarget({
          cellLeft:
            s.leftPaneTotalWidth + s.centerLeadingWidth + single.extent.start,
          cellWidth: single.extent.width,
          leftPaneWidth: s.leftPaneTotalWidth,
          rightPaneWidth: s.rightPaneTotalWidth,
          viewportWidth: el.clientWidth,
          currentScrollLeft: el.scrollLeft,
          align,
        });
      };

      const scrollToCellInternal = (
        viewRowIndex: number,
        colIndex: number,
        align: ScrollAlign,
      ) => {
        applyScroll(
          verticalTargetFor(viewRowIndex, align),
          horizontalTargetFor(colIndex, align),
        );
      };

      // scope(all/selection/visible)から、出力対象の行レンジ [startRow, endRow) と列集合を解決します。
      //   exportCsv(buildCsv)と getExportData で共有します。scope='selection' で選択が無いときは null を
      //   返し、呼び出し側が「空」を表現します(CSV は空文字 / 整形済みデータは空)。
      const resolveExportScope = (
        scope: CsvExportScope,
      ): { startRow: number; endRow: number; columns: GridColumn<T>[] } | null => {
        const s = apiStateRef.current;
        if (!s) {
          return null;
        }
        if (scope === 'visible') {
          return {
            startRow: s.windowFirstRow,
            endRow:
              s.windowLastRow >= s.windowFirstRow
                ? s.windowLastRow + 1
                : s.windowFirstRow,
            columns: s.orderedColumns,
          };
        }
        if (scope === 'selection') {
          const sel = s.uiState.selection;
          if (!sel) {
            return null;
          }
          if (sel.type === 'cell') {
            const r = normalizeCellRange(sel.range);
            return {
              startRow: r.start.row,
              endRow: r.end.row + 1,
              columns: s.orderedColumns.slice(r.start.col, r.end.col + 1),
            };
          }
          if (sel.type === 'row') {
            const r = normalizeRowRange(sel.startRow, sel.endRow);
            return {
              startRow: r.startRow,
              endRow: r.endRow + 1,
              columns: s.orderedColumns,
            };
          }
          const r = normalizeColumnRange(sel.startCol, sel.endCol);
          return {
            startRow: 0,
            endRow: s.viewRowCount,
            columns: s.orderedColumns.slice(r.startCol, r.endCol + 1),
          };
        }
        // scope === 'all'
        return {
          startRow: 0,
          endRow: s.viewRowCount,
          columns: s.orderedColumns,
        };
      };

      // CSV 文字列を組み立てます(exportCsv / downloadCsv で共有)。
      const buildCsv = (options?: CsvExportOptions): string => {
        const s = apiStateRef.current;
        if (!s) {
          return '';
        }
        const resolved = resolveExportScope(options?.scope ?? 'all');
        // scope='selection' で選択無し。BOM 指定があれば BOM のみ、無ければ空文字。
        if (!resolved) {
          return options?.bom ? '\uFEFF' : '';
        }
        return serializeRowsToCsv({
          getRow: (index) => s.rowModel.getRow(index),
          startRow: resolved.startRow,
          endRow: resolved.endRow,
          columns: resolved.columns,
          delimiter: options?.delimiter,
          includeHeaders: options?.includeHeaders,
          bom: options?.bom,
        });
      };

      // エクスポート用の整形済みデータ(列メタ + 2 次元セル)を組み立てます(getExportData で使用)。
      //   scope / 列順 / フィルター・ソート適用は buildCsv と同一(resolveExportScope を共有)。xlsx 等の
      //   生成は consumer 側で行います(本ライブラリは Excel ライブラリを同梱しません)。
      const buildExportData = (options?: GridExportOptions): GridExportData => {
        const s = apiStateRef.current;
        if (!s) {
          return { columns: [], rows: [] };
        }
        const resolved = resolveExportScope(options?.scope ?? 'all');
        // scope='selection' で選択無し → 空データ。
        if (!resolved) {
          return { columns: [], rows: [] };
        }
        return buildGridExportData({
          getRow: (index) => s.rowModel.getRow(index),
          startRow: resolved.startRow,
          endRow: resolved.endRow,
          columns: resolved.columns,
        });
      };

      return {
        scrollToRow: (viewRowIndex, scrollOptions) =>
          applyScroll(
            verticalTargetFor(viewRowIndex, scrollOptions?.align ?? 'auto'),
            null,
          ),

        scrollToCell: (viewRowIndex, colIndex, scrollOptions) =>
          scrollToCellInternal(
            viewRowIndex,
            colIndex,
            scrollOptions?.align ?? 'auto',
          ),

        scrollToTop: () => {
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        },

        scrollToBottom: () => {
          const el = scrollContainerRef.current;
          const s = apiStateRef.current;
          if (!el || !s) {
            return;
          }
          el.scrollTo({
            top: Math.max(
              s.headerHeight + s.physicalBodyHeight - el.clientHeight,
              0,
            ),
            behavior: 'auto',
          });
        },

        getVisibleRowRange: () => {
          const s = apiStateRef.current;
          if (!s || s.windowLastRow < s.windowFirstRow) {
            return null;
          }
          return { startIndex: s.windowFirstRow, endIndex: s.windowLastRow + 1 };
        },

        getActiveCell: () => {
          const cell = apiStateRef.current?.uiState.activeCell;
          return cell ? { row: cell.row, col: cell.col } : null;
        },

        setActiveCell: (cell, cellOptions) => {
          const s = apiStateRef.current;
          if (!s) {
            return;
          }
          s.dispatch(gridActions.activateCell(cell));
          if (cell && cellOptions?.scrollIntoView) {
            scrollToCellInternal(cell.row, cell.col, 'auto');
          }
        },

        getSelection: () => apiStateRef.current?.uiState.selection ?? null,

        selectCell: (viewRowIndex, colIndex, cellOptions) => {
          const s = apiStateRef.current;
          if (!s) {
            return;
          }
          const cell = { row: viewRowIndex, col: colIndex };
          // クリック相当: pointerdown(start)→ pointerup(end)。activeCell=cell / 単一セル選択 / dragState クリア。
          s.dispatch(gridActions.startSelection(cell));
          s.dispatch(gridActions.endSelection());
          if (cellOptions?.scrollIntoView) {
            scrollToCellInternal(viewRowIndex, colIndex, 'auto');
          }
        },

        selectRange: (range, rangeOptions) => {
          const s = apiStateRef.current;
          if (!s) {
            return;
          }
          // ドラッグ選択相当: start(anchor)→ update(focus)→ end。1 イベント内のため再レンダーは 1 回。
          s.dispatch(gridActions.startSelection(range.start));
          s.dispatch(gridActions.updateSelection(range.end));
          s.dispatch(gridActions.endSelection());
          if (rangeOptions?.scrollIntoView) {
            scrollToCellInternal(range.end.row, range.end.col, 'auto');
          }
        },

        clearSelection: () => {
          apiStateRef.current?.dispatch(gridActions.clearSelection());
        },

        getSelectedRows: () => {
          const s = apiStateRef.current;
          if (!s) {
            return [];
          }
          const sel = s.uiState.selection;
          if (!sel) {
            return [];
          }
          const result: T[] = [];
          const pushRow = (index: number) => {
            const row = s.rowModel.getRow(index);
            // SSRM 未ロード行(undefined)はスキップします。
            if (row) {
              result.push(row);
            }
          };
          if (sel.type === 'cell') {
            const r = normalizeCellRange(sel.range);
            for (let i = r.start.row; i <= r.end.row; i += 1) {
              pushRow(i);
            }
          } else if (sel.type === 'row') {
            const r = normalizeRowRange(sel.startRow, sel.endRow);
            for (let i = r.startRow; i <= r.endRow; i += 1) {
              pushRow(i);
            }
          } else {
            // 列選択は全ビュー行が対象(コピーと同義)。
            for (let i = 0; i < s.viewRowCount; i += 1) {
              pushRow(i);
            }
          }
          return result;
        },

        exportCsv: (options) => buildCsv(options),

        downloadCsv: (filename, options) => {
          if (typeof document === 'undefined') {
            return;
          }
          // ファイル化では Excel 互換のため bom 既定を true にします(明示指定があればそれを尊重)。
          const csv = buildCsv({ ...options, bom: options?.bom ?? true });
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename ?? 'export.csv';
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        },

        getExportData: (options) => buildExportData(options),

        // ── 状態の保存 / 復元 ──────────────────────────────
        getState: () => {
          const s = apiStateRef.current;
          if (!s) {
            // ref 未確定時(通常起こりません)は現行スキーマの空状態を返します(列メタは空配列)。
            return buildGridState(
              {},
              { globalText: '', columnFilters: {} },
              [],
              [],
            );
          }
          // 永続スライス(手動リサイズ幅 / フィルター / ソート)+ 列メタ(可視 / 順序 / ピン)を純粋に
          //   スナップショットします。列メタは columns prop から配列順で抽出します(read-only)。
          return buildGridState(
            s.uiState.columnWidths,
            s.uiState.filters,
            s.uiState.sort,
            extractColumnState(s.columns),
          );
        },

        applyState: (state) => {
          const s = apiStateRef.current;
          if (!s) {
            return;
          }
          // 外部入力(deserialize 結果)を現行スキーマへ防御的に正規化してから反映します。
          const normalized = migrateGridState(state);
          // 列メタ(v2): onColumnsChange があり、かつ正規化後に columns があるときだけ反映します
          //   (onColumnsChange 未指定 or v1 保存値=列メタ無しならスキップ。この場合は下の 3 dispatch
          //   のみで v1 と完全同一の経路です)。現 columns へ key ベースでマージし(順序復元 +
          //   visible/pinned 適用 + 手動リサイズ幅の column.width 焼き込み)、onColumnsChange で
          //   controlled に返します。焼き込みは、columns 変化で走る列同期 effect が column.width 起点で
          //   columnWidths を再構築する際に手動リサイズ幅を保全するためです(pin/visible/reorder と同型)。
          if (s.onColumnsChange && normalized.columns) {
            s.onColumnsChange(
              applyColumnState(
                s.columns,
                normalized.columns,
                normalized.columnWidths,
              ),
            );
          }
          // 幅 reset / フィルター一括 / ソート set の 3 dispatch。同一イベント内で自動バッチされ
          //   再レンダーは 1 回。SSRM では filters/sort 変化が liveServerSideQuery へ載り再取得されます。
          //   幅は resetColumnWidths(フル置換)で、保存外(= flex 列など)のキーを残しません。
          s.dispatch(gridActions.resetColumnWidths(normalized.columnWidths));
          s.dispatch(gridActions.setAllFilters(normalized.filters));
          s.dispatch(gridActions.setSort(normalized.sort));
        },
      };
    },
    [],
  );

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
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const lastEmittedStateRef = useRef<GridState | null>(null);
  useEffect(() => {
    // onStateChange 未指定なら何もしません(snapshot 組み立て / 比較すら省略)。
    if (!onStateChangeRef.current) {
      return;
    }
    const current = buildGridState(
      uiState.columnWidths,
      uiState.filters,
      uiState.sort,
      // 列メタ(可視 / 順序 / ピン)を columns prop から抽出して snapshot へ含めます。
      extractColumnState(columns),
    );
    const decision = decideStateChangeEmit(
      lastEmittedStateRef.current,
      current,
      // 列リサイズ / 選択のドラッグ中は確定前。確定(drag 終了で dragState→null)後にまとめて評価します。
      uiState.dragState !== null,
    );
    lastEmittedStateRef.current = decision.nextLast;
    if (decision.emit) {
      onStateChangeRef.current(current);
    }
  }, [
    uiState.columnWidths,
    uiState.filters,
    uiState.sort,
    uiState.dragState,
    columns,
  ]);

  return (
    <div className={cx('ssg-root', className, classNames?.root)}>
      {resolvedTopBar}

      <div
        ref={gridRootRef}
        className="ssg-shell"
        style={{ cursor: isAutosizing ? 'progress' : undefined }}
        onDragStart={handleNativeDragStart}
        // 追加(UI hover): grid 本体(ヘッダー+ボディ)から出たら行ホバーをクリアします。
        onPointerLeave={() => setHoveredRowIndex(null)}
        onPointerMoveCapture={(event) => {
          pointerClientRef.current = { x: event.clientX, y: event.clientY };
          updateSelectionFromPointer(event.clientX, event.clientY);
        }}
        // 追加: popup(フィルター / 列メニュー)open 中は grid root を tab フォーカス対象から外します。
        tabIndex={isAnyGridPopupOpen ? -1 : 0}
        // 追加: popup open 中は root の keyboard/paste handler 自体を外します。
        onKeyDown={isAnyGridPopupOpen ? undefined : handleKeyDown}
        onPaste={isAnyGridPopupOpen ? undefined : handlePaste}
      >
        {/* ── 変更(10-G): 縦横スクロールを 1 本化した共有スクロールコンテナ ── */}
        {/*   旧: 中央ペインのみ overflow:auto + 左右ペインを JS の transform で同期     */}
        {/*   新: 外側コンテナが縦横ともネイティブスクロール / 固定列は position: sticky  */}
        {/*   pinned 列がない場合は左右ペインが width:0 で非表示、中央ペインのみ表示。     */}
        <div
          ref={scrollContainerRef}
          className="ssg-scroll-container"
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
                  headerRowClassName={classNames?.headerRow}
                  headerCellClassName={classNames?.headerCell}
                  rowHeaderCellClassName={classNames?.rowHeaderCell}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  filteredRowsLength={viewRowCount}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={leftRenderEntries}
                  hoveredColumnIndex={hoveredColumnIndex}
                  selectionSnapshot={selectionSnapshot}
                  columnFilterValues={uiState.filters.columnFilters}
                  sortState={uiState.sort}
                  iconButtonClassName={classNames?.iconButton}
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
                <SelectionOverlay
                  rect={selectionRectForPane('left')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={leftLeadingWidth}
                />

                <ActiveCellOverlay
                  rect={activeCellRectForPane('left')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={leftLeadingWidth}
                />

                <CellEditorLayer
                  rect={editorRectForPane('left')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={leftLeadingWidth}
                  initialValue={editorInitialValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  align={editingColumn?.align}
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
                  isServerSide={isServerSide}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  hoveredRowIndex={hoveredRowIndex}
                  isWholeGridSelected={isWholeGridSelected}
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
                  onCellDoubleClick={handleCellDoubleClickWithController}
                  renderCellContent={renderCellContent}
                  getRowClassName={getRowClassName}
                  bodyCellClassName={classNames?.bodyCell}
                  bodyRowClassName={classNames?.bodyRow}
                  rowHeaderCellClassName={classNames?.rowHeaderCell}
                />
                </div>
              </div>
            )}

            {/* 追加(13-B3-3): 左固定ペインのドロップインジケータ(縦線)。
                変更点: 旧来は hasLeftPane 内の relative コンテナ直下に置いていましたが、
                空ペイン(pinned-left 0 本)時にも線を出せるよう、常時レンダーされる
                wrapper(sticky;left:0 = absolute 子の containing block)直下へ移しました。
                非空時は wrapper と内側 relative コンテナが原点(0,0)・高さ共通のため、
                leftPx の意味・縦線位置は従来と不変です。 */}
            <div ref={leftIndicatorRef} style={columnDropIndicatorStyle} />
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
                headerRowClassName={classNames?.headerRow}
                headerCellClassName={classNames?.headerCell}
                rowHeaderCellClassName={classNames?.rowHeaderCell}
                isCornerHovered={isCornerHovered}
                isWholeGridSelected={isWholeGridSelected}
                filteredRowsLength={viewRowCount}
                visibleColumnsLength={visibleColumns.length}
                renderEntries={centerRenderEntries}
                hoveredColumnIndex={hoveredColumnIndex}
                selectionSnapshot={selectionSnapshot}
                columnFilterValues={uiState.filters.columnFilters}
                sortState={uiState.sort}
                iconButtonClassName={classNames?.iconButton}
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
                <SelectionOverlay
                  rect={selectionRectForPane('center')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={centerLeadingWidth}
                />

                <ActiveCellOverlay
                  rect={activeCellRectForPane('center')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={centerLeadingWidth}
                />

                <CellEditorLayer
                  rect={editorRectForPane('center')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={centerLeadingWidth}
                  initialValue={editorInitialValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  align={editingColumn?.align}
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
                  isServerSide={isServerSide}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  hoveredRowIndex={hoveredRowIndex}
                  isWholeGridSelected={isWholeGridSelected}
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
                  onCellDoubleClick={handleCellDoubleClickWithController}
                  renderCellContent={renderCellContent}
                  getRowClassName={getRowClassName}
                  bodyCellClassName={classNames?.bodyCell}
                  bodyRowClassName={classNames?.bodyRow}
                  rowHeaderCellClassName={classNames?.rowHeaderCell}
                />
              </div>

              {/* 追加(13-B3-2): 中央ペインのドロップインジケータ(縦線)。
                  controller が ref 経由で display/left を imperative に制御します
                  (ドラッグ中の再レンダーなし → GridHeaderRow の memo を維持)。 */}
              <div ref={centerIndicatorRef} style={columnDropIndicatorStyle} />
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
                  headerRowClassName={classNames?.headerRow}
                  headerCellClassName={classNames?.headerCell}
                  rowHeaderCellClassName={classNames?.rowHeaderCell}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  filteredRowsLength={viewRowCount}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={rightRenderEntries}
                  hoveredColumnIndex={hoveredColumnIndex}
                  selectionSnapshot={selectionSnapshot}
                  columnFilterValues={uiState.filters.columnFilters}
                  sortState={uiState.sort}
                  iconButtonClassName={classNames?.iconButton}
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
                <SelectionOverlay
                  rect={selectionRectForPane('right')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={rightLeadingWidth}
                />

                <ActiveCellOverlay
                  rect={activeCellRectForPane('right')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={rightLeadingWidth}
                />

                <CellEditorLayer
                  rect={editorRectForPane('right')}
                  headerHeight={headerHeight}
                  baseOffset={overlayBaseOffset}
                  leadingWidth={rightLeadingWidth}
                  initialValue={editorInitialValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                  align={editingColumn?.align}
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
                  isServerSide={isServerSide}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  hoveredRowIndex={hoveredRowIndex}
                  isWholeGridSelected={isWholeGridSelected}
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
                  onCellDoubleClick={handleCellDoubleClickWithController}
                  renderCellContent={renderCellContent}
                  getRowClassName={getRowClassName}
                  bodyCellClassName={classNames?.bodyCell}
                  bodyRowClassName={classNames?.bodyRow}
                  rowHeaderCellClassName={classNames?.rowHeaderCell}
                />
                </div>
              </div>
            )}

            {/* 追加(13-B3-3): 右固定ペインのドロップインジケータ(縦線)。
                左と同様、空ペイン(pinned-right 0 本)時にも線を出せるよう、常時レンダーされる
                wrapper(sticky;right:0 = absolute 子の containing block)直下へ移しました。
                非空時は leftPx の意味・位置とも従来と不変です。空時は wrapper 原点が
                ビューポート右端のため、controller が leftPx を負値(-inset)にして端の内側へ寄せます。 */}
            <div ref={rightIndicatorRef} style={columnDropIndicatorStyle} />
          </div>

          </div>
          {/* ── /スクロールコンテンツ本体（inner flex row） ── */}

          {/* 追加(12-B): 0 行時の空状態表示です。rows 自体が 0 件か、
              フィルターで 0 件になったかでメッセージを切り替えます。 */}
          {isBodyEmpty && (
            <div className="ssg-empty-state">
              {rows.length === 0 ? noRowsText : noMatchingRowsText}
            </div>
          )}
        </div>
        {/* ── /共有スクロールコンテナ ── */}

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
      </div>

      {resolvedBottomBar}
      {renderedFilterPopover}
      {/* 追加(13-A): 列メニュー popover(列固定の切替 UI)です。*/}
      {renderedColumnMenuPopover}
      {/* 追加(13-B2-1): 列の表示/非表示パネル(Choose Columns 相当)です。*/}
      {renderedColumnChooserPanel}
      {/* 追加(MS-3-1): 並び替え管理パネル(並べ替えダイアログ相当)です。*/}
      {renderedSortManagementPanel}
    </div>
  );
}