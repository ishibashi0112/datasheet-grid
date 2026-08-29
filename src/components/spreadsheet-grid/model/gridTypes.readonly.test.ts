// 追加(proposals ②): rows / columns / filterOptions が readonly 配列を受け付けることの
//   コンパイル時回帰テストです(tsc -p tsconfig.vitest.json ゲートで検証)。
//   useMemo / filter 由来の readonly T[] や as const の候補配列をキャストなしで渡せることを、
//   型代入だけで担保します(実行時アサーションは型が通ること自体が本体)。
import { describe, expect, it } from 'vitest';

import type { GridColumn, SpreadsheetGridProps } from '../index';

type Row = { id: number; name: string };

describe('SpreadsheetGridProps の readonly 入力(proposals ②)', () => {
  it('readonly rows / columns / filterOptions を型エラーなく代入できる', () => {
    const readonlyRows: readonly Row[] = [{ id: 1, name: 'a' }];
    const filterOptions = [{ label: 'A', value: 'a' }] as const;
    const readonlyColumns: readonly GridColumn<Row>[] = [
      { key: 'name', title: '名前', width: 120, filterOptions },
    ];

    // 入力側は readonly のまま渡せる(キャスト不要)。
    const props: SpreadsheetGridProps<Row> = {
      rows: readonlyRows,
      columns: readonlyColumns,
    };

    // 従来どおり mutable 配列も渡せる(緩和であって置き換えではない)。
    const mutableProps: SpreadsheetGridProps<Row> = {
      rows: [{ id: 2, name: 'b' }],
      columns: [{ key: 'id', title: 'ID', width: 80 }],
    };

    expect(props.rows).toHaveLength(1);
    expect(mutableProps.columns).toHaveLength(1);
  });
});