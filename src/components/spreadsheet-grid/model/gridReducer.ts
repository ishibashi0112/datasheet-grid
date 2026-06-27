import type { GridUiAction } from './gridActions';
import type { GridColumn, GridUiState } from './gridTypes';
// 追加(B3): flex 列(center かつ flex>0)は columnWidths に固定エントリを持たせません。
//   flex 算出が効くよう、初期生成・columns 同期の両方でこの判定でスキップします。
import { isFlexingColumn } from '../logic/columnFlex';

// 追加: 列幅のデフォルト下限です。
const DEFAULT_MIN_WIDTH = 60;

// 追加: 列幅のデフォルト上限です。
const DEFAULT_MAX_WIDTH = 1000;

// 追加: 値を min/max に収めるユーティリティです。
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// 追加: 初期 column width map を生成します。
// 変更(B3): flex 列(center かつ flex>0)はエントリを作りません。columnWidths にエントリがあると
//   flex 算出より優先され固定化されてしまうためです(手動リサイズ時のみ column/resizeUpdate が
//   その列のエントリを書き、その列だけ固定になります)。
const createColumnWidthMap = <T,>(columns: GridColumn<T>[]) =>
  columns.reduce<Record<string, number>>((acc, column) => {
    if (isFlexingColumn(column)) {
      return acc;
    }
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
  // 変更(MS-1): 単一オブジェクト → エントリ配列。[] = ソートなし。
  sort: [],
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
        },
      };

    case 'rowSelection/update':
      if (
        state.dragState?.type !== 'selection' ||
        state.dragState.selectionKind !== 'row'
      ) {
        return state;
      }

      // 追加(11-B1): 終端行が変わらない update は no-op として state をそのまま返します。
      // 変更理由: ドラッグ中の pointermove は同一行内でも毎フレーム発火し、
      //           毎回新しい state を返すと無意味な再レンダーが走るためです。
      // 注意: 比較基準は selection.endRow です(11-B2 で dragState.currentRow を
      //       削除済み。ドラッグ中の現在位置の正は selection 側に一本化されています)。
      if (
        state.selection?.type === 'row' &&
        state.selection.endRow === action.row
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
      };

    case 'selection/update':
      if (
        state.dragState?.type !== 'selection' ||
        state.dragState.selectionKind !== 'cell'
      ) {
        return state;
      }

      // 追加(11-B1): 終端セルが変わらない update は no-op として state をそのまま返します。
      // 注意: 比較基準は selection.range.end です(11-B2 で dragState.current を削除済み)。
      if (
        state.selection?.type === 'cell' &&
        state.selection.range.end.row === action.cell.row &&
        state.selection.range.end.col === action.cell.col
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
        },
      };

    case 'columnSelection/update':
      if (
        state.dragState?.type !== 'selection' ||
        state.dragState.selectionKind !== 'col'
      ) {
        return state;
      }

      // 追加(11-B1): 終端列が変わらない update は no-op として state をそのまま返します。
      // 注意: 比較基準は selection.endCol です(11-B2 で dragState.currentCol を削除済み)。
      if (
        state.selection?.type === 'col' &&
        state.selection.endCol === action.col
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
      };

    case 'selection/end':
      // 変更(11-A2): selection ドラッグ中でなければ state をそのまま返します。
      // 変更理由: window の pointerup は画面上のあらゆるクリックで発火し、
      //           endSelection / endColumnResize が毎回 dispatch されます。
      //           旧実装は no-op でも常に新しい state オブジェクトを返していたため、
      //           無関係なクリックでも親の再レンダーが余分に発生していました。
      if (state.dragState?.type !== 'selection') {
        return state;
      }
      return {
        ...state,
        dragState: null,
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

    case 'column/resizeUpdate': {
      if (state.dragState?.type !== 'columnResize') {
        return state;
      }

      const nextWidth = clamp(
        state.dragState.startWidth + (action.clientX - state.dragState.startX),
        state.dragState.minWidth,
        state.dragState.maxWidth,
      );

      // 追加(11-B1): clamp 後の幅が現在値と同じなら no-op として state をそのまま返します。
      // 変更理由: min/max に張り付いている間や、縦方向のみのポインタ移動でも
      //           pointermove は発火し続けるため、同値更新を弾くことで
      //           ライブリサイズ中の無駄な全体再レンダーを抑止します。
      if (state.columnWidths[state.dragState.columnKey] === nextWidth) {
        return state;
      }

      return {
        ...state,
        columnWidths: {
          ...state.columnWidths,
          [state.dragState.columnKey]: nextWidth,
        },
      };
    }

    case 'column/resizeEnd':
      // 変更(11-A2): columnResize ドラッグ中でなければ state をそのまま返します(no-op)。
      if (state.dragState?.type !== 'columnResize') {
        return state;
      }
      return {
        ...state,
        dragState: null,
      };

    case 'columnWidths/sync':
      return {
        ...state,
        columnWidths: {
          ...state.columnWidths,
          ...action.widths,
        },
      };

    // 追加(B3): columns 同期用のフル置換です。merge ではなく置き換えるため、widths に無いキー
    //   (= flex 列や除去された列)は捨てられます。これにより flex 列が固定エントリを持ち続けて
    //   flex が効かなくなるのを防ぎます(autosize 経路の merge=columnWidths/sync とは別物)。
    case 'columnWidths/reset':
      return {
        ...state,
        columnWidths: action.widths,
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

    case 'sort/set':
      // 変更(MS-1): 受け取ったエントリ配列をそのまま採用します。
      return {
        ...state,
        sort: action.entries,
      };

    case 'sort/clear':
      // 変更(MS-1): 空配列でソートなしに正規化します。
      return {
        ...state,
        sort: [],
      };

    default:
      return state;
  }
};