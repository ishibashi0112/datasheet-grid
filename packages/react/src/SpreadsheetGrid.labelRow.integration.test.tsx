// SpreadsheetGrid を実際に render し、ラベル行(見出し / 区切り行、label-row batch 1〜4)の配線を実行検証する
//   結合テストです。表示順 / RowModel は logic/labelRows.test.ts と engine/rowPipeline.test.ts が正本で、
//   ここでは実コンポーネント越しに「帯と中身の描画 / 行ヘッダー空欄 / 行高 / className / セクション内ソート /
//   未指定時の不変」を確認します。行の DOM を検証するため detail 結合テストと同じ寸法スタブを使います。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, LabelRowOptions, SpreadsheetGridHandle } from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 900,
  });
});

afterEach(() => {
  cleanup();
});

type Row = { id: string; kind?: 'label'; name: string; qty: number };

// [S1] a b [S2] c d e
const rows: Row[] = [
  { id: 's1', kind: 'label', name: 'セクション 1', qty: 0 },
  { id: 'a', name: 'alpha', qty: 30 },
  { id: 'b', name: 'beta', qty: 10 },
  { id: 's2', kind: 'label', name: 'セクション 2', qty: 0 },
  { id: 'c', name: 'gamma', qty: 50 },
  { id: 'd', name: 'delta', qty: 20 },
  { id: 'e', name: 'epsilon', qty: 40 },
];

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80, pinned: 'left' },
  { key: 'name', title: '名称', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

const rowKeyGetter = (row: Row) => row.id;

const labelRow: LabelRowOptions<Row> = {
  isLabelRow: (row) => row.kind === 'label',
  getLabel: (row) => row.name,
};

const labelRowsIn = (container: HTMLElement, pane: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(`[data-pane="${pane}"][data-ssg-label-row]`),
  );
const dataRowsIn = (container: HTMLElement, pane: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      `.ssg-body-row[data-pane="${pane}"]:not([data-ssg-label-row]):not([data-ssg-group-row])`,
    ),
  );
const cellText = (row: HTMLElement, key: string) =>
  row.querySelector<HTMLElement>(`[data-ssg-col-key="${key}"]`)?.textContent ?? '';

describe('SpreadsheetGrid × ラベル行(描画)', () => {
  it('labelRow 未指定では data-ssg-label-row が無く、全行がデータ行として描画される', () => {
    const { container } = render(
      <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={rowKeyGetter} />,
    );
    expect(labelRowsIn(container, 'center')).toHaveLength(0);
    expect(dataRowsIn(container, 'center')).toHaveLength(7);
  });

  it('ラベル行は 3 ペインに帯として描かれ、中身は中央ペインだけ、行ヘッダーは空欄', () => {
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        labelRow={labelRow}
        rowHeight={30}
      />,
    );
    const centerLabels = labelRowsIn(container, 'center');
    const leftLabels = labelRowsIn(container, 'left');
    expect(centerLabels).toHaveLength(2);
    expect(leftLabels).toHaveLength(2);
    // 中身(既定表示 = getLabel の文字列)は中央ペインだけ。
    expect(centerLabels[0].querySelector('.ssg-label-row-content')?.textContent).toBe('セクション 1');
    expect(centerLabels[1].querySelector('.ssg-label-row-content')?.textContent).toBe('セクション 2');
    expect(leftLabels[0].querySelector('.ssg-label-row-content')).toBeNull();
    // 行ヘッダー(左ペインが持つ)は空欄で番号を消費しない。
    const gutter = leftLabels[0].querySelector<HTMLElement>('.ssg-row-header-cell');
    expect(gutter).not.toBeNull();
    expect(gutter?.textContent).toBe('');
    expect(gutter?.classList.contains('ssg-row-header-cell--label')).toBe(true);
    // aria / view index。
    expect(centerLabels[0].getAttribute('aria-label')).toBe('セクション 1');
    expect(centerLabels[0].dataset.rowIndex).toBe('0');
    expect(centerLabels[1].dataset.rowIndex).toBe('3');
    // データ行は 5 行、セルも持つ。
    const dataRows = dataRowsIn(container, 'center');
    expect(dataRows).toHaveLength(5);
    expect(dataRows.map((row) => cellText(row, 'name'))).toEqual([
      'alpha', 'beta', 'gamma', 'delta', 'epsilon',
    ]);
    // ラベル行にセルは無い。
    expect(centerLabels[0].querySelector('[data-ssg-col-key]')).toBeNull();
    // 既定の行高。
    expect(centerLabels[0].style.height).toBe('30px');
  });

  it('render / height / className を反映し、sectionRowCount を渡す', () => {
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        rowKeyGetter={rowKeyGetter}
        rowHeight={30}
        labelRow={{
          ...labelRow,
          height: (row) => (row.id === 's1' ? 48 : 40),
          className: (row) => ({ className: `sec-${row.id}`, style: { color: 'red' } }),
          render: ({ label, sectionRowCount, rowIndex, sourceRowIndex, rowKey }) => (
            <span data-testid="label-content">
              {`${label}|${sectionRowCount}|${rowIndex}|${sourceRowIndex}|${String(rowKey)}`}
            </span>
          ),
        }}
        classNames={{ labelRow: 'slot-label', labelRowContent: 'slot-content' }}
      />,
    );
    const centerLabels = labelRowsIn(container, 'center');
    expect(centerLabels[0].querySelector('[data-testid="label-content"]')?.textContent).toBe(
      'セクション 1|2|0|0|s1',
    );
    expect(centerLabels[1].querySelector('[data-testid="label-content"]')?.textContent).toBe(
      'セクション 2|3|3|3|s2',
    );
    expect(centerLabels[0].style.height).toBe('48px');
    expect(centerLabels[1].style.height).toBe('40px');
    expect(centerLabels[0].classList.contains('sec-s1')).toBe(true);
    expect(centerLabels[0].classList.contains('slot-label')).toBe(true);
    expect(centerLabels[0].style.color).toBe('red');
    expect(centerLabels[0].querySelector('.ssg-label-row-content')?.classList.contains('slot-content')).toBe(true);
    // 行高の上書きは後続行の top に反映される(48 + 30 * 2 = 108 が 2 つ目のラベル行の相対 top)。
    const dataRows = dataRowsIn(container, 'center');
    const topOf = (el: HTMLElement) => Number(/translateY\((-?\d+(?:\.\d+)?)px\)/.exec(el.style.transform)?.[1]);
    expect(topOf(dataRows[0]) - topOf(centerLabels[0])).toBe(48);
    expect(topOf(centerLabels[1]) - topOf(centerLabels[0])).toBe(48 + 30 * 2);
    expect(topOf(dataRows[2]) - topOf(centerLabels[1])).toBe(40);
  });

  it('行番号はラベル行を飛ばした通し番号、Rows サマリの分子 / 分母はデータ行数', () => {
    const { container } = render(
      <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={rowKeyGetter} labelRow={labelRow} />,
    );
    const numbers = dataRowsIn(container, 'left').map(
      (row) => row.querySelector('.ssg-row-header-cell')?.textContent,
    );
    expect(numbers).toEqual(['1', '2', '3', '4', '5']);
    expect(container.textContent).toContain('Rows: 5 / 5');
  });

  it('ソート(applyState)はセクション内に閉じ、ラベル行の位置は動かない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={rowKeyGetter} labelRow={labelRow} />,
    );
    act(() => {
      ref.current?.applyState({
        ...ref.current.getState(),
        sort: [{ columnKey: 'qty', direction: 'asc' }],
      });
    });
    const centerLabels = labelRowsIn(container, 'center');
    expect(centerLabels.map((el) => el.dataset.rowIndex)).toEqual(['0', '3']);
    const dataRows = dataRowsIn(container, 'center');
    // 数量昇順: セクション 1 = b(10) a(30) / セクション 2 = d(20) e(40) c(50)
    expect(dataRows.map((row) => cellText(row, 'name'))).toEqual([
      'beta', 'alpha', 'delta', 'epsilon', 'gamma',
    ]);
  });
});
