// Solid 版の型の束ね。core の公開型は描画の型(node / style)を束ね型 F で受けるので、Solid の JSX.Element と
//   JSX.CSSProperties を入れるだけで同じ列定義・props の型が使えます(React 版の model/gridTypes.ts と同じ作り)。
import type { JSX } from '@solidjs/web';
import type * as Core from '@ishibashi0112/spreadsheet-grid-core';

export type SolidGridTypes = {
  node: JSX.Element;
  style: JSX.CSSProperties;
};

export type GridColumn<T> = Core.GridColumn<T, SolidGridTypes>;
export type CellRenderContext<T> = Core.CellRenderContext<T, SolidGridTypes>;
export type SpreadsheetGridHandle<T> = Core.SpreadsheetGridHandle<T>;
export type SpreadsheetGridSlotContext<T> = Core.SpreadsheetGridSlotContext<T, SolidGridTypes>;
export type GridClassNames = Core.GridClassNames<SolidGridTypes>;
export type GridResolvedSlot = Core.GridResolvedSlot<SolidGridTypes>;
export type GridResolvedSlots = Core.GridResolvedSlots<SolidGridTypes>;
export type GridSlotProps = Core.GridSlotProps<SolidGridTypes>;
export type TotalRowCellContext<T> = Core.TotalRowCellContext<T, SolidGridTypes>;
export type GridContextMenuItem = Core.GridContextMenuItem<SolidGridTypes>;
export type GridContextMenuParams<T> = Core.GridContextMenuParams<T, SolidGridTypes>;
export type GridContextMenuTarget<T> = Core.GridContextMenuTarget<T, SolidGridTypes>;

// 受ける props(React 版と同じ名前・同じ型)。段階 1 は React 版の機能なしの構成(`/lite` の
//   createSpreadsheetGrid({ features: {} }))と同じ範囲で、受けられるものから順に足していきます。
type SupportedPropKeys =
  | 'rows'
  | 'columns'
  | 'onRowsChange'
  | 'rowKeyGetter'
  | 'rowHeight'
  | 'autoHeight'
  | 'estimateRowHeight'
  | 'verticalAlign'
  | 'headerHeight'
  | 'density'
  | 'rowHeaderWidth'
  | 'height'
  | 'maxHeight'
  | 'readOnly'
  | 'canEditCell'
  | 'dimReadOnlyCells'
  | 'enableUndoRedo'
  | 'undoHistoryLimit'
  | 'onUndoRedoStateChange'
  | 'enableClearOnDelete'
  | 'editorEnterMove'
  | 'enableRangeSelection'
  | 'enableRowHover'
  | 'hoveredRowIndex'
  | 'onHoveredRowChange'
  | 'enableColumnHeaderHover'
  | 'enableSorting'
  | 'manualSorting'
  | 'enableGlobalFilter'
  | 'globalFilterMatch'
  | 'enableColumnFilter'
  | 'manualFiltering'
  | 'getFilterOptions'
  | 'showFilterChipBar'
  | 'renderFilterDateInput'
  | 'enableColumnMenu'
  | 'enableColumnResize'
  | 'onColumnsChange'
  | 'showValidationMarks'
  | 'getRowClassName'
  | 'classNames'
  | 'ariaLabel'
  | 'className'
  | 'style'
  | 'theme'
  | 'motion'
  | 'animateRows'
  | 'localeText'
  | 'noRowsText'
  | 'noMatchingRowsText'
  | 'showTopBar'
  | 'showBottomBar'
  | 'showTopBarSummary'
  | 'showTopBarFilter'
  | 'globalFilterPlaceholder'
  | 'globalFilterIcon'
  | 'showTopBarCounts'
  | 'showBottomBarCounts'
  | 'showSelectionAggregates'
  | 'scrollHint'
  | 'highlightChanges'
  | 'showCopyRange'
  | 'hoverHighlight'
  | 'find'
  | 'onFindChange'
  | 'imeDirectInput'
  | 'autoSizeColumns'
  | 'columnDragMotion'
  | 'enableRowDrag'
  | 'isRowDraggable'
  | 'canDropRow'
  | 'onRowMove'
  | 'rowDragMotion'
  | 'fillHandle'
  | 'enableContextMenu'
  | 'getContextMenuItems'
  | 'onContextMenuOpen'
  | 'renderTopBar'
  | 'renderBottomBar'
  | 'initialState'
  | 'activeCellFollows'
  | 'onCellClick'
  | 'onCellDoubleClick'
  | 'onActiveCellChange'
  | 'onStateChange'
  | 'onFiltersChange'
  | 'onSortChange'
  | 'onScroll'
  | 'showCellOverflowTooltip'
  | 'popupContainer'
  | 'createRow'
  | 'createOverflowColumn'
  | 'onPasteSkipped'
  | 'pasteFillsSelection'
  | 'isRowExportable'
  | 'enableRowSelection'
  | 'rowSelectionMode'
  | 'enableSelectAllRows'
  | 'rowSelection'
  | 'selectedRowKeys'
  | 'onRowSelectionChange'
  | 'detailRow'
  | 'onExpandedDetailRowKeysChange'
  | 'totalRow'
  | 'pinnedTopRows'
  | 'pinnedBottomRows'
  | 'pinnedBottomRowsPlacement'
  | 'includeGroupingInState'
  | 'labelRow'
  | 'dataSource'
  | 'serverSideRefreshToken'
  | 'onServerSideLoadError'
  | 'onServerSideWriteError'
  | 'showSaveStatus';

export type SpreadsheetGridProps<T> = Pick<Core.SpreadsheetGridProps<T, SolidGridTypes>, SupportedPropKeys> & {
  // Solid の ref は関数だけ(React の ref オブジェクトは無い)。命令的 API のハンドルを受け取ります。
  ref?: ((handle: SpreadsheetGridHandle<T>) => void) | undefined;
};