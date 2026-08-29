// GridBodyLayer を直接描画して、getRowClassName の第 3 引数(RowStyleContext)を検証する
//   ユニットテストです(proposals ⑤)。cellStyleContext テストと同じく、rowModel はビュー順が
//   source の逆順(order = [1, 0] 相当)で構成し、ソート適用時でも source 行基準の突き合わせが
//   できること + チェックボックス行選択状態(isSelected)が渡ることを確認します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GridBodyLayer } from './GridBodyLayer';
import type { PaneColumnEntry } from '../logic/geometry';
import type {
  GridColumn,
  RowModel,
  RowStyleContext,
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

const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 160 }];

const renderEntries: PaneColumnEntry<Row>[] = [
  {
    column: columns[0],
    logicalIndex: 0,
    paneLocalStart: 0,
    paneLocalSize: 160,
    paneLocalEnd: 160,
  },
];

function renderLayer(props: {
  getRowClassName: (
    row: Row,
    rowIndex: number,
    ctx: RowStyleContext<Row>,
  ) => string | undefined;
  rowSelectionKeys?: Set<string | number>;
}) {
  return render(
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
      enableRowSelection={props.rowSelectionKeys != null}
      rowSelectionState={{
        mode: 'include',
        keys: props.rowSelectionKeys ?? new Set(),
      }}
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
      getRowClassName={props.getRowClassName}
    />,
  );
}

describe('GridBodyLayer RowStyleContext(getRowClassName 第 3 引数)', () => {
  it('ソートでビュー順が変わっても ctx へ source 行 index と rowKey が渡る', () => {
    const captured: RowStyleContext<Row>[] = [];
    const { container } = renderLayer({
      getRowClassName: (_row, _rowIndex, ctx) => {
        captured.push(ctx);
        // source 行 index 基準のクラス付与(利用側の「エラー行 index 集合」突き合わせ相当)。
        return `row-src-${ctx.sourceRowIndex}`;
      },
    });

    // ビュー行 0 = source 1(row-b)/ ビュー行 1 = source 0(row-a)。
    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({
      rowIndex: 0,
      sourceRowIndex: 1,
      rowKey: 'row-b',
      isSelected: false,
    });
    expect(captured[0].row).toBe(rows[1]);
    expect(captured[1]).toMatchObject({
      rowIndex: 1,
      sourceRowIndex: 0,
      rowKey: 'row-a',
      isSelected: false,
    });

    // 行コンテナ + データセルの両方へ返り値クラスが付く(既存仕様の維持)。
    const rowEls = container.querySelectorAll('.ssg-body-row');
    expect(rowEls).toHaveLength(2);
    expect(rowEls[0].className).toContain('row-src-1');
    const cells = container.querySelectorAll('.ssg-body-cell');
    expect(cells[0].className).toContain('row-src-1');
  });

  it('チェックボックス行選択の状態が ctx.isSelected に渡る', () => {
    const selectedByKey = new Map<string | number, boolean>();
    renderLayer({
      rowSelectionKeys: new Set(['row-b']),
      getRowClassName: (_row, _rowIndex, ctx) => {
        selectedByKey.set(ctx.rowKey, ctx.isSelected);
        return undefined;
      },
    });

    expect(selectedByKey.get('row-b')).toBe(true);
    expect(selectedByKey.get('row-a')).toBe(false);
  });

  it('従来の 2 引数関数もそのまま動く(後方互換)', () => {
    const seen: Array<[string, number]> = [];
    const { container } = renderLayer({
      getRowClassName: (row, rowIndex) => {
        seen.push([row.id, rowIndex]);
        return `legacy-${row.id}`;
      },
    });

    expect(seen).toEqual([
      ['row-b', 0],
      ['row-a', 1],
    ]);
    expect(
      container.querySelectorAll('.ssg-body-row')[0].className,
    ).toContain('legacy-row-b');
  });
});