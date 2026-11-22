// 追加(1.3.0 / Solid 版の品質の段 2-4): 列・見出し・メニューの所見の結合テストです(Solid 版は parity の同じ場面)。
//   R3-2: フィルターのポップオーバーを開いたまま別の列へ移ると(ツールパネルの ✎)、set の候補の検索の文字が前の列のまま残っていた。
//   S12-01: 見出しのドラッグ・列メニューの固定・ツールパネルの非表示で列を変えると、アクティブセルと選択が消えていた。
//   S6-21: 2 つのグリッドがあるとき、片方の列メニューを開いたまま、もう片方の列のメニューのボタンを押すと、2 つとも開いていた。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { createRef, useState, type Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; category: string; status: string };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'category', title: 'Category', width: 120, filterType: 'set' },
  { key: 'status', title: 'Status', width: 120, filterType: 'set' },
];

const rows: Row[] = [
  { id: 1, name: 'alpha', category: 'a', status: 'open' },
  { id: 2, name: 'beta', category: 'b', status: 'closed' },
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

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const searchInput = () => screen.getByLabelText<HTMLInputElement>('検索（Enter で確定）');

describe('R3-2: 開いたまま別の列のフィルターへ移る', () => {
  it('ツールパネルの ✎ で別の set の列へ移ると、検索の文字は空から始まる', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid<Row> ref={ref} columns={columns} rows={rows} rowKeyGetter={(row) => row.id} />);
    act(() => {
      ref.current?.applyState({
        filters: {
          columnFilters: {
            category: { kind: 'set', mode: 'include', values: ['a'] },
            status: { kind: 'set', mode: 'include', values: ['open'] },
          },
        },
      });
    });
    act(() => {
      ref.current?.openFilterManager();
    });
    // ✎ は列の見出しへスクロールしてから次のフレームで開く。
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Category のフィルターを編集'));
      await nextFrame();
    });
    fireEvent.change(searchInput(), { target: { value: 'zz' } });
    expect(searchInput().value).toBe('zz');
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Status のフィルターを編集'));
      await nextFrame();
    });
    expect(screen.getByRole('dialog', { name: /Status/ })).toBeTruthy();
    expect(searchInput().value).toBe('');
  });
});

describe('S6-21: 2 つのグリッドのメニュー', () => {
  it('別のグリッドの列メニューを開くと、前のグリッドのメニューは閉じる', async () => {
    render(
      <>
        <SpreadsheetGrid<Row> columns={columns} rows={rows} rowKeyGetter={(row) => row.id} enableColumnMenu />
        <SpreadsheetGrid<Row>
          columns={columns.map((column) => ({ ...column, title: `B-${column.title}` }))}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          enableColumnMenu
        />
      </>,
    );
    const pointer = { button: 0, pointerType: 'mouse', pointerId: 1 };
    await act(async () => {
      fireEvent.pointerDown(screen.getByLabelText('Name の列メニュー'), pointer);
      await nextFrame();
    });
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    await act(async () => {
      fireEvent.pointerDown(screen.getByLabelText('B-Name の列メニュー'), pointer);
      await nextFrame();
    });
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });
});

describe('S12-01: グリッドの中で列を変えた後のアクティブセル', () => {
  function Harness({ gridRef }: { gridRef: Ref<SpreadsheetGridHandle<Row>> }) {
    const [cols, setCols] = useState(columns);
    return (
      <SpreadsheetGrid<Row>
        ref={gridRef}
        columns={cols}
        onColumnsChange={setCols}
        rows={rows}
        rowKeyGetter={(row) => row.id}
        enableColumnMenu
      />
    );
  }

  it('列メニューで左に固定すると、アクティブセルはその列(0 列目)に付いていく', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<Harness gridRef={ref} />);
    const shell = container.querySelector<HTMLElement>('.ssg-shell')!;
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 2 });
    });
    await act(async () => {
      fireEvent.keyDown(shell, { key: 'ArrowDown', altKey: true });
      await nextFrame();
    });
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /列の固定/ }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('menuitemradio', { name: '左に固定' }));
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(ref.current?.getSelection()).toMatchObject({ range: { start: { row: 1, col: 0 }, end: { row: 1, col: 0 } } });
    // 次の矢印キーはその列から。
    act(() => {
      fireEvent.keyDown(shell, { key: 'ArrowRight' });
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 1 });
  });
});