// 追加(バッチ②/コンテキストメニュー): 右クリック対象(セル/行)の解決に使う純ロジックです。
//   DOM 逆引き(SpreadsheetGrid 側の委譲ハンドラ)から得た「列キー」「行 index」を、公開 params の
//   colIndex / isTargetSelected へ変換する部分だけを副作用なしで切り出しています(テスト対象)。
//   メニューの開閉・配線は useCellContextMenuController / SpreadsheetGrid 側が担います。
//   変更(1.3.0 / 段 2-9): params を作る処理(下の buildCellContextMenuParams / buildBodyContextMenuParams)もここ。
import { getCellValue } from '../utils/permissions';
import type {
  CellCoord,
  GridColumn,
  GridContextMenuParams,
  GridContextMenuTarget,
  GridSelection,
  RowModel,
} from '../model/gridTypes.unbound';

// 右クリックされたセルの列キーから論理列 index(視覚順 左→中央→右 = orderedColumns 上の index)を
//   引きます。見つからなければ -1。handle.selectCell などが使う colIndex と同一空間の値を返します。
export const resolveContextMenuColIndex = <T,>(
  orderedColumns: readonly GridColumn<T>[],
  columnKey: string,
): number => orderedColumns.findIndex((column) => column.key === columnKey);

// セル(row,col)が現在のセル範囲選択(GridSelection)に含まれるかの判定です。
//   body の isSelected と同じ規則: row 選択は行内の全列 / cell 選択は矩形 / col 選択は列区間。
//   params.isTargetSelected(cell target)の算出に使います(チェックボックス行選択とは別概念)。
export const isContextMenuCellSelected = (
  selection: GridSelection,
  rowIndex: number,
  colIndex: number,
): boolean => {
  if (!selection) {
    return false;
  }
  if (selection.type === 'row') {
    return rowIndex >= selection.startRow && rowIndex <= selection.endRow;
  }
  if (selection.type === 'col') {
    return colIndex >= selection.startCol && colIndex <= selection.endCol;
  }
  // type 'cell'。start/end は正規化されていない場合があるため min/max で吸収します。
  const { start, end } = selection.range;
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  return (
    rowIndex >= minRow &&
    rowIndex <= maxRow &&
    colIndex >= minCol &&
    colIndex <= maxCol
  );
};

// 行(rowHeader target)が現在のセル範囲選択に含まれるかの判定です。
//   row / cell 選択は行区間で判定し、col 選択は「列」を選ぶ概念のため行は非選択(false)扱いです。
//   params.isTargetSelected(rowHeader target)の算出に使います。
export const isContextMenuRowSelected = (
  selection: GridSelection,
  rowIndex: number,
): boolean => {
  if (!selection) {
    return false;
  }
  if (selection.type === 'row') {
    return rowIndex >= selection.startRow && rowIndex <= selection.endRow;
  }
  if (selection.type === 'cell') {
    const { start, end } = selection.range;
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    return rowIndex >= minRow && rowIndex <= maxRow;
  }
  return false;
};

// 追加(1.3.0 / Solid 版の品質の段 2-9): メニューへ渡す params を作る処理です。React 版の features/contextMenu.tsx と Solid 版の
//   features/contextMenu.ts に同じ処理があったので、ここへ寄せました(片方だけ直してずれないように)。
//   - buildCellContextMenuParams: セルの座標から(右クリックのセルと、キーボードの Shift+F10 / メニューキーで開くアクティブセルで共通)。
//   - buildBodyContextMenuParams: 右クリックの対象(セル / 行番号)を DOM(data-row-index / data-ssg-col-key)から逆引きして。
//   どちらも開かないとき(見出し / SSRM の未ロード行・グループ行・ラベル行・範囲外)は null(ブラウザの標準のメニューへ)。
export type CellContextMenuInput<T> = {
  cell: CellCoord;
  clientX: number;
  clientY: number;
  rowModel: RowModel<T>;
  orderedColumns: readonly GridColumn<T>[];
  selection: GridSelection;
  activeCell: CellCoord | null;
};

export type BodyContextMenuInput<T> = Omit<CellContextMenuInput<T>, 'cell' | 'clientX' | 'clientY'> & {
  // React の合成イベントと DOM の MouseEvent のどちらでも渡せるように、使う 3 つだけ。
  event: { readonly target: EventTarget | null; readonly clientX: number; readonly clientY: number };
};

export const buildCellContextMenuParams = <T,>({
  cell,
  clientX,
  clientY,
  rowModel,
  orderedColumns,
  selection,
  activeCell,
}: CellContextMenuInput<T>): GridContextMenuParams<T> | null => {
  const rowIndex = cell.row;
  const colIndex = cell.col;
  const row = rowModel.getRow(rowIndex);
  const column = orderedColumns[colIndex];
  if (!row || !column) {
    return null;
  }
  const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
  return {
    target: {
      type: 'cell',
      rowIndex,
      colIndex,
      rowKey,
      row,
      column,
      value: getCellValue(row, column),
    },
    clientX,
    clientY,
    selection,
    activeCell,
    isTargetSelected: isContextMenuCellSelected(selection, rowIndex, colIndex),
  };
};

export const buildBodyContextMenuParams = <T,>({
  event,
  rowModel,
  orderedColumns,
  selection,
  activeCell,
}: BodyContextMenuInput<T>): GridContextMenuParams<T> | null => {
  const targetEl = event.target as HTMLElement | null;
  if (!targetEl || typeof targetEl.closest !== 'function') {
    return null;
  }
  // 本体の行(行番号の列を含む)。見出しはこれを持たないので null。
  const rowEl = targetEl.closest<HTMLElement>('[data-row-index]');
  if (!rowEl) {
    return null;
  }
  const rowIndexRaw = rowEl.dataset.rowIndex;
  if (rowIndexRaw === undefined) {
    return null;
  }
  const rowIndex = Number(rowIndexRaw);
  if (!Number.isInteger(rowIndex)) {
    return null;
  }
  const row = rowModel.getRow(rowIndex);
  // SSRM の未ロード行 / 範囲外は開きません(標準のメニューへ)。
  if (!row) {
    return null;
  }
  const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
  // セル(data-ssg-col-key あり)か、行番号(なし)かで対象を分けます。
  const cellEl = targetEl.closest<HTMLElement>('[data-ssg-col-key]');
  const colKey = cellEl?.dataset.ssgColKey;
  if (cellEl && colKey !== undefined) {
    const colIndex = resolveContextMenuColIndex(orderedColumns, colKey);
    if (colIndex < 0) {
      return null;
    }
    return buildCellContextMenuParams({
      cell: { row: rowIndex, col: colIndex },
      clientX: event.clientX,
      clientY: event.clientY,
      rowModel,
      orderedColumns,
      selection,
      activeCell,
    });
  }
  const target: GridContextMenuTarget<T> = { type: 'rowHeader', rowIndex, rowKey, row };
  return {
    target,
    clientX: event.clientX,
    clientY: event.clientY,
    selection,
    activeCell,
    isTargetSelected: isContextMenuRowSelected(selection, rowIndex),
  };
};