// GridBodyLayer を直接描画して、cellClassName 関数へ渡る CellStyleContext の
//   sourceRowIndex / rowKey(context 拡張)を検証するユニットテストです。
//   目的は「ソート / フィルター適用時(view 順 ≠ source 順)でも source 行基準の突き合わせが
//   できること」なので、rowModel はビュー順が source の逆順(order = [1, 0] 相当)で構成します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GridBodyLayer } from './GridBodyLayer';
import type { PaneColumnEntry } from '../logic/geometry';
import type {
  CellStyleContext,
  GridColumn,
  RowModel,
} from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { id: string; name: string };

const rows: Row[] = [
  { id: 'row-a', name: 'alpha' },
  { id: 'row-b', name: 'beta' },
];

// ビュー順 = source の逆順(降順ソート相当)。view 0 → source 1 / view 1 → source 0。
const order = [1, 0] as const;

const rowModel: RowModel<Row> = {
  getRowCount: () => order.length,
  getRow: (viewIndex) => rows[order[viewIndex]],
  getSourceIndex: (viewIndex) => order[viewIndex],
  getRowKey: (viewIndex) => rows[order[viewIndex]].id,
};

describe('GridBodyLayer CellStyleContext(sourceRowIndex / rowKey)', () => {
  it('ソートでビュー順が変わっても cellClassName へ source 行 index と rowKey が渡る', () => {
    const captured: CellStyleContext<Row>[] = [];
    const columns: GridColumn<Row>[] = [
      {
        key: 'name',
        title: 'Name',
        width: 160,
        cellClassName: (ctx) => {
          captured.push(ctx);
          // source 行 index 基準のクラス付与(利用側の「エラー行 index 集合」突き合わせ相当)。
          return `err-src-${ctx.sourceRowIndex}`;
        },
      },
    ];
    const renderEntries: PaneColumnEntry<Row>[] = [
      {
        column: columns[0],
        logicalIndex: 0,
        paneLocalStart: 0,
        paneLocalSize: 160,
        paneLocalEnd: 160,
      },
    ];

    const { container } = render(
      <GridBodyLayer
        pane="center"
        ownsRowHeader={false}
        leadingWidth={0}
        rowModel={rowModel}
        virtualRows={order.map((_, index) => ({ index, start: index * 32 }))}
        virtualRowIndexes={new Set(order.map((_, index) => index))}
        renderEntries={renderEntries}
        rowHeight={32}
        rowHeaderCellStyle={{}}
        hoveredRowIndex={null}
        isWholeGridSelected={false}
        enableRowSelection={false}
        rowSelectionState={{ mode: 'include', keys: new Set() }}
        activeCell={null}
        editingCell={null}
        selectionSnapshot={{ kind: 'none' }}
        readOnly={false}
        canEditCell={undefined}
        onRowHeaderPointerDown={() => {}}
        onRowHeaderPointerEnter={() => {}}
        onRowHeaderPointerLeave={() => {}}
        onCellPointerDown={() => {}}
        onCellPointerEnter={() => {}}
        onCellDoubleClick={() => {}}
        renderCellContent={(row) => <span>{row.name}</span>}
      />,
    );

    // ビュー行 0 = source 1(row-b)/ ビュー行 1 = source 0(row-a)。
    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({
      rowIndex: 0,
      sourceRowIndex: 1,
      rowKey: 'row-b',
    });
    expect(captured[0].row).toBe(rows[1]);
    expect(captured[1]).toMatchObject({
      rowIndex: 1,
      sourceRowIndex: 0,
      rowKey: 'row-a',
    });
    expect(captured[1].row).toBe(rows[0]);

    // DOM 側も source 基準のクラスが正しいセルに付いている(beta = source 1 が先頭行)。
    const cells = container.querySelectorAll('.ssg-body-cell');
    expect(cells).toHaveLength(2);
    expect(cells[0].className).toContain('err-src-1');
    expect(cells[0].textContent).toBe('beta');
    expect(cells[1].className).toContain('err-src-0');
    expect(cells[1].textContent).toBe('alpha');
  });
});