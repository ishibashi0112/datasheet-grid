// 追加(Solid 版 段階 0-2): セルの操作のコマンド群です(React 非依存。React 版の GridShell.tsx の useCallback 群
//   tryStartEditCell / handleCellDoubleClick / toggleCheckboxCell / clearSelectedCells / selectEntireGrid を移設)。
//   Solid 版も同じ判断を使います(シェルごとに書き直さない)。
//   - tryStartEdit: 編集を始めてよいセルなら、今の値を初期値に編集を始めます(始めたら true)。ダブルクリック / Enter / F2 /
//     命令的 API の startEditing() の共通の入口です。チェックボックス列は編集を開かず(クリック / Space で切り替える)、
//     読み取り専用 / canEditCell / 列の editable は isViewCellEditable で見ます。
//   - toggleCheckbox: チェックボックスのセルの直接の切り替え(クリック / Space)。検証で reject の列は NG の値を書きません。
//   - writeCellValue: 1 セルへ値をそのまま書きます(renderCell の ctx.setValue。パースを通らない値なので、検証で reject の列の
//     NG の値だけを止め、書き換えてよいかの判定はしません = これまでどおり)。本体は純関数 writeCellValueTo で、React 版の
//     ctx.setValue は描いた時点の rows / rowModel / 書き込み口を渡します(setValue は後で呼ばれることがあり、描いた時点の
//     行の index と今の並びを混ぜると別の行へ書くため。別視点のレビュー)。
//   - clearSelectedCells: 選んだセル(無ければアクティブセル)の値を消します(Delete / Backspace)。
//   - selectEntireGrid: 表の全体を選び、アクティブセルは最初のデータのセル(合成列とラベル行を飛ばす)。
//   書き込みは clientSide = handleRowsChange(履歴のラッパ)、serverSide = applyServerSideCellEdits(書き戻し)です。
//   状態はイベントの時点の store から読みます(getUiState。controllers/liveUiState)。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { CellCoord, GridColumn, GridUiState, RowModel, SpreadsheetGridProps } from '../model/gridTypes.unbound';
import { buildClearCellEdits, clearCellsInSelection } from '../logic/clearCells';
import { toggleCheckboxValue } from '../logic/checkboxEditor';
import { writeRowsCell } from '../logic/editorValues';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';
import { decideCellWrite } from '../logic/validation';
import { getCellValue, isViewCellEditable } from '../utils/permissions';
import { resolveFirstDataCell } from '../controllers/keyboardController';
import { readLiveUiState } from '../controllers/liveUiState';

export type CellCommandsArgs<T extends object> = {
  // clientSide の元の行(書き込みで作り直す)。serverSide では使いません。
  rows: T[];
  rowModel: RowModel<T>;
  // 論理 index の空間の列(ペイン順。セル座標の col と同じ並び)。
  orderedColumns: GridColumn<T>[];
  uiState: GridUiState;
  // イベントの時点の状態(store の getState)。省略は uiState。
  getUiState?: (() => GridUiState) | undefined;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  // clientSide の書き込み口(履歴のラッパ)。未指定なら書きません。
  handleRowsChange: ((nextRows: T[]) => void) | undefined;
  // serverSide の書き込み口(dataSource.updateRows があるときだけ)。指定時は handleRowsChange より先に使います。
  applyServerSideCellEdits: ((edits: ServerSideCellEditInput<T>[]) => number) | undefined;
  // 初期値を入れて編集を始めます(controllers/editController の startEditWithValue)。
  startEditWithValue: (cell: CellCoord, initialValue: string) => void;
  dispatch: (action: GridUiAction) => void;
};

// 書き込み先(clientSide = rows を作り直して handleRowsChange / serverSide = applyServerSideCellEdits)。
export type CellWriteTarget<T extends object> = Pick<
  CellCommandsArgs<T>,
  'rows' | 'rowModel' | 'handleRowsChange' | 'applyServerSideCellEdits'
>;

// 1 セルへ値をそのまま書きます。viewIndex は target.rowModel の並びの index です。
export const writeCellValueTo = <T extends object>(
  target: CellWriteTarget<T>,
  viewIndex: number,
  row: T,
  column: GridColumn<T>,
  nextValue: unknown,
): void => {
  const { rows, rowModel, handleRowsChange, applyServerSideCellEdits } = target;
  // reject の列は検証 NG の値を書きません。
  if (decideCellWrite(column, row, nextValue).action === 'reject') {
    return;
  }
  // serverSide は書き戻しへ流します(楽観更新は serverSide の機能の側)。
  if (applyServerSideCellEdits) {
    applyServerSideCellEdits([{ viewIndex, column, value: nextValue }]);
    return;
  }
  if (!handleRowsChange) {
    return;
  }
  // 元の行が引けなければ書きません(別の行へ書かない)。
  const originalRowIndex = rowModel.getSourceIndex(viewIndex);
  if (originalRowIndex === undefined) {
    return;
  }
  handleRowsChange(writeRowsCell(rows, originalRowIndex, column, nextValue));
};

export type CellCommands<T extends object> = {
  update: (args: CellCommandsArgs<T>) => void;
  tryStartEdit: (cell: CellCoord) => boolean;
  toggleCheckbox: (cell: CellCoord) => void;
  writeCellValue: (viewIndex: number, row: T, column: GridColumn<T>, nextValue: unknown) => void;
  clearSelectedCells: () => void;
  selectEntireGrid: () => void;
};

export const createCellCommands = <T extends object>(): CellCommands<T> => {
  let args: CellCommandsArgs<T> | null = null;

  const update = (next: CellCommandsArgs<T>) => {
    args = next;
  };

  // そのセルを書き換えてよいか(読み取り専用 / canEditCell / 列の editable / グループ行・ラベル行)。
  const canWrite = (current: CellCommandsArgs<T>, viewIndex: number, colIndex: number, row: T, column: GridColumn<T>) =>
    isViewCellEditable(
      { readOnly: current.readOnly, canEditCell: current.canEditCell },
      current.rowModel,
      viewIndex,
      colIndex,
      row,
      column,
    );

  const tryStartEdit = (cell: CellCoord): boolean => {
    if (args === null) {
      return false;
    }
    const row = args.rowModel.getRow(cell.row);
    const column = args.orderedColumns[cell.col];
    if (!row || !column || !canWrite(args, cell.row, cell.col, row, column)) {
      return false;
    }
    // チェックボックス列は直接切り替える方式なので編集を開きません(ダブルクリックはクリック 2 回として扱う)。
    if (column.editor?.type === 'checkbox') {
      return false;
    }
    args.startEditWithValue(cell, String(getCellValue(row, column) ?? ''));
    return true;
  };

  // 最新の状態(update で受けた値)へ書きます。チェックボックスの切り替えは今の並びの行を読んで書くので一致します。
  const writeCellValue = (viewIndex: number, row: T, column: GridColumn<T>, nextValue: unknown) => {
    if (args !== null) {
      writeCellValueTo(args, viewIndex, row, column, nextValue);
    }
  };

  const toggleCheckbox = (cell: CellCoord) => {
    if (args === null) {
      return;
    }
    const { rowModel, orderedColumns, handleRowsChange, applyServerSideCellEdits } = args;
    // 書き込み口はどちらか(clientSide = handleRowsChange / serverSide = applyServerSideCellEdits)があれば進みます。
    if (!handleRowsChange && !applyServerSideCellEdits) {
      return;
    }
    const row = rowModel.getRow(cell.row);
    const column = orderedColumns[cell.col];
    if (!row || !column || column.editor?.type !== 'checkbox' || !canWrite(args, cell.row, cell.col, row, column)) {
      return;
    }
    writeCellValue(cell.row, row, column, toggleCheckboxValue(getCellValue(row, column), column.editor));
  };

  // 書き込みは貼り付けと同じく view → 元の行の解決 + 書き換えてよいかの判定で、1 セルも変わらなければ書きません
  //   (元に戻すの履歴に何もしない変更を積まない)。消した値は「空の文字を貼り付けた」のと同じ規則です。
  const clearSelectedCells = () => {
    if (args === null) {
      return;
    }
    const current = args;
    const { rows, rowModel, orderedColumns, handleRowsChange, applyServerSideCellEdits } = current;
    const { selection, activeCell } = readLiveUiState(current);
    const viewRowCount = rowModel.getRowCount();
    // serverSide は見えている行を走査してセルの編集の集まりを作り、書き戻しへ流します(全件の rows が無いため)。
    //   読み込んでいない行(スケルトン)は飛ばします。
    if (applyServerSideCellEdits) {
      const edits = buildClearCellEdits({
        getRow: (viewIndex) => rowModel.getRow(viewIndex),
        columns: orderedColumns,
        selection,
        activeCell,
        viewRowCount,
        canWriteCell: (viewIndex, colIndex, row, column) => canWrite(current, viewIndex, colIndex, row, column),
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
      selection,
      activeCell,
      viewRowCount,
      // canEditCell の rowIndex はビュー行の index(表示 / 編集開始と同じ。audit RD-4)。
      canWriteCell: (_originalRowIndex, colIndex, row, column, viewIndex) =>
        canWrite(current, viewIndex, colIndex, row, column),
    });
    if (changed) {
      handleRowsChange(nextRows);
    }
  };

  const selectEntireGrid = () => {
    if (args === null) {
      return;
    }
    const { rowModel, orderedColumns, dispatch } = args;
    const viewRowCount = rowModel.getRowCount();
    if (viewRowCount === 0 || orderedColumns.length === 0) {
      return;
    }
    dispatch(gridActions.startSelection({ row: 0, col: 0 }));
    dispatch(gridActions.updateSelection({ row: viewRowCount - 1, col: orderedColumns.length - 1 }));
    dispatch(gridActions.endSelection());
    // 範囲は表の全体のまま、アクティブセルは最初のデータのセル(合成列とラベル行を飛ばす。Tab の最初の止まり先と同じ)。
    //   合成列はどの並びでも先頭にまとまっているので、ペイン順の列で数えても見える列の順と同じ index です。
    dispatch(gridActions.activateCell(resolveFirstDataCell(rowModel, orderedColumns)));
  };

  return { update, tryStartEdit, toggleCheckbox, writeCellValue, clearSelectedCells, selectEntireGrid };
};