// 追加(段階 2 DU-27): 行の型を union にしたとき、isLabelRow を型ガードで書けば getLabel / render / height / className /
//   exportText の row がラベル行の型になること(これまでは T のままで、row.label を読むには中でもう一度絞る必要が
//   あった)を型で確かめます。実行はせず、tsc(tsconfig.vitest.json)が検査します(@ts-expect-error が要らなくなると
//   tsc が落ちる)。
import { describe, expect, it } from 'vitest';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { createSpreadsheetGrid } from './createSpreadsheetGrid';
import { labelRowFeature } from './features/labelRow';
import type { GridColumn, LabelRowOptions } from './model/gridTypes';

type Sale = { kind: 'sale'; id: number; amount: number };
type Month = { kind: 'label'; id: string; label: string };
type Row = Sale | Month;

const rows: Row[] = [];
const columns: GridColumn<Row>[] = [{ key: 'amount', title: '金額', width: 100 }];
const LiteGrid = createSpreadsheetGrid({ features: { labelRow: labelRowFeature } });
const isMonth = (row: Row): row is Month => row.kind === 'label';

// 呼ばない関数の中で JSX を組み立て、型だけを検査します。
export const typeCases = () => [
  // 型ガード(`row is Month`)で書くと、ほかの関数の row が Month になる。
  <SpreadsheetGrid
    key="guard"
    rows={rows}
    columns={columns}
    rowKeyGetter={(row) => row.id}
    labelRow={{
      isLabelRow: (row): row is Month => row.kind === 'label',
      getLabel: (row) => row.label,
      render: ({ row }) => row.label,
      height: (row) => (row.label.length > 10 ? 40 : 32),
      className: (row) => (row.label === '' ? 'empty' : undefined),
      exportText: (row) => [row.label],
    }}
  />,
  // 外で定義した型ガードでも同じ。/lite で作ったコンポーネントでも同じ。
  <LiteGrid key="lite" rows={rows} columns={columns} labelRow={{ isLabelRow: isMonth, getLabel: (row) => row.label }} />,
  // 型ガードでなければ従来どおり T(中で絞る)。
  <SpreadsheetGrid
    key="boolean"
    rows={rows}
    columns={columns}
    labelRow={{ isLabelRow: (row, index) => index === 0 || row.id === 'x', getLabel: (row) => (row.kind === 'label' ? row.label : '') }}
  />,
  <SpreadsheetGrid
    key="not-narrowed"
    rows={rows}
    columns={columns}
    // @ts-expect-error -- 型ガードでない isLabelRow では row は Row のまま(Sale に label は無い)。
    labelRow={{ isLabelRow: (row, index) => index === 0 || row.id === 'x', getLabel: (row) => row.label }}
  />,
  // 明示の型引数が 1 つなら従来どおり T。2 つ目でラベル行の型を書ける。
  <SpreadsheetGrid<Row>
    key="explicit"
    rows={rows}
    columns={columns}
    labelRow={{ isLabelRow: isMonth, getLabel: (row) => (row.kind === 'label' ? row.label : '') }}
  />,
  <SpreadsheetGrid<Row, Month> key="explicit-2" rows={rows} columns={columns} labelRow={{ isLabelRow: isMonth, getLabel: (row) => row.label }} />,
];

// 変数に置くときは LabelRowOptions<T, L>。
export const monthLabels: LabelRowOptions<Row, Month> = { isLabelRow: isMonth, getLabel: (row) => row.label };
// L を書かなければ従来どおり T。
export const plainLabels: LabelRowOptions<Row> = {
  isLabelRow: isMonth,
  getLabel: (row) => (row.kind === 'label' ? row.label : ''),
};

describe('isLabelRow の型ガード(DU-27)', () => {
  it('型の検査は tsc が行う', () => {
    expect(typeof typeCases).toBe('function');
  });
});
