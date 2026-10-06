// 追加(G-3): GridBodyLayer を直接描画して、セルのメモ(GridColumn.cellNote)の表示を検証するユニットテストです
//   (validationMarks テストと同じく virtualRows / renderEntries を直接供給して可視セルの DOM を見る)。
//   ①メモを返したセルだけに .ssg-body-cell--has-note + data-ssg-tooltip(改行込み)が付く
//   ②入力エラーと同じセルでは「エラー → 改行 → メモ」の順につなぐ(showValidationMarks=false ならメモだけ)
//   ③cellNote は cellClassName の関数版と同じコンテキストを受け、cellClassName の関数版と 1 つを共有する
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GridBodyLayer } from './GridBodyLayer';
import type { PaneColumnEntry } from '@ishibashi0112/spreadsheet-grid-core/logic/geometry';
import type { CellStyleContext, GridColumn, RowModel } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { id: number; code: string; price: number };

const rows: Row[] = [
  { id: 1, code: 'A1234', price: 1200 },
  { id: 2, code: 'B2210', price: 0 },
  { id: 3, code: 'C0001', price: -5 },
];

// 恒等 RowModel(ソート / フィルターなし)。
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (viewIndex) => rows[viewIndex],
  getSourceIndex: (viewIndex) => viewIndex,
  getRowKey: (viewIndex) => rows[viewIndex].id,
};

const toRenderEntries = (columns: GridColumn<Row>[]): PaneColumnEntry<Row>[] => {
  let start = 0;
  return columns.map((column, logicalIndex) => {
    const entry: PaneColumnEntry<Row> = {
      column,
      logicalIndex,
      paneLocalStart: start,
      paneLocalSize: column.width,
      paneLocalEnd: start + column.width,
    };
    start += column.width;
    return entry;
  });
};

const layerElement = (columns: GridColumn<Row>[], props: { showValidationMarks?: boolean } = {}) => (
  <GridBodyLayer
    pane="center"
    ownsRowHeader={false}
    leadingWidth={0}
    rowModel={rowModel}
    virtualRows={rows.map((_, index) => ({ index, start: index * 32 }))}
    virtualRowIndexes={new Set(rows.map((_, index) => index))}
    renderEntries={toRenderEntries(columns)}
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
    onCellClick={() => {}}
    onCellDoubleClick={() => {}}
    renderCellContent={(row, _rowIndex, column) => (
      <span>{String((row as Record<string, unknown>)[column.key] ?? '')}</span>
    )}
    {...props}
  />
);

const cellOf = (container: HTMLElement, rowIndex: number, colKey: string): HTMLElement => {
  const rowEl = container.querySelectorAll('.ssg-body-row')[rowIndex];
  const cell = rowEl?.querySelector<HTMLElement>(`.ssg-body-cell[data-ssg-col-key="${colKey}"]`);
  if (!cell) {
    throw new Error(`セル (${rowIndex}, ${colKey}) が見つかりません`);
  }
  return cell;
};

describe('GridBodyLayer セルのメモ(cellNote・G-3)', () => {
  it('メモを返したセルだけに印のクラスとツールチップ(改行込み)が付く', () => {
    const columns: GridColumn<Row>[] = [
      {
        key: 'code',
        title: '品番',
        width: 120,
        cellNote: ({ row }) =>
          row.id === 1 ? '今回の取込で追加された構成です。\n他 2 箇所でも使用' : row.id === 2 ? '' : undefined,
      },
      { key: 'price', title: '単価', width: 100 },
    ];
    const { container } = render(layerElement(columns));

    const noted = container.querySelectorAll('.ssg-body-cell--has-note');
    expect(noted).toHaveLength(1);
    expect(cellOf(container, 0, 'code').classList.contains('ssg-body-cell--has-note')).toBe(true);
    expect(cellOf(container, 0, 'code').getAttribute('data-ssg-tooltip')).toBe(
      '今回の取込で追加された構成です。\n他 2 箇所でも使用',
    );
    // '' / undefined は「メモなし」。
    expect(cellOf(container, 1, 'code').hasAttribute('data-ssg-tooltip')).toBe(false);
    expect(cellOf(container, 2, 'code').hasAttribute('data-ssg-tooltip')).toBe(false);
    // 未指定列には何も付かない。
    expect(cellOf(container, 0, 'price').classList.contains('ssg-body-cell--has-note')).toBe(false);
  });

  it('入力エラーと同じセルでは「エラー → 改行 → メモ」。showValidationMarks=false ならメモだけ', () => {
    const columns: GridColumn<Row>[] = [
      { key: 'code', title: '品番', width: 120 },
      {
        key: 'price',
        title: '単価',
        width: 100,
        validate: ({ value }) => (typeof value === 'number' && value >= 0) || '0 以上で入力してください',
        cellNote: ({ value }) => (value === 0 || value === -5 ? '販売単価が 0 円以下で登録されています。' : null),
      },
    ];
    const { container, rerender } = render(layerElement(columns));

    // エラーなし + メモ。
    const zero = cellOf(container, 1, 'price');
    expect(zero.className).toContain('ssg-body-cell--has-note');
    expect(zero.className).not.toContain('ssg-body-cell--invalid');
    expect(zero.getAttribute('data-ssg-tooltip')).toBe('販売単価が 0 円以下で登録されています。');
    // エラー + メモ(二重三角 = 両方のクラス)。
    const negative = cellOf(container, 2, 'price');
    expect(negative.className).toContain('ssg-body-cell--has-note');
    expect(negative.className).toContain('ssg-body-cell--invalid');
    expect(negative.getAttribute('data-ssg-tooltip')).toBe(
      '0 以上で入力してください\n販売単価が 0 円以下で登録されています。',
    );

    rerender(layerElement(columns, { showValidationMarks: false }));
    const negativeHidden = cellOf(container, 2, 'price');
    expect(negativeHidden.className).not.toContain('ssg-body-cell--invalid');
    expect(negativeHidden.getAttribute('data-ssg-tooltip')).toBe('販売単価が 0 円以下で登録されています。');
  });

  it('cellNote は cellClassName の関数版と同じコンテキストを受ける(1 回だけ組み立てて共有)', () => {
    const contexts: CellStyleContext<Row>[] = [];
    const classContexts: CellStyleContext<Row>[] = [];
    const cellNote = vi.fn((ctx: CellStyleContext<Row>) => {
      contexts.push(ctx);
      return ctx.rowIndex === 0 ? 'メモ' : null;
    });
    const columns: GridColumn<Row>[] = [
      {
        key: 'price',
        title: '単価',
        width: 100,
        cellNote,
        cellClassName: (ctx) => {
          classContexts.push(ctx);
          return undefined;
        },
      },
    ];
    render(layerElement(columns));

    expect(cellNote).toHaveBeenCalledTimes(3);
    expect(contexts[0]).toMatchObject({
      row: rows[0],
      rowIndex: 0,
      sourceRowIndex: 0,
      rowKey: 1,
      colIndex: 0,
      value: 1200,
      isActive: false,
      isSelected: false,
      isEditing: false,
      readOnly: false,
    });
    expect(contexts[0]?.column).toBe(columns[0]);
    // 同じセルでは cellClassName と同一のオブジェクトを受け取る。
    expect(classContexts[0]).toBe(contexts[0]);
  });
});