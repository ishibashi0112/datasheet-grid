// 追加: 列フィルター UI 整備 + ソート/フィルター見た目強化を反映します。
import {
  useEffect,
  useMemo,
  useCallback,
  // 追加(11-B7): グローバルフィルタ評価の遅延化(Transition 化)に使います。
  useDeferredValue,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';

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
import { useGridClipboardController } from './hooks/useGridClipboardController';
import { useGridBarContext } from './hooks/useGridBarContext';
import { useGridEditController } from './hooks/useGridEditController';
import { useGridKeyboardInteractions } from './hooks/useGridKeyboardInteractions';
import { useGridPointerInteractions } from './hooks/useGridPointerInteractions';
import { useGridViewportSync } from './hooks/useGridViewportSync';
import {
  applyColumnFilters,
  applyGlobalFilter,
  // 追加(12-A): set フィルター値の判定 / 構築に使います。
  isSetColumnFilterValue,
  type GridRowModelLike,
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
  type GridPaneLayout,
  type PaneColumnEntry,
  type ColumnPane,
  type PaneColumnExtentMap,
} from './logic/geometry';
import { applySort } from './logic/sorting';
import type {
  CellCoord,
  CellRenderState,
  GridColumn,
  GridRowKey,
  // 追加(12-A): set フィルター値の構築に使います。
  SetColumnFilterValue,
  SpreadsheetGridProps,
} from './model/gridTypes';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import ColumnFilterPopover, {
  // 追加(12-A): popover を開いている列の候補メモ化に使う型です。
  type ColumnFilterPopoverOption,
} from './view/ColumnFilterPopover';
import DefaultGridBottomBar from './view/DefaultGridBottomBar';
import DefaultGridTopBar from './view/DefaultGridTopBar';
import { resolveGridSlot } from './view/gridBarHelpers';
import GridBodyLayer from './view/GridBodyLayer';
import GridHeaderRow from './view/GridHeaderRow';

// 追加: 元 rows と filteredRows の対応を安定して持つための row model です。
type SourceRowModel<T> = GridRowModelLike<T> & {
  rowKey: GridRowKey;
};

// 追加(12-A): popover 非表示時 / 候補不要な filterType 用の安定空配列です。
//             useMemo の返り値参照を安定させるため module スコープに置きます。
const EMPTY_FILTER_OPTIONS: ColumnFilterPopoverOption[] = [];

// 追加: Grid 本体です。
export function SpreadsheetGrid<T extends object>({
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  rowKeyGetter,
  createRow,
  createOverflowColumn,
  rowHeight = 36,
  headerHeight = 40,
  rowHeaderWidth = 56,
  readOnly = false,
  canEditCell,
  enableRangeSelection = true,
  enableGlobalFilter = true,
  enableColumnFilter = true,
  enableSorting = true,
  // 追加(12-B): 0 行時の空状態テキストです(AG Grid のオーバーレイ相当)。
  noMatchingRowsText = '一致する行がありません',
  noRowsText = '表示する行がありません',
  renderTopBar,
  renderBottomBar,
  className,
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
  const columnWidthsRef = useRef(uiState.columnWidths);
  columnWidthsRef.current = uiState.columnWidths;

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

  // 追加(11-B4): ペインごとの「解決済み幅 join キー」です。
  //             毎 render 計算しますが、列数ぶんの lookup + join のみで軽量です。
  //             columnWidths の参照が変わっても、そのペインの幅が実際に変わらない限り
  //             同一文字列になるため、下の useMemo の依存値として機能します。
  const leftPaneWidthsKey = buildPaneWidthsKey(
    paneSourceColumns.left,
    uiState.columnWidths,
  );
  const centerPaneWidthsKey = buildPaneWidthsKey(
    paneSourceColumns.center,
    uiState.columnWidths,
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
    enableColumnFilter,
    gridRootRef,
  });

  // ── column widths sync ────────────────────────────────
  useEffect(() => {
    const nextWidths = visibleColumns.reduce<Record<string, number>>(
      (acc, column) => {
        acc[column.key] = column.width;
        return acc;
      },
      {},
    );
    dispatch(gridActions.syncColumnWidths(nextWidths));
  }, [visibleColumns]);

  // ── row models (source → filtered → sorted) ──────────
  const sourceRowModels = useMemo<SourceRowModel<T>[]>(
    () =>
      rows.map((row, index) => ({
        row,
        sourceIndex: index,
        rowKey: resolvedRowKeyGetter(row, index),
      })),
    [rows, resolvedRowKeyGetter],
  );

  const getColumnSelectOptions = useCallback(
    (column: GridColumn<T>) => {
      if (column.filterOptions && column.filterOptions.length > 0) {
        return column.filterOptions;
      }
      const seen = new Set<string>();
      const options = sourceRowModels.reduce<{ label: string; value: string }[]>(
        (acc, rowModel) => {
          const value = String(getCellValue(rowModel.row, column) ?? '');
          if (seen.has(value)) {
            return acc;
          }
          seen.add(value);
          acc.push({
            value,
            label: value || '（空白）',
          });
          return acc;
        },
        [],
      );
      return options.sort((left, right) =>
        left.label.localeCompare(right.label, 'ja', {
          numeric: true,
          sensitivity: 'base',
        }),
      );
    },
    [sourceRowModels],
  );

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

  // 追加(11-B7): グローバルフィルタの評価値を useDeferredValue で遅延化します。
  // 変更理由: globalText は入力欄の毎キーストロークで更新され、従来はその同期レンダー内で
  //   5,000 行のフィルタ計算(applyGlobalFilter)と下流チェーン
  //   (columnFiltered → sorted → filteredRows / SourceIndexes / Keys → 仮想行再構築)が
  //   毎回走っていました。タイピングが速いと入力欄の文字反映自体がこの計算にブロックされ、
  //   「入力の引っかかり」として体感されます。
  //   依存を deferred 値へ差し替えることで、キーストローク直後の緊急レンダーでは
  //   deferred 値が旧値のままになり、この useMemo 以下の行モデルチェーンは全て
  //   同一参照を返してスキップされます(=入力欄だけが即時更新)。フィルタ再計算は
  //   React が低優先度で行う遅延レンダーへ移り、連続タイピング中は次のキーストロークで
  //   中断・破棄されるため、中間値での計算が省かれ最終値での 1 回に収束します。
  //   入力欄の value は従来どおり即時値 globalFilterText を参照する
  //   (useGridBarContext → slotContext 経由)ため、表示が遅れることはありません。
  // 注記: pending 表示が欲しくなった場合は
  //   `const isGlobalFilterPending = deferredGlobalFilterText !== globalFilterText;`
  //   を slotContext へ載せて top bar 側で薄く出せます(今回は見送り)。
  const deferredGlobalFilterText = useDeferredValue(globalFilterText);

  const globallyFilteredRowModels = useMemo(
    () =>
      applyGlobalFilter(
        sourceRowModels,
        visibleColumns,
        deferredGlobalFilterText,
      ),
    [sourceRowModels, visibleColumns, deferredGlobalFilterText],
  );

  // 追加(12-B): 列フィルター評価値を useDeferredValue で遅延化します(11-B7 と同型)。
  // 変更理由: 12-A で set フィルターが「チェック操作ごとの即時適用」になったため、
  //   columnFilters の更新頻度が popover の Apply 押下時代より大きく上がりました。
  //   従来はチェック 1 回ごとの同期レンダー内で applyColumnFilters(最大 5,000 行)と
  //   下流チェーン(sorted → filteredRows / SourceIndexes / Keys → 仮想行再構築)が
  //   走り、連続クリック時にチェックボックスの応答がブロックされ得ます。
  //   依存を deferred 値へ差し替えることで、クリック直後の緊急レンダーでは
  //   チェックボックス表示(openedSetFilterSelectedValues は即時値 uiState を参照)・
  //   ヘッダーバッジ・bar 件数だけが即時更新され、行の再フィルタは低優先度の
  //   遅延レンダーへ移ります。連続クリック中の中間値計算は中断・破棄され、
  //   最終値での 1 回に収束します。
  // 注記: text / number フィルターの Apply 押下や「クリア」も同じ経路ですが、
  //   これらは単発操作のため体感差はなく、挙動は等価です。
  const columnFilters = uiState.filters.columnFilters;
  const deferredColumnFilters = useDeferredValue(columnFilters);

  const columnFilteredRowModels = useMemo(
    () =>
      applyColumnFilters(
        globallyFilteredRowModels,
        visibleColumns,
        deferredColumnFilters,
      ),
    [globallyFilteredRowModels, visibleColumns, deferredColumnFilters],
  );

  const filteredRowModels = useMemo(
    () => applySort(columnFilteredRowModels, visibleColumns, uiState.sort),
    [columnFilteredRowModels, visibleColumns, uiState.sort],
  );

  const filteredRows = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.row),
    [filteredRowModels],
  );

  const filteredRowSourceIndexes = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.sourceIndex),
    [filteredRowModels],
  );

  const filteredRowKeys = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.rowKey),
    [filteredRowModels],
  );

  // ── column measurements ───────────────────────────────
  const columnMeasurements = useMemo(
    () => buildColumnMeasurements(visibleColumns, uiState.columnWidths),
    [visibleColumns, uiState.columnWidths],
  );

  // 注記(10-E): columnMeasurements は columnVirtualizer の再計測トリガーとしてのみ使います。
  //             水平座標の実計算は paneLayout（ペインローカル座標）側へ移行しました。

  // ── virtualizer ───────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    // 変更(A-2): overscan を 8 → 20 に増やします。
    //   useFlushSync を切る代わりに、上下に多めの行を先回りで描画しておくことで、
    //   速いフリックでネイティブスクロールが描画ウィンドウを追い越しても、端の行が
    //   空になる前に既に用意済みの状態にして「チカチカ（端の行が一瞬抜ける）」を隠します。
    overscan: 20,
    // 変更(A-2): useFlushSync:true は毎スクロールティックで重い同期再レンダー＋強制 paint を
    //   発生させ、5000×29・メモ化なしの状況ではフレーム予算を超えてかえってカクつき/チカチカの
    //   一因になっていました。A-1(行の memo 化)で 1 フレームの仕事量を端の行だけに減らしたうえで、
    //   ここは false（通常の非同期更新）に戻し、遅延ぶんは上の overscan で吸収します。
    useFlushSync: false,
    // 変更(10-G): スクロール要素が共有コンテナになったため、行リストの開始位置は
    //             sticky ヘッダーぶん下にあります。scrollMargin で先頭オフセットを補正します。
    scrollMargin: headerHeight,
  });

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

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const totalBodyHeight = rowVirtualizer.getTotalSize();

  const virtualRowIndexes = useMemo(
    () => new Set(virtualRows.map((item) => item.index)),
    [virtualRows],
  );

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
    if (row < 0 || row >= filteredRows.length) {
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
        top: row * rowHeight,
        width: single.extent.width,
        height: rowHeight,
      },
    };
  }, [uiState.activeCell, filteredRows.length, paneLayout, rowHeight]);

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
    rowVirtualizer,
    columnVirtualizer,
    rowHeight,
    filteredRowsLength: filteredRows.length,
    columnMeasurements,
    totalScrollWidth,
    totalBodyHeight,
    headerHeight,
    leftPaneWidth: leftPaneTotalWidth,
    rightPaneWidth: rightPaneTotalWidth,
    centerLeadingWidth,
    activeCellRect: centerViewportActiveRect,
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
    filteredRowsLength: filteredRows.length,
    visibleColumnsLength: visibleColumns.length,
    // 変更(10-E): グローバル columnMeasurements / rowHeaderWidth から
    //             ペイン別 geometry + 各ペインの leadingWidth へ切り替えます。
    paneLayout,
    leftLeadingWidth,
    centerLeadingWidth,
    rightLeadingWidth,
    headerHeight,
    rowHeight,
  });

  // ── clipboard ─────────────────────────────────────────
  const { isWholeGridSelected, handleCopy, handlePaste } =
    useGridClipboardController({
      rows,
      filteredRows,
      filteredRowSourceIndexes,
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
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return;
    }
    const startCell = { row: 0, col: 0 };
    const endCell = {
      row: filteredRows.length - 1,
      col: visibleColumns.length - 1,
    };
    dispatch(gridActions.startSelection(startCell));
    dispatch(gridActions.updateSelection(endCell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(startCell));
  }, [dispatch, filteredRows.length, visibleColumns.length]);

  // ── double click → edit ───────────────────────────────
  const handleCellDoubleClick = useCallback(
    (cell: CellCoord) => {
      const row = filteredRows[cell.row];
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
    [canEditCell, dispatch, filteredRows, readOnly, orderedColumns],
  );

  // ── keyboard ──────────────────────────────────────────
  const { getMovedCell, handleKeyDown } = useGridKeyboardInteractions({
    uiState,
    filteredRows,
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
    filteredRowSourceIndexes,
    setEditorInitialValue,
    onRowsChange,
    dispatch,
    getMovedCell,
    gridRootRef,
    editorActionGuardRef,
  });

  const handleCellDoubleClickWithController = useCallback(
    (cell: CellCoord) => {
      const row = filteredRows[cell.row];
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
    [canEditCell, filteredRows, readOnly, startEditWithValue, orderedColumns],
  );

  // ── selection overlay placement（10-D: ペイン別座標系） ─
  // 変更(10-D): 選択範囲を「論理列 index 範囲 + 行範囲」に正規化し、
  //             computePaneColumnExtents / computeFullWidthPaneExtents で
  //             各ペインのローカル水平 extent に分解します。
  //             これにより選択がペインをまたいでも、各ペイン内に正しくクリップされた
  //             矩形セグメントが描画されます（AG Grid と同様のペイン別レンダリング）。
  //             固定列なしのときは center のみに extent が出て従来と一致します。
  const selectionPlacement = useMemo<{
    extents: PaneColumnExtentMap;
    top: number;
    height: number;
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
        top: normalizedRange.start.row * rowHeight,
        height:
          (normalizedRange.end.row - normalizedRange.start.row + 1) * rowHeight,
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
        top: normalizedRange.startRow * rowHeight,
        height:
          (normalizedRange.endRow - normalizedRange.startRow + 1) * rowHeight,
      };
    }

    // col selection
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
      top: 0,
      height: filteredRows.length * rowHeight,
    };
  }, [uiState.selection, paneLayout, rowHeight, filteredRows.length]);

  // 追加(10-D): 指定ペインの選択矩形（ペインローカル）を返します。該当列が無ければ null です。
  const selectionRectForPane = useCallback(
    (pane: ColumnPane): SelectionOverlayRect | null => {
      if (!selectionPlacement) {
        return null;
      }
      const extent = selectionPlacement.extents[pane];
      if (!extent) {
        return null;
      }
      return {
        left: extent.start,
        top: selectionPlacement.top,
        width: extent.width,
        height: selectionPlacement.height,
      };
    },
    [selectionPlacement],
  );

  // ── corner header ─────────────────────────────────────
  const handleCornerHeaderPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button !== 0) {
        return;
      }
      if (filteredRows.length === 0 || visibleColumns.length === 0) {
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
      filteredRows.length,
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
      dispatch(
        gridActions.startColumnResize(
          column.key,
          event.clientX,
          columnWidthsRef.current[column.key] ?? column.width,
          column.minWidth ?? 60,
          column.maxWidth ?? 1000,
        ),
      );
    },
    [dispatch],
  );

  // ── filter popover actions ────────────────────────────
  // 追加(12-A): popover を開いている列の select / set 候補です。
  // 変更理由: 従来は JSX 内で getColumnSelectOptions(openedFilterColumn) を直接呼んでおり、
  //   popover を開いたまま親が再レンダーするたび(set フィルター即時適用での再レンダー含む)に
  //   5,000 行スキャン + ソートが再実行されていました。開いている列と行データが
  //   変わらない限り、計算・参照とも再利用します。
  const openedFilterSelectOptions = useMemo<ColumnFilterPopoverOption[]>(() => {
    if (!openedFilterColumn) {
      return EMPTY_FILTER_OPTIONS;
    }
    const filterType = openedFilterColumn.filterType ?? 'text';
    if (filterType !== 'select' && filterType !== 'set') {
      return EMPTY_FILTER_OPTIONS;
    }
    return getColumnSelectOptions(openedFilterColumn);
  }, [openedFilterColumn, getColumnSelectOptions]);

  // 追加(12-A): popover を開いている列の set フィルター選択状態です。
  //             null = 全選択(フィルター未設定)を意味します。
  const openedSetFilterValue = openedFilterColumn
    ? uiState.filters.columnFilters[openedFilterColumn.key]
    : undefined;

  const openedSetFilterSelectedValues = useMemo<ReadonlySet<string> | null>(
    () =>
      isSetColumnFilterValue(openedSetFilterValue)
        ? new Set(openedSetFilterValue.values)
        : null,
    [openedSetFilterValue],
  );

  // 追加(12-A): set フィルターの選択結果を reducer へ反映します。
  //             全候補が選択された状態は clearColumn へ正規化し
  //             「フィルターなし」(ヘッダーバッジ消灯 / 件数 0 扱い)へ戻します。
  const commitSetFilterSelection = useCallback(
    (columnKey: string, nextSelected: Set<string>) => {
      const isAllSelected = openedFilterSelectOptions.every((option) =>
        nextSelected.has(option.value),
      );
      if (isAllSelected) {
        dispatch(gridActions.clearColumnFilter(columnKey));
        return;
      }
      const nextValue: SetColumnFilterValue = {
        kind: 'set',
        values: Array.from(nextSelected),
      };
      dispatch(gridActions.setColumnFilter(columnKey, nextValue));
    },
    [dispatch, openedFilterSelectOptions],
  );

  // 追加(12-A): チェックボックス 1 件のトグルです(AG Grid Set Filter と同じ即時適用)。
  const handleSetFilterValueToggle = useCallback(
    (value: string) => {
      if (!filterPopoverState) {
        return;
      }
      const nextSelected = new Set(
        openedSetFilterSelectedValues ??
          openedFilterSelectOptions.map((option) => option.value),
      );
      if (nextSelected.has(value)) {
        nextSelected.delete(value);
      } else {
        nextSelected.add(value);
      }
      commitSetFilterSelection(filterPopoverState.columnKey, nextSelected);
    },
    [
      filterPopoverState,
      openedSetFilterSelectedValues,
      openedFilterSelectOptions,
      commitSetFilterSelection,
    ],
  );

  // 追加(12-A): (Select All) の一括トグルです。検索中は popover 側から
  //             「表示中候補の values」だけが渡るため、検索結果のみが対象になります。
  const handleSetFilterSelectAllChange = useCallback(
    (visibleValues: string[], nextChecked: boolean) => {
      if (!filterPopoverState) {
        return;
      }
      const nextSelected = new Set(
        openedSetFilterSelectedValues ??
          openedFilterSelectOptions.map((option) => option.value),
      );
      if (nextChecked) {
        visibleValues.forEach((value) => nextSelected.add(value));
      } else {
        visibleValues.forEach((value) => nextSelected.delete(value));
      }
      commitSetFilterSelection(filterPopoverState.columnKey, nextSelected);
    },
    [
      filterPopoverState,
      openedSetFilterSelectedValues,
      openedFilterSelectOptions,
      commitSetFilterSelection,
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
    const normalized =
      filterType === 'select'
        ? filterPopoverState.draftValue
        : filterPopoverState.draftValue.trim();
    if (!normalized) {
      dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
      closeColumnFilterPopover();
      return;
    }
    dispatch(
      gridActions.setColumnFilter(filterPopoverState.columnKey, normalized),
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
  const handleColumnSortButtonPointerDown = useCallback(
    (columnKey: string, event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!enableSorting) {
        return;
      }
      if (
        uiState.sort.columnKey !== columnKey ||
        uiState.sort.direction === null
      ) {
        dispatch(gridActions.setSort(columnKey, 'asc'));
        return;
      }
      if (uiState.sort.direction === 'asc') {
        dispatch(gridActions.setSort(columnKey, 'desc'));
        return;
      }
      dispatch(gridActions.clearSort());
    },
    [dispatch, enableSorting, uiState.sort],
  );

  const getSortIndicator = useCallback(
    (columnKey: string) => {
      if (
        !enableSorting ||
        uiState.sort.columnKey !== columnKey ||
        !uiState.sort.direction
      ) {
        return '↕';
      }
      return uiState.sort.direction === 'asc' ? '↑' : '↓';
    },
    [enableSorting, uiState.sort],
  );

  // ── header action button style ────────────────────────
  const getHeaderActionButtonStyle = useCallback(
    (isActive: boolean): CSSProperties => ({
      border: '1px solid #cbd5e1',
      backgroundColor: isActive ? '#dbeafe' : '#ffffff',
      color: isActive ? '#2563eb' : '#475569',
      borderRadius: 6,
      width: 24,
      height: 24,
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: 11,
      flex: '0 0 auto',
    }),
    [],
  );

  // ── cell content renderer ─────────────────────────────
  // 変更(11-A): isActive / isSelected / isEditing / readOnly の判定を GridBodyRow 側へ
  //             移し、ここでは算出済みの cellState を受け取るだけにします。
  // 変更理由: 旧実装は uiState に依存しており、選択ドラッグ・active cell 移動・編集開始の
  //           たびにこの useCallback の参照が変わり、props として受け取る GridBodyRow(memo)
  //           の比較が全行で不一致になっていました(=毎 pointermove で全行×3ペイン再構築)。
  //           依存を rows / filteredRowSourceIndexes / onRowsChange のみへ縮小したことで、
  //           uiState がどう変わっても本関数は同一参照を保ちます(rows 変更=編集 commit 時
  //           とフィルター/ソート変更時だけ参照が変わりますが、それらは行内容自体が変わる
  //           ため再レンダーが必要なケースです)。
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
            const originalRowIndex =
              filteredRowSourceIndexes[rowIndex] ?? rowIndex;
            const nextRows = rows.map((currentRow, index) =>
              index === originalRowIndex
                ? setCellValue(currentRow, column, nextValue)
                : currentRow,
            );
            onRowsChange(nextRows);
          },
        });
      }
      return <span>{String(value ?? '')}</span>;
    },
    [filteredRowSourceIndexes, onRowsChange, rows],
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
    filteredRows,
    columns,
    visibleColumns,
    uiState,
    setGlobalFilterText,
  });

  // ── styles ────────────────────────────────────────────
  const gridShellStyle: CSSProperties = {
    border: '1px solid #d7dce3',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
  };

  // 変更(A-1): style オブジェクトを useMemo で安定化します。
  //   これらは GridBodyRow(memo) に props として渡るため、毎レンダーで新しい参照を作ると
  //   memo の shallow 比較が必ず不一致になり、行のスキップが効かなくなります。
  const headerCellBaseStyle: CSSProperties = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      boxSizing: 'border-box',
      padding: '0 10px',
      borderRight: '1px solid #e5e7eb',
      borderBottom: '1px solid #d7dce3',
      backgroundColor: '#f8fafc',
      fontSize: 13,
      fontWeight: 600,
      color: '#334155',
    }),
    [],
  );

  const rowHeaderCellStyle: CSSProperties = useMemo(
    () => ({
      ...headerCellBaseStyle,
      justifyContent: 'center',
      width: rowHeaderWidth,
      minWidth: rowHeaderWidth,
      position: 'sticky',
      left: 0,
      zIndex: 1,
    }),
    [headerCellBaseStyle, rowHeaderWidth],
  );

  // 追加(10-G): 共有スクロールコンテナ（縦横ともにネイティブスクロール）の style です。
  // 変更理由: スクロールを 1 つの要素に集約し、固定列は position: sticky で横方向だけ留めます。
  //           これにより全ペインが同一スクロールで動き、固定列のチカチカ（ティアリング）が
  //           原理的に消えます。
  const scrollContainerStyle: CSSProperties = {
    maxHeight: 480,
    overflow: 'auto',
    position: 'relative',
  };

  // 追加(10-G): スクロールコンテンツ本体（3 ペインを横並びにする flex 行）の style です。
  //             width=コンテンツ全幅 / height=ヘッダー+ボディ全高 を明示し、
  //             縦横のスクロール範囲を確定させます。
  const innerRowStyle: CSSProperties = {
    display: 'flex',
    width: totalScrollWidth,
    minWidth: totalScrollWidth,
    height: headerHeight + totalBodyHeight,
  };

  // 追加(12-B): フィルター結果 0 行時の空状態表示(AG Grid の "No Matching Rows" 相当)です。
  // 変更理由: 従来は totalBodyHeight=0 でボディが高さごと潰れ、空白だけが残っていました。
  //           sticky ヘッダーの下に固定高の案内領域を確保し、メッセージを表示します。
  // 配置のポイント:
  //   - inner flex row(幅 totalScrollWidth)の「後ろ」に通常フローで置くことで、
  //     ブロック要素の auto 幅はスクロールコンテナの clientWidth に一致します
  //     (兄弟のはみ出し幅には引っ張られません)。
  //   - position: sticky; left: 0 により、横スクロールしてもメッセージが
  //     ビューポート中央に留まります(ヘッダーは従来どおり横スクロール可能)。
  const isBodyEmpty = filteredRows.length === 0;

  const emptyStateStyle: CSSProperties = {
    position: 'sticky',
    left: 0,
    height: 160,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 13,
    userSelect: 'none',
  };

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
  const centerPaneStyle: CSSProperties = {
    width: centerContentWidth,
    minWidth: centerContentWidth,
    flexShrink: 0,
    position: 'relative',
    zIndex: 1,
  };

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
      return `${rawValue.values.length}件を選択中`;
    }
    const text = String(rawValue ?? '').trim();
    return text ? String(rawValue) : '（なし）';
  })();

  const renderedFilterPopover = openedFilterColumn ? (
    <ColumnFilterPopover
      isOpen={Boolean(filterPopoverState)}
      title={openedFilterColumn.title || openedFilterColumn.key}
      filterType={openedFilterColumn.filterType ?? 'text'}
      draftValue={filterPopoverState?.draftValue ?? ''}
      currentValueText={openedFilterCurrentValueText}
      layout={filterPopoverLayout}
      selectOptions={openedFilterSelectOptions}
      setSelectedValues={openedSetFilterSelectedValues}
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

  // ── slot bars ─────────────────────────────────────────
  // 追加: slot helper を使って top/bottom の描画を解決します。
  const resolvedTopBar = resolveGridSlot(
    renderTopBar,
    slotContext,
    enableGlobalFilter ? <DefaultGridTopBar context={slotContext} /> : null,
  );

  // 追加: bottom は未指定時に既定ステータスバーを表示します。
  const resolvedBottomBar = resolveGridSlot(
    renderBottomBar,
    slotContext,
    <DefaultGridBottomBar context={slotContext} />,
  );

  // ── render ────────────────────────────────────────────
  return (
    <div className={className}>
      {resolvedTopBar}

      <div
        ref={gridRootRef}
        style={gridShellStyle}
        onDragStart={handleNativeDragStart}
        onPointerMoveCapture={(event) => {
          pointerClientRef.current = { x: event.clientX, y: event.clientY };
          updateSelectionFromPointer(event.clientX, event.clientY);
        }}
        // 追加: popover open 中は grid root を tab フォーカス対象から外します。
        tabIndex={isFilterPopoverOpen ? -1 : 0}
        // 追加: popover open 中は root の keyboard/paste handler 自体を外します。
        onKeyDown={isFilterPopoverOpen ? undefined : handleKeyDown}
        onPaste={isFilterPopoverOpen ? undefined : handlePaste}
      >
        {/* ── 変更(10-G): 縦横スクロールを 1 本化した共有スクロールコンテナ ── */}
        {/*   旧: 中央ペインのみ overflow:auto + 左右ペインを JS の transform で同期     */}
        {/*   新: 外側コンテナが縦横ともネイティブスクロール / 固定列は position: sticky  */}
        {/*   pinned 列がない場合は左右ペインが width:0 で非表示、中央ペインのみ表示。     */}
        <div ref={scrollContainerRef} style={scrollContainerStyle}>
          <div style={innerRowStyle}>

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
                  width: leftPaneTotalWidth,
                  minWidth: leftPaneTotalWidth,
                  height: headerHeight + totalBodyHeight,
                }}
              >
                <GridHeaderRow
                  pane="left"
                  ownsRowHeader
                  leadingWidth={leftLeadingWidth}
                  rowHeaderWidth={rowHeaderWidth}
                  headerHeight={headerHeight}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  headerCellBaseStyle={headerCellBaseStyle}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  filteredRowsLength={filteredRows.length}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={leftRenderEntries}
                  hoveredColumnIndex={hoveredColumnIndex}
                  selectionSnapshot={selectionSnapshot}
                  columnFilterValues={uiState.filters.columnFilters}
                  sortState={uiState.sort}
                  getHeaderActionButtonStyle={getHeaderActionButtonStyle}
                  getSortIndicator={getSortIndicator}
                  onCornerPointerDown={handleCornerHeaderPointerDown}
                  onCornerPointerEnter={handleCornerPointerEnterStable}
                  onCornerPointerLeave={handleCornerPointerLeaveStable}
                  onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
                  onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
                  onColumnHeaderPointerLeave={handleColumnHeaderPointerLeaveStable}
                  onColumnSortButtonPointerDown={
                    handleColumnSortButtonPointerDown
                  }
                  onColumnFilterButtonPointerDown={openColumnFilterPopover}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
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
                    height: headerHeight + totalBodyHeight,
                  }}
                >
                <SelectionOverlay
                  rect={selectionRectForPane('left')}
                  headerHeight={headerHeight}
                  leadingWidth={leftLeadingWidth}
                />

                <ActiveCellOverlay
                  rect={activeCellRectForPane('left')}
                  headerHeight={headerHeight}
                  leadingWidth={leftLeadingWidth}
                />

                <CellEditorLayer
                  rect={editorRectForPane('left')}
                  headerHeight={headerHeight}
                  leadingWidth={leftLeadingWidth}
                  initialValue={editorInitialValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />

                <GridBodyLayer
                  pane="left"
                  ownsRowHeader
                  leadingWidth={leftLeadingWidth}
                  filteredRows={filteredRows}
                  filteredRowKeys={filteredRowKeys}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={leftRenderEntries}
                  rowHeight={rowHeight}
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
                />
                </div>
              </div>
            )}
          </div>

          {/* ── 中央ペイン ── */}
          {/* 変更(10-G): 自前のスクロールは持たず、共有コンテナのスクロールに乗ります。   */}
          {/*   bodyScrollRef はヒットテストの基準矩形としてのみ使用します（scrollTop/Left は 0）。*/}
          {/* 変更(10-C): 行ヘッダーは左固定列が無いときだけ中央が持ちます（従来と同一）。*/}
          <div
            ref={bodyScrollRef}
            style={centerPaneStyle}
          >
            <div
              style={{
                position: 'relative',
                width: centerContentWidth,
                minWidth: centerContentWidth,
                height: headerHeight + totalBodyHeight,
              }}
            >
              <GridHeaderRow
                pane="center"
                ownsRowHeader={centerOwnsRowHeader}
                leadingWidth={centerLeadingWidth}
                rowHeaderWidth={rowHeaderWidth}
                headerHeight={headerHeight}
                rowHeaderCellStyle={rowHeaderCellStyle}
                headerCellBaseStyle={headerCellBaseStyle}
                isCornerHovered={isCornerHovered}
                isWholeGridSelected={isWholeGridSelected}
                filteredRowsLength={filteredRows.length}
                visibleColumnsLength={visibleColumns.length}
                renderEntries={centerRenderEntries}
                hoveredColumnIndex={hoveredColumnIndex}
                selectionSnapshot={selectionSnapshot}
                columnFilterValues={uiState.filters.columnFilters}
                sortState={uiState.sort}
                getHeaderActionButtonStyle={getHeaderActionButtonStyle}
                getSortIndicator={getSortIndicator}
                onCornerPointerDown={handleCornerHeaderPointerDown}
                onCornerPointerEnter={handleCornerPointerEnterStable}
                onCornerPointerLeave={handleCornerPointerLeaveStable}
                onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
                onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
                onColumnHeaderPointerLeave={handleColumnHeaderPointerLeaveStable}
                onColumnSortButtonPointerDown={handleColumnSortButtonPointerDown}
                onColumnFilterButtonPointerDown={openColumnFilterPopover}
                onColumnResizePointerDown={handleColumnResizePointerDown}
              />

              {/* 変更(10-D): 中央ペインの overlay をペインローカル座標に切替。*/}
              {/*   leadingWidth は centerLeadingWidth（固定列なしのとき rowHeaderWidth）。*/}
              <SelectionOverlay
                rect={selectionRectForPane('center')}
                headerHeight={headerHeight}
                leadingWidth={centerLeadingWidth}
              />

              <ActiveCellOverlay
                rect={activeCellRectForPane('center')}
                headerHeight={headerHeight}
                leadingWidth={centerLeadingWidth}
              />

              <CellEditorLayer
                rect={editorRectForPane('center')}
                headerHeight={headerHeight}
                leadingWidth={centerLeadingWidth}
                initialValue={editorInitialValue}
                onCommit={commitEdit}
                onCancel={cancelEdit}
              />

              <GridBodyLayer
                pane="center"
                ownsRowHeader={centerOwnsRowHeader}
                leadingWidth={centerLeadingWidth}
                filteredRows={filteredRows}
                filteredRowKeys={filteredRowKeys}
                virtualRows={virtualRows}
                virtualRowIndexes={virtualRowIndexes}
                renderEntries={centerRenderEntries}
                rowHeight={rowHeight}
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
              />
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
                  width: rightPaneTotalWidth,
                  minWidth: rightPaneTotalWidth,
                  height: headerHeight + totalBodyHeight,
                }}
              >
                <GridHeaderRow
                  pane="right"
                  ownsRowHeader={false}
                  leadingWidth={rightLeadingWidth}
                  rowHeaderWidth={rowHeaderWidth}
                  headerHeight={headerHeight}
                  rowHeaderCellStyle={rowHeaderCellStyle}
                  headerCellBaseStyle={headerCellBaseStyle}
                  isCornerHovered={isCornerHovered}
                  isWholeGridSelected={isWholeGridSelected}
                  filteredRowsLength={filteredRows.length}
                  visibleColumnsLength={visibleColumns.length}
                  renderEntries={rightRenderEntries}
                  hoveredColumnIndex={hoveredColumnIndex}
                  selectionSnapshot={selectionSnapshot}
                  columnFilterValues={uiState.filters.columnFilters}
                  sortState={uiState.sort}
                  getHeaderActionButtonStyle={getHeaderActionButtonStyle}
                  getSortIndicator={getSortIndicator}
                  onCornerPointerDown={handleCornerHeaderPointerDown}
                  onCornerPointerEnter={handleCornerPointerEnterStable}
                  onCornerPointerLeave={handleCornerPointerLeaveStable}
                  onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
                  onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
                  onColumnHeaderPointerLeave={handleColumnHeaderPointerLeaveStable}
                  onColumnSortButtonPointerDown={
                    handleColumnSortButtonPointerDown
                  }
                  onColumnFilterButtonPointerDown={openColumnFilterPopover}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
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
                    height: headerHeight + totalBodyHeight,
                  }}
                >
                <SelectionOverlay
                  rect={selectionRectForPane('right')}
                  headerHeight={headerHeight}
                  leadingWidth={rightLeadingWidth}
                />

                <ActiveCellOverlay
                  rect={activeCellRectForPane('right')}
                  headerHeight={headerHeight}
                  leadingWidth={rightLeadingWidth}
                />

                <CellEditorLayer
                  rect={editorRectForPane('right')}
                  headerHeight={headerHeight}
                  leadingWidth={rightLeadingWidth}
                  initialValue={editorInitialValue}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />

                <GridBodyLayer
                  pane="right"
                  ownsRowHeader={false}
                  leadingWidth={rightLeadingWidth}
                  filteredRows={filteredRows}
                  filteredRowKeys={filteredRowKeys}
                  virtualRows={virtualRows}
                  virtualRowIndexes={virtualRowIndexes}
                  renderEntries={rightRenderEntries}
                  rowHeight={rowHeight}
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
                />
                </div>
              </div>
            )}
          </div>

          </div>
          {/* ── /スクロールコンテンツ本体（inner flex row） ── */}

          {/* 追加(12-B): 0 行時の空状態表示です。rows 自体が 0 件か、
              フィルターで 0 件になったかでメッセージを切り替えます。 */}
          {isBodyEmpty && (
            <div style={emptyStateStyle}>
              {rows.length === 0 ? noRowsText : noMatchingRowsText}
            </div>
          )}
        </div>
        {/* ── /共有スクロールコンテナ ── */}
      </div>

      {resolvedBottomBar}
      {renderedFilterPopover}
    </div>
  );
}

export default SpreadsheetGrid;