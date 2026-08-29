// 追加(proposals ③): testing サブパスの installJsdomLayoutStubs で、素の jsdom では
//   描画されない実グリッドの本体行 / 列が描画されることを検証する結合テストです。
//   (縦: clientHeight / clientWidth、横: observe 時に即時発火する ResizeObserver の両方が
//   揃って初めて行・列が出ます。詳細は testing/index.ts の背景コメント参照。)
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 5 },
  { id: 2, name: 'beta', qty: 12 },
  { id: 3, name: 'gamma', qty: 30 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

describe('installJsdomLayoutStubs(testing サブパス)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  it('実グリッドの本体行と全列のセルが jsdom で描画される', () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} />,
    );

    const rowEls = container.querySelectorAll('.ssg-body-row');
    expect(rowEls).toHaveLength(rows.length);
    // 全列が描画される(no-op ResizeObserver だと列が 1 本も出ない)。
    const firstRowCells = rowEls[0].querySelectorAll('.ssg-body-cell');
    expect(firstRowCells).toHaveLength(columns.length);
    expect(firstRowCells[0].textContent).toBe('alpha');
    expect(firstRowCells[1].textContent).toBe('5');
  });

  it('getRowClassName / cellClassName のクラスが DOM で検証できる', () => {
    const styledColumns: GridColumn<Row>[] = [
      {
        ...columns[0],
        cellClassName: (ctx) => (ctx.row.qty >= 10 ? 'my-large-qty' : undefined),
      },
      columns[1],
    ];
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={styledColumns}
        getRowClassName={(row) => (row.id === 2 ? 'my-row-2' : undefined)}
      />,
    );

    const markedRows = container.querySelectorAll('.ssg-body-row.my-row-2');
    expect(markedRows).toHaveLength(1);
    expect(
      container.querySelectorAll('.ssg-body-cell.my-large-qty'),
    ).toHaveLength(2);
  });
});