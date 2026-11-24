// グリッドを包む汎用の部品(S4-06。React 版の type-tests/src/wrapper.tsx と同じ)。部品の型引数は `T extends object` なので、
//   包む部品も `<T extends object>` で書きます。2.0 で `SpreadsheetGridProps<T>` にも同じ制約を付ける候補(docs/next-major.md)。
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid';
import type { SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid-solid';

export function CompactGrid<T extends object>(props: SpreadsheetGridProps<T>) {
  return <SpreadsheetGrid rowHeight={32} {...props} />;
}

export function LooseGrid<T>(props: SpreadsheetGridProps<T>) {
  // @ts-expect-error 部品の型引数は T extends object
  return <SpreadsheetGrid {...props} />;
}

type Row = { id: string; name: string };
export const compactGrid = (rows: Row[]) => (
  <CompactGrid rows={rows} columns={[{ key: 'name', title: '名前', width: 160 }]} rowKeyGetter={(row) => row.id} />
);