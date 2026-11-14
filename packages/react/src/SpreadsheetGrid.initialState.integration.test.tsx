// 追加(段階 2 DU-12): 状態の初期値 initialState です。これまでは最初の描画の後に applyState を呼ぶしかなく、SSRM は
//   まず条件なしで 1 回取りに行き、Next.js では URL から戻した絞り込み / 並べ替えがサーバーの描画に載りませんでした。
//   initialState は最初の 1 回(マウント時)だけ使い、最初の描画・SSRM の最初の取得・getState() に効きます。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef, StrictMode } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { restoreColumnsFromState } from './common';
import { installJsdomLayoutStubs } from './testing';
import type {
  GridColumn,
  GridState,
  ServerSideDataSource,
  ServerSideGetRowsParams,
  SpreadsheetGridHandle,
  SpreadsheetGridProps,
} from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3 },
  { id: 2, name: 'beta', qty: 1 },
  { id: 3, name: 'gamma', qty: 2 },
  { id: 4, name: 'delta', qty: 5 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text' },
  { key: 'qty', title: '数量', width: 100, filterType: 'number' },
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
  vi.restoreAllMocks();
});

const initialState: NonNullable<SpreadsheetGridProps<Row>['initialState']> = {
  columnWidths: { name: 220 },
  filters: { columnFilters: { name: { kind: 'text', value: 'l' } } },
  sort: [{ columnKey: 'qty', direction: 'asc' }],
};

// 中央ペインの「名前」の列のセルの並び(表示順)。
const shownNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row'))
    .filter((row) => row.closest('.ssg-center-pane') !== null)
    .sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex))
    .map((row) => row.querySelector('[data-ssg-col-key="name"]')?.textContent ?? '');

describe('initialState(DU-12)', () => {
  it('最初の描画から絞り込み / 並べ替え / 列幅が効き、getState() にも出る。マウント時は通知しない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onStateChange = vi.fn();
    const onFiltersChange = vi.fn();
    const onSortChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={initialState}
        onStateChange={onStateChange}
        onFiltersChange={onFiltersChange}
        onSortChange={onSortChange}
      />,
    );
    // 「l」を含む行(alpha / delta)を数量の昇順に。
    expect(shownNames(container)).toEqual(['alpha', 'delta']);
    const state = ref.current?.getState();
    expect(state?.sort).toEqual([{ columnKey: 'qty', direction: 'asc' }]);
    expect(state?.filters.columnFilters).toEqual({ name: { kind: 'text', value: 'l' } });
    expect(state?.columnWidths).toEqual({ name: 220 });
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('最初の 1 回だけ使う(後から initialState を変えても今の状態は変わらない)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = (state: SpreadsheetGridProps<Row>['initialState']) => (
      <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={300} initialState={state} />
    );
    const { rerender } = render(view(initialState));
    rerender(view({ sort: [{ columnKey: 'name', direction: 'desc' }] }));
    expect(ref.current?.getState().sort).toEqual([{ columnKey: 'qty', direction: 'asc' }]);
  });

  it('今の列定義に無い列は捨て、開発時に知らせる', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={{ sort: [{ columnKey: 'gone', direction: 'asc' }, { columnKey: 'qty', direction: 'desc' }] }}
      />,
    );
    expect(ref.current?.getState().sort).toEqual([{ columnKey: 'qty', direction: 'desc' }]);
    expect(warn.mock.calls.some(([message]) => String(message).includes('initialState') && String(message).includes('gone'))).toBe(
      true,
    );
  });

  // 追加(段階 2 の確かめ直し): getState() を保存して initialState へ渡しても、列の並び / 表示 / 固定は戻らず(columns prop で
  //   決めるため)、保存した columns を列定義へ当てる方法が無かった(アプリが関数を自作していた)。
  it('restoreColumnsFromState: 保存した状態の列の並び / 表示 / 固定を列定義へ当てる(initialState と一緒に渡すと警告しない)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saved: GridState = {
      version: 2,
      columnWidths: { qty: 140 },
      filters: { globalText: '', columnFilters: {} },
      sort: [],
      columns: [{ key: 'gone' }, { key: 'qty', pinned: 'left' }, { key: 'name', visible: false }],
    };
    const restored = restoreColumnsFromState(columns, saved);
    expect(restored.map((column) => [column.key, column.pinned, column.visible])).toEqual([
      ['qty', 'left', undefined],
      ['name', undefined, false],
    ]);
    // 列定義のほかの項目(title / width / filterType)はそのまま。保存の幅は列定義へ焼き込まない(initialState の columnWidths で戻す)。
    expect(restored[0]).toMatchObject({ title: '数量', width: 100, filterType: 'number' });
    // 保存した columns が無い / 読めない値なら、渡した列定義をそのまま返す。
    expect(restoreColumnsFromState(columns, undefined)).toBe(columns);
    expect(restoreColumnsFromState(columns, { sort: [] })).toBe(columns);
    expect(restoreColumnsFromState(columns, 'broken')).toBe(columns);
    // 追加(段階 2 の確かめ直し S-N2): 保存した columns に同じ key が重なっていても、列は 1 つだけ。
    expect(
      restoreColumnsFromState(columns, { columns: [{ key: 'qty' }, { key: 'name' }, { key: 'qty', visible: false }] }).map(
        (column) => [column.key, column.visible],
      ),
    ).toEqual([
      ['qty', undefined],
      ['name', undefined],
    ]);
    // 追加(段階 2 の確かめ直し): readonly の配列(as const の列定義など)も受ける。
    const readonlyColumns: readonly GridColumn<Row>[] = columns;
    const restoredFromReadonly: GridColumn<Row>[] = restoreColumnsFromState(readonlyColumns, saved);
    expect(restoredFromReadonly.map((column) => column.key)).toEqual(['qty', 'name']);

    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={restored}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={saved}
      />,
    );
    expect(ref.current?.getState().columnWidths).toEqual({ qty: 140 });
    expect(warn.mock.calls.some(([message]) => String(message).includes('initialState の columns'))).toBe(false);
  });

  // 追加(段階 2 の 3 回目の確かめ直し N3-3): 列メニューで途中の列を固定すると、保存した columns は元の並びのまま固定の印だけが
  //   付き、restoreColumnsFromState は固定した列を先に並べる。並びの違いだけで「columns が違う」と警告していた(見た目は同じ)。
  it('途中の列を固定した状態を restoreColumnsFromState で戻しても警告しない(並びは表示の順で比べる)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const threeColumns: GridColumn<Row>[] = [{ key: 'id', title: 'ID', width: 60 }, ...columns];
    const saved: GridState = {
      version: 2,
      columnWidths: {},
      filters: { globalText: '', columnFilters: {} },
      sort: [],
      columns: [{ key: 'id', pinned: 'left' }, { key: 'name' }, { key: 'qty', pinned: 'left' }],
    };
    const restored = restoreColumnsFromState(threeColumns, saved);
    expect(restored.map((column) => column.key)).toEqual(['id', 'qty', 'name']);
    render(
      <SpreadsheetGrid<Row> rows={rows} columns={restored} rowKeyGetter={(row) => row.id} height={300} initialState={saved} />,
    );
    expect(warn.mock.calls.some(([message]) => String(message).includes('initialState の columns'))).toBe(false);
  });

  // 追加(段階 2 の確かめ直し N2-4): StrictMode(Next.js の開発時の既定)では状態の初期化が 2 回呼ばれ、同じ警告が 2 回ずつ出ていた。
  it('StrictMode でも、同じ initialState への開発時の警告は 1 回だけ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // getState() の値と同じ形(columns 付き)。
    const saved: Partial<GridState> = {
      columns: [{ key: 'qty' }, { key: 'name' }],
      sort: [{ columnKey: 'gone', direction: 'asc' }],
    };
    render(
      <StrictMode>
        <SpreadsheetGrid<Row>
          rows={rows}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          height={300}
          initialState={saved}
        />
      </StrictMode>,
    );
    const count = (text: string) => warn.mock.calls.filter(([message]) => String(message).includes(text)).length;
    expect(count('`gone`')).toBe(1);
    expect(count('initialState の columns')).toBe(1);
  });

  it('serverSide: 最初の取得から initialState の絞り込み / 並べ替えを載せる', async () => {
    const calls: ServerSideGetRowsParams[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) => {
        calls.push(params);
        return Promise.resolve({ rows: rows.slice(params.startIndex, params.endIndex), totalRowCount: rows.length });
      },
    };
    render(
      <SpreadsheetGrid<Row>
        rows={[]}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        dataSource={dataSource}
        initialState={initialState}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.query.sort).toEqual([{ columnKey: 'qty', direction: 'asc' }]);
      expect(call.query.columnFilters).toEqual({ name: { kind: 'text', value: 'l' } });
    }
  });

  // 修正(段階 2 の見直し): グリッドが足す列(自動グループ列など)の幅もマウントの後に残す(applyState と同じ)。これまでは
  //   マウント時の列幅の整合で columns に無い列として捨て、サーバーの描画の幅から既定の幅へ戻っていた。
  it('自動グループ列の幅も最初の描画から効き、マウントの後も残る(columns を渡し直しても)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const grouped: GridColumn<Row>[] = [
      { key: 'name', title: '名前', width: 160, rowGroup: true },
      { key: 'qty', title: '数量', width: 100 },
    ];
    const view = (cols: GridColumn<Row>[]) => (
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={cols}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={{ columnWidths: { __ssg_group__: 333, qty: 150 } }}
      />
    );
    const { container, rerender } = render(view(grouped));
    expect(ref.current?.getState().columnWidths).toEqual({ __ssg_group__: 333, qty: 150 });
    const groupHeader = container.querySelector<HTMLElement>('.ssg-header-row [data-ssg-col-key="__ssg_group__"]');
    expect(groupHeader?.style.width).toBe('333px');
    rerender(view(grouped.map((column) => ({ ...column }))));
    expect(ref.current?.getState().columnWidths).toEqual({ __ssg_group__: 333, qty: 150 });
  });

  // 修正(段階 2 の見直し): getState() の値をそのまま渡しても警告しない(columns が columns prop と同じなら)。違うときだけ
  //   「並び / 表示 / 固定は戻さない」と知らせる。
  it('getState() の値をそのまま渡しても警告しない。columns が columns prop と違うときだけ知らせる', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = createRef<SpreadsheetGridHandle<Row>>();
    const { unmount } = render(
      <SpreadsheetGrid<Row> ref={first} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={300} initialState={initialState} />,
    );
    const saved = first.current?.getState();
    unmount();
    expect(saved?.columns).toBeDefined();
    render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={300} initialState={saved} />,
    );
    expect(warn).not.toHaveBeenCalled();
    cleanup();
    const reordered: GridState = { ...saved!, columns: [{ key: 'qty' }, { key: 'name', pinned: 'left' }] };
    render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={reordered}
      />,
    );
    expect(warn.mock.calls.some(([message]) => String(message).includes('initialState の columns'))).toBe(true);
  });

  // 修正(段階 2 の見直し): serverSide で相対日付のプリセット(今月など)を initialState に入れても、最初のブロックを 1 回だけ取る
  //   (これまでは最初の query のキーに相対日付の範囲が入らず、debounce の後にキャッシュを捨てて取り直していた)。
  // 1.0.1 のレビュー RA-5: クライアントで解けないプリセット(サーバーだけが解く ID)では、見張りを始めて基準日が入ったときに
  //   キーが変わり、最初のブロックを取り直していた。
  it.each(['thisMonth', 'serverOnlyPreset'])(
    'serverSide: 相対日付のプリセットの initialState でも最初のブロックは 1 回だけ取る(%s)',
    async (preset) => {
      type Dated = { id: number; d: string };
      const calls: ServerSideGetRowsParams[] = [];
      const dataSource: ServerSideDataSource<Dated> = {
        getRows: (params) => {
          calls.push(params);
          return Promise.resolve({ rows: [{ id: 1, d: '2026-11-08' }], totalRowCount: 1 });
        },
      };
      render(
        <SpreadsheetGrid<Dated>
          rows={[]}
          columns={[{ key: 'd', title: '日付', width: 120, filterType: 'dateSet' }]}
          rowKeyGetter={(row) => row.id}
          height={300}
          dataSource={dataSource}
          initialState={{
            filters: { columnFilters: { d: { kind: 'dateSet', condition: { mode: 'preset', preset }, set: null } } },
          }}
        />,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
      });
      expect(calls.filter((call) => call.startIndex === 0)).toHaveLength(1);
    },
  );
});