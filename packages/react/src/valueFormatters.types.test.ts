// 追加(dogfood DU-28): numberFormatter() を変数に入れて複数の列 / グリッドで使い回したときに型エラーにならないことを、
//   tsc(tsconfig.vitest.json)で固定する型のテストです(実行時は値の確認だけ)。
import { describe, expect, it } from 'vitest';
import { numberFormatter } from './index';
import type { CellValueFormatter, GridColumn } from './index';

type Row = { id: number; amount: number };
type Other = { code: string; price: number };

describe('numberFormatter の型(dogfood DU-28)', () => {
  it('型引数なしで作ったフォーマッタを、別の行の型の列でも使い回せる', () => {
    // 型引数なしで共有(これまでは CellValueFormatter<unknown> になり、GridColumn<Row> へ渡すと型エラー)
    const shared = numberFormatter({ maximumFractionDigits: 0 });
    const rowColumns: GridColumn<Row>[] = [{ key: 'amount', width: 100, valueFormatter: shared }];
    const otherColumns: GridColumn<Other>[] = [{ key: 'price', width: 100, valueFormatter: shared }];
    // これまでどおりの書き方も通る
    const inline: GridColumn<Row>[] = [{ key: 'amount', width: 100, valueFormatter: numberFormatter() }];
    const typed = numberFormatter<Row>();
    const typedColumns: GridColumn<Row>[] = [{ key: 'amount', width: 100, valueFormatter: typed }];
    const annotated: CellValueFormatter<Row> = numberFormatter();
    expect(rowColumns[0]?.valueFormatter?.({ value: 1234.5, row: undefined, column: rowColumns[0] })).toBe('1,235');
    expect(otherColumns[0]?.valueFormatter?.({ value: 1000, row: undefined, column: otherColumns[0] })).toBe('1,000');
    expect(inline).toHaveLength(1);
    expect(typedColumns).toHaveLength(1);
    expect(annotated({ value: 12, row: undefined, column: inline[0]! })).toBe('12');
  });
});
