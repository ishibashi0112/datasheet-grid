// 追加(選択範囲の集計): 下部バーの「平均 / データの個数 / 合計」と slotContext.selectionAggregates の結合テストです。
//   範囲選択 / 1 セル選択 / 文字だけの列 / showSelectionAggregates=false / 自前のバー / 編集での再計算 /
//   フィルターで隠れた行を数えないことを、実コンポーネント越しに固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  GridSelectionAggregates,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from './model/gridTypes';

type Row = { id: number; name: string; qty: number | string; price: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'qty', title: 'Qty', width: 80 },
  { key: 'price', title: 'Price', width: 80 },
];
const initialRows: Row[] = [
  { id: 1, name: 'alpha', qty: 10, price: 1.5 },
  { id: 2, name: 'beta', qty: '20', price: 2 },
  { id: 3, name: 'gamma', qty: '', price: 3 },
  { id: 4, name: 'delta', qty: 'n/a', price: 4 },
];

function Harness(props: Partial<SpreadsheetGridProps<Row>> & { gridRef: Ref<SpreadsheetGridHandle<Row>> }) {
  const { gridRef, ...rest } = props;
  const [rows, setRows] = useState(initialRows);
  return (
    <SpreadsheetGrid<Row>
      ref={gridRef}
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      {...rest}
    />
  );
}

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(<Harness gridRef={ref} {...props} />);
  return { ...view, ref };
};

const aggregateTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')).map((chip) => chip.textContent);

describe('選択範囲の集計(下部バー)', () => {
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

  it('2 セル以上の範囲で「平均 / データの個数 / 合計」を出す(数値の文字列は数え、空と文字は数えない)', () => {
    const { container, ref } = setup();
    expect(container.querySelector('.ssg-bar-aggregates')).toBeNull();
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 3, col: 1 } });
    });
    // Qty: 10 / '20' / '' / 'n/a' → 個数 3(空を除く)・数値 2 つ・合計 30・平均 15。
    expect(aggregateTexts(container)).toEqual(['平均:15', 'データの個数:3', '合計:30']);
  });

  it('1 セルだけの選択では出さない', () => {
    const { container, ref } = setup();
    act(() => {
      ref.current?.selectCell(0, 1);
    });
    expect(container.querySelector('.ssg-bar-aggregates')).toBeNull();
  });

  it('文字だけの範囲は「データの個数」だけ', () => {
    const { container, ref } = setup();
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 2, col: 0 } });
    });
    expect(aggregateTexts(container)).toEqual(['データの個数:3']);
  });

  it('複数列の範囲・小数も集計する', () => {
    const { container, ref } = setup();
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 1, col: 2 } });
    });
    // 10 + 20 + 1.5 + 2 = 33.5 / 4 = 8.375
    expect(aggregateTexts(container)).toEqual([
      `平均:${(8.375).toLocaleString()}`,
      'データの個数:4',
      `合計:${(33.5).toLocaleString()}`,
    ]);
  });

  it('編集で値が変わると再計算する', () => {
    const { container, ref } = setup();
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 2 }, end: { row: 3, col: 2 } });
    });
    expect(aggregateTexts(container)).toContain(`合計:${(10.5).toLocaleString()}`);
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    // 先頭セルへ貼り付け(範囲の左上から)。
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 2 }, end: { row: 0, col: 2 } });
    });
    fireEvent.paste(shell, { clipboardData: { getData: () => '100' } });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 2 }, end: { row: 3, col: 2 } });
    });
    expect(aggregateTexts(container)).toContain('合計:109');
  });

  it('フィルターで隠れた行は数えない(表示中の行だけ)', () => {
    const { container, ref } = setup();
    // 'mm' を含むのは gamma だけ(ビュー 0 行目)。
    act(() => {
      ref.current?.applyState({
        version: 2,
        columnWidths: {},
        filters: { globalText: 'mm', columnFilters: {} },
        sort: [],
      });
    });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 0, col: 2 } });
    });
    // gamma: Qty '' / Price 3 → 個数 1、合計 3。
    expect(aggregateTexts(container)).toEqual(['平均:3', 'データの個数:1', '合計:3']);
  });

  it('showSelectionAggregates=false では出さず、slotContext.selectionAggregates も null', () => {
    const seen: (GridSelectionAggregates | null)[] = [];
    const { container, ref } = setup({
      showSelectionAggregates: false,
      renderBottomBar: (ctx) => {
        seen.push(ctx.selectionAggregates);
        return <div data-testid="bar" />;
      },
    });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 3, col: 2 } });
    });
    expect(container.querySelector('.ssg-bar-aggregates')).toBeNull();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value === null)).toBe(true);
  });

  it('自前のバー(renderBottomBar)へ集計値が渡る', () => {
    let latest: GridSelectionAggregates | null = null;
    const { ref } = setup({
      renderBottomBar: (ctx) => {
        latest = ctx.selectionAggregates;
        return null;
      },
    });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 3, col: 2 } });
    });
    expect(latest).toMatchObject({
      status: 'ready',
      cellCount: 8,
      count: 7,
      numericCount: 6,
      sum: 40.5,
      min: 1.5,
      max: 20,
      partial: false,
    });
  });

  it('showBottomBarCounts=false でも右のグループに出る', () => {
    const { container, ref } = setup({ showBottomBarCounts: false });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 2 }, end: { row: 1, col: 2 } });
    });
    expect(aggregateTexts(container)).toEqual([`平均:${(1.75).toLocaleString()}`, 'データの個数:2', `合計:${(3.5).toLocaleString()}`]);
  });
});