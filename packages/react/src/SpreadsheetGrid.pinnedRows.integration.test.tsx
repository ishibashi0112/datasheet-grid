// 追加(1.1.0 / 固定行): 表の上下に固定する行(pinnedTopRows / pinnedBottomRows)の結合テストです。
//   既定では何も変わらないこと、描画(値の書式 / renderCell の ctx.pinned / 行見出しのピンと読み上げ)、ARIA の行の番号、
//   表示専用(押しても選択が動かない・ホバーを外す)、配置(sticky の器・本体の行は固定行の下から・行を見せる位置)、
//   固定列の 3 ペイン、合計行との並び、エクスポート(includePinnedRows)を実コンポーネント越しに固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { Ref } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import { localeTextEn } from './locales/en';
import type { CellRenderContext, GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: string; name: string; qty: number; done: boolean };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'qty', title: 'Qty', width: 80, aggFunc: 'sum', align: 'right', valueFormatter: ({ value }) => `${String(value)} 個` },
  { key: 'done', title: 'Done', width: 60, editor: { type: 'checkbox' } },
];
const initialRows: Row[] = [
  { id: 'a', name: 'alpha', qty: 10, done: false },
  { id: 'b', name: 'beta', qty: 20, done: true },
  { id: 'c', name: 'gamma', qty: 30, done: false },
];
const top: Row[] = [{ id: 'target', name: '目標', qty: 100, done: true }];
const bottom: Row[] = [
  { id: 'last-year', name: '前年', qty: 50, done: false },
  { id: 'avg', name: '平均', qty: 20, done: false },
];

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 40;

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
      rowHeight={ROW_HEIGHT}
      headerHeight={HEADER_HEIGHT}
      {...rest}
    />
  );
}

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(<Harness gridRef={ref} {...props} />);
  const grid = view.container.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error('grid がありません');
  return { ...view, ref, grid };
};

const pinnedRowsIn = (container: HTMLElement, position: 'top' | 'bottom', pane = 'center') =>
  Array.from(container.querySelectorAll<HTMLElement>(`.ssg-pinned-row[data-ssg-pinned="${position}"][data-pane="${pane}"]`));
const cellText = (row: HTMLElement | undefined, key: string) =>
  row?.querySelector(`.ssg-pinned-cell[data-ssg-col-key="${key}"]`)?.textContent ?? null;

describe('固定行(pinnedTopRows / pinnedBottomRows)', () => {
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

  it('既定(未指定 / 空の配列)では何も描かず、高さ・ARIA の行数は従来どおり', () => {
    const plain = setup();
    const empty = setup({ pinnedTopRows: [], pinnedBottomRows: [] });
    for (const { container, grid } of [plain, empty]) {
      expect(container.querySelector('.ssg-pinned-rows, .ssg-pinned-row')).toBeNull();
      expect(grid.getAttribute('aria-rowcount')).toBe('4');
    }
    const height = (container: HTMLElement) => container.querySelector<HTMLElement>('.ssg-inner-row')?.style.height;
    expect(height(empty.container)).toBe(height(plain.container));
    const withPinned = setup({ pinnedTopRows: top, pinnedBottomRows: bottom });
    // 固定行の高さ(3 行 × rowHeight)だけ伸びる。
    expect(parseFloat(height(withPinned.container) ?? '0') - parseFloat(height(plain.container) ?? '0')).toBe(3 * ROW_HEIGHT);
  });

  it('上下の固定行を列の書式で描き、行見出しはピンの印と「上に固定 1」の読み上げ', () => {
    const { container } = setup({ pinnedTopRows: top, pinnedBottomRows: bottom });
    // 行見出しは左のペイン(行番号の列はいつも左に固定)、セルは中央のペイン。
    const topRows = pinnedRowsIn(container, 'top');
    const bottomRows = pinnedRowsIn(container, 'bottom');
    const topHeaders = pinnedRowsIn(container, 'top', 'left');
    const bottomHeaders = pinnedRowsIn(container, 'bottom', 'left');
    expect(topRows).toHaveLength(1);
    expect(bottomRows).toHaveLength(2);
    expect(cellText(topRows[0], 'name')).toBe('目標');
    expect(cellText(topRows[0], 'qty')).toBe('100 個');
    expect(cellText(bottomRows[1], 'name')).toBe('平均');
    // 右寄せの列は本体と同じ寄せ。checkbox 列は読み取りだけの印。
    expect(topRows[0]?.querySelector('[data-ssg-col-key="qty"]')?.classList.contains('ssg-body-cell--align-right')).toBe(true);
    const checkbox = topRows[0]?.querySelector('[data-ssg-col-key="done"] [role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    // 行見出し: ピンの印(svg)と読み上げの名前。
    const header = topHeaders[0]?.querySelector<HTMLElement>('[role="rowheader"]');
    expect(header?.querySelector('svg.ssg-pinned-row-icon')).not.toBeNull();
    expect(header?.getAttribute('aria-label')).toBe('上に固定 1');
    expect(bottomHeaders[1]?.querySelector('[role="rowheader"]')?.getAttribute('aria-label')).toBe('下に固定 2');
    // 本体の行ではない(行の DOM を探す処理 / 右クリックメニューの対象にしない)。
    for (const row of [...topRows, ...bottomRows, ...topHeaders, ...bottomHeaders]) {
      expect(row.classList.contains('ssg-body-row')).toBe(false);
      expect(row.closest('[data-row-index]')).toBeNull();
      expect(row.querySelector('[data-row-index], [data-row-key]')).toBeNull();
    }
  });

  it('ARIA: 見出し → 上の固定行 → 本体の行 → 下の固定行 → 合計行の順に番号を振る', () => {
    const { container, grid } = setup({ pinnedTopRows: top, pinnedBottomRows: bottom, totalRow: true });
    // 見出し 1 + 上 1 + 本体 3 + 下 2 + 合計 1。
    expect(grid.getAttribute('aria-rowcount')).toBe('8');
    expect(pinnedRowsIn(container, 'top')[0]?.getAttribute('aria-rowindex')).toBe('2');
    const bodyRows = Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row[data-pane="center"]'));
    expect(bodyRows.map((row) => row.getAttribute('aria-rowindex'))).toEqual(['3', '4', '5']);
    expect(pinnedRowsIn(container, 'bottom').map((row) => row.getAttribute('aria-rowindex'))).toEqual(['6', '7']);
    expect(container.querySelector('.ssg-total-row[data-pane="center"]')?.getAttribute('aria-rowindex')).toBe('8');
    const cell = pinnedRowsIn(container, 'top')[0]?.querySelector('[data-ssg-col-key="qty"]');
    expect(cell?.getAttribute('role')).toBe('gridcell');
    expect(cell?.getAttribute('aria-colindex')).toBe('3');
    expect(cell?.getAttribute('aria-readonly')).toBe('true');
  });

  it('renderCell / cellClassName / getRowClassName は ctx.pinned で見分けられる(読み取りだけ)', () => {
    const contexts: CellRenderContext<Row>[] = [];
    const rowPinned: Array<string | undefined> = [];
    const withCtx: GridColumn<Row>[] = [
      { ...columns[0], renderCell: (ctx) => {
        contexts.push(ctx);
        return <b>{ctx.pinned ? `[${ctx.pinned}] ${String(ctx.value)}` : String(ctx.value)}</b>;
      } },
      { ...columns[1], cellClassName: (ctx) => (ctx.pinned === 'bottom' ? 'is-bottom' : undefined) },
      columns[2],
    ];
    const { container } = setup({
      columns: withCtx,
      pinnedTopRows: top,
      pinnedBottomRows: bottom,
      getRowClassName: (_row, _index, ctx) => {
        rowPinned.push(ctx.pinned);
        return ctx.pinned ? 'pinned-row' : undefined;
      },
    });
    expect(cellText(pinnedRowsIn(container, 'top')[0], 'name')).toBe('[top] 目標');
    const pinnedCtx = contexts.find((ctx) => ctx.pinned === 'top');
    expect(pinnedCtx).toMatchObject({ rowIndex: 0, rowKey: 'target', readOnly: true, isActive: false, isSelected: false });
    // setValue は何もしない(固定行は書き込まない)。
    pinnedCtx?.setValue('x');
    expect(cellText(pinnedRowsIn(container, 'top')[0], 'name')).toBe('[top] 目標');
    expect(contexts.some((ctx) => ctx.pinned === undefined && ctx.value === 'alpha')).toBe(true);
    expect(pinnedRowsIn(container, 'bottom')[0]?.querySelector('[data-ssg-col-key="qty"]')?.classList.contains('is-bottom')).toBe(true);
    expect(pinnedRowsIn(container, 'top')[0]?.classList.contains('pinned-row')).toBe(true);
    // 追加(1.1.0 / 固定行の見直し): 行見出しにも getRowClassName の class(本体の行と同じ)。
    expect(pinnedRowsIn(container, 'top', 'left')[0]?.querySelector('[role="rowheader"]')?.classList.contains('pinned-row')).toBe(true);
    expect(rowPinned).toContain('top');
    expect(rowPinned).toContain('bottom');
    expect(rowPinned).toContain(undefined);
  });

  it('表示専用: 固定行のセルを押しても選択 / アクティブセルは変わらず、編集も始まらない', () => {
    const { container, ref } = setup({ pinnedTopRows: top, pinnedBottomRows: bottom });
    act(() => {
      ref.current?.selectCell(1, 1);
    });
    const before = ref.current?.getSelection();
    for (const position of ['top', 'bottom'] as const) {
      const cell = pinnedRowsIn(container, position)[0]?.querySelector<HTMLElement>('[data-ssg-col-key="qty"]');
      if (!cell) throw new Error('固定行のセルがありません');
      act(() => {
        fireEvent.pointerDown(cell, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
        fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
        fireEvent.click(cell);
        fireEvent.doubleClick(cell);
      });
    }
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 1 });
    expect(ref.current?.getSelection()).toEqual(before);
    expect(container.querySelector('.ssg-cell-editor, [data-ssg-editor]')).toBeNull();
  });

  it('本体の行から固定行へポインタが移ると行ホバーを外す', () => {
    const hovered: Array<number | null> = [];
    const { container } = setup({ pinnedBottomRows: bottom, onHoveredRowChange: (index) => hovered.push(index) });
    const bodyCell = container.querySelector<HTMLElement>(
      '.ssg-body-row[data-row-index="2"] .ssg-body-cell[data-ssg-col-key="qty"]',
    );
    const pinnedBlock = container.querySelector<HTMLElement>('.ssg-pinned-rows--bottom');
    if (!bodyCell || !pinnedBlock) throw new Error('セル / 固定行がありません');
    act(() => {
      fireEvent.pointerEnter(bodyCell, { pointerId: 1 });
    });
    act(() => {
      fireEvent.pointerEnter(pinnedBlock, { pointerId: 1 });
    });
    expect(hovered).toEqual([2, null]);
  });

  it('配置: 上の器は列見出しの直下、下の器は合計行の上に留まり、本体の行は上の固定行の下から始まる', () => {
    const { container } = setup({ pinnedTopRows: top, pinnedBottomRows: bottom, totalRow: { height: 34 } });
    const topBlock = container.querySelector<HTMLElement>('.ssg-pinned-rows--top');
    const bottomBlock = container.querySelector<HTMLElement>('.ssg-pinned-rows--bottom');
    expect(topBlock?.style.top).toBe(`${HEADER_HEIGHT}px`);
    expect(topBlock?.style.height).toBe(`${ROW_HEIGHT}px`);
    expect(bottomBlock?.style.bottom).toBe('34px');
    expect(bottomBlock?.style.height).toBe(`${2 * ROW_HEIGHT}px`);
    // 列見出しの行の高さは変わらない(固定行のぶんは器が持つ)。
    const headerRow = container.querySelector<HTMLElement>('.ssg-header-row');
    expect(headerRow?.style.height).toBe(`${HEADER_HEIGHT}px`);
    // 本体の先頭の行は 列見出し + 上の固定行 の下。
    const firstBody = container.querySelector<HTMLElement>('.ssg-body-row[data-pane="center"][data-row-index="0"]');
    expect(firstBody?.style.transform).toBe(`translateY(${HEADER_HEIGHT + ROW_HEIGHT}px)`);
    // DOM の順: 列見出し → 上の器 → … → 下の器 → (高さ 0 の空き)→ 合計行(どちらも sticky。合計行は下の器の後ろ)。
    const pane = container.querySelector<HTMLElement>('.ssg-total-row[data-pane="center"]')?.parentElement;
    const order = Array.from(pane?.children ?? []).map((child) => child.className);
    const topIndex = order.findIndex((name) => name.includes('ssg-pinned-rows--top'));
    const bottomIndex = order.findIndex((name) => name.includes('ssg-pinned-rows--bottom'));
    const totalIndex = order.findIndex((name) => name.includes('ssg-total-row'));
    expect(topIndex).toBeGreaterThan(-1);
    expect(bottomIndex).toBeGreaterThan(topIndex);
    expect(totalIndex).toBe(bottomIndex + 2);
    expect((pane?.children[bottomIndex + 1] as HTMLElement | undefined)?.style.height).toBe('0px');
  });

  it('固定列があっても 3 ペインに描き、列はそれぞれのペインに出る', () => {
    const pinnedColumns: GridColumn<Row>[] = [{ ...columns[0], pinned: 'left' }, columns[1], { ...columns[2], pinned: 'right' }];
    const { container, grid } = setup({ columns: pinnedColumns, pinnedTopRows: top });
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.ssg-pinned-row[data-ssg-pinned="top"]'));
    expect(rows.map((row) => row.getAttribute('data-pane'))).toEqual(['left', 'center', 'right']);
    expect(rows.every((row) => row.getAttribute('aria-rowindex') === '2')).toBe(true);
    expect(cellText(rows[0], 'name')).toBe('目標');
    expect(rows[0]?.querySelector('[role="rowheader"]')).not.toBeNull();
    expect(cellText(rows[1], 'qty')).toBe('100 個');
    expect(rows[1]?.querySelector('[role="rowheader"]')).toBeNull();
    expect(rows[2]?.querySelector('[data-ssg-col-key="done"]')).not.toBeNull();
    // 見えている行はすべてセルを持つ(ARIA の構造)。
    for (const rowEl of Array.from(grid.querySelectorAll('[role="row"]'))) {
      if (rowEl.closest('[aria-hidden="true"]')) continue;
      expect(rowEl.querySelector('[role="gridcell"], [role="rowheader"], [role="columnheader"]')).not.toBeNull();
    }
  });

  it('行を見せる位置(scrollToRow の end)は固定行のぶんだけ下がる', () => {
    const scrollTops = (props: Partial<SpreadsheetGridProps<Row>>) => {
      const many = Array.from({ length: 200 }, (_, index) => ({ id: `r${index}`, name: `row ${index}`, qty: index, done: false }));
      const ref = createRef<SpreadsheetGridHandle<Row>>();
      const { container, unmount } = render(
        <SpreadsheetGrid<Row>
          ref={ref}
          rows={many}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          {...props}
        />,
      );
      const scrollEl = container.querySelector<HTMLElement>('.ssg-scroll-container');
      if (!scrollEl) throw new Error('スクロールの器がありません');
      // jsdom の既定 0 だと scrollTop が 0 へ詰められるため、スクロールできる量を与えます。
      Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, get: () => 100000 });
      const calls: number[] = [];
      scrollEl.scrollTo = ((options: ScrollToOptions) => {
        calls.push(options.top ?? Number.NaN);
      }) as typeof scrollEl.scrollTo;
      act(() => {
        ref.current?.scrollToRow(150, { align: 'end' });
      });
      act(() => {
        ref.current?.scrollToRow(150, { align: 'start' });
      });
      unmount();
      return calls;
    };
    const plain = scrollTops({});
    const pinned = scrollTops({ pinnedTopRows: top, pinnedBottomRows: bottom });
    expect(plain).toHaveLength(2);
    // end: 本体の見える高さが固定行 3 行ぶん減る。start: 本体の座標は同じ(上の固定行の下が本体の先頭)。
    expect((pinned[0] ?? 0) - (plain[0] ?? 0)).toBe(3 * ROW_HEIGHT);
    expect(pinned[1]).toBe(plain[1]);
  });

  it('エクスポート: includePinnedRows で上の固定行を本体の前、下の固定行を合計行の前に出す(範囲の選択には入れない)', () => {
    const { ref } = setup({ pinnedTopRows: top, pinnedBottomRows: bottom, totalRow: true });
    expect(ref.current?.exportCsv().split('\r\n')).toHaveLength(4);
    const csv = ref.current?.exportCsv({ includePinnedRows: true, includeTotalRow: true, includeHeaders: false }) ?? '';
    expect(csv.split('\r\n').map((line) => line.split(',')[0])).toEqual(['目標', 'alpha', 'beta', 'gamma', '前年', '平均', '合計']);
    const data = ref.current?.getExportData({ includePinnedRows: true });
    expect(data?.rowKinds).toEqual(['pinned', 'data', 'data', 'data', 'pinned', 'pinned']);
    expect(data?.rows[0]?.[1]).toEqual({ value: 100, text: '100' });
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    });
    expect(ref.current?.exportCsv({ scope: 'selection', includePinnedRows: true, includeHeaders: false }).split('\r\n')).toHaveLength(2);
  });

  it('localeText で行見出しの読み上げを変えられる(英語の表)', () => {
    const { container } = setup({ pinnedTopRows: top, pinnedBottomRows: bottom, localeText: localeTextEn });
    expect(pinnedRowsIn(container, 'top', 'left')[0]?.querySelector('[role="rowheader"]')?.getAttribute('aria-label')).toBe(
      'Pinned to top 1',
    );
    expect(pinnedRowsIn(container, 'bottom', 'left')[1]?.querySelector('[role="rowheader"]')?.getAttribute('aria-label')).toBe(
      'Pinned to bottom 2',
    );
  });

  // 追加(1.1.0 / 固定行の見直し): 固定行は負の index で列幅の自動調整へ渡るので、チップの ctx は固定行の位置で作る
  //   (本体の rowModel を引くと rowKeyGetter(undefined) で落ちていた)。
  it('チップの列があっても列幅の自動調整が固定行で止まらず、チップの関数には固定行の ctx が渡る', async () => {
    const chipCalls: Array<{ pinned: string | undefined; rowKey: unknown; rowIndex: number }> = [];
    const withChips: GridColumn<Row>[] = [
      columns[0],
      columns[1],
      {
        key: 'done',
        title: 'Done',
        width: 60,
        conditionalFormat: {
          chips: (ctx) => {
            chipCalls.push({ pinned: ctx.pinned, rowKey: ctx.rowKey, rowIndex: ctx.rowIndex });
            return ctx.value ? { label: '済み', tone: 'good' } : null;
          },
        },
      },
    ];
    // jsdom には canvas が無いので、文字の幅を測る 2d の context を差し込む(無いと自動調整は何もしない)。
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ font: '', measureText: (text: string) => ({ width: text.length * 7 }) }) as unknown as CanvasRenderingContext2D,
    );
    try {
      const { ref } = setup({ columns: withChips, pinnedTopRows: top, pinnedBottomRows: bottom, autoSizeColumns: 'onMount' });
      await waitFor(() => {
        expect(ref.current?.getState().columnWidths.done).toBeDefined();
      });
      // 自動調整の中で、固定行のチップは固定行の ctx で決める(負の index のまま本体の行として扱わない)。
      expect(chipCalls.every((call) => call.rowIndex >= 0)).toBe(true);
      expect(chipCalls).toContainEqual({ pinned: 'top', rowKey: 'target', rowIndex: 0 });
      expect(chipCalls).toContainEqual({ pinned: 'bottom', rowKey: 'avg', rowIndex: 1 });
    } finally {
      getContext.mockRestore();
    }
  });
});