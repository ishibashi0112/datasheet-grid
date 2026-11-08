// 追加(段階 2 DU-32): auto-height の背の高い行での縦の揃え(verticalAlign)。
//   - auto-height のセルは中身を器(data-autoheight-content)に入れ、セルの箱は行の高さにする(短い方の枠線が行の途中に
//     出ていた)。
//   - 既定は auto-height の列が上揃え、それ以外は中央。グリッドの verticalAlign で全体を、列の verticalAlign でその列を
//     決める(列が優先)。上揃えは行が基準の高さより高いときだけ(1 行の行は今までどおり中央)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, GridVerticalAlign } from './model/gridTypes';

type Row = { id: number; name: string; note: string };
const rows: Row[] = [
  { id: 1, name: 'alpha', note: '長いメモ' },
  { id: 2, name: 'beta', note: '至急' },
];

let restore: () => void;
beforeAll(() => {
  // jsdom のレイアウトスタブはどの要素も高さ 600px と答えるので、auto-height の行は 600px(基準の 30px より高い)になる。
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
});

const makeColumns = (noteAlign?: GridVerticalAlign): GridColumn<Row>[] => [
  { key: 'name', title: '名前', width: 120 },
  { key: 'note', title: 'メモ', width: 160, autoHeight: true, ...(noteAlign ? { verticalAlign: noteAlign } : {}) },
];

const topAligned = (container: HTMLElement, key: string) =>
  container
    .querySelector<HTMLElement>(`.ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="${key}"]`)
    ?.classList.contains('ssg-body-cell--valign-top');

describe('auto-height の縦の揃え(DU-32)', () => {
  it('auto-height のセルは中身を器に入れ、セルの箱は行の高さにする', () => {
    const { container } = render(
      <SpreadsheetGrid rows={rows} columns={makeColumns()} rowKeyGetter={(row) => row.id} rowHeight={30} autoHeight />,
    );
    const cell = container.querySelector<HTMLElement>('.ssg-body-row[data-row-index="0"] [data-autoheight-cell]');
    expect(cell?.querySelector('[data-autoheight-content]')?.textContent).toBe('長いメモ');
    expect(cell?.style.height).toBe('600px');
    expect(cell?.style.minHeight).toBe('');
  });

  it('既定は auto-height の列だけ上揃え、ほかの列は中央', () => {
    const { container } = render(
      <SpreadsheetGrid rows={rows} columns={makeColumns()} rowKeyGetter={(row) => row.id} rowHeight={30} autoHeight />,
    );
    expect(topAligned(container, 'note')).toBe(true);
    expect(topAligned(container, 'name')).toBe(false);
  });

  it('グリッドの verticalAlign="top" で全部の列、"center" で全部の列を中央にする', () => {
    const { container, rerender } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={makeColumns()}
        rowKeyGetter={(row) => row.id}
        rowHeight={30}
        autoHeight
        verticalAlign="top"
      />,
    );
    expect(topAligned(container, 'note')).toBe(true);
    expect(topAligned(container, 'name')).toBe(true);
    rerender(
      <SpreadsheetGrid
        rows={rows}
        columns={makeColumns()}
        rowKeyGetter={(row) => row.id}
        rowHeight={30}
        autoHeight
        verticalAlign="center"
      />,
    );
    expect(topAligned(container, 'note')).toBe(false);
    expect(topAligned(container, 'name')).toBe(false);
  });

  it('列の verticalAlign がグリッドの指定より優先する', () => {
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={makeColumns('center')}
        rowKeyGetter={(row) => row.id}
        rowHeight={30}
        autoHeight
        verticalAlign="top"
      />,
    );
    expect(topAligned(container, 'note')).toBe(false);
    expect(topAligned(container, 'name')).toBe(true);
  });

  it('autoHeight を使わない(行の高さが固定)ときは上揃えにしない', () => {
    const { container } = render(
      <SpreadsheetGrid
        rows={rows}
        columns={makeColumns()}
        rowKeyGetter={(row) => row.id}
        rowHeight={30}
        verticalAlign="top"
      />,
    );
    expect(topAligned(container, 'name')).toBe(false);
    expect(container.querySelector('[data-autoheight-content]')).toBeNull();
  });
});
