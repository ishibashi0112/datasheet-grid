// 追加(選択範囲の集計): 下部バーの「平均 / データの個数 / 合計」と slotContext.selectionAggregates の結合テストです。
//   範囲選択 / 1 セル選択 / 文字だけの列 / showSelectionAggregates=false / 自前のバー / 編集での再計算 /
//   フィルターで隠れた行を数えないことを、実コンポーネント越しに固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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

// 集計の対象を解決した回数を数えます(出す先が無いときは計算しないことの確認。値はそのまま)。
vi.mock('@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates')>();
  return { ...actual, resolveSelectionAggregateTarget: vi.fn(actual.resolveSelectionAggregateTarget) };
});
import { resolveSelectionAggregateTarget } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionAggregates';

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
    const seen: (GridSelectionAggregates | null | undefined)[] = [];
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
    let latest: GridSelectionAggregates | null | undefined = null;
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

  it('出す先が無い(ボトムバー非表示・renderTopBar なし)ときは計算しない。renderTopBar があれば渡す', () => {
    const resolveTarget = vi.mocked(resolveSelectionAggregateTarget);
    const hidden = setup({ showBottomBar: false });
    resolveTarget.mockClear();
    act(() => {
      hidden.ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 3, col: 2 } });
    });
    expect(resolveTarget).not.toHaveBeenCalled();
    cleanup();

    let latest: GridSelectionAggregates | null | undefined = null;
    const custom = setup({
      showBottomBar: false,
      renderTopBar: (ctx) => {
        latest = ctx.selectionAggregates;
        return null;
      },
    });
    act(() => {
      custom.ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 3, col: 2 } });
    });
    expect(latest).toMatchObject({ status: 'ready', sum: 40.5 });
  });

  it('showBottomBarCounts=false でも右のグループに出る', () => {
    const { container, ref } = setup({ showBottomBarCounts: false });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 2 }, end: { row: 1, col: 2 } });
    });
    expect(aggregateTexts(container)).toEqual([`平均:${(1.75).toLocaleString()}`, 'データの個数:2', `合計:${(3.5).toLocaleString()}`]);
  });

  // 追加(見直し): columns をインライン(毎レンダー新しい配列)で渡しても、大きな選択の集計を最初からやり直さない。
  it('columns をインラインで渡す親が再描画しても、大きな選択の集計結果を出したまま(集計中に戻らない)', async () => {
    type BigRow = { id: number; a: number; b: number; c: number };
    const bigRows: BigRow[] = Array.from({ length: 20_000 }, (_, index) => ({ id: index, a: 1, b: 2, c: 3 }));
    function InlineColumnsHarness({ gridRef }: { gridRef: Ref<SpreadsheetGridHandle<BigRow>>; tick: number }) {
      return (
        <SpreadsheetGrid<BigRow>
          ref={gridRef}
          rows={bigRows}
          columns={[
            { key: 'a', title: 'A', width: 80 },
            { key: 'b', title: 'B', width: 80 },
            { key: 'c', title: 'C', width: 80 },
          ]}
          rowKeyGetter={(row) => row.id}
        />
      );
    }
    const ref = createRef<SpreadsheetGridHandle<BigRow>>();
    const { container, rerender } = render(<InlineColumnsHarness gridRef={ref} tick={0} />);
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: bigRows.length - 1, col: 2 } });
    });
    // 60,000 セル = 時間分割の経路。完了まで待つ。
    for (let i = 0; i < 400 && !aggregateTexts(container).some((text) => text?.startsWith('合計')); i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
      });
    }
    const sum = `合計:${(120_000).toLocaleString()}`;
    expect(aggregateTexts(container)).toContain(sum);
    rerender(<InlineColumnsHarness gridRef={ref} tick={1} />);
    expect(aggregateTexts(container)).toContain(sum);
  });
});