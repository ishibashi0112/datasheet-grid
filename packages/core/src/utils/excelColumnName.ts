// 追加: 0-based の列 index を Excel 形式 (A, B, ... AA, AB...) に変換します。
export const toExcelColumnName = (columnIndex: number): string => {
  if (columnIndex < 0) {
    return '';
  }

  let current = columnIndex;
  let result = '';

  while (current >= 0) {
    result = String.fromCharCode((current % 26) + 65) + result;
    current = Math.floor(current / 26) - 1;
  }

  return result;
};