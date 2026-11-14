// 追加(1.0.2 / 2026-11-09 実アプリの総点検 G-14): 上限を超えたときの開発時の警告(auto-height の 5 万行 / 展開行の論理全高)は、
//   グリッド 1 つにつき 1 回だけ出す。これまでは絞り込みで行数がしきい値をまたぐたびに出ていた。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { createRef, StrictMode } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; note: string };
const makeRows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, note: `n${i}` }));

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

const countWarnings = (warn: { mock: { calls: unknown[][] } }, text: string) =>
  warn.mock.calls.filter(([message]) => String(message).includes(text)).length;

describe('上限を超えたときの開発時の警告(G-14)', () => {
  it('auto-height の行数の上限: しきい値を何度またいでも 1 回だけ(StrictMode でも)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const columns: GridColumn<Row>[] = [{ key: 'note', title: 'メモ', width: 120, autoHeight: true }];
      const many = makeRows(50_001);
      const few = makeRows(10);
      const view = (rows: Row[]) => (
        <StrictMode>
          <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={300} autoHeight />
        </StrictMode>
      );
      const { rerender } = render(view(many));
      rerender(view(few));
      rerender(view(many));
      rerender(view(makeRows(50_002)));
      expect(countWarnings(warn, 'auto-height は 50000 行まで')).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('展開行の論理全高の上限: 行数が上下しても 1 回だけ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const columns: GridColumn<Row>[] = [{ key: 'note', title: 'メモ', width: 120 }];
      // 行の高さ 1,000px × 2 万行 = 2,000 万 px(上限 1,500 万 px を超える)。
      const many = makeRows(20_000);
      const few = makeRows(10);
      const ref = createRef<SpreadsheetGridHandle<Row>>();
      const view = (rows: Row[]) => (
        <SpreadsheetGrid<Row>
          ref={ref}
          rows={rows}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          height={300}
          rowHeight={1000}
          detailRow={{ render: () => <div>詳細</div> }}
        />
      );
      const { rerender } = render(view(many));
      act(() => {
        ref.current?.setDetailRowExpanded(1, true);
      });
      rerender(view(few));
      rerender(view(many));
      act(() => {
        ref.current?.setDetailRowExpanded(2, true);
      });
      expect(countWarnings(warn, '展開行は論理全高')).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });
});