// GridBodyLayer を直接描画して invalid マーク表示の制御(showValidationMarks)を検証する
//   ユニットテストです。SpreadsheetGrid 経由の結合では jsdom で仮想化行が描画されない
//   (ビューポート高さ 0 で可視窓が空になる)ため、virtualRows / renderEntries を直接供給して
//   可視セルの DOM(ssg-body-cell--invalid クラス / data-ssg-tooltip 属性)を検証します。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { GridBodyLayer } from './GridBodyLayer';
import type { PaneColumnEntry } from '../logic/geometry';
import type { GridColumn, RowModel } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { id: number; qty: unknown };

// 2 行目の qty が検証 NG(number 以外)になるデータです。
const rows: Row[] = [
  { id: 1, qty: 10 },
  { id: 2, qty: 'abc' },
];

const qtyValidate = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? true : '数値を入力してください';

const makeColumns = (
  validate: GridColumn<Row>['validate'],
): GridColumn<Row>[] => [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'qty', title: 'Qty', width: 100, validate },
];

// clientSide 相当の恒等 RowModel です(ソート / フィルターなし = view 順が source 順)。
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (viewIndex) => rows[viewIndex],
  getSourceIndex: (viewIndex) => viewIndex,
  getRowKey: (viewIndex) => rows[viewIndex].id,
};

// 列定義からペインローカル座標のエントリを組み立てます(単一ペイン前提の直列配置)。
const toRenderEntries = (
  columns: GridColumn<Row>[],
): PaneColumnEntry<Row>[] => {
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

// showValidationMarks 以外を固定した GridBodyLayer 要素を生成します(rerender 用に JSX を返す)。
const layerElement = (
  columns: GridColumn<Row>[],
  props: { showValidationMarks?: boolean } = {},
) => (
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
    onCellDoubleClick={() => {}}
    renderCellContent={(row, _rowIndex, column) => (
      <span>{String((row as Record<string, unknown>)[column.key] ?? '')}</span>
    )}
    {...props}
  />
);

describe('GridBodyLayer invalid マーク表示制御(showValidationMarks)', () => {
  it('既定(未指定)では invalid セルにマーク(クラス + ツールチップ)が付く', () => {
    const { container } = render(layerElement(makeColumns(qtyValidate)));

    const invalidCells = container.querySelectorAll('.ssg-body-cell--invalid');
    expect(invalidCells).toHaveLength(1);
    expect(invalidCells[0].getAttribute('data-ssg-tooltip')).toBe(
      '数値を入力してください',
    );
  });

  it('showValidationMarks=true(明示)でも既定と同じマークが付く', () => {
    const { container } = render(
      layerElement(makeColumns(qtyValidate), { showValidationMarks: true }),
    );

    expect(container.querySelectorAll('.ssg-body-cell--invalid')).toHaveLength(
      1,
    );
  });

  it('showValidationMarks=false ではマークが付かず、validate 評価もスキップされる', () => {
    const validateSpy = vi.fn(qtyValidate);
    const { container } = render(
      layerElement(makeColumns(validateSpy), { showValidationMarks: false }),
    );

    // マーク(クラス / ツールチップ)は 1 つも付かない。
    expect(container.querySelectorAll('.ssg-body-cell--invalid')).toHaveLength(
      0,
    );
    expect(container.querySelectorAll('[data-ssg-tooltip]')).toHaveLength(0);
    // セル自体(2 列 × 2 行)は通常どおり描画されている。
    expect(container.querySelectorAll('.ssg-body-cell')).toHaveLength(4);
    // 非表示中は可視セルの validate を評価しない(評価スキップの最適化)。
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it('showValidationMarks を false→true へ切り替えるとマークが宣言的に現れる', () => {
    const columns = makeColumns(qtyValidate);
    const { container, rerender } = render(
      layerElement(columns, { showValidationMarks: false }),
    );
    expect(container.querySelectorAll('.ssg-body-cell--invalid')).toHaveLength(
      0,
    );

    rerender(layerElement(columns, { showValidationMarks: true }));
    expect(container.querySelectorAll('.ssg-body-cell--invalid')).toHaveLength(
      1,
    );

    // true→false へ戻すと消える(送信成功後にマークを消す UX 相当)。
    rerender(layerElement(columns, { showValidationMarks: false }));
    expect(container.querySelectorAll('.ssg-body-cell--invalid')).toHaveLength(
      0,
    );
  });
});