import type { GridUiAction } from './gridActions';
import type { GridColumn, GridUiState } from './gridTypes';

// 追加: 列幅のデフォルト下限です。
const DEFAULT_MIN_WIDTH = 60;

// 追加: 列幅のデフォルト上限です。
const DEFAULT_MAX_WIDTH = 1000;

// 追加: 値を min/max に収めるユーティリティです。
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// 追加: 初期 column width map を生成します。
const createColumnWidthMap = <T,>(columns: GridColumn<T>[]) =>
  columns.reduce<Record<string, number>>((acc, column) => {
    acc[column.key] = column.width;
    return acc;
  }, {});

// 追加: reducer 初期 state を生成します。
export const createInitialGridUiState = <T,>(
  columns: GridColumn<T>[],
): GridUiState => ({
  activeCell: null,
  selection: null,
  editingCell: null,
  dragState: null,
  columnWidths: createColumnWidthMap(columns),
  filters: {
    globalText: '',
    columnFilters: {},
  },
});

// 追加: Grid の UI state reducer 本体です。
export const gridUiReducer = (
  state: GridUiState,
  action: GridUiAction,
): GridUiState => {
  switch (action.type) {
    case 'cell/activate':
      return {
        ...state,
        activeCell: action.cell,
      };

    case 'selection/start':
      return {
        ...state,
        activeCell: action.cell,
        selection: {
          type: 'cell',
          range: {
            start: action.cell,
            end: action.cell,
          },
        },
        dragState: {
          type: 'selection',
          selectionKind: 'cell',
          anchor: action.cell,
          current: action.cell,
        },
      };

    case 'rowSelection/start':
      return {
        ...state,
        activeCell: {
          row: action.row,
          col: state.activeCell?.col ?? 0,
        },
        selection: {
          type: 'row',
          startRow: action.row,
          endRow: action.row,
        },
        dragState: {
          type: 'selection',
          selectionKind: 'row',
          anchorRow: action.row,
          currentRow: action.row,
        },
      };

    case 'rowSelection/update':
      if (
        state.dragState?.type !== 'selection' ||
        state.dragState.selectionKind !== 'row'
      ) {
        return state;
      }

      return {
        ...state,
        selection: {
          type: 'row',
          startRow: state.dragState.anchorRow,
          endRow: action.row,
        },
        dragState: { ...state.dragState, currentRow: action.row },
      };

    case 'selection/update':
      if (
        state.dragState?.type !== 'selection' ||
        state.dragState.selectionKind !== 'cell'
      ) {
        return state;
      }

      return {
        ...state,
        selection: {
          type: 'cell',
          range: {
            start: state.dragState.anchor,
            end: action.cell,
          },
        },
        dragState: {
          ...state.dragState,
          current: action.cell,
        },
      };

    case 'columnSelection/start':
      return {
        ...state,
        activeCell: {
          row: state.activeCell?.row ?? 0,
          col: action.col,
        },
        selection: {
          type: 'col',
          startCol: action.col,
          endCol: action.col,
        },
        dragState: {
          type: 'selection',
          selectionKind: 'col',
          anchorCol: action.col,
          currentCol: action.col,
        },
      };

    case 'columnSelection/update':
      if (
        state.dragState?.type !== 'selection' ||
        state.dragState.selectionKind !== 'col'
      ) {
        return state;
      }

      return {
        ...state,
        selection: {
          type: 'col',
          startCol: state.dragState.anchorCol,
          endCol: action.col,
        },
        dragState: { ...state.dragState, currentCol: action.col },
      };

    case 'selection/end':
      return {
        ...state,
        dragState:
          state.dragState?.type === 'selection' ? null : state.dragState,
      };

    case 'selection/clear':
      return {
        ...state,
        selection: null,
        dragState: null,
      };

    case 'edit/start':
      return {
        ...state,
        editingCell: action.cell,
        activeCell: action.cell,
      };

    case 'edit/stop':
      return {
        ...state,
        editingCell: null,
      };

    case 'column/resizeStart':
      return {
        ...state,
        dragState: {
          type: 'columnResize',
          columnKey: action.columnKey,
          startX: action.startX,
          startWidth: action.startWidth,
          minWidth: action.minWidth || DEFAULT_MIN_WIDTH,
          maxWidth: action.maxWidth || DEFAULT_MAX_WIDTH,
        },
      };

    case 'column/resizeUpdate':
      if (state.dragState?.type !== 'columnResize') {
        return state;
      }

      return {
        ...state,
        columnWidths: {
          ...state.columnWidths,
          [state.dragState.columnKey]: clamp(
            state.dragState.startWidth + (action.clientX - state.dragState.startX),
            state.dragState.minWidth,
            state.dragState.maxWidth,
          ),
        },
      };

    case 'column/resizeEnd':
      return {
        ...state,
        dragState: state.dragState?.type === 'columnResize' ? null : state.dragState,
      };

    case 'columnWidths/sync':
      return {
        ...state,
        columnWidths: {
          ...state.columnWidths,
          ...action.widths,
        },
      };

    case 'filter/setGlobal':
      return {
        ...state,
        filters: {
          ...state.filters,
          globalText: action.value,
        },
      };

    case 'filter/setColumn':
      return {
        ...state,
        filters: {
          ...state.filters,
          columnFilters: {
            ...state.filters.columnFilters,
            [action.columnKey]: action.value,
          },
        },
      };

    case 'filter/clearColumn': {
      const nextColumnFilters = { ...state.filters.columnFilters };
      delete nextColumnFilters[action.columnKey];

      return {
        ...state,
        filters: {
          ...state.filters,
          columnFilters: nextColumnFilters,
        },
      };
    }

    case 'filter/resetAll':
      return {
        ...state,
        filters: {
          globalText: '',
          columnFilters: {},
        },
      };

    default:
      return state;
  }
};
