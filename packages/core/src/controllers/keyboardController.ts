// 追加(非依存化 ③-7): グリッドのキーボード操作(キー → アクション / コールバックの写像)のコントローラです
//   (React 非依存。旧 hooks/useGridKeyboardInteractions の本体を移設)。
//   - イベントは構造的型(GridKeyboardEventLike)で受けます。React アダプタは合成イベントから
//     key / 修飾キー / nativeEvent.isComposing / target / preventDefault を詰め替え、Solid 版はネイティブ
//     KeyboardEvent をほぼそのまま渡せます。
//   - update(args) はレンダー後に毎回呼ばれる前提(hooks/useController)。handleKeyDown はイベント時点の
//     最新 args(uiState / rowModel / 列 / コールバック)を読みます。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridColumn,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { clamp } from '../logic/geometry';
import { isImeInputTarget, isPrintableKey, shouldIgnoreGridKeydown } from '../logic/domGuards';
import { isViewCellEditable } from '../utils/permissions';
import { DETAIL_TOGGLE_COLUMN_KEY } from '../logic/detailRow';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '../logic/rowReorder';

export type GridKeyboardEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  // IME 変換中(nativeEvent.isComposing)。変換中の Ctrl+Z / Y は無視します。
  isComposing: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

export type KeyboardControllerArgs<T> = {
  uiState: GridUiState;
  rowModel: RowModel<T>;
  visibleColumns: GridColumn<T>[];
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  setEditorInitialValue: (value: string) => void;
  dispatch: (action: GridUiAction) => void;
  handleCopy: () => Promise<void>;
  // 追加(F-2): Ctrl/Cmd+F で検索バーを開く(未指定ならブラウザ標準の検索に譲る)。
  openFind?: () => void;
  handleCellDoubleClick: (cell: CellCoord) => void;
  isWholeGridSelected: boolean;
  selectEntireGrid: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearSelection: () => void;
  enableClearOnDelete: boolean;
  onToggleCheckboxCell: (cell: CellCoord) => void;
  onToggleGroup: (groupKey: string) => void;
  // 追加(dogfood DU-04): 展開トグル列(合成列)のセルでの Enter / Space の開閉です。開閉したら true(展開行が無い構成は未指定)。
  onToggleDetailRow?: (cell: CellCoord) => boolean;
  // 追加(dogfood DU-01): PageUp / PageDown の移動先の行(見えている高さ 1 画面ぶん先の行)。未指定なら 10 行。
  resolvePageRow?: (fromRow: number, direction: 1 | -1) => number;
  // 追加(別視点のレビュー): Alt+↓ でアクティブセルの列の列メニューを開く。開いたら true(列メニューが無い構成は未指定)。
  openColumnMenu?: (col: number) => boolean;
};

// 追加(dogfood DU-01): Home / Ctrl+Home / Ctrl+← で止まる先頭の列は、操作用の合成列(行ドラッグのハンドル列・展開トグル列)を
//   飛ばした最初の列です(← ではこれまでどおり合成列へも移れる)。自動グループ列は値を出す列なので止まります。
const isControlColumnKey = (key: string): boolean =>
  key === ROW_DRAG_HANDLE_COLUMN_KEY || key === DETAIL_TOGGLE_COLUMN_KEY;
const DEFAULT_PAGE_ROWS = 10;

// 追加(label-row ③): 縦移動ではラベル行(セルを持たない)に止まらず、同じ向きに読み飛ばします。
//   端までラベル行しか無ければ fallback に留まります(getLabelRow 未定義 = ラベル行なしでは従来どおり)。
const skipLabelRows = <T,>(rowModel: RowModel<T>, candidateRow: number, step: 1 | -1, fallback: number): number => {
  if (!rowModel.getLabelRow) {
    return candidateRow;
  }
  const rowCount = rowModel.getRowCount();
  let candidate = candidateRow;
  while (candidate >= 0 && candidate < rowCount && rowModel.getLabelRow(candidate)) {
    candidate += step;
  }
  return candidate >= 0 && candidate < rowCount ? candidate : fallback;
};

// 追加(dogfood DU-01 / DU-16): 端の行(ラベル行を飛ばした最初の行)と端の列(操作用の合成列を飛ばした最初の列)。
const firstRowIndex = <T,>(rowModel: RowModel<T>): number => skipLabelRows(rowModel, 0, 1, 0);
const firstColIndex = <T,>(visibleColumns: GridColumn<T>[]): number => {
  const index = visibleColumns.findIndex((column) => !isControlColumnKey(column.key));
  return index < 0 ? 0 : index;
};

// 追加(段階 2 lite-2): 最初のデータのセルです(ラベル行と操作用の合成列を飛ばす)。Tab の最初の止まり先(DU-16)と同じで、
//   全選択(Ctrl+A / 左上の角)の後のアクティブセルにも使います(これまでは (0, 0) で、枠が合成列やラベル行に乗っていた)。
export const resolveFirstDataCell = <T,>(rowModel: RowModel<T>, visibleColumns: GridColumn<T>[]): CellCoord => ({
  row: firstRowIndex(rowModel),
  col: firstColIndex(visibleColumns),
});

export type KeyboardController<T> = {
  update: (args: KeyboardControllerArgs<T>) => void;
  handleKeyDown: (event: GridKeyboardEventLike) => Promise<void>;
};

export const createKeyboardController = <T,>(): KeyboardController<T> => {
  let args: KeyboardControllerArgs<T> | null = null;

  const update = (next: KeyboardControllerArgs<T>) => {
    args = next;
  };

  // 追加(別視点のレビュー): 横の移動の行です。ラベル行なら近いデータ行(上、無ければ下)へ寄せます(範囲の終わりがラベル行の
  //   とき = 末尾がラベル行の表で全選択した後など、横に広げるとアクティブセルがラベル行に乗っていた)。
  const nearestDataRow = (rowModel: RowModel<T>, row: number): number =>
    skipLabelRows(rowModel, row, -1, skipLabelRows(rowModel, row, 1, row));

  // 追加(dogfood DU-01): 端の行(ラベル行を飛ばした最後の行)。最初の行 / 列はモジュール直下の firstRowIndex / firstColIndex。
  const lastRowIndex = (rowModel: RowModel<T>): number => {
    const last = rowModel.getRowCount() - 1;
    return skipLabelRows(rowModel, last, -1, last);
  };

  // 移動先のセルへアクティブセルを移します(Shift で範囲拡張。起点は今の範囲の起点か、無ければアクティブセル)。
  const commitMove = (currentCell: CellCoord, nextCell: CellCoord, extendSelection: boolean) => {
    if (args === null) {
      return;
    }
    const { uiState, dispatch } = args;
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

  // 追加(dogfood DU-16): アクティブセルが無いとき(Tab でグリッドに入った直後など)の最初の移動キーは、先頭のセル
  //   (ラベル行を飛ばした最初の行 × 操作用の合成列を飛ばした最初の列)に止まります。これまでは (0, 0) から 1 つ動いた
  //   セル(↓ なら A2、→ / Tab なら B1)へ行き、A1 に止まれませんでした。止まったら true。
  const activateFirstCellIfNone = (): boolean => {
    if (args === null || args.uiState.activeCell) {
      return false;
    }
    const { rowModel, visibleColumns } = args;
    if (rowModel.getRowCount() === 0 || visibleColumns.length === 0) {
      return true;
    }
    const first = resolveFirstDataCell(rowModel, visibleColumns);
    commitMove(first, first, false);
    return true;
  };

  // 動かす側のセル。Shift で範囲を広げるときは範囲の終わり(ドラッグ / Shift+クリックで選んだ範囲でも、その終わりから
  //   広げる。これまではアクティブセル = 起点から数え直して範囲が縮んでいた)、それ以外はアクティブセルです。
  //   キー操作だけで広げた範囲はアクティブセルが範囲の終わりなので、これまでと同じです。
  const movingCell = (extendSelection: boolean): CellCoord => {
    const uiState = args?.uiState;
    if (extendSelection && uiState?.selection?.type === 'cell') {
      return uiState.selection.range.end;
    }
    return uiState?.activeCell ?? { row: 0, col: 0 };
  };

  // active cell の移動(Shift で範囲拡張)。行 / 列とも端で clamp します。
  const moveActiveCell = (
    deltaRow: number,
    deltaCol: number,
    extendSelection: boolean,
  ) => {
    if (args === null) {
      return;
    }
    const { rowModel, visibleColumns } = args;
    const rowCount = rowModel.getRowCount();
    if (rowCount === 0 || visibleColumns.length === 0) {
      return;
    }
    if (activateFirstCellIfNone()) {
      return;
    }
    const currentCell = movingCell(extendSelection);
    let nextRow = clamp(currentCell.row + deltaRow, 0, rowCount - 1);
    nextRow =
      deltaRow !== 0
        ? skipLabelRows(rowModel, nextRow, deltaRow > 0 ? 1 : -1, currentCell.row)
        : nearestDataRow(rowModel, nextRow);
    const nextCell = {
      row: nextRow,
      col: clamp(currentCell.col + deltaCol, 0, visibleColumns.length - 1),
    };
    commitMove(currentCell, nextCell, extendSelection);
  };

  // 追加(dogfood DU-01): 端 / 1 画面ぶんの移動(Excel と同じキー)。row / col は移動先を返す関数で、今のセルを受けます。
  //   アクティブセルが無いときは先頭のセルから数えます(Ctrl+End などは無くても端へ行く)。
  const jumpActiveCell = (
    resolve: (current: CellCoord, rowModel: RowModel<T>, visibleColumns: GridColumn<T>[]) => CellCoord,
    extendSelection: boolean,
  ) => {
    if (args === null) {
      return;
    }
    const { uiState, rowModel, visibleColumns } = args;
    if (rowModel.getRowCount() === 0 || visibleColumns.length === 0) {
      return;
    }
    const currentCell = uiState.activeCell
      ? movingCell(extendSelection)
      : { row: firstRowIndex(rowModel), col: firstColIndex(visibleColumns) };
    const next = resolve(currentCell, rowModel, visibleColumns);
    commitMove(
      currentCell,
      {
        row: nearestDataRow(rowModel, clamp(next.row, 0, rowModel.getRowCount() - 1)),
        col: clamp(next.col, 0, visibleColumns.length - 1),
      },
      extendSelection && uiState.activeCell !== null,
    );
  };

  const resolvePageTarget = (current: CellCoord, rowModel: RowModel<T>, direction: 1 | -1): number => {
    const rowCount = rowModel.getRowCount();
    const raw = args?.resolvePageRow
      ? args.resolvePageRow(current.row, direction)
      : current.row + direction * DEFAULT_PAGE_ROWS;
    // 少なくとも 1 行は動かします(見えている高さより高い行など)。
    const moved = direction > 0 ? Math.max(raw, current.row + 1) : Math.min(raw, current.row - 1);
    const clamped = clamp(moved, 0, rowCount - 1);
    // ラベル行に当たったら同じ向きへ読み飛ばし、先がラベル行だけなら逆向きに戻って最寄りの行へ(無ければ今の行)。
    const forward = skipLabelRows(rowModel, clamped, direction, -1);
    if (forward >= 0) {
      return forward;
    }
    const backward = skipLabelRows(rowModel, clamped, direction > 0 ? -1 : 1, current.row);
    return backward;
  };

  const handleKeyDown = async (event: GridKeyboardEventLike) => {
    if (args === null) {
      return;
    }
    const {
      uiState,
      rowModel,
      visibleColumns,
      readOnly,
      canEditCell,
      setEditorInitialValue,
      dispatch,
      handleCopy,
      openFind,
      handleCellDoubleClick,
      isWholeGridSelected,
      selectEntireGrid,
      onUndo,
      onRedo,
      onClearSelection,
      enableClearOnDelete,
      onToggleCheckboxCell,
      onToggleGroup,
      onToggleDetailRow,
    } = args;

    // 入力部品(input / textarea / select / button / contenteditable)配下では発火させません。
    if (shouldIgnoreGridKeydown(event.target)) {
      return;
    }
    // 編集中はエディタがキーを扱います。
    if (uiState.editingCell) {
      return;
    }
    // 追加(G-2): 入力受け(imeDirectInput)で IME の変換中のキー(候補の選択 / 変換確定の Enter 等)は IME の操作なので
    //   グリッドでは扱いません(セル移動や編集開始に使わない)。
    if (event.isComposing && isImeInputTarget(event.target)) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      await handleCopy();
      return;
    }
    // 追加(F-2): セル内検索(グリッドにフォーカスがあるときだけ横取り)。
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && openFind) {
      event.preventDefault();
      openFind();
      return;
    }

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

    if ((event.ctrlKey || event.metaKey) && !event.isComposing) {
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }
      if (event.key.toLowerCase() === 'y' && !event.shiftKey) {
        event.preventDefault();
        onRedo();
        return;
      }
    }

    // 追加(dogfood DU-01): Excel と同じ端 / 1 画面ぶんの移動です(Shift で範囲を広げる)。Ctrl / ⌘ + 矢印 = その向きの端の
    //   行 / 列、Home / End = 行の先頭 / 末尾の列、Ctrl / ⌘ + Home / End = 先頭 / 末尾のセル、PageUp / PageDown = 1 画面ぶん上 / 下。
    //   これまでは Ctrl+矢印が 1 つだけ動き、ほかは何もしませんでした(端は表の端。値の切れ目では止まらない)。
    //   先頭の列は操作用の合成列(行ドラッグのハンドル列・展開トグル列)を飛ばし、行はラベル行を飛ばします。
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    // 追加(別視点のレビュー): Alt+↓(Mac は Option+↓)でアクティブセルの列の列メニューを開きます(Excel のフィルターの
    //   ドロップダウンと同じキー)。見出しの ⋮ は Tab の順番に入れない(DF-08)ので、キーボードの入口です。開けなければ ↓ のまま。
    if (
      event.key === 'ArrowDown' &&
      event.altKey &&
      !ctrlOrMeta &&
      !event.shiftKey &&
      uiState.activeCell &&
      args.openColumnMenu?.(uiState.activeCell.col)
    ) {
      event.preventDefault();
      return;
    }
    if (ctrlOrMeta && !event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const toLast = event.key === 'ArrowDown';
      jumpActiveCell(
        (current, model) => ({ row: toLast ? lastRowIndex(model) : firstRowIndex(model), col: current.col }),
        event.shiftKey,
      );
      return;
    }
    if (ctrlOrMeta && !event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const toLast = event.key === 'ArrowRight';
      jumpActiveCell(
        (current, _model, columns) => ({ row: current.row, col: toLast ? columns.length - 1 : firstColIndex(columns) }),
        event.shiftKey,
      );
      return;
    }
    if ((event.key === 'Home' || event.key === 'End') && !event.altKey) {
      event.preventDefault();
      const toLast = event.key === 'End';
      jumpActiveCell(
        (current, model, columns) => ({
          row: ctrlOrMeta ? (toLast ? lastRowIndex(model) : firstRowIndex(model)) : current.row,
          col: toLast ? columns.length - 1 : firstColIndex(columns),
        }),
        event.shiftKey,
      );
      return;
    }
    if ((event.key === 'PageDown' || event.key === 'PageUp') && !ctrlOrMeta && !event.altKey) {
      event.preventDefault();
      if (activateFirstCellIfNone()) {
        return;
      }
      const direction = event.key === 'PageDown' ? 1 : -1;
      jumpActiveCell(
        (current, model) => ({ row: resolvePageTarget(current, model, direction), col: current.col }),
        event.shiftKey,
      );
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
      // 列の端(最終列で Tab / 先頭列で Shift+Tab)は既定動作に任せ、フォーカスをグリッド外へ出します
      //   (キーボードトラップ回避。WCAG 2.1.2 / 監査 C-5)。端以外は従来どおりアクティブセル移動。
      // 変更(dogfood DU-16): アクティブセルが無いときの Tab は先頭のセルに止まります(Shift+Tab はグリッドの外へ)。
      //   変更(別視点のレビュー): 行や列が 0 件なら止まるセルが無いので、Tab は既定の動きのまま外へ出します(止めると出られなかった)。
      if (!uiState.activeCell && !event.shiftKey) {
        if (args.rowModel.getRowCount() === 0 || args.visibleColumns.length === 0) {
          return;
        }
        event.preventDefault();
        activateFirstCellIfNone();
        return;
      }
      const currentCol = uiState.activeCell?.col ?? 0;
      const atEdge = event.shiftKey
        ? currentCol <= 0
        : currentCol >= args.visibleColumns.length - 1;
      if (atEdge) {
        return;
      }
      event.preventDefault();
      moveActiveCell(0, event.shiftKey ? -1 : 1, false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch(gridActions.clearSelection());
      return;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      enableClearOnDelete
    ) {
      event.preventDefault();
      onClearSelection();
      return;
    }
    // グループ行では Enter / Space が開閉トグル。
    if ((event.key === 'Enter' || event.key === ' ') && uiState.activeCell) {
      const groupRow = rowModel.getGroupRow?.(uiState.activeCell.row);
      if (groupRow) {
        event.preventDefault();
        onToggleGroup(groupRow.groupKey);
        return;
      }
      // 追加(dogfood DU-04): 展開トグル列のセルでは Enter / Space が展開行の開閉(▸ を押したのと同じ)。これまではキーボードで
      //   開閉できませんでした。
      if (
        onToggleDetailRow &&
        visibleColumns[uiState.activeCell.col]?.key === DETAIL_TOGGLE_COLUMN_KEY &&
        onToggleDetailRow(uiState.activeCell)
      ) {
        event.preventDefault();
        return;
      }
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      if (uiState.activeCell) {
        handleCellDoubleClick(uiState.activeCell);
        return;
      }
      // 追加(dogfood DU-16): アクティブセルが無いときの Enter は先頭のセルに止まります(編集は始めない)。
      if (event.key === 'Enter') {
        activateFirstCellIfNone();
      }
      return;
    }
    // 印字キーは、その文字を初期値にして編集開始(checkbox 列は Space でトグルのみ)。
    if (isPrintableKey(event) && uiState.activeCell) {
      const row = rowModel.getRow(uiState.activeCell.row);
      const column = visibleColumns[uiState.activeCell.col];
      if (!row || !column) {
        return;
      }
      if (
        !isViewCellEditable(
          { readOnly, canEditCell },
          rowModel,
          uiState.activeCell.row,
          uiState.activeCell.col,
          row,
          column,
        )
      ) {
        return;
      }
      if (column.editor?.type === 'checkbox') {
        event.preventDefault();
        if (event.key === ' ') {
          onToggleCheckboxCell(uiState.activeCell);
        }
        return;
      }
      event.preventDefault();
      setEditorInitialValue(event.key);
      dispatch(gridActions.startEdit(uiState.activeCell));
    }
  };

  return { update, handleKeyDown };
};