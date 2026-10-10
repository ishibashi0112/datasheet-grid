// 追加(F-3 / 条件付き書式): conditionalFormat の結合テストです。jsdom の layout スタブで本体行を描画し、データバーの
//   帯 / カラースケールの背景 / 状態チップが既定セルに出ること、min / max がビュー行(フィルター後)から集計されることを
//   固定します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';
import { GRID_STATE_VERSION } from '@ishibashi0112/spreadsheet-grid-core/logic/gridState';

type Row = { id: number; qty: number; delta: number; status: string };
const rows: Row[] = [
  { id: 1, qty: 10, delta: -30, status: '受注' },
  { id: 2, qty: 50, delta: 0, status: '出荷済' },
  { id: 3, qty: 30, delta: 30, status: 'キャンセル' },
];
const columns: GridColumn<Row>[] = [
  { key: 'qty', title: '数量', width: 100, conditionalFormat: { dataBar: { color: 'rgb(1, 2, 3)' } } },
  { key: 'delta', title: '前月比', width: 100, conditionalFormat: { colorScale: { type: 'diverging' } } },
  {
    key: 'status',
    title: '状態',
    width: 120,
    conditionalFormat: { chips: { 受注: 'info', 出荷済: 'good', キャンセル: { tone: 'critical', label: '取消', icon: false } } },
  },
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

const cellsOf = (container: HTMLElement, key: string) =>
  Array.from(container.querySelectorAll<HTMLElement>(`.ssg-body-cell[data-ssg-col-key="${key}"]`));

describe('F-3: 条件付き書式(conditionalFormat)', () => {
  it('データバー / カラースケール / チップが既定セルに描かれ、min / max はビュー行から集計される', () => {
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    // データバー: 10..50 → 10 は帯なし、50 は 0〜100%、30 は 0〜50%。色は指定色。
    const bars = cellsOf(container, 'qty').map((cell) => {
      const bar = cell.querySelector<HTMLElement>('.ssg-cf-bar');
      return bar ? { left: bar.style.left, width: bar.style.width, color: bar.style.backgroundColor, cls: cell.classList.contains('ssg-body-cell--cf-bar') } : null;
    });
    expect(bars).toEqual([
      null,
      { left: '0%', width: '100%', color: 'rgb(1, 2, 3)', cls: true },
      { left: '0%', width: '50%', color: 'rgb(1, 2, 3)', cls: true },
    ]);
    // カラースケール(diverging): -30 は負側 60%、0 は中立、30 は正側 60%。
    const scales = cellsOf(container, 'delta').map((cell) => ({
      cls: cell.classList.contains('ssg-body-cell--cf-scale'),
      bg: cell.style.getPropertyValue('background-color'),
    }));
    expect(scales.map((s) => s.cls)).toEqual([true, true, true]);
    expect(scales[0].bg).toContain('--ssg-cf-div-negative) 60%');
    expect(scales[1].bg).toBe('var(--ssg-cf-div-mid)');
    expect(scales[2].bg).toContain('--ssg-cf-div-positive) 60%');
    // チップ: 色味のクラス + アイコン + ラベル(label 指定 / icon: false を反映)。
    const chips = cellsOf(container, 'status').map((cell) => {
      const chip = cell.querySelector<HTMLElement>('.ssg-chip');
      return chip ? { cls: chip.className, icon: chip.querySelector('.ssg-chip-icon') !== null, label: chip.querySelector('.ssg-chip-label')?.textContent } : null;
    });
    expect(chips).toEqual([
      { cls: 'ssg-chip ssg-chip--info', icon: true, label: '受注' },
      { cls: 'ssg-chip ssg-chip--good', icon: true, label: '出荷済' },
      { cls: 'ssg-chip ssg-chip--critical', icon: false, label: '取消' },
    ]);
  });

  it('フィルターで行が減ると min / max を取り直す(ビュー行基準)。showValue: false は文字を出さない', () => {
    const cols: GridColumn<Row>[] = [
      { key: 'qty', title: '数量', width: 100, filterType: 'number', conditionalFormat: { dataBar: { showValue: false } } },
    ];
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<SpreadsheetGrid<Row> ref={ref} rows={rows} columns={cols} rowKeyGetter={(r) => r.id} />);
    // 全行(10..50): 50 が 100%、30 が 50%。
    expect(cellsOf(container, 'qty').map((cell) => cell.querySelector<HTMLElement>('.ssg-cf-bar')?.style.width ?? null)).toEqual([null, '100%', '50%']);
    act(() => {
      ref.current?.applyState({
        version: GRID_STATE_VERSION,
        columnWidths: {},
        filters: { globalText: '', columnFilters: { qty: { kind: 'number', raw: '<=30', parsed: { mode: 'comparison', operator: '<=', value: 30 } } } },
        sort: [],
      });
    });
    const cells = cellsOf(container, 'qty');
    // 10..30 の範囲: 30 が 100%。文字は出さない(帯だけ)。
    expect(cells.map((cell) => cell.querySelector<HTMLElement>('.ssg-cf-bar')?.style.width ?? null)).toEqual([null, '100%']);
    expect(cells.map((cell) => cell.textContent)).toEqual(['', '']);
  });
});
