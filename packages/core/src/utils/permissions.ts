import type {
  CanEditCellContext,
  GridColumn,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';

type EditPermissionProps<T> = Pick<SpreadsheetGridProps<T>, 'readOnly' | 'canEditCell'>;

// グリッド全体 / 列の静的な条件(canEditCell より前に判定し、false ならコールバックを呼びません)。
const isEditableByProps = <T,>(props: EditPermissionProps<T>, column: GridColumn<T>): boolean =>
  !props.readOnly && !column.readOnly && column.editable !== false;

// 追加: Grid 全体 / 列 / セル単位の条件をまとめて編集可否を判定します。
// 変更(audit RD-4): rowIndex はビュー行 index。canEditCell へは第 5 引数 context(元 rows の index / rowKey)も
//   渡します。context 未指定は後方互換のため rowIndex を流用します(グリッド内部の呼び出しは常に渡します)。
export const isCellEditable = <T,>(
  props: EditPermissionProps<T>,
  rowIndex: number,
  colIndex: number,
  row: T,
  column: GridColumn<T>,
  context?: CanEditCellContext,
): boolean => {
  if (!isEditableByProps(props, column)) {
    return false;
  }

  if (props.canEditCell) {
    return props.canEditCell(
      rowIndex,
      colIndex,
      row,
      column,
      context ?? { sourceRowIndex: rowIndex, rowKey: rowIndex },
    );
  }

  return true;
};

// 追加(audit RD-4): ビュー行 index から canEditCell の context を解決します(行が実在する index で呼ぶこと。
//   rowKeyGetter が row を読む実装だと、未ロード / 範囲外の index で throw し得るため)。
export const resolveCanEditCellContext = <T,>(
  rowModel: Pick<RowModel<T>, 'getSourceIndex' | 'getRowKey'>,
  viewIndex: number,
): CanEditCellContext => ({
  sourceRowIndex: rowModel.getSourceIndex(viewIndex) ?? viewIndex,
  rowKey: rowModel.getRowKey(viewIndex) ?? viewIndex,
});

// 追加(audit RD-4): ビュー行 index で編集可否を判定します(context は canEditCell があるときだけ rowModel から解決)。
export const isViewCellEditable = <T,>(
  props: EditPermissionProps<T>,
  rowModel: Pick<RowModel<T>, 'getSourceIndex' | 'getRowKey'>,
  viewIndex: number,
  colIndex: number,
  row: T,
  column: GridColumn<T>,
): boolean => {
  if (!isEditableByProps(props, column)) {
    return false;
  }
  if (!props.canEditCell) {
    return true;
  }
  return props.canEditCell(
    viewIndex,
    colIndex,
    row,
    column,
    resolveCanEditCellContext(rowModel, viewIndex),
  );
};

// 追加: 列定義からセル値を取り出します。getValue 未指定時は key ベースで取得します。
export const getCellValue = <T,>(row: T, column: GridColumn<T>): unknown => {
  if (column.getValue) {
    return column.getValue(row);
  }

  return (row as Record<string, unknown>)[column.key];
};

// 型だけの宣言です(ブラウザに process は無く、利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

const warnedComputedColumns = new Set<string>();

// 追加(dogfood DD-05): getValue だけの列(計算列)へ書き込むと、行に無いプロパティ row[key] が足され、表示は getValue の
//   ままで変わりません。編集させない / setValue を渡す、のどちらかに気づけるよう、開発時だけ列ごとに 1 回知らせます。
//   行に key のプロパティが既にある列(getValue で読み方だけ変えている列)は、key へ書くのが意図どおりなので知らせません。
const warnComputedColumnWrite = (row: unknown, key: string): void => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  if (warnedComputedColumns.has(key) || typeof row !== 'object' || row === null || Object.hasOwn(row, key)) {
    return;
  }
  warnedComputedColumns.add(key);
  console.warn(
    `[spreadsheet-grid] 列 \`${key}\` は getValue だけで setValue が無いため、書き込んだ値は行に新しいプロパティ ` +
      `\`${key}\` として足され、表示(getValue)は変わりません。編集させないなら \`editable: false\`、` +
      '書き戻すなら `setValue` を渡してください。',
  );
};

// 追加: 列定義を使ってセル値を書き換えます。setValue 未指定時は key ベース shallow copy を行います。
export const setCellValue = <T,>(
  row: T,
  column: GridColumn<T>,
  value: unknown,
): T => {
  if (column.setValue) {
    return column.setValue(row, value);
  }
  if (column.getValue) {
    warnComputedColumnWrite(row, column.key);
  }

  return {
    ...(row as Record<string, unknown>),
    [column.key]: value,
  } as T;
};