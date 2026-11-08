// 追加(段階 2 DU-18): 上下のバーの文言です。メニューやツールチップは日本語なのに、バーだけ「Toolbar」「Rows」「Active」など
//   英語が混ざり、変える prop も無かった(4 本のアプリで指摘)。既定を日本語にし、localeText で 1 つずつ変えられるようにします。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3 },
  { id: 2, name: 'beta', qty: 1 },
  { id: 3, name: 'gamma', qty: 2 },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

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

// 選択範囲の集計(.ssg-bar-aggregates)は別に見ます。
const chips = (container: HTMLElement, bar: 'top' | 'bottom') =>
  Array.from(container.querySelectorAll(`.ssg-bar--${bar} .ssg-bar-chip`))
    .filter((chip) => chip.closest('.ssg-bar-aggregates') === null)
    .map((chip) => chip.textContent);

describe('バーの文言(DU-18)', () => {
  it('既定は日本語で、「Toolbar」の見出しは無い', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={{ sort: [{ columnKey: 'qty', direction: 'desc' }] }}
      />,
    );
    expect(container.textContent).not.toContain('Toolbar');
    expect(chips(container, 'top')).toEqual(['行 3 / 3', '列 2 / 2', '絞り込み: なし', '並び替え: 数量(降順)']);
    expect(chips(container, 'bottom')).toEqual(['行 3 / 3', '列 2 / 2', 'セル なし', '範囲 なし', '0 セル / 0 行', '0 列']);
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    });
    expect(chips(container, 'bottom').slice(2, 6)).toEqual(['セル A1', '範囲 A1:B2', '4 セル / 2 行', '2 列']);
    expect(Array.from(container.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')).map((chip) => chip.textContent)).toEqual([
      '平均:2.5',
      'データの個数:4',
      '合計:5',
    ]);
  });

  it('選択範囲の集計の見出しも localeText で変わる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        localeText={{ aggregateAverage: 'Average', aggregateCount: 'Count', aggregateSum: 'Sum' }}
      />,
    );
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 2, col: 1 } });
    });
    expect(Array.from(container.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')).map((chip) => chip.textContent)).toEqual([
      'Average:2',
      'Count:3',
      'Sum:6',
    ]);
  });

  it('localeText で変えたキーだけが置き換わる(その場で書いたオブジェクトでも)', () => {
    const view = (height: number) => (
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={height}
        localeText={{ rowCount: 'Rows: {shown} / {total}', activeCell: 'Active: {cell}', none: '—' }}
      />
    );
    const { container, rerender } = render(view(300));
    rerender(view(320));
    expect(chips(container, 'top')).toEqual(['Rows: 3 / 3', '列 2 / 2', '絞り込み: —', '並び替え: —']);
    expect(chips(container, 'bottom').slice(2, 4)).toEqual(['Active: —', '範囲 —']);
  });
});
