// 追加: 列フィルター UI 整備 + ソート/フィルター見た目強化を反映します。
import {
  useEffect,
  useMemo,
  useCallback,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { gridActions } from './model/gridActions';
import { createInitialGridUiState, gridUiReducer } from './model/gridReducer';
import {
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
  selectColumnWidth,
  selectGlobalFilter,
  selectIsActiveCell,
  selectIsCellSelected,
  selectIsColumnSelected,
  selectIsEditingCell,
  selectIsRowSelected,
} from './model/gridSelectors';
import SelectionOverlay, {
  type SelectionOverlayRect,
} from './SelectionOverlay';
import ActiveCellOverlay, {
  type ActiveCellOverlayRect,
} from './ActiveCellOverlay';
import CellEditorLayer, {
  type EditorCommitDirection,
} from './CellEditorLayer';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  SpreadsheetGridProps,
} from './model/gridTypes';
import { toExcelColumnName } from './utils/excelColumnName';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import {
  applyClipboardMatrixToRows,
  parseClipboardText,
  serializeSelectionToTsv,
} from './utils/clipboard';

// 追加: 列の座標計算を共通化するための measurement 型です。
type ColumnMeasurement<T> = {
  index: number;
  column: GridColumn<T>;
  start: number;
  size: number;
  end: number;
};

// 追加: 元 rows と filteredRows の対応を安定して持つための row model です。
type SourceRowModel<T> = {
  row: T;
  sourceIndex: number;
  rowKey: GridRowKey;
};

// 追加: 列フィルターポップオーバーの状態です。
type HeaderFilterPopoverState = {
  columnKey: string;
  draftValue: string;
};

// 追加: body 直下 portal popover の配置情報です。
type FilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
};

// 追加: number フィルターの解釈結果です。
type ParsedNumberFilter =
  | {
      mode: 'comparison';
      operator: '>' | '>=' | '<' | '<=' | '=';
      value: number;
    }
  | {
      mode: 'range';
      min: number;
      max: number;
    };

// 追加: columns + columnWidths から、列座標の measurement 一覧を生成します。
const buildColumnMeasurements = <T,>(
  columns: GridColumn<T>[],
  columnWidths: Record<string, number>,
): ColumnMeasurement<T>[] => {
  let start = 0;
  return columns.map((column, index) => {
    const size = columnWidths[column.key] ?? column.width;
    const measurement: ColumnMeasurement<T> = {
      index,
      column,
      start,
      size,
      end: start + size,
    };
    start += size;
    return measurement;
  });
};

// 追加: x 座標から列 index を特定するための二分探索です。
const findColumnIndexFromOffset = <T,>(
  measurements: ColumnMeasurement<T>[],
  offset: number,
) => {
  if (measurements.length === 0) {
    return -1;
  }
  if (offset <= 0) {
    return 0;
  }
  let low = 0;
  let high = measurements.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = measurements[mid];
    if (offset < current.start) {
      high = mid - 1;
      continue;
    }
    if (offset >= current.end) {
      low = mid + 1;
      continue;
    }
    return current.index;
  }
  return Math.max(0, Math.min(low, measurements.length - 1));
};

// 追加: 行フィルターの最小実装です。初版では global filter のみをここで扱います。
const applyGlobalFilter = <T,>(
  rowModels: SourceRowModel<T>[],
  columns: GridColumn<T>[],
  globalText: string,
) => {
  const normalizedFilter = globalText.trim().toLowerCase();
  if (!normalizedFilter) {
    return rowModels;
  }
  return rowModels.filter((rowModel) =>
    columns.some((column) => {
      const value = getCellValue(rowModel.row, column);
      return String(value ?? '').toLowerCase().includes(normalizedFilter);
    }),
  );
};

// 追加: number フィルター式を解釈します。
const parseNumberFilterExpression = (
  rawValue: string,
): ParsedNumberFilter | null => {
  const normalized = rawValue.trim();
  if (!normalized) {
    return null;
  }

  const rangeMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return null;
    }
    return {
      mode: 'range',
      min: Math.min(first, second),
      max: Math.max(first, second),
    };
  }

  const comparisonMatch = normalized.match(
    /^(<=|>=|=|<|>)?\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (!comparisonMatch) {
    return null;
  }

  return {
    mode: 'comparison',
    operator: (comparisonMatch[1] ?? '=') as '>' | '>=' | '<' | '<=' | '=',
    value: Number(comparisonMatch[2]),
  };
};

// 追加: number 型フィルターの評価です。
const applyNumberFilter = (cellValue: unknown, filterValue: unknown) => {
  const normalizedFilter = String(filterValue ?? '').trim();
  if (!normalizedFilter) {
    return true;
  }

  const parsedFilter = parseNumberFilterExpression(normalizedFilter);
  if (!parsedFilter) {
    // 追加: 式として解釈できない場合は contains にフォールバックします。
    return String(cellValue ?? '')
      .toLowerCase()
      .includes(normalizedFilter.toLowerCase());
  }

  const numericCellValue = Number(cellValue);
  if (!Number.isFinite(numericCellValue)) {
    return false;
  }

  if (parsedFilter.mode === 'range') {
    return (
      numericCellValue >= parsedFilter.min &&
      numericCellValue <= parsedFilter.max
    );
  }

  switch (parsedFilter.operator) {
    case '>':
      return numericCellValue > parsedFilter.value;
    case '>=':
      return numericCellValue >= parsedFilter.value;
    case '<':
      return numericCellValue < parsedFilter.value;
    case '<=':
      return numericCellValue <= parsedFilter.value;
    case '=':
    default:
      return numericCellValue === parsedFilter.value;
  }
};

// 追加: 列ごとのフィルターを適用します。text / number / select の最小実装です。
//       column.filterFn がある場合はそれを優先します。
const applyColumnFilters = <T,>(
  rowModels: SourceRowModel<T>[],
  columns: GridColumn<T>[],
  columnFilters: Record<string, unknown>,
) => {
  return rowModels.filter((rowModel) =>
    columns.every((column) => {
      const filterValue = columnFilters[column.key];
      const normalizedFilter = String(filterValue ?? '').trim().toLowerCase();
      if (!normalizedFilter) {
        return true;
      }
      if (column.filterFn) {
        return column.filterFn(rowModel.row, filterValue);
      }

      const cellValue = getCellValue(rowModel.row, column);
      const filterType = column.filterType ?? 'text';

      if (filterType === 'number') {
        return applyNumberFilter(cellValue, filterValue);
      }

      if (filterType === 'select') {
        return String(cellValue ?? '') === String(filterValue ?? '');
      }

      return String(cellValue ?? '').toLowerCase().includes(normalizedFilter);
    }),
  );
};

// 追加: 値比較を行います。数値化できるものは数値比較し、
//       それ以外は文字列比較へフォールバックします。
const compareUnknownValues = (left: unknown, right: unknown) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  if (bothNumeric) {
    return leftNumber - rightNumber;
  }
  return String(left ?? '').localeCompare(String(right ?? ''), 'ja', {
    numeric: true,
    sensitivity: 'base',
  });
};

// 追加: 単一列ソートを適用します。初版は 1列のみ扱います。
const applySort = <T,>(
  rowModels: SourceRowModel<T>[],
  columns: GridColumn<T>[],
  sort: { columnKey: string | null; direction: 'asc' | 'desc' | null },
) => {
  if (!sort.columnKey || !sort.direction) {
    return rowModels;
  }
  const column = columns.find((item) => item.key === sort.columnKey);
  if (!column) {
    return rowModels;
  }
  const multiplier = sort.direction === 'asc' ? 1 : -1;
  return [...rowModels].sort((leftRowModel, rightRowModel) => {
    const compared = compareUnknownValues(
      getCellValue(leftRowModel.row, column),
      getCellValue(rightRowModel.row, column),
    );
    if (compared !== 0) {
      return compared * multiplier;
    }
    // 追加: 安定ソートのため sourceIndex を tie-breaker にします。
    return leftRowModel.sourceIndex - rightRowModel.sourceIndex;
  });
};

// 追加: 値を min/max に収めるユーティリティです。
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// 追加: 文字キー入力で編集開始する判定です。
const isPrintableKey = (event: KeyboardEvent<HTMLDivElement>) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

// 追加: input/select/textarea/button/contenteditable 配下では
//       grid のキーボードショートカットを発火させないための判定です。
const shouldIgnoreGridKeydown = (eventTarget: EventTarget | null) => {
  if (!(eventTarget instanceof HTMLElement)) {
    return false;
  }

  const interactiveElement = eventTarget.closest(
    'input, textarea, select, button, [contenteditable="true"]',
  );

  return interactiveElement !== null;
};

// 追加: Grid 本体です。
export function SpreadsheetGrid<T>({
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
  className,
}: SpreadsheetGridProps<T>) {
  // 追加: Grid ルート参照です。keyboard / paste の起点に使います。
  const gridRootRef = useRef<HTMLDivElement | null>(null);
  // 追加: drag 中ポインタ位置を保持します。
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null);
  // 追加: drag 中の端オートスクロールに使う frame id です。
  const autoScrollFrameRef = useRef<number | null>(null);
  // 追加: body のスクロールコンテナ参照です。row virtualization / column virtualization に使います。
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  // 追加: 編集中の入力値です。editingCell 自体は reducer state を使います。
  const [editorValue, setEditorValue] = useState('');
  const editorActionGuardRef = useRef(false);
  // 追加: 左上コーナーセル hover 状態です。
  const [isCornerHovered, setIsCornerHovered] = useState(false);
  // 追加: 行ヘッダー hover 状態です。
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  // 追加: 列ヘッダー hover 状態です。
  const [hoveredColumnIndex, setHoveredColumnIndex] = useState<number | null>(
    null,
  );
  // 追加: 列フィルターポップオーバーの開閉状態です。
  const [filterPopoverState, setFilterPopoverState] =
    useState<HeaderFilterPopoverState | null>(null);
  // 追加: portal popover の画面配置情報です。
  const [filterPopoverLayout, setFilterPopoverLayout] =
    useState<FilterPopoverLayout | null>(null);
  // 追加: フィルターポップオーバーの外側クリック判定に使います。
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  // 追加: filter ボタンの DOM を保持し、portal popover の位置計算に使います。
  const filterPopoverAnchorButtonRef = useRef<HTMLButtonElement | null>(null);
  // 追加: text filter input の自動 focus 用 ref です。
  const filterTextInputRef = useRef<HTMLInputElement | null>(null);
  // 追加: select filter の自動 focus 用 ref です。
  const filterSelectRef = useRef<HTMLSelectElement | null>(null);
  // 追加: popover open 状態を boolean で持ち、keyboard / paste 抑止条件に使います。
  const isFilterPopoverOpen = filterPopoverState !== null;
  // 追加: draftValue 変更ではなく、open 中の列キー単位で状態を追うための値です。
  const openedFilterColumnKey = filterPopoverState?.columnKey ?? null;

  // 追加: visible column だけを描画対象にします。
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible !== false),
    [columns],
  );

  // 追加: rowKeyGetter のデフォルト実装です。未指定時は source index を使います。
  const resolvedRowKeyGetter = useMemo(
    () => rowKeyGetter ?? ((_row: T, index: number) => index),
    [rowKeyGetter],
  );

  // 追加: reducer 初期化です。列幅などをここで初期化します。
  const [uiState, dispatch] = useReducer(
    gridUiReducer,
    visibleColumns,
    createInitialGridUiState,
  );

  // 追加: columns が変わった際に column width map を同期します。
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

  // 追加: source rows を row model 化します。
  const sourceRowModels = useMemo<SourceRowModel<T>[]>(
    () =>
      rows.map((row, index) => ({
        row,
        sourceIndex: index,
        rowKey: resolvedRowKeyGetter(row, index),
      })),
    [rows, resolvedRowKeyGetter],
  );

  // 追加: select フィルター候補を列定義または rows から取得します。
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

  // 追加: body 直下 portal popover の表示位置を計算します。
  const updateFilterPopoverLayout = useCallback(() => {
    if (!openedFilterColumnKey || !filterPopoverAnchorButtonRef.current) {
      setFilterPopoverLayout(null);
      return;
    }

    const anchorRect = filterPopoverAnchorButtonRef.current.getBoundingClientRect();

    const POPUP_WIDTH = 240;
    const VIEWPORT_MARGIN = 8;
    const OFFSET_Y = 8;
    const ESTIMATED_POPUP_HEIGHT = 260;

    let left = anchorRect.right - POPUP_WIDTH;
    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN);

    let top = anchorRect.bottom + OFFSET_Y;
    if (top + ESTIMATED_POPUP_HEIGHT > window.innerHeight - VIEWPORT_MARGIN) {
      top = anchorRect.top - ESTIMATED_POPUP_HEIGHT - OFFSET_Y;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    setFilterPopoverLayout((current) => {
      if (
        current &&
        current.top === top &&
        current.left === left &&
        current.width === POPUP_WIDTH
      ) {
        return current;
      }

      return {
        top,
        left,
        width: POPUP_WIDTH,
      };
    });
  }, [openedFilterColumnKey]);

  // 追加: グローバルフィルター適用済み row models です。
  const globallyFilteredRowModels = useMemo(
    () =>
      applyGlobalFilter(
        sourceRowModels,
        visibleColumns,
        selectGlobalFilter(uiState),
      ),
    [sourceRowModels, visibleColumns, uiState],
  );

  // 追加: 列フィルターを global filter 後に適用します。
  const columnFilteredRowModels = useMemo(
    () =>
      applyColumnFilters(
        globallyFilteredRowModels,
        visibleColumns,
        uiState.filters.columnFilters,
      ),
    [globallyFilteredRowModels, visibleColumns, uiState.filters.columnFilters],
  );

  // 追加: 最後にソートを適用します。
  const filteredRowModels = useMemo(
    () => applySort(columnFilteredRowModels, visibleColumns, uiState.sort),
    [columnFilteredRowModels, visibleColumns, uiState.sort],
  );

  // 追加: 描画用 rows 配列です。
  const filteredRows = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.row),
    [filteredRowModels],
  );

  // 追加: filteredRows の元 rows index を保持します。
  const filteredRowSourceIndexes = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.sourceIndex),
    [filteredRowModels],
  );

  // 追加: filteredRows の rowKey 一覧です。
  const filteredRowKeys = useMemo(
    () => filteredRowModels.map((rowModel) => rowModel.rowKey),
    [filteredRowModels],
  );

  // 追加: 列 geometry を measurement として共通管理します。
  const columnMeasurements = useMemo(
    () => buildColumnMeasurements(visibleColumns, uiState.columnWidths),
    [visibleColumns, uiState.columnWidths],
  );

  // 追加: 列方向の総幅です。overlay / container / virtualization で共通利用します。
  const totalColumnWidth = useMemo(
    () =>
      columnMeasurements.length > 0
        ? columnMeasurements[columnMeasurements.length - 1].end
        : 0,
    [columnMeasurements],
  );

  // 追加: row virtualizer です。
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    useFlushSync: false,
  });

  // 追加: column virtualizer です。
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: visibleColumns.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: (index) =>
      columnMeasurements[index]?.size ?? visibleColumns[index]?.width ?? 120,
    overscan: 4,
    useFlushSync: false,
  });

  // 追加: 列/行サイズ変化時に virtualizer の measurement を再取得します。
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, rowHeight, filteredRows.length]);

  // 追加: column geometry が変わった際に horizontal virtualizer を再計測します。
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnVirtualizer, columnMeasurements]);

  // 追加: selection drag / column resize drag 中の window pointer イベントを処理します。
  useEffect(() => {
    const handleWindowPointerMove = (event: globalThis.PointerEvent) => {
      pointerClientRef.current = { x: event.clientX, y: event.clientY };
      if (uiState.dragState?.type === 'columnResize') {
        dispatch(gridActions.updateColumnResize(event.clientX));
      }
    };
    const handleWindowPointerUp = () => {
      dispatch(gridActions.endSelection());
      dispatch(gridActions.endColumnResize());
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [uiState.dragState]);

  // 追加: portal popover の位置を open / resize / scroll に応じて再計算します。
  useEffect(() => {
    if (!openedFilterColumnKey) {
      return;
    }

    updateFilterPopoverLayout();

    const handleReposition = () => {
      updateFilterPopoverLayout();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [openedFilterColumnKey, updateFilterPopoverLayout]);

  // 追加: popover が実際に描画され、かつ「開いた直後 / 別列へ切替時」にだけ
  //       input / select へ自動 focus します。
  //       draftValue 更新では再実行しないように columnKey ベースで監視します。
  useEffect(() => {
    if (!openedFilterColumnKey || !filterPopoverLayout) {
      return;
    }

    const targetColumn = visibleColumns.find(
      (column) => column.key === openedFilterColumnKey,
    );
    const filterType = targetColumn?.filterType ?? 'text';

    let frameId1 = 0;
    let frameId2 = 0;

    // 追加: portal 描画完了をより確実に待ってから focus します。
    frameId1 = requestAnimationFrame(() => {
      frameId2 = requestAnimationFrame(() => {
        if (filterType === 'select') {
          filterSelectRef.current?.focus();
          return;
        }

        const inputElement = filterTextInputRef.current;
        if (!inputElement) {
          return;
        }

        inputElement.focus();
        // 追加: 全文選択ではなく末尾へ caret を置き、半角入力時の全文置換を避けます。
        const end = inputElement.value.length;
        inputElement.setSelectionRange(end, end);
      });
    });

    return () => {
      cancelAnimationFrame(frameId1);
      cancelAnimationFrame(frameId2);
    };
  }, [
    openedFilterColumnKey,
    filterPopoverLayout?.top,
    filterPopoverLayout?.left,
    filterPopoverLayout?.width,
    visibleColumns,
  ]);

  // 追加: 仮想行一覧です。
  const virtualRows = rowVirtualizer.getVirtualItems();
  // 追加: 仮想列一覧です。
  const virtualColumns = columnVirtualizer.getVirtualItems();
  // 追加: 仮想 body の総高さです。
  const totalBodyHeight = rowVirtualizer.getTotalSize();

  // 追加: visible row の開始・終了 index を保持します。
  const virtualRowIndexes = useMemo(
    () => new Set(virtualRows.map((item) => item.index)),
    [virtualRows],
  );
  // 追加: visible column の開始・終了 index を保持します。
  const virtualColumnIndexes = useMemo(
    () => new Set(virtualColumns.map((item) => item.index)),
    [virtualColumns],
  );

  // 追加: content サイズが縮んだ場合に scroll を clamp します。
  useEffect(() => {
    if (!bodyScrollRef.current) {
      return;
    }
    const scrollElement = bodyScrollRef.current;
    const maxScrollLeft = Math.max(
      rowHeaderWidth + totalColumnWidth - scrollElement.clientWidth,
      0,
    );
    const maxScrollTop = Math.max(
      headerHeight + totalBodyHeight - scrollElement.clientHeight,
      0,
    );
    if (scrollElement.scrollLeft > maxScrollLeft) {
      scrollElement.scrollLeft = maxScrollLeft;
    }
    if (scrollElement.scrollTop > maxScrollTop) {
      scrollElement.scrollTop = maxScrollTop;
    }
  }, [totalColumnWidth, totalBodyHeight, rowHeaderWidth, headerHeight]);

  // 追加: active cell の矩形です。overlay 用に使います。
  const activeCellRect = useMemo<ActiveCellOverlayRect | null>(() => {
    if (!uiState.activeCell) {
      return null;
    }
    const { row, col } = uiState.activeCell;
    if (
      row < 0 ||
      row >= filteredRows.length ||
      col < 0 ||
      col >= visibleColumns.length
    ) {
      return null;
    }
    const measurement = columnMeasurements[col];
    if (!measurement) {
      return null;
    }
    const top = row * rowHeight;
    return {
      left: measurement.start,
      top,
      width: measurement.size,
      height: rowHeight,
    };
  }, [
    uiState.activeCell,
    filteredRows.length,
    visibleColumns.length,
    columnMeasurements,
    rowHeight,
  ]);

  // 追加: editor layer は editingCell がある場合に activeCellRect を流用します。
  const editorRect = useMemo(
    () => (uiState.editingCell ? activeCellRect : null),
    [uiState.editingCell, activeCellRect],
  );

  // 追加: active cell が画面外へ出た場合に、scroll container を自動調整して常に表示領域内へ収めます。
  useEffect(() => {
    if (!bodyScrollRef.current || !activeCellRect) {
      return;
    }
    const scrollElement = bodyScrollRef.current;
    const cellTop = headerHeight + activeCellRect.top;
    const cellBottom = cellTop + activeCellRect.height;
    const cellLeft = rowHeaderWidth + activeCellRect.left;
    const cellRight = cellLeft + activeCellRect.width;
    const currentScrollTop = scrollElement.scrollTop;
    const currentScrollLeft = scrollElement.scrollLeft;
    const viewportHeight = scrollElement.clientHeight;
    const viewportWidth = scrollElement.clientWidth;
    let nextScrollTop = currentScrollTop;
    let nextScrollLeft = currentScrollLeft;
    const visibleTop = currentScrollTop + headerHeight;
    const visibleBottom = currentScrollTop + viewportHeight;
    if (cellTop < visibleTop) {
      nextScrollTop = Math.max(cellTop - headerHeight, 0);
    } else if (cellBottom > visibleBottom) {
      nextScrollTop = Math.max(cellBottom - viewportHeight, 0);
    }
    const visibleLeft = currentScrollLeft + rowHeaderWidth;
    const visibleRight = currentScrollLeft + viewportWidth;
    if (cellLeft < visibleLeft) {
      nextScrollLeft = Math.max(cellLeft - rowHeaderWidth, 0);
    } else if (cellRight > visibleRight) {
      nextScrollLeft = Math.max(cellRight - viewportWidth, 0);
    }
    if (
      nextScrollTop !== currentScrollTop ||
      nextScrollLeft !== currentScrollLeft
    ) {
      scrollElement.scrollTo({
        top: nextScrollTop,
        left: nextScrollLeft,
        behavior: 'auto',
      });
    }
  }, [activeCellRect, headerHeight, rowHeaderWidth]);

  // 追加: client 座標から rowIndex / colIndex を推定します。
  const getCellCoordFromClientPoint = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      if (
        !bodyScrollRef.current ||
        filteredRows.length === 0 ||
        visibleColumns.length === 0
      ) {
        return null;
      }
      const scrollElement = bodyScrollRef.current;
      const rect = scrollElement.getBoundingClientRect();
      const x = scrollElement.scrollLeft + clientX - rect.left - rowHeaderWidth;
      const y = scrollElement.scrollTop + clientY - rect.top - headerHeight;
      const row = clamp(Math.floor(y / rowHeight), 0, filteredRows.length - 1);
      const normalizedX = Math.max(x, 0);
      const col = findColumnIndexFromOffset(columnMeasurements, normalizedX);
      return {
        row,
        col: clamp(col, 0, visibleColumns.length - 1),
      };
    },
    [
      filteredRows.length,
      visibleColumns.length,
      columnMeasurements,
      rowHeaderWidth,
      headerHeight,
      rowHeight,
    ],
  );

  // 追加: 現在の dragState に応じて selection を更新します。
  const updateSelectionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!uiState.dragState || uiState.dragState.type !== 'selection') {
        return;
      }
      const cell = getCellCoordFromClientPoint(clientX, clientY);
      if (!cell) {
        return;
      }
      if (uiState.dragState.selectionKind === 'cell') {
        dispatch(gridActions.updateSelection(cell));
        return;
      }
      if (uiState.dragState.selectionKind === 'row') {
        dispatch(gridActions.updateRowSelection(cell.row));
        return;
      }
      if (uiState.dragState.selectionKind === 'col') {
        dispatch(gridActions.updateColumnSelection(cell.col));
      }
    },
    [getCellCoordFromClientPoint, uiState.dragState],
  );

  // 追加: 範囲選択中、端に近づいたら自動スクロールします。
  useEffect(() => {
    if (uiState.dragState?.type !== 'selection') {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      return;
    }
    const EDGE_THRESHOLD = 24;
    const SCROLL_STEP = 18;
    const tick = () => {
      const scrollElement = bodyScrollRef.current;
      const pointer = pointerClientRef.current;
      if (!scrollElement || !pointer) {
        autoScrollFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const rect = scrollElement.getBoundingClientRect();
      let nextScrollTop = scrollElement.scrollTop;
      let nextScrollLeft = scrollElement.scrollLeft;
      if (pointer.y < rect.top + EDGE_THRESHOLD) {
        nextScrollTop = Math.max(scrollElement.scrollTop - SCROLL_STEP, 0);
      } else if (pointer.y > rect.bottom - EDGE_THRESHOLD) {
        nextScrollTop = scrollElement.scrollTop + SCROLL_STEP;
      }
      if (pointer.x < rect.left + EDGE_THRESHOLD) {
        nextScrollLeft = Math.max(scrollElement.scrollLeft - SCROLL_STEP, 0);
      } else if (pointer.x > rect.right - EDGE_THRESHOLD) {
        nextScrollLeft = scrollElement.scrollLeft + SCROLL_STEP;
      }
      if (
        nextScrollTop !== scrollElement.scrollTop ||
        nextScrollLeft !== scrollElement.scrollLeft
      ) {
        scrollElement.scrollTo({
          top: nextScrollTop,
          left: nextScrollLeft,
          behavior: 'auto',
        });
        updateSelectionFromPointer(pointer.x, pointer.y);
      }
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [uiState.dragState, updateSelectionFromPointer]);

  // 追加: 現在の selection が「表全体選択」かどうかを判定します。
  const isWholeGridSelected = useMemo(() => {
    if (
      filteredRows.length === 0 ||
      visibleColumns.length === 0 ||
      uiState.selection?.type !== 'cell'
    ) {
      return false;
    }
    const normalizedRange = normalizeCellRange(uiState.selection.range);
    return (
      normalizedRange.start.row === 0 &&
      normalizedRange.start.col === 0 &&
      normalizedRange.end.row === filteredRows.length - 1 &&
      normalizedRange.end.col === visibleColumns.length - 1
    );
  }, [uiState.selection, filteredRows.length, visibleColumns.length]);

  // 追加: 全体選択の実行処理を共通化します。
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
  }, [filteredRows.length, visibleColumns.length]);

  // 追加: 全体選択時の copy を専用経路で行います。
  const serializeWholeGridToTsv = useCallback(() => {
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return '';
    }
    return filteredRows
      .map((row) =>
        visibleColumns
          .map((column) => {
            const rawValue = getCellValue(row, column);
            return column.formatClipboardValue
              ? column.formatClipboardValue(rawValue, row)
              : String(rawValue ?? '');
          })
          .join('\t'),
      )
      .join('\n');
  }, [filteredRows, visibleColumns]);

  // 追加: 現在の selection を overlay 用矩形へ変換します。
  const selectionOverlayRect = useMemo<SelectionOverlayRect | null>(() => {
    if (!uiState.selection) {
      return null;
    }
    if (uiState.selection.type === 'cell') {
      const normalizedRange = normalizeCellRange(uiState.selection.range);
      const startMeasurement = columnMeasurements[normalizedRange.start.col];
      const endMeasurement = columnMeasurements[normalizedRange.end.col];
      if (!startMeasurement || !endMeasurement) {
        return null;
      }
      const top = normalizedRange.start.row * rowHeight;
      const height =
        (normalizedRange.end.row - normalizedRange.start.row + 1) * rowHeight;
      return {
        left: startMeasurement.start,
        top,
        width: endMeasurement.end - startMeasurement.start,
        height,
      };
    }
    if (uiState.selection.type === 'row') {
      const normalizedRange = normalizeRowRange(
        uiState.selection.startRow,
        uiState.selection.endRow,
      );
      return {
        left: 0,
        top: normalizedRange.startRow * rowHeight,
        width: totalColumnWidth,
        height:
          (normalizedRange.endRow - normalizedRange.startRow + 1) * rowHeight,
      };
    }
    const normalizedRange = normalizeColumnRange(
      uiState.selection.startCol,
      uiState.selection.endCol,
    );
    const startMeasurement = columnMeasurements[normalizedRange.startCol];
    const endMeasurement = columnMeasurements[normalizedRange.endCol];
    if (!startMeasurement || !endMeasurement) {
      return null;
    }
    return {
      left: startMeasurement.start,
      top: 0,
      width: endMeasurement.end - startMeasurement.start,
      height: filteredRows.length * rowHeight,
    };
  }, [
    uiState.selection,
    columnMeasurements,
    rowHeight,
    filteredRows.length,
    totalColumnWidth,
  ]);

  // 追加: 左上コーナーセルクリック時、全体選択と解除をトグルします。
  const handleCornerHeaderPointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
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
  };

  // 追加: セルクリック/ドラッグ開始時の処理です。
  const handleCellPointerDown = (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    gridRootRef.current?.focus();
    dispatch(gridActions.activateCell(cell));
    if (enableRangeSelection) {
      dispatch(gridActions.startSelection(cell));
    }
  };

  // 追加: ダブルクリック時に編集開始します。
  const handleCellDoubleClick = (cell: CellCoord) => {
    const row = filteredRows[cell.row];
    const column = visibleColumns[cell.col];
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
    setEditorValue(String(currentValue ?? ''));
    dispatch(gridActions.startEdit(cell));
  };

  // 追加: 単一セルを active + selection へ反映するユーティリティです。
  const activateSingleCell = (cell: CellCoord) => {
    dispatch(gridActions.startSelection(cell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(cell));
  };

  // 追加: 基準セルから移動先セルを計算します。
  const getMovedCell = (
    baseCell: CellCoord,
    deltaRow: number,
    deltaCol: number,
  ): CellCoord => ({
    row: clamp(
      baseCell.row + deltaRow,
      0,
      Math.max(filteredRows.length - 1, 0),
    ),
    col: clamp(
      baseCell.col + deltaCol,
      0,
      Math.max(visibleColumns.length - 1, 0),
    ),
  });

  // 追加: 編集確定です。editorValue を rows へ反映し、必要なら次セルへ移動します。
  const commitEdit = (direction?: EditorCommitDirection) => {
    if (editorActionGuardRef.current || !uiState.editingCell) {
      return;
    }
    const editingCell = uiState.editingCell;
    const nextCell =
      direction === 'down'
        ? getMovedCell(editingCell, 1, 0)
        : direction === 'right'
          ? getMovedCell(editingCell, 0, 1)
          : direction === 'left'
            ? getMovedCell(editingCell, 0, -1)
            : editingCell;
    const column = visibleColumns[editingCell.col];
    const originalRowIndex =
      filteredRowSourceIndexes[editingCell.row] ?? editingCell.row;
    const row = rows[originalRowIndex];
    if (!column || !row) {
      dispatch(gridActions.stopEdit());
      return;
    }
    if (onRowsChange) {
      const parsedValue = column.parseClipboardValue
        ? column.parseClipboardValue(editorValue, row)
        : editorValue;
      const nextRows = rows.map((currentRow, index) =>
        index === originalRowIndex
          ? setCellValue(currentRow, column, parsedValue)
          : currentRow,
      );
      onRowsChange(nextRows);
    }
    editorActionGuardRef.current = true;
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
      activateSingleCell(nextCell);
      editorActionGuardRef.current = false;
    });
    dispatch(gridActions.stopEdit());
  };

  // 追加: 編集キャンセルです。editor を閉じるだけです。
  const cancelEdit = () => {
    if (editorActionGuardRef.current) {
      return;
    }
    editorActionGuardRef.current = true;
    dispatch(gridActions.stopEdit());
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
      editorActionGuardRef.current = false;
    });
  };

  // 追加: selection drag 中にセルへ入ったら範囲更新します。
  const handleCellPointerEnter = (
    cell: CellCoord,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (!enableRangeSelection) {
      return;
    }
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'cell'
    ) {
      return;
    }
    pointerClientRef.current = { x: event.clientX, y: event.clientY };
    dispatch(gridActions.updateSelection(cell));
  };

  // 追加: ブラウザ標準の drag ghost を抑止します。
  const handleNativeDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  // 追加: 行ヘッダー選択開始です。
  const handleRowHeaderPointerDown = (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    gridRootRef.current?.focus();
    dispatch(gridActions.startRowSelection(rowIndex));
  };

  // 追加: 行ヘッダードラッグ中の更新です。
  const handleRowHeaderPointerEnter = (
    rowIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'row'
    ) {
      return;
    }
    pointerClientRef.current = { x: event.clientX, y: event.clientY };
    dispatch(gridActions.updateRowSelection(rowIndex));
  };

  // 追加: 列ヘッダー選択開始です。
  const handleColumnHeaderPointerDown = (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    gridRootRef.current?.focus();
    dispatch(gridActions.startColumnSelection(colIndex));
  };

  // 追加: 列ヘッダードラッグ中の更新です。
  const handleColumnHeaderPointerEnter = (
    colIndex: number,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (
      uiState.dragState?.type !== 'selection' ||
      uiState.dragState.selectionKind !== 'col'
    ) {
      return;
    }
    pointerClientRef.current = { x: event.clientX, y: event.clientY };
    dispatch(gridActions.updateColumnSelection(colIndex));
  };

  // 追加: column resize 開始処理です。
  const handleColumnResizePointerDown = (
    column: GridColumn<T>,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dispatch(
      gridActions.startColumnResize(
        column.key,
        event.clientX,
        selectColumnWidth(uiState, column.key) ?? column.width,
        column.minWidth ?? 60,
        column.maxWidth ?? 1000,
      ),
    );
  };

  // 追加: copy 処理です。selection を TSV にしてクリップボードへ書き込みます。
  const handleCopy = async () => {
    const text = isWholeGridSelected
      ? serializeWholeGridToTsv()
      : serializeSelectionToTsv(
          filteredRows,
          visibleColumns,
          uiState.selection as
            | {
                type: 'cell';
                range: {
                  start: { row: number; col: number };
                  end: { row: number; col: number };
                };
              }
            | { type: 'row'; startRow: number; endRow: number }
            | { type: 'col'; startCol: number; endCol: number }
            | null,
        );
    if (!text) {
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  // 追加: ソート状態に応じた表示記号を返します。
  const getSortIndicator = (columnKey: string) => {
    if (
      !enableSorting ||
      uiState.sort.columnKey !== columnKey ||
      !uiState.sort.direction
    ) {
      return '↕';
    }
    return uiState.sort.direction === 'asc' ? '↑' : '↓';
  };

  // 追加: 列ソートを asc -> desc -> none で循環させます。
  const cycleColumnSort = (columnKey: string) => {
    if (!enableSorting) {
      return;
    }
    if (uiState.sort.columnKey !== columnKey || uiState.sort.direction === null) {
      dispatch(gridActions.setSort(columnKey, 'asc'));
      return;
    }
    if (uiState.sort.direction === 'asc') {
      dispatch(gridActions.setSort(columnKey, 'desc'));
      return;
    }
    dispatch(gridActions.clearSort());
  };

  // 追加: フィルターポップオーバーを開きます。
  const openColumnFilterPopover = (
    column: GridColumn<T>,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!enableColumnFilter) {
      return;
    }

    // 追加: grid root に残っているフォーカスを明示的に外します。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    gridRootRef.current?.blur();

    // 追加: anchor button を保持し、portal popover の位置計算に使います。
    filterPopoverAnchorButtonRef.current = event.currentTarget;

    setFilterPopoverState({
      columnKey: column.key,
      draftValue: String(uiState.filters.columnFilters[column.key] ?? ''),
    });
  };

  // 追加: フィルターポップオーバーを閉じます。
  const closeColumnFilterPopover = useCallback(() => {
    setFilterPopoverState(null);
    setFilterPopoverLayout(null);
    filterPopoverAnchorButtonRef.current = null;
    // 追加: close 時に input/select ref をクリアして次回 open の focus を安定させます。
    filterTextInputRef.current = null;
    filterSelectRef.current = null;

    // 追加: close 後は grid root にフォーカスを戻し、従来の keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, []);

  // 追加: フィルター draft を更新します。
  const updateFilterPopoverDraft = (value: string) => {
    setFilterPopoverState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        draftValue: value,
      };
    });
  };

  // 追加: フィルター draft を適用します。
  const applyFilterPopoverValue = () => {
    if (!filterPopoverState) {
      return;
    }

    const targetColumn = visibleColumns.find(
      (column) => column.key === filterPopoverState.columnKey,
    );
    const filterType = targetColumn?.filterType ?? 'text';
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
  };

  // 追加: フィルター draft をクリアします。
  const clearFilterPopoverValue = () => {
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    closeColumnFilterPopover();
  };

  // 追加: ソートボタン押下です。列選択開始と競合しないよう stopPropagation します。
  const handleColumnSortButtonPointerDown = (
    columnKey: string,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    cycleColumnSort(columnKey);
  };

  // 追加: ポップオーバー表示中は、外側クリックで閉じます。
  useEffect(() => {
    if (!filterPopoverState) {
      return;
    }
    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (filterPopoverRef.current?.contains(targetNode)) {
        return;
      }
      closeColumnFilterPopover();
    };
    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [filterPopoverState, closeColumnFilterPopover]);

  // 追加: ソート/フィルターボタンの見た目を返します。
  const getHeaderActionButtonStyle = (isActive: boolean): CSSProperties => ({
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
  });

  // 追加: active cell を移動します。shiftKey=true の場合は cell selection を拡張します。
  const moveActiveCell = (
    deltaRow: number,
    deltaCol: number,
    extendSelection: boolean,
  ) => {
    if (filteredRows.length === 0 || visibleColumns.length === 0) {
      return;
    }
    const currentCell = uiState.activeCell ?? { row: 0, col: 0 };
    const nextCell = {
      row: clamp(currentCell.row + deltaRow, 0, filteredRows.length - 1),
      col: clamp(currentCell.col + deltaCol, 0, visibleColumns.length - 1),
    };
    if (extendSelection) {
      const anchor =
        uiState.selection?.type === 'cell'
          ? uiState.selection.range.start
          : currentCell;
      dispatch(gridActions.startSelection(anchor));
      dispatch(gridActions.updateSelection(nextCell));
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(nextCell));
      return;
    }
    dispatch(gridActions.startSelection(nextCell));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(nextCell));
  };

  // 追加: Ctrl/Cmd + C や Arrow/Enter を捕捉します。
  const handleKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: popover open 中は grid 側 keyboard を一時停止します。
    if (isFilterPopoverOpen) {
      return;
    }

    // 追加: filter input / select / button 等にフォーカス中は、
    //       grid 側の keyboard 操作を無効化します。
    if (shouldIgnoreGridKeydown(event.target)) {
      return;
    }

    if (uiState.editingCell) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await handleCopy();
      return;
    }
    // 追加: Ctrl + A / Cmd + A で全体選択、2回目で解除します。
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (isWholeGridSelected) {
        dispatch(gridActions.clearSelection());
        dispatch(gridActions.activateCell(null));
        return;
      }
      selectEntireGrid();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveCell(-1, 0, event.shiftKey);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveCell(1, 0, event.shiftKey);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveActiveCell(0, -1, event.shiftKey);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveActiveCell(0, 1, event.shiftKey);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      moveActiveCell(0, event.shiftKey ? -1 : 1, false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch(gridActions.clearSelection());
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      if (uiState.activeCell) {
        handleCellDoubleClick(uiState.activeCell);
      }
      return;
    }
    if (isPrintableKey(event) && uiState.activeCell) {
      const row = filteredRows[uiState.activeCell.row];
      const column = visibleColumns[uiState.activeCell.col];
      if (!row || !column) {
        return;
      }
      if (
        !isCellEditable(
          { readOnly, canEditCell },
          uiState.activeCell.row,
          uiState.activeCell.col,
          row,
          column,
        )
      ) {
        return;
      }
      event.preventDefault();
      setEditorValue(event.key);
      dispatch(gridActions.startEdit(uiState.activeCell));
    }
  };

  // 追加: paste 処理です。TSV を activeCell 起点に適用し、必要なら行/列を自動拡張します。
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!onRowsChange || !uiState.activeCell) {
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    event.preventDefault();
    const matrix = parseClipboardText(text);
    if (matrix.length === 0) {
      return;
    }

    const startFilteredRowIndex = uiState.activeCell.row;
    const startOriginalRowIndex =
      filteredRowSourceIndexes[startFilteredRowIndex] ?? startFilteredRowIndex;
    const startColIndex = uiState.activeCell.col;

    let workingRows = [...rows];
    let workingColumns = [...visibleColumns];
    let workingSourceIndexes = [...filteredRowSourceIndexes];

    // 追加: 行不足分を createRow で自動追加します。
    const requiredOriginalRowCount = startOriginalRowIndex + matrix.length;
    if (requiredOriginalRowCount > workingRows.length) {
      if (createRow) {
        while (workingRows.length < requiredOriginalRowCount) {
          workingRows.push(createRow());
          workingSourceIndexes.push(workingRows.length - 1);
        }
      }
    }

    // 追加: 列不足分を createOverflowColumn で自動追加します。
    let maxPasteWidth = 0;
    for (
      let matrixRowIndex = 0;
      matrixRowIndex < matrix.length;
      matrixRowIndex += 1
    ) {
      const currentWidth = matrix[matrixRowIndex]?.length ?? 0;
      if (currentWidth > maxPasteWidth) {
        maxPasteWidth = currentWidth;
      }
    }
    if (maxPasteWidth === 0) {
      return;
    }

    const requiredColumnCount = startColIndex + maxPasteWidth;
    if (requiredColumnCount > workingColumns.length) {
      if (onColumnsChange && createOverflowColumn) {
        while (workingColumns.length < requiredColumnCount) {
          workingColumns.push(createOverflowColumn(workingColumns.length));
        }
        onColumnsChange(workingColumns);
      }
    }

    const nextRows = applyClipboardMatrixToRows(
      workingRows,
      workingSourceIndexes,
      workingColumns,
      matrix,
      startFilteredRowIndex,
      startColIndex,
      (originalRowIndex, colIndex, row, column) =>
        isCellEditable(
          { readOnly, canEditCell },
          originalRowIndex,
          colIndex,
          row,
          column,
        ),
    );

    const endRow = clamp(
      uiState.activeCell.row + Math.max(matrix.length - 1, 0),
      0,
      Math.max(
        Math.max(filteredRows.length - 1, 0),
        startFilteredRowIndex + matrix.length - 1,
      ),
    );
    const endCol = clamp(
      uiState.activeCell.col + Math.max((matrix[0]?.length ?? 1) - 1, 0),
      0,
      Math.max(
        Math.max(workingColumns.length - 1, 0),
        startColIndex + maxPasteWidth - 1,
      ),
    );

    onRowsChange(nextRows);
    dispatch(gridActions.startSelection(uiState.activeCell));
    dispatch(gridActions.updateSelection({ row: endRow, col: endCol }));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(uiState.activeCell));
  };

  // 追加: 列定義に応じて cell node を描画します。
  const renderCellContent = (
    row: T,
    rowIndex: number,
    column: GridColumn<T>,
    colIndex: number,
  ) => {
    const value = getCellValue(row, column);
    const readOnlyCell = !isCellEditable(
      { readOnly, canEditCell },
      rowIndex,
      colIndex,
      row,
      column,
    );
    const isActive = selectIsActiveCell(uiState, rowIndex, colIndex);
    const isSelected = selectIsCellSelected(uiState, rowIndex, colIndex);
    const isEditing = selectIsEditingCell(uiState, rowIndex, colIndex);

    if (column.renderCell) {
      return column.renderCell({
        row,
        rowIndex,
        colIndex,
        value,
        column,
        isActive,
        isSelected,
        isEditing,
        readOnly: readOnlyCell,
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
  };

  const gridShellStyle: CSSProperties = {
    border: '1px solid #d7dce3',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
  };

  const headerCellBaseStyle: CSSProperties = {
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
  };

  const rowHeaderCellStyle: CSSProperties = {
    ...headerCellBaseStyle,
    justifyContent: 'center',
    width: rowHeaderWidth,
    minWidth: rowHeaderWidth,
    position: 'sticky',
    left: 0,
    zIndex: 1,
  };

  const renderedFilterPopover =
    typeof document !== 'undefined' &&
    filterPopoverState &&
    filterPopoverLayout
      ? (() => {
          const column = visibleColumns.find(
            (item) => item.key === filterPopoverState.columnKey,
          );
          if (!column) {
            return null;
          }

          const filterType = column.filterType ?? 'text';
          const selectOptions = getColumnSelectOptions(column);
          const draftValue = filterPopoverState.draftValue;

          return createPortal(
            <div
              ref={filterPopoverRef}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onKeyDownCapture={(event) => {
                // 追加: portal 内 keyboard イベントを React ツリー上の parent へ流しません。
                event.stopPropagation();
              }}
              onPasteCapture={(event) => {
                // 追加: portal 内 paste も grid 側へ流しません。
                event.stopPropagation();
              }}
              style={{
                position: 'fixed',
                top: filterPopoverLayout.top,
                left: filterPopoverLayout.left,
                width: filterPopoverLayout.width,
                padding: 12,
                boxSizing: 'border-box',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                列フィルター: {column.title || column.key}
              </div>

              {filterType === 'select' ? (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      marginBottom: 8,
                    }}
                  >
                    フィルター種別: select
                  </div>
                  <select
                    ref={filterSelectRef}
                    value={draftValue}
                    onChange={(event) =>
                      updateFilterPopoverDraft(event.target.value)
                    }
                    onKeyDown={(event) => {
                      // 追加: select 内操作を grid 側へ伝播させません。
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyFilterPopoverValue();
                        return;
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        closeColumnFilterPopover();
                      }
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      outline: 'none',
                      marginBottom: 8,
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <option value="">（すべて）</option>
                    {selectOptions.map((option) => (
                      <option
                        key={`${column.key}-${option.value}`}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      marginBottom: 10,
                    }}
                  >
                    候補数: {selectOptions.length}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      marginBottom: 8,
                    }}
                  >
                    フィルター種別: {filterType === 'number' ? 'number' : 'text'}
                  </div>
                  <input
                    ref={filterTextInputRef}
                    type="text"
                    value={draftValue}
                    onChange={(event) =>
                      updateFilterPopoverDraft(event.target.value)
                    }
                    onKeyDown={(event) => {
                      // 追加: filter input 内入力を grid 側へ伝播させません。
                      event.stopPropagation();
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyFilterPopoverValue();
                        return;
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        closeColumnFilterPopover();
                      }
                    }}
                    placeholder={
                      filterType === 'number'
                        ? '例: >=10 / <20 / 10..20 / =5'
                        : '部分一致で絞り込み'
                    }
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      outline: 'none',
                      marginBottom: 8,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      marginBottom: 10,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {filterType === 'number'
                      ? '数量系は =, >, >=, <, <=, .. が使えます'
                      : 'text は部分一致検索です'}
                  </div>
                </>
              )}

              <div
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  marginBottom: 10,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                現在値:
                {String(uiState.filters.columnFilters[column.key] ?? '').trim()
                  ? ` ${String(uiState.filters.columnFilters[column.key])}`
                  : ' （なし）'}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearFilterPopoverValue();
                  }}
                  onKeyDown={(event) => {
                    // 追加: popover 内 button の key 操作を grid 側へ流しません。
                    event.stopPropagation();
                  }}
                  style={{
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    borderRadius: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  クリア
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    applyFilterPopoverValue();
                  }}
                  onKeyDown={(event) => {
                    // 追加: popover 内 button の key 操作を grid 側へ流しません。
                    event.stopPropagation();
                  }}
                  style={{
                    border: '1px solid #2563eb',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    borderRadius: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  適用
                </button>
              </div>
            </div>,
            document.body,
          );
        })()
      : null;

  return (
    <div className={className}>
      {enableGlobalFilter ? (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={selectGlobalFilter(uiState)}
            onChange={(event) =>
              dispatch(gridActions.setGlobalFilter(event.target.value))
            }
            placeholder="グローバルフィルター"
            style={{
              width: '100%',
              maxWidth: 320,
              boxSizing: 'border-box',
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
            }}
          />
        </div>
      ) : null}

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
        <div
          ref={bodyScrollRef}
          style={{
            overflow: 'auto',
            maxHeight: 480,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: rowHeaderWidth + totalColumnWidth,
              minWidth: rowHeaderWidth + totalColumnWidth,
              height: headerHeight + totalBodyHeight,
            }}
          >
            <div
              style={{
                height: headerHeight,
                position: 'sticky',
                top: 0,
                zIndex: 6,
                backgroundColor: '#f8fafc',
              }}
            >
              <div
                onPointerDown={handleCornerHeaderPointerDown}
                onPointerEnter={() => setIsCornerHovered(true)}
                onPointerLeave={() => setIsCornerHovered(false)}
                style={{
                  ...rowHeaderCellStyle,
                  // 追加: 左上コーナーセル専用に見た目を明示して、
                  //       高さ・中央寄せ・境界線のズレを抑えます。
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: rowHeaderWidth,
                  minWidth: rowHeaderWidth,
                  height: headerHeight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  padding: 0,
                  lineHeight: 1,
                  zIndex: 7,
                  backgroundColor: isWholeGridSelected
                    ? isCornerHovered
                      ? '#bfdbfe'
                      : '#dbeafe'
                    : isCornerHovered
                      ? '#e2e8f0'
                      : '#f8fafc',
                  borderRight: '1px solid #e5e7eb',
                  borderBottom: '1px solid #d7dce3',
                  cursor:
                    filteredRows.length > 0 && visibleColumns.length > 0
                      ? 'pointer'
                      : 'default',
                }}
              >
                #
              </div>

              {virtualColumns.map((virtualColumn) => {
                const colIndex = virtualColumn.index;
                const measurement = columnMeasurements[colIndex];
                const column = visibleColumns[colIndex];
                if (
                  !column ||
                  !measurement ||
                  !virtualColumnIndexes.has(colIndex)
                ) {
                  return null;
                }

                const isColumnFiltered =
                  String(uiState.filters.columnFilters[column.key] ?? '').trim()
                    .length > 0;

                return (
                  <div
                    key={column.key}
                    onPointerDown={(event) =>
                      handleColumnHeaderPointerDown(colIndex, event)
                    }
                    onPointerEnter={(event) => {
                      setHoveredColumnIndex(colIndex);
                      handleColumnHeaderPointerEnter(colIndex, event);
                    }}
                    onPointerLeave={() =>
                      setHoveredColumnIndex((current) =>
                        current === colIndex ? null : current,
                      )
                    }
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: rowHeaderWidth + measurement.start,
                      ...headerCellBaseStyle,
                      width: measurement.size,
                      minWidth: measurement.size,
                      height: headerHeight,
                      backgroundColor: isWholeGridSelected
                        ? hoveredColumnIndex === colIndex
                          ? '#bfdbfe'
                          : '#dbeafe'
                        : selectIsColumnSelected(uiState, colIndex)
                          ? hoveredColumnIndex === colIndex
                            ? '#bfdbfe'
                            : '#dbeafe'
                          : hoveredColumnIndex === colIndex
                            ? '#e2e8f0'
                            : '#f8fafc',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 22,
                        height: 22,
                        borderRadius: 9999,
                        backgroundColor: isColumnFiltered ? '#bfdbfe' : '#e2e8f0',
                        color: isColumnFiltered ? '#1d4ed8' : '#475569',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {toExcelColumnName(colIndex)}
                    </span>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        minWidth: 0,
                        flex: 1,
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                          flex: 1,
                          color: isColumnFiltered ? '#1d4ed8' : '#334155',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {column.renderHeader
                          ? column.renderHeader({
                              colIndex,
                              width: measurement.size,
                              column,
                              filterValue: uiState.filters.columnFilters[column.key],
                              isFiltered: isColumnFiltered,
                            })
                          : column.title || column.key}
                      </div>

                      {enableSorting ? (
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            handleColumnSortButtonPointerDown(column.key, event)
                          }
                          title="並び替え"
                          style={getHeaderActionButtonStyle(
                            uiState.sort.columnKey === column.key &&
                              uiState.sort.direction !== null,
                          )}
                        >
                          {getSortIndicator(column.key)}
                        </button>
                      ) : null}

                      {enableColumnFilter ? (
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            openColumnFilterPopover(column, event)
                          }
                          title="列フィルター"
                          style={getHeaderActionButtonStyle(isColumnFiltered)}
                        >
                          {isColumnFiltered ? '●' : '○'}
                        </button>
                      ) : null}
                    </div>

                    <div
                      onPointerDown={(event) =>
                        handleColumnResizePointerDown(column, event)
                      }
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: -3,
                        width: 6,
                        height: '100%',
                        cursor: 'col-resize',
                        zIndex: 3,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <SelectionOverlay
              rect={selectionOverlayRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
            />
            <ActiveCellOverlay
              rect={activeCellRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
            />
            <CellEditorLayer
              rect={editorRect}
              headerHeight={headerHeight}
              rowHeaderWidth={rowHeaderWidth}
              value={editorValue}
              onChange={setEditorValue}
              onCommit={commitEdit}
              onCancel={cancelEdit}
            />

            {virtualRows.map((virtualRow) => {
              const rowIndex = virtualRow.index;
              const row = filteredRows[rowIndex];
              const rowKey = filteredRowKeys[rowIndex] ?? rowIndex;
              if (!row || !virtualRowIndexes.has(rowIndex)) {
                return null;
              }

              return (
                <div
                  key={String(rowKey)}
                  style={{ display: 'flex', minHeight: rowHeight }}
                >
                  <div
                    onPointerDown={(event) =>
                      handleRowHeaderPointerDown(rowIndex, event)
                    }
                    onPointerEnter={(event) => {
                      setHoveredRowIndex(rowIndex);
                      handleRowHeaderPointerEnter(rowIndex, event);
                    }}
                    onPointerLeave={() =>
                      setHoveredRowIndex((current) =>
                        current === rowIndex ? null : current,
                      )
                    }
                    style={{
                      ...rowHeaderCellStyle,
                      position: 'absolute',
                      top: headerHeight + virtualRow.start,
                      left: 0,
                      zIndex: 5,
                      height: rowHeight,
                      backgroundColor: isWholeGridSelected
                        ? hoveredRowIndex === rowIndex
                          ? '#bfdbfe'
                          : '#dbeafe'
                        : selectIsRowSelected(uiState, rowIndex)
                          ? hoveredRowIndex === rowIndex
                            ? '#bfdbfe'
                            : '#dbeafe'
                          : hoveredRowIndex === rowIndex
                            ? '#e2e8f0'
                            : '#f8fafc',
                      fontWeight: 500,
                    }}
                  >
                    {rowIndex + 1}
                  </div>

                  {virtualColumns.map((virtualColumn) => {
                    const colIndex = virtualColumn.index;
                    const measurement = columnMeasurements[colIndex];
                    const column = visibleColumns[colIndex];
                    if (
                      !column ||
                      !measurement ||
                      !virtualColumnIndexes.has(colIndex)
                    ) {
                      return null;
                    }

                    const isActive = selectIsActiveCell(
                      uiState,
                      rowIndex,
                      colIndex,
                    );
                    const isSelected = selectIsCellSelected(
                      uiState,
                      rowIndex,
                      colIndex,
                    );
                    const readOnlyCell = !isCellEditable(
                      { readOnly, canEditCell },
                      rowIndex,
                      colIndex,
                      row,
                      column,
                    );

                    return (
                      <div
                        key={`${String(rowKey)}-${column.key}`}
                        onPointerDown={(event) =>
                          handleCellPointerDown(
                            { row: rowIndex, col: colIndex },
                            event,
                          )
                        }
                        onPointerEnter={(event) =>
                          handleCellPointerEnter(
                            { row: rowIndex, col: colIndex },
                            event,
                          )
                        }
                        onDoubleClick={() =>
                          handleCellDoubleClick({
                            row: rowIndex,
                            col: colIndex,
                          })
                        }
                        style={{
                          position: 'absolute',
                          top: headerHeight + virtualRow.start,
                          left: rowHeaderWidth + measurement.start,
                          width: measurement.size,
                          minWidth: measurement.size,
                          height: rowHeight,
                          boxSizing: 'border-box',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 10px',
                          borderRight: '1px solid #e5e7eb',
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: isSelected
                            ? '#ffffff'
                            : readOnlyCell
                              ? '#f8fafc'
                              : '#ffffff',
                          color: readOnlyCell ? '#64748b' : '#0f172a',
                          cursor: 'default',
                          userSelect: 'none',
                          outline: 'none',
                          zIndex: isActive ? 3 : 1,
                        }}
                      >
                        {renderCellContent(row, rowIndex, column, colIndex)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {renderedFilterPopover}
    </div>
  );
}

export default SpreadsheetGrid;