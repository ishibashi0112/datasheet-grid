// グリッドを包む汎用の部品(S4-06)。部品の型引数は `T extends object` なので、包む部品も `<T extends object>` で書きます
//   (`SpreadsheetGridProps<T>` には制約が無いので、`<T>` のままでは TS2322)。2.0 で `SpreadsheetGridProps<T>` にも同じ制約を付ける
//   候補(docs/next-major.md)。付けたら下の `@ts-expect-error` は型引数の宣言の側へ移る。
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import type { SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid';

export function CompactGrid<T extends object>(props: SpreadsheetGridProps<T>) {
  return <SpreadsheetGrid rowHeight={32} {...props} />;
}

export function LooseGrid<T>(props: SpreadsheetGridProps<T>) {
  // @ts-expect-error 部品の型引数は T extends object
  return <SpreadsheetGrid {...props} />;
}

type Row = { id: string; name: string };
export const useCompactGrid = (rows: Row[]) => (
  <CompactGrid rows={rows} columns={[{ key: 'name', title: '名前', width: 160 }]} rowKeyGetter={(row) => row.id} />
);