// 追加(別視点のレビュー): filterType 'auto' の列の種別の推定で、ラベル行の値を数えない(見出しの文字が数値の列に
//   入っていると、数値の列が文字の列に推定されていた)。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { filteringFeature } from './filtering';
import type { GridColumn } from '../model/gridTypes';

type Row = { id: string; kind?: 'label'; qty: number | string };

const rows: Row[] = [
  { id: 's1', kind: 'label', qty: '■ 東日本' },
  { id: 'a', qty: 10 },
  { id: 'b', qty: 20 },
  { id: 's2', kind: 'label', qty: '■ 西日本' },
  { id: 'c', qty: 30 },
];
const qty: GridColumn<Row> = { key: 'qty', title: '数量', width: 80, filterType: 'auto' };

const openedType = (isLabelRow?: (row: Row, sourceIndex: number) => boolean) => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const { result, unmount } = renderHook(() =>
    filteringFeature.useFilterPopover<Row>({
      visibleColumns: [qty],
      columnFilters: {},
      columnFilterEnabled: true,
      gridRootRef: { current: root as HTMLDivElement },
      isServerSide: false,
      rows,
      isLabelRow,
    }),
  );
  act(() => {
    result.current.openColumnFilterPopover(qty);
  });
  const type = result.current.openedFilterType;
  unmount();
  root.remove();
  return type;
};

describe("filterType 'auto' の推定とラベル行", () => {
  it('ラベル行の値を数えずに推定する(数値の列は numberSet)', () => {
    expect(openedType((row) => row.kind === 'label')).toBe('numberSet');
    // ラベル行の判定が無ければ、見出しの文字も値として数える(従来どおり)
    expect(openedType()).toBe('textSet');
  });
});
