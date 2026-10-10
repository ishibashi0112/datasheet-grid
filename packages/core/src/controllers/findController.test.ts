// 追加(F-2 / セル内検索): findController のテストです(走査は時間分割なので await で流す)。
import { describe, expect, it, vi } from 'vitest';
import { createFindController } from './findController';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; name: string; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 120 },
  { key: 'qty', title: 'Qty', width: 80, valueFormatter: ({ value }) => `${value}個` },
];
const makeRowModel = (rows: Row[]): RowModel<Row> => ({
  getRow: (i) => rows[i],
  getRowCount: () => rows.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
});
const rows: Row[] = [
  { id: 1, name: 'Alpha', qty: 10 },
  { id: 2, name: 'beta alpha', qty: 2 },
  { id: 3, name: 'gamma', qty: 100 },
];
const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

describe('findController', () => {
  it('open(query) で走査し、ヒット(大文字小文字を無視・複数列・1 セル複数)をカレント先頭で onNavigate する', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    const onChange = vi.fn();
    controller.update({ enabled: true, rowModel: makeRowModel(rows), columns, caseSensitive: false, onNavigate, onChange });
    controller.open('alpha');
    expect(controller.getSnapshot().open).toBe(true);
    await flush();
    const s = controller.getSnapshot();
    expect(s.matches.map((m) => [m.rowIndex, m.colIndex, m.start])).toEqual([
      [0, 0, 0],
      [1, 0, 5],
    ]);
    expect(s.currentIndex).toBe(0);
    expect(s.index.get(1)?.get(0)?.[0]).toEqual({ start: 5, length: 5, matchIndex: 1 });
    expect(onNavigate).toHaveBeenLastCalledWith(0, 0);
    expect(onChange).toHaveBeenLastCalledWith({ query: 'alpha', matchCount: 2, currentIndex: 0, open: true });
    // 順送り(循環)。
    controller.next();
    expect(controller.getSnapshot().currentIndex).toBe(1);
    expect(onNavigate).toHaveBeenLastCalledWith(1, 0);
    controller.next();
    expect(controller.getSnapshot().currentIndex).toBe(0);
    controller.prev();
    expect(controller.getSnapshot().currentIndex).toBe(1);
    // 整形後の文字列(「10個」)にヒットする。
    controller.setQuery('0個');
    await flush();
    expect(controller.getSnapshot().matches.map((m) => [m.rowIndex, m.colIndex])).toEqual([
      [0, 1],
      [2, 1],
    ]);
    // close でクエリと結果が消える。
    controller.close();
    expect(controller.getSnapshot()).toMatchObject({ open: false, query: '', matches: [], currentIndex: null });
    expect(onChange).toHaveBeenLastCalledWith({ query: '', matchCount: 0, currentIndex: null, open: false });
    controller.dispose();
  });

  it('rowModel の差し替えで再走査し、同じヒットがあればカレントを保つ(移動はしない)。大文字小文字区別も反映', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    const base = { enabled: true, columns, caseSensitive: false, onNavigate };
    controller.update({ ...base, rowModel: makeRowModel(rows) });
    controller.open('alpha');
    await flush();
    controller.next();
    expect(controller.getSnapshot().currentIndex).toBe(1);
    onNavigate.mockClear();
    // 行 0 を編集(Alpha → Zeta): ヒットは行 1 だけになり、カレントは同じヒット(行 1)を保つ。
    const edited = [{ ...rows[0], name: 'Zeta' }, rows[1], rows[2]];
    controller.update({ ...base, rowModel: makeRowModel(edited) });
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([1]);
    expect(controller.getSnapshot().currentIndex).toBe(0);
    expect(onNavigate).not.toHaveBeenCalled();
    // 大文字小文字を区別すると 'alpha' は行 1 だけ(Alpha は外れる)。
    controller.update({ ...base, rowModel: makeRowModel(rows), caseSensitive: true });
    await flush();
    expect(controller.getSnapshot().matches.map((m) => m.rowIndex)).toEqual([1]);
    controller.dispose();
  });

  it('enabled=false では開かず、開いている最中に無効化されると閉じる。未ロード行(undefined)は読み飛ばす', async () => {
    const controller = createFindController<Row>();
    const onNavigate = vi.fn();
    controller.update({ enabled: false, rowModel: makeRowModel(rows), columns, caseSensitive: false, onNavigate });
    controller.open('a');
    expect(controller.getSnapshot().open).toBe(false);
    // 未ロード行は「型は T のまま実行時 undefined」の契約(SSRM / グループ行と同じ)。
    const sparse: RowModel<Row> = { ...makeRowModel(rows), getRow: (i) => (i === 1 ? undefined : rows[i]) as Row };
    controller.update({ enabled: true, rowModel: sparse, columns, caseSensitive: false, onNavigate });
    controller.open('a');
    await flush();
    // 'Alpha' / 'gamma' はそれぞれ 2 箇所ヒット(行 1 は読み飛ばし)。
    expect([...new Set(controller.getSnapshot().matches.map((m) => m.rowIndex))]).toEqual([0, 2]);
    controller.update({ enabled: false, rowModel: sparse, columns, caseSensitive: false, onNavigate });
    expect(controller.getSnapshot().open).toBe(false);
    controller.dispose();
  });
});
