// 追加(監査 RD-5 / M-03): columns prop の変化に合わせて列幅 state(uiState.columnWidths)を整える純粋関数です。
//   列幅 state は「手動リサイズ / autosize / applyState で決まった列」だけを持ち、それ以外の列は
//   column.width(flex 列は flex 算出)で描画します(解決は columnWidths[key] ?? flex 算出 ?? column.width)。
//   columns の参照が変わっただけ(インライン columns={[...]} の再レンダー等)ではエントリを消しません。
//   エントリを消すのは次の場合だけです:
//     - 列が columns から無くなった
//     - その列の flex 指定(flex 値 / flex するかどうか = pinned 変化を含む)が変わった
//     - その列の width がエントリと異なる値へ変わった(= 利用側がコードで幅を指定し直した)。
//       pin / 表示 / 並べ替え / applyState が解決済み幅を column.width へ書き戻す経路は
//       エントリと同値になるため保全されます。
import type { GridColumn } from '../model/gridTypes.unbound';
import { isFlexingColumn } from './columnFlex';

export const reconcileColumnWidths = <T,>(
  columnWidths: Record<string, number>,
  prevColumns: readonly GridColumn<T>[] | null,
  nextColumns: readonly GridColumn<T>[],
): Record<string, number> => {
  const keys = Object.keys(columnWidths);
  if (keys.length === 0) {
    return columnWidths;
  }
  const prevByKey = new Map<string, GridColumn<T>>();
  for (const column of prevColumns ?? []) {
    prevByKey.set(column.key, column);
  }
  const nextByKey = new Map<string, GridColumn<T>>();
  for (const column of nextColumns) {
    nextByKey.set(column.key, column);
  }

  let changed = false;
  const result: Record<string, number> = {};
  for (const key of keys) {
    const width = columnWidths[key];
    const next = nextByKey.get(key);
    if (next === undefined) {
      changed = true;
      continue;
    }
    const prev = prevByKey.get(key);
    if (prev !== undefined) {
      const flexChanged =
        isFlexingColumn(prev) !== isFlexingColumn(next) ||
        (prev.flex ?? undefined) !== (next.flex ?? undefined);
      const widthOverridden = prev.width !== next.width && next.width !== width;
      if (flexChanged || widthOverridden) {
        changed = true;
        continue;
      }
    }
    result[key] = width;
  }
  return changed ? result : columnWidths;
};
