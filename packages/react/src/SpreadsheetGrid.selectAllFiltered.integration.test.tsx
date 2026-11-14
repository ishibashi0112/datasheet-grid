// 追加(1.0.1 / 実アプリの総点検 AP-03): フィルター中の見出しのチェックボックスの結合テストです。
//   フィルターで隠れている行があるときは、見えている行だけを選ぶ / 外す(フィルターを外したときに見えなかった行まで
//   選ばれ、一括削除で消えていた)。ハンドルの selectAllRows() はこれまでどおり全行。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { createRef, type RefObject } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn, RowSelectionModel, SpreadsheetGridHandle } from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string };

const columns: GridColumn<Row>[] = [{ key: 'name', title: '品名', width: 120 }];
const rows: Row[] = [
  { id: 1, name: 'りんご' },
  { id: 2, name: 'みかん' },
  { id: 3, name: 'りんご' },
  { id: 4, name: 'ぶどう' },
];

const setup = () => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const changes: RowSelectionModel[] = [];
  const { container } = render(
    <SpreadsheetGrid
      ref={ref}
      columns={columns}
      rows={rows}
      rowKeyGetter={(row) => row.id}
      enableRowSelection
      enableGlobalFilter
      onRowSelectionChange={(model) => changes.push(model)}
    />,
  );
  const corner = () => container.querySelector('.ssg-corner-cell') as HTMLElement;
  const cornerState = () => corner().querySelector('[aria-checked]')?.getAttribute('aria-checked') ?? null;
  return { ref, changes, corner, cornerState };
};

const filterTo = async (ref: RefObject<SpreadsheetGridHandle<Row> | null>, text: string, count: number) => {
  act(() => {
    ref.current?.applyState({ filters: { globalText: text } });
  });
  await waitFor(() => {
    expect(ref.current?.getExportData({ scope: 'view' }).rows).toHaveLength(count);
  });
};

describe('フィルター中の見出しのチェックボックス(AP-03)', () => {
  it('見えている行だけを選び、フィルターを外しても見えなかった行は選ばれていない', async () => {
    const { ref, changes, corner } = setup();
    await filterTo(ref, 'りんご', 2);
    fireEvent.pointerDown(corner(), { button: 0 });
    expect(changes[changes.length - 1]).toEqual({ type: 'include', rowKeys: [1, 3] });
    await filterTo(ref, '', 4);
    expect(ref.current?.getSelectedRowKeys()).toEqual([1, 3]);
    expect(ref.current?.getSelectedRowCount()).toBe(2);
  });

  it('見えている行がすべて選ばれていれば、もう一度押すと見えている行だけ外す(見えない行の選択は残す)', async () => {
    const { ref, changes, corner, cornerState } = setup();
    act(() => {
      ref.current?.setRowSelection({ type: 'include', rowKeys: [2] });
    });
    await filterTo(ref, 'りんご', 2);
    // 見えない行(2)だけが選ばれている = 見出しは「なし」。
    expect(cornerState()).toBe('false');
    fireEvent.pointerDown(corner(), { button: 0 });
    expect(cornerState()).toBe('true');
    fireEvent.pointerDown(corner(), { button: 0 });
    expect(changes[changes.length - 1]).toEqual({ type: 'include', rowKeys: [2] });
  });

  it('フィルターで隠れている行が無いときと selectAllRows() は従来どおり全行(exclude)', async () => {
    const { ref, changes, corner } = setup();
    fireEvent.pointerDown(corner(), { button: 0 });
    expect(changes[changes.length - 1]).toEqual({ type: 'exclude', rowKeys: [] });
    fireEvent.pointerDown(corner(), { button: 0 });
    await filterTo(ref, 'りんご', 2);
    act(() => {
      ref.current?.selectAllRows();
    });
    expect(changes[changes.length - 1]).toEqual({ type: 'exclude', rowKeys: [] });
  });
});