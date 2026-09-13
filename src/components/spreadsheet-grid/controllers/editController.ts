// 追加(非依存化 ③-6): セル編集セッションのコントローラです(React 非依存。旧 hooks/useGridEditController の
//   本体を移設)。開始 / 確定 / 取消と、確定後のフォーカス復帰 + 隣接セルへの移動(rAF)を担います。
//   - update(args) はレンダー後に毎回呼ばれる前提(hooks/useController)。最新の args(編集中セル /
//     rows / 列 / rowModel / コールバック)を保持し、メソッドはイベント時点の最新値を読みます。
//   - editorActionGuard は「commit / cancel 直後の rAF まで再入を抑止する」共有フラグで、他の hook
//     (ポインタ系)も参照するため { current } の構造的型で受けます(React の RefObject と互換)。
//   - 書き込み経路は clientSide(rows → onRowsChange)と serverSide(applyServerSideCellEdits)の 2 つ。
//     いずれも列パーサ(parseCommittedValue)→ 検証(decideCellWrite。reject なら { status: 'rejected' })。
import { gridActions, type GridUiAction } from '../model/gridActions';
// 注記: 列 / RowModel の型は logic/(editorValues / validation / serverSideEdits)が現状 React 束縛の
//   gridTypes を参照しているため、ここも同じ束縛を使います(束ね型 F の一般化は ⑤ パッケージ分割で
//   logic/ と一緒に行う)。ランタイムの React 依存はありません。
import type {
  CellCoord,
  EditorCommitDirection,
  EditorCommitResult,
  GridColumn,
  GridUiState,
  RowModel,
} from '../model/gridTypes';
import { parseCommittedValue, writeRowsCell } from '../logic/editorValues';
import { decideCellWrite } from '../logic/validation';
import { clamp } from '../logic/geometry';
import { isFocusInsideDetailCard } from '../logic/detailRow';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';

export type EditControllerArgs<T extends object> = {
  uiState: GridUiState;
  rows: T[];
  visibleColumns: GridColumn<T>[];
  rowModel: RowModel<T>;
  setEditorInitialValue: (value: string) => void;
  onRowsChange?: (nextRows: T[]) => void;
  applyServerSideCellEdits?: (edits: ServerSideCellEditInput<T>[]) => number;
  dispatch: (action: GridUiAction) => void;
  // フォーカス復帰先(グリッド root)。未マウントなら null。
  gridRootRef: { readonly current: HTMLElement | null };
  // 再入抑止フラグ(共有・可変)。
  editorActionGuardRef: { current: boolean };
};

export type EditController<T extends object> = {
  update: (args: EditControllerArgs<T>) => void;
  activateSingleCell: (cell: CellCoord) => void;
  startEditWithValue: (cell: CellCoord, initialValue: string) => void;
  commitEdit: (
    committedValue: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult;
  cancelEdit: () => void;
};

export const createEditController = <T extends object>(): EditController<T> => {
  let args: EditControllerArgs<T> | null = null;

  const update = (next: EditControllerArgs<T>) => {
    args = next;
  };

  const activateSingleCell = (cell: CellCoord) => {
    if (args === null) {
      return;
    }
    args.dispatch(gridActions.startSelection(cell));
    args.dispatch(gridActions.endSelection());
    args.dispatch(gridActions.activateCell(cell));
  };

  const startEditWithValue = (cell: CellCoord, initialValue: string) => {
    if (args === null) {
      return;
    }
    args.setEditorInitialValue(initialValue);
    args.dispatch(gridActions.startEdit(cell));
  };

  // commit / cancel 直後の後処理(rAF): フォーカスをグリッドへ戻し(展開行カード内にフォーカスがある
  //   場合は奪わない)、必要なら隣接セルへ移動してから再入抑止を解除します。ガードを立てるのは
  //   呼び出し側(旧実装と同じ順序を保つため)。
  const scheduleAfterEdit = (nextCell: CellCoord | null) => {
    const current = args;
    if (current === null) {
      return;
    }
    requestAnimationFrame(() => {
      if (!isFocusInsideDetailCard()) {
        current.gridRootRef.current?.focus();
      }
      if (nextCell !== null && args !== null) {
        // 行数 / 列数は rAF 時点の最新 args で clamp します(旧 boundsRef 相当)。
        const rowCount = args.rowModel.getRowCount();
        const colCount = args.visibleColumns.length;
        activateSingleCell({
          row: clamp(nextCell.row, 0, Math.max(rowCount - 1, 0)),
          col: clamp(nextCell.col, 0, Math.max(colCount - 1, 0)),
        });
      }
      current.editorActionGuardRef.current = false;
    });
  };

  const commitEdit = (
    committedValue: unknown,
    direction?: EditorCommitDirection,
  ): EditorCommitResult => {
    if (args === null) {
      return { status: 'noop' };
    }
    const {
      uiState,
      visibleColumns,
      rowModel,
      rows,
      applyServerSideCellEdits,
      onRowsChange,
      dispatch,
      editorActionGuardRef,
    } = args;
    if (editorActionGuardRef.current || !uiState.editingCell) {
      return { status: 'noop' };
    }

    const editingCell = uiState.editingCell;
    const intendedCell: CellCoord =
      direction === 'down'
        ? { row: editingCell.row + 1, col: editingCell.col }
        : direction === 'up'
          ? { row: editingCell.row - 1, col: editingCell.col }
          : direction === 'right'
            ? { row: editingCell.row, col: editingCell.col + 1 }
            : direction === 'left'
              ? { row: editingCell.row, col: editingCell.col - 1 }
              : editingCell;

    const column = visibleColumns[editingCell.col];
    const originalRowIndex = rowModel.getSourceIndex(editingCell.row);
    const row = applyServerSideCellEdits
      ? rowModel.getRow(editingCell.row)
      : rows[originalRowIndex];
    if (!column || !row) {
      dispatch(gridActions.stopEdit());
      return { status: 'noop' };
    }

    if (applyServerSideCellEdits) {
      const parsedValue = parseCommittedValue(column, committedValue, row);
      const decision = decideCellWrite(column, row, parsedValue);
      if (decision.action === 'reject') {
        return { status: 'rejected', message: decision.message };
      }
      applyServerSideCellEdits([
        { viewIndex: editingCell.row, column, value: parsedValue },
      ]);
    } else if (onRowsChange) {
      const parsedValue = parseCommittedValue(column, committedValue, row);
      const decision = decideCellWrite(column, row, parsedValue);
      if (decision.action === 'reject') {
        return { status: 'rejected', message: decision.message };
      }
      const nextRows = writeRowsCell(rows, originalRowIndex, column, parsedValue);
      onRowsChange(nextRows);
    }

    // 旧実装と同じ順序: ガード → rAF 予約 → stopEdit。
    editorActionGuardRef.current = true;
    scheduleAfterEdit(intendedCell);
    dispatch(gridActions.stopEdit());
    return { status: 'committed' };
  };

  const cancelEdit = () => {
    if (args === null || args.editorActionGuardRef.current) {
      return;
    }
    // 旧実装と同じ順序: ガード → stopEdit → rAF 予約。
    args.editorActionGuardRef.current = true;
    args.dispatch(gridActions.stopEdit());
    scheduleAfterEdit(null);
  };

  return { update, activateSingleCell, startEditWithValue, commitEdit, cancelEdit };
};