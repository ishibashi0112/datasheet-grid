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
  type PointerEvent,
} from 'react';
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
  selectIsEditingCell,
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
import ColumnFilterPopover from './view/ColumnFilterPopover';
import GridHeaderRow from './view/GridHeaderRow';
import GridBodyLayer from './view/GridBodyLayer';
import { useFilterPopoverController } from './hooks/useFilterPopoverController';
import { useGridPointerInteractions } from './hooks/useGridPointerInteractions';
import { useGridKeyboardInteractions } from './hooks/useGridKeyboardInteractions';
import { useGridViewportSync } from './hooks/useGridViewportSync';
import type {
  CellCoord,
  GridColumn,
  GridRowKey,
  SpreadsheetGridProps,
} from './model/gridTypes';
import {
  applyColumnFilters,
  applyGlobalFilter,
  type GridRowModelLike,
} from './logic/filtering';
import { applySort } from './logic/sorting';
import { buildColumnMeasurements, clamp } from './logic/geometry';
import { getCellValue, isCellEditable, setCellValue } from './utils/permissions';
import {
  applyClipboardMatrixToRows,
  parseClipboardText,
  serializeSelectionToTsv,
} from './utils/clipboard';

// 追加: 元 rows と filteredRows の対応を安定して持つための row model です。
type SourceRowModel<T> = GridRowModelLike<T> & {
  rowKey: GridRowKey;
};

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

  useGridViewportSync({
    bodyScrollRef,
    rowVirtualizer,
    columnVirtualizer,
    rowHeight,
    filteredRowsLength: filteredRows.length,
    columnMeasurements,
    totalColumnWidth,
    totalBodyHeight,
    rowHeaderWidth,
    headerHeight,
    activeCellRect,
  });

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
    pointerClientRef,
    autoScrollFrameRef,
    uiState,
    dispatch,
    enableRangeSelection,
    filteredRowsLength: filteredRows.length,
    visibleColumnsLength: visibleColumns.length,
    columnMeasurements,
    rowHeaderWidth,
    headerHeight,
    rowHeight,
  });

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
  }, [dispatch, filteredRows.length, visibleColumns.length]);

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

  // 追加: copy 処理です。selection を TSV にしてクリップボードへ書き込みます。
  const handleCopy = useCallback(async () => {
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
  }, [filteredRows, isWholeGridSelected, serializeWholeGridToTsv, uiState.selection, visibleColumns]);

  // 追加: ダブルクリック時に編集開始します。
  const handleCellDoubleClick = useCallback(
    (cell: CellCoord) => {
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
    },
    [canEditCell, dispatch, filteredRows, readOnly, visibleColumns],
  );

  const { getMovedCell, handleKeyDown } = useGridKeyboardInteractions({
    uiState,
    filteredRows,
    visibleColumns,
    readOnly,
    canEditCell,
    setEditorValue,
    dispatch,
    handleCopy,
    handleCellDoubleClick,
    isWholeGridSelected,
    selectEntireGrid,
  });

  // 追加: 単一セルを active + selection へ反映するユーティリティです。
  const activateSingleCell = useCallback(
    (cell: CellCoord) => {
      dispatch(gridActions.startSelection(cell));
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(cell));
    },
    [dispatch],
  );

  // 追加: 編集確定です。editorValue を rows へ反映し、必要なら次セルへ移動します。
  const commitEdit = useCallback(
    (direction?: EditorCommitDirection) => {
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
    },
    [
      activateSingleCell,
      dispatch,
      editorValue,
      filteredRowSourceIndexes,
      getMovedCell,
      onRowsChange,
      rows,
      uiState.editingCell,
      visibleColumns,
    ],
  );

  // 追加: 編集キャンセルです。editor を閉じるだけです。
  const cancelEdit = useCallback(() => {
    if (editorActionGuardRef.current) {
      return;
    }
    editorActionGuardRef.current = true;
    dispatch(gridActions.stopEdit());
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
      editorActionGuardRef.current = false;
    });
  }, [dispatch]);

  // 追加: 列定義に応じて cell node を描画します。
  const renderCellContent = useCallback(
    (
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
    },
    [
      canEditCell,
      filteredRowSourceIndexes,
      onRowsChange,
      readOnly,
      rows,
      uiState,
    ],
  );

  // 追加: paste 処理です。TSV を activeCell 起点に適用し、必要なら行/列を自動拡張します。
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
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
    },
    [
      canEditCell,
      createOverflowColumn,
      createRow,
      dispatch,
      filteredRowSourceIndexes,
      filteredRows.length,
      onColumnsChange,
      onRowsChange,
      readOnly,
      rows,
      uiState.activeCell,
      visibleColumns,
    ],
  );

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

  const handleColumnResizePointerDown = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLDivElement>) => {
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
    },
    [dispatch, uiState, visibleColumns],
  );

  const applyFilterPopoverValue = useCallback(() => {
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
  }, [closeColumnFilterPopover, dispatch, filterPopoverState, visibleColumns]);

  const clearFilterPopoverValue = useCallback(() => {
    if (!filterPopoverState) {
      return;
    }
    dispatch(gridActions.clearColumnFilter(filterPopoverState.columnKey));
    closeColumnFilterPopover();
  }, [closeColumnFilterPopover, dispatch, filterPopoverState]);

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

  const renderedFilterPopover = openedFilterColumn ? (
    <ColumnFilterPopover
      isOpen={Boolean(filterPopoverState)}
      title={openedFilterColumn.title || openedFilterColumn.key}
      filterType={openedFilterColumn.filterType ?? 'text'}
      draftValue={filterPopoverState?.draftValue ?? ''}
      currentValueText={
        String(uiState.filters.columnFilters[openedFilterColumn.key] ?? '').trim()
          ? String(uiState.filters.columnFilters[openedFilterColumn.key])
          : '（なし）'
      }
      layout={filterPopoverLayout}
      selectOptions={getColumnSelectOptions(openedFilterColumn)}
      popoverRef={filterPopoverRef}
      textInputRef={filterTextInputRef}
      selectRef={filterSelectRef}
      onRequestClose={closeColumnFilterPopover}
      onDraftChange={updateFilterPopoverDraft}
      onApply={applyFilterPopoverValue}
      onClear={clearFilterPopoverValue}
    />
  ) : null;

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
            <GridHeaderRow
              rowHeaderWidth={rowHeaderWidth}
              headerHeight={headerHeight}
              rowHeaderCellStyle={rowHeaderCellStyle}
              headerCellBaseStyle={headerCellBaseStyle}
              isCornerHovered={isCornerHovered}
              isWholeGridSelected={isWholeGridSelected}
              filteredRowsLength={filteredRows.length}
              visibleColumnsLength={visibleColumns.length}
              virtualColumns={virtualColumns}
              virtualColumnIndexes={virtualColumnIndexes}
              columnMeasurements={columnMeasurements}
              visibleColumns={visibleColumns}
              hoveredColumnIndex={hoveredColumnIndex}
              uiState={uiState}
              columnFilterValues={uiState.filters.columnFilters}
              sortState={uiState.sort}
              getHeaderActionButtonStyle={getHeaderActionButtonStyle}
              getSortIndicator={getSortIndicator}
              onCornerPointerDown={handleCornerHeaderPointerDown}
              onCornerPointerEnter={() => setIsCornerHovered(true)}
              onCornerPointerLeave={() => setIsCornerHovered(false)}
              onColumnHeaderPointerDown={handleColumnHeaderPointerDown}
              onColumnHeaderPointerEnter={handleColumnHeaderPointerEnter}
              onColumnHeaderPointerLeave={(colIndex) =>
                setHoveredColumnIndex((current) =>
                  current === colIndex ? null : current,
                )
              }
              onColumnSortButtonPointerDown={handleColumnSortButtonPointerDown}
              onColumnFilterButtonPointerDown={openColumnFilterPopover}
              onColumnResizePointerDown={handleColumnResizePointerDown}
            />

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

            <GridBodyLayer
              filteredRows={filteredRows}
              filteredRowKeys={filteredRowKeys}
              visibleColumns={visibleColumns}
              virtualRows={virtualRows}
              virtualColumns={virtualColumns}
              virtualRowIndexes={virtualRowIndexes}
              virtualColumnIndexes={virtualColumnIndexes}
              columnMeasurements={columnMeasurements}
              rowHeaderWidth={rowHeaderWidth}
              headerHeight={headerHeight}
              rowHeight={rowHeight}
              rowHeaderCellStyle={rowHeaderCellStyle}
              hoveredRowIndex={hoveredRowIndex}
              isWholeGridSelected={isWholeGridSelected}
              uiState={uiState}
              readOnly={readOnly}
              canEditCell={canEditCell}
              onRowHeaderPointerDown={handleRowHeaderPointerDown}
              onRowHeaderPointerEnter={handleRowHeaderPointerEnter}
              onRowHeaderPointerLeave={(rowIndex) =>
                setHoveredRowIndex((current) =>
                  current === rowIndex ? null : current,
                )
              }
              onCellPointerDown={handleCellPointerDown}
              onCellPointerEnter={handleCellPointerEnter}
              onCellDoubleClick={handleCellDoubleClick}
              renderCellContent={renderCellContent}
            />
          </div>
        </div>
      </div>

      {renderedFilterPopover}
    </div>
  );
}

export default SpreadsheetGrid;