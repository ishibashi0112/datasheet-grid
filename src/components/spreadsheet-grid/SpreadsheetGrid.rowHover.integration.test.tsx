// 追加(proposals ⑩)の回帰テスト: 行ホバーの optionally controlled 化
//   (hoveredRowIndex / onHoveredRowChange)です。実グリッドを render し、
//   ①controlled 値でハイライトされ pointer では動かない(prop が勝つ)
//   ②uncontrolled で pointer 由来の変化が同値抑止つきで通知される
//   ③enableRowHover=false では controlled 値も通知も無効
//   を検証します。本体行 / セルの描画には testing サブパスの installJsdomLayoutStubs を
//   使います(素の jsdom では行・列が描画されないため。jsdomLayoutStubs テストと同方針)。
// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

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

// viewRowIndex 行の rowIndex 番目のデータセルを返します。
const getCell = (
  container: HTMLElement,
  rowIndex: number,
  colIndex: number,
): HTMLElement => {
  const rowEls = container.querySelectorAll('.ssg-body-row');
  const cell = rowEls[rowIndex]?.querySelectorAll<HTMLElement>('.ssg-body-cell')[
    colIndex
  ];
  if (!cell) {
    throw new Error(`セル (${rowIndex}, ${colIndex}) が見つかりません`);
  }
  return cell;
};

// 行ハイライト(.ssg-body-cell--row-hovered)が付いているビュー行 index の集合を返します。
const hoveredRows = (container: HTMLElement): number[] => {
  const rowEls = Array.from(container.querySelectorAll('.ssg-body-row'));
  return rowEls
    .map((rowEl, index) =>
      rowEl.querySelector('.ssg-body-cell--row-hovered') ? index : null,
    )
    .filter((index): index is number => index !== null);
};

describe('行ホバーの optionally controlled 化(proposals ⑩)', () => {
  it('uncontrolled: pointer で通知(同値抑止つき)+ ハイライトが追従する', () => {
    const onHoveredRowChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        onHoveredRowChange={onHoveredRowChange}
      />,
    );

    // 行 1 の 1 セル目へ enter → 通知 1 回 + 行 1 ハイライト。
    fireEvent.pointerEnter(getCell(container, 1, 0));
    expect(onHoveredRowChange).toHaveBeenCalledTimes(1);
    expect(onHoveredRowChange).toHaveBeenLastCalledWith(1, {
      source: 'pointer',
    });
    expect(hoveredRows(container)).toEqual([1]);

    // 同一行内のセル跨ぎ(行 1 の 2 セル目)→ 同値抑止で通知されない。
    fireEvent.pointerEnter(getCell(container, 1, 1));
    expect(onHoveredRowChange).toHaveBeenCalledTimes(1);

    // 行 2 へ移動 → 2 回目の通知 + ハイライト移動。
    fireEvent.pointerEnter(getCell(container, 2, 0));
    expect(onHoveredRowChange).toHaveBeenCalledTimes(2);
    expect(onHoveredRowChange).toHaveBeenLastCalledWith(2, {
      source: 'pointer',
    });
    expect(hoveredRows(container)).toEqual([2]);

    // grid 本体(.ssg-shell)から出る → null 通知 + ハイライト解除。
    const shell = container.querySelector<HTMLElement>('.ssg-shell');
    expect(shell).not.toBeNull();
    fireEvent.pointerLeave(shell!);
    expect(onHoveredRowChange).toHaveBeenCalledTimes(3);
    expect(onHoveredRowChange).toHaveBeenLastCalledWith(null, {
      source: 'pointer',
    });
    expect(hoveredRows(container)).toEqual([]);
  });

  it('controlled: prop の行がハイライトされ、pointer では動かない(通知はされる)', () => {
    const onHoveredRowChange = vi.fn();
    const { container, rerender } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        hoveredRowIndex={1}
        onHoveredRowChange={onHoveredRowChange}
      />,
    );
    expect(hoveredRows(container)).toEqual([1]);

    // pointer が行 0 に入っても表示は prop(行 1)のまま。変化は通知のみ。
    fireEvent.pointerEnter(getCell(container, 0, 0));
    expect(onHoveredRowChange).toHaveBeenCalledTimes(1);
    expect(onHoveredRowChange).toHaveBeenLastCalledWith(0, {
      source: 'pointer',
    });
    expect(hoveredRows(container)).toEqual([1]);

    // 親が prop を更新すればハイライトが移る(controlled の往復)。
    rerender(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        hoveredRowIndex={2}
        onHoveredRowChange={onHoveredRowChange}
      />,
    );
    expect(hoveredRows(container)).toEqual([2]);

    // null でハイライトなし。
    rerender(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        hoveredRowIndex={null}
        onHoveredRowChange={onHoveredRowChange}
      />,
    );
    expect(hoveredRows(container)).toEqual([]);
  });

  it('enableRowHover=false: controlled 値も通知も無効', () => {
    const onHoveredRowChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        enableRowHover={false}
        hoveredRowIndex={1}
        onHoveredRowChange={onHoveredRowChange}
      />,
    );
    expect(hoveredRows(container)).toEqual([]);

    fireEvent.pointerEnter(getCell(container, 0, 0));
    expect(onHoveredRowChange).not.toHaveBeenCalled();
    expect(hoveredRows(container)).toEqual([]);
  });
});