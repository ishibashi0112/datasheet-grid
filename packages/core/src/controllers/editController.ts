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
  GridRowKey,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { parseCommittedValue, writeRowsCell } from '../logic/editorValues';
import { decideCellWrite } from '../logic/validation';
import { clamp } from '../logic/geometry';
import { isFocusInsideDetailCard } from '../logic/detailRow';
import { isCellEditable } from '../utils/permissions';
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
  // 追加(監査 RD-6): 確定時に編集可否を再評価するための props です(開始時のゲートだけでは、編集中に
  //   readOnly へ切り替わった / canEditCell の結果が変わった場合に書き込めてしまうため)。未指定は従来どおり。
  readOnly?: boolean;
  canEditCell?: SpreadsheetGridProps<T>['canEditCell'];
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

// 追加(audit RD-1 / RD-3): 編集セッションの「同一性」です。editingCell は view / 論理 index だけを
//   持つため、編集中に rows が差し替わって行順が変わる(ポーリング更新 / SSRM refresh / 外部からの
//   applyState 等)と、確定値が「同じ index に来た別の行」へ書き込まれていました。開始時の rowKey /
//   columnKey を控えておき、update のたびに index との対応を確かめます(詳細は update 内のコメント)。
type EditIdentity = {
  rowKey: GridRowKey;
  columnKey: string;
  // この同一性が指していた editingCell(前回 update 時点)。
  cell: CellCoord;
};

// 追加(確定後のアクティブセル上書き): 方向なしの確定(エディタの blur / custom の commit(value) / select の
//   候補クリック / editorEnterMove 'none')の時点のアクティブセルと選択です。後処理(rAF)で「編集していたセルを
//   単一選択にする」前に、ここから変わっていないかを参照で比べます(edit/stop はどちらの参照も保ち、セルの
//   クリック / ドラッグ / 行・列ヘッダーの選択 / 命令的 API は新しい参照を作る)。
type SelectionSnapshot = Pick<GridUiState, 'activeCell' | 'selection'>;

const isSelectionChangedSince = (
  snapshot: SelectionSnapshot,
  uiState: GridUiState,
): boolean =>
  uiState.activeCell !== snapshot.activeCell || uiState.selection !== snapshot.selection;

// 追加(編集確定後のフォーカス奪取): commit / cancel 後の rAF でグリッドへフォーカスを戻してよいかです。
//   - どこにもない(null / body)→ 戻す。Enter / Tab / Escape で確定・取消してエディタが外れた直後はここ。
//   - グリッドのルート内(まだ残っているエディタ / セルのクリックでフォーカスを受けたルート / imeDirectInput
//     の入力受け)→ 戻す(ルートへの focus は imeDirectInput 有効時は入力受けへ回る)。
//   - グリッド外の要素(上部バーの入力欄 / ページ内の別フォーム / 別のグリッド)→ 戻さない。エディタの blur で
//     確定したとき、クリック先の入力欄からフォーカスを奪い返さない(ポップオーバーの監査 C-3 と同じ方針)。
//   - 展開行カード内(ルート内だが消費側の UI)→ 従来どおり奪わない。
const shouldRestoreFocusAfterEdit = (root: HTMLElement): boolean => {
  if (isFocusInsideDetailCard()) {
    return false;
  }
  const doc = root.ownerDocument;
  const active = doc.activeElement;
  return (
    active === null ||
    active === doc.body ||
    active === doc.documentElement ||
    root.contains(active)
  );
};

export const createEditController = <T extends object>(): EditController<T> => {
  let args: EditControllerArgs<T> | null = null;
  let identity: EditIdentity | null = null;

  // 指定セルの rowKey / columnKey を読みます(行が無い = SSRM 未ロード / 範囲外なら null)。
  const readKeysAt = (
    current: EditControllerArgs<T>,
    cell: CellCoord,
  ): { rowKey: GridRowKey; columnKey: string } | null => {
    const column = current.visibleColumns[cell.col];
    if (!column || cell.row < 0 || cell.row >= current.rowModel.getRowCount()) {
      return null;
    }
    if (current.rowModel.getRow(cell.row) === undefined) {
      return null;
    }
    return { rowKey: current.rowModel.getRowKey(cell.row), columnKey: column.key };
  };

  // 同一性から現在の view 座標を探します(行は O(行数) の走査。rows の差し替え時だけ呼ばれます)。
  const locateIdentity = (
    current: EditControllerArgs<T>,
    target: EditIdentity,
  ): CellCoord | null => {
    const col = current.visibleColumns.findIndex(
      (column) => column.key === target.columnKey,
    );
    if (col < 0) {
      return null;
    }
    const rowCount = current.rowModel.getRowCount();
    for (let row = 0; row < rowCount; row += 1) {
      if (
        current.rowModel.getRow(row) !== undefined &&
        Object.is(current.rowModel.getRowKey(row), target.rowKey)
      ) {
        return { row, col };
      }
    }
    return null;
  };

  const update = (next: EditControllerArgs<T>) => {
    args = next;
    const editingCell = next.uiState.editingCell;
    if (!editingCell) {
      identity = null;
      return;
    }
    const keysHere = readKeysAt(next, editingCell);
    const matchesIdentity =
      identity !== null &&
      keysHere !== null &&
      Object.is(keysHere.rowKey, identity.rowKey) &&
      keysHere.columnKey === identity.columnKey;
    if (matchesIdentity) {
      // 同じ行 / 列を指している(通常の再レンダー、または下の再ターゲット後)。座標だけ更新します。
      identity = { ...identity!, cell: editingCell };
      return;
    }
    const sameCellAsBefore =
      identity !== null &&
      identity.cell.row === editingCell.row &&
      identity.cell.col === editingCell.col;
    if (identity === null || !sameCellAsBefore) {
      // 新しい編集セッションの開始(startEdit 直後)。この時点の行 / 列を同一性として控えます。
      identity = keysHere ? { ...keysHere, cell: editingCell } : null;
      return;
    }
    // 座標は変わっていないのに行 / 列のキーが変わった = 編集中に rows / columns が差し替わった。
    //   同一性を手がかりに現在位置を探し、見つかれば editingCell をそこへ再ターゲット(RD-1)、
    //   見つからなければ編集を終了します(RD-3: editingCell が残ってキー操作が全滅するのを防ぐ)。
    const located = locateIdentity(next, identity);
    if (located) {
      identity = { ...identity, cell: located };
      next.dispatch(gridActions.startEdit(located));
    } else {
      identity = null;
      next.dispatch(gridActions.stopEdit());
    }
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

  // commit / cancel 直後の後処理(rAF): フォーカスをグリッドへ戻し(グリッド外 / 展開行カード内に
  //   フォーカスがある場合は奪わない = shouldRestoreFocusAfterEdit)、必要なら隣接セルへ移動してから
  //   再入抑止を解除します。ガードを立てるのは呼び出し側(旧実装と同じ順序を保つため)。
  //   変更(確定後のアクティブセル上書き): stayedFrom(方向なしの確定時点のスナップショット)があり、rAF までに
  //   アクティブセル / 選択が変わっていれば、編集していたセルへ戻しません。グリッド内の別のセルや行・列ヘッダーを
  //   押したことで blur 確定した場合、押した操作(アクティブセル / ドラッグ選択の開始)を上書きしていたため。
  //   方向付きの移動(Enter / Tab / commit(value, direction))は従来どおり常に行います。
  const scheduleAfterEdit = (
    nextCell: CellCoord | null,
    stayedFrom: SelectionSnapshot | null = null,
  ) => {
    const current = args;
    if (current === null) {
      return;
    }
    requestAnimationFrame(() => {
      const root = current.gridRootRef.current;
      if (root !== null && shouldRestoreFocusAfterEdit(root)) {
        root.focus();
      }
      if (
        nextCell !== null &&
        args !== null &&
        !(stayedFrom !== null && isSelectionChangedSince(stayedFrom, args.uiState))
      ) {
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
    // 追加(監査 RD-6): 確定時点で編集不可(編集中に readOnly へ切替 / canEditCell が false へ変化)なら
    //   書き込まずに編集を終了します(cancel と同じ後処理)。
    if (
      !isCellEditable(
        { readOnly: args.readOnly, canEditCell: args.canEditCell },
        editingCell.row,
        editingCell.col,
        row,
        column,
      )
    ) {
      editorActionGuardRef.current = true;
      dispatch(gridActions.stopEdit());
      scheduleAfterEdit(null);
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
    scheduleAfterEdit(
      intendedCell,
      direction === undefined
        ? { activeCell: uiState.activeCell, selection: uiState.selection }
        : null,
    );
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