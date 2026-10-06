// 追加(本体分解 E-6a): 外部通知の配線(ホバー行 / 展開行キー集合 / onStateChange)の単体テストです。
// 追加(G-1): セル操作の通知(クリック / ダブルクリック / アクティブセル)も検証します。
import { describe, it, expect, vi } from 'vitest';
import {
  createActiveCellNotifier,
  createCellEventNotifier,
  createDetailKeysNotifier,
  createHoverRowNotifier,
  createStateChangeNotifier,
} from './notifiers';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';

describe('createHoverRowNotifier', () => {
  it('同値は抑止し、変化時だけ内部 state 更新 + 通知。controlled では state を更新しない。無効時は何もしない', () => {
    const notifier = createHoverRowNotifier();
    const setHoveredRowIndex = vi.fn();
    const onHoveredRowChange = vi.fn();
    notifier.update({ enableRowHover: true, isHoverControlled: false, onHoveredRowChange, setHoveredRowIndex });
    notifier.applyHoveredRowChange(3);
    notifier.applyHoveredRowChange(3);
    expect(setHoveredRowIndex).toHaveBeenCalledTimes(1);
    expect(onHoveredRowChange).toHaveBeenCalledWith(3, { source: 'pointer' });
    // 関数形(useState 互換)。
    notifier.applyHoveredRowChange((current) => (current === 3 ? null : current));
    expect(setHoveredRowIndex).toHaveBeenLastCalledWith(null);

    notifier.update({ enableRowHover: true, isHoverControlled: true, onHoveredRowChange, setHoveredRowIndex });
    notifier.applyHoveredRowChange(5);
    expect(setHoveredRowIndex).toHaveBeenCalledTimes(2);
    expect(onHoveredRowChange).toHaveBeenLastCalledWith(5, { source: 'pointer' });

    notifier.update({ enableRowHover: false, isHoverControlled: false, onHoveredRowChange, setHoveredRowIndex });
    notifier.applyHoveredRowChange(7);
    expect(onHoveredRowChange).toHaveBeenCalledTimes(3);
  });
});

describe('createDetailKeysNotifier', () => {
  it('初回は通知せず、集合の参照が変わったときだけ配列で通知する(コールバック差し替えでは通知しない)', () => {
    const notifier = createDetailKeysNotifier();
    const first = vi.fn();
    const empty = new Set<number>();
    notifier.update({ expandedKeys: empty, onChange: first });
    expect(first).not.toHaveBeenCalled();
    notifier.update({ expandedKeys: empty, onChange: vi.fn() });
    expect(first).not.toHaveBeenCalled();
    const second = vi.fn();
    notifier.update({ expandedKeys: new Set([2, 5]), onChange: second });
    expect(second).toHaveBeenCalledWith([2, 5]);
  });
});

describe('createStateChangeNotifier', () => {
  type Row = { a: number };
  const columns: GridColumn<Row>[] = [{ key: 'a', title: 'A', width: 100 }];
  const base = {
    columnWidths: {},
    filters: { globalText: '', columnFilters: {} },
    sort: [],
    dragState: null,
    columns,
  };

  it('初回は baseline 記録のみ、変化時に通知、ドラッグ中は保留して確定後にまとめて通知、同値は非発火', () => {
    const notifier = createStateChangeNotifier<Row>();
    const onStateChange = vi.fn();
    notifier.update({ ...base, onStateChange });
    expect(onStateChange).not.toHaveBeenCalled();
    // 幅変更(ドラッグ中)→ 保留。
    notifier.update({ ...base, columnWidths: { a: 150 }, dragState: { type: 'columnResize' } as never, onStateChange });
    expect(onStateChange).not.toHaveBeenCalled();
    // 確定(dragState → null)で通知。
    notifier.update({ ...base, columnWidths: { a: 150 }, onStateChange });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0][0].columnWidths).toEqual({ a: 150 });
    // 同値の新参照(列メタ同値)は非発火。
    notifier.update({ ...base, columnWidths: { a: 150 }, columns: [{ ...columns[0] }], onStateChange });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    // 監視対象が不変なら(コールバックだけ差し替え)何もしない。
    const another = vi.fn();
    notifier.update({ ...base, columnWidths: { a: 150 }, columns: [{ ...columns[0] }], onStateChange: another });
    expect(another).not.toHaveBeenCalled();
  });

  it('onStateChange 未指定の間は snapshot を作らず、後から付いた初回は baseline 記録(非発火)', () => {
    const notifier = createStateChangeNotifier<Row>();
    notifier.update({ ...base, onStateChange: undefined });
    const onStateChange = vi.fn();
    notifier.update({ ...base, columnWidths: { a: 120 }, onStateChange });
    expect(onStateChange).not.toHaveBeenCalled();
    notifier.update({ ...base, columnWidths: { a: 130 }, onStateChange });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  // 追加(change-callbacks): スライス単位の通知は「そのスライスが実際に変化したとき」だけ、複製を渡して発火します。
  it('onFiltersChange / onSortChange は初回非発火、該当スライスの構造変化でだけ発火し、複製を渡す', () => {
    const notifier = createStateChangeNotifier<Row>();
    const onFiltersChange = vi.fn();
    const onSortChange = vi.fn();
    const callbacks = { onStateChange: undefined, onFiltersChange, onSortChange };
    notifier.update({ ...base, ...callbacks });
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    // 列幅だけの変化では発火しない。
    notifier.update({ ...base, ...callbacks, columnWidths: { a: 150 } });
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    // フィルター変化 → onFiltersChange のみ。
    const filters = { globalText: '', columnFilters: { a: { kind: 'text' as const, value: 'x' } } };
    notifier.update({ ...base, ...callbacks, columnWidths: { a: 150 }, filters });
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange.mock.calls[0][0]).toEqual(filters);
    expect(onFiltersChange.mock.calls[0][0]).not.toBe(filters);
    expect(onSortChange).not.toHaveBeenCalled();
    // 同値の新参照では発火しない。
    notifier.update({ ...base, ...callbacks, columnWidths: { a: 150 }, filters: { ...filters } });
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    // ソート変化 → onSortChange のみ(ドラッグ中でも保留しない)。
    const sort = [{ columnKey: 'a', direction: 'desc' as const }];
    notifier.update({
      ...base,
      ...callbacks,
      columnWidths: { a: 150 },
      filters,
      sort,
      dragState: { type: 'columnResize' } as never,
    });
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange.mock.calls[0][0]).toEqual(sort);
    expect(onSortChange.mock.calls[0][0]).not.toBe(sort);
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
  });
});

describe('セル操作の通知(G-1)', () => {
  type Row = { id: string; name: string };
  const rows: Row[] = [
    { id: 'a', name: 'alpha' },
    { id: 'b', name: 'beta' },
  ];
  const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 100 }];
  const makeModel = (order: number[]): RowModel<Row> => ({
    getRowCount: () => order.length,
    getRow: (i) => rows[order[i]],
    getSourceIndex: (i) => order[i],
    getRowKey: (i) => rows[order[i]]?.id,
  });

  describe('createCellEventNotifier', () => {
    it('クリックをセル参照 + event で通知する。対象外のセル / コールバック未指定では何もしない', () => {
      const notifier = createCellEventNotifier<Row>();
      // node 環境のため DOM の MouseEvent は構造だけのダミーで代用します(通知は素通しするだけ)。
      const event = { type: 'click', ctrlKey: true } as unknown as MouseEvent;
      // update 前 / 未指定でも落ちない。
      notifier.handleCellClick({ row: 0, col: 0 }, event);
      const rowModel = makeModel([1, 0]);
      notifier.update({ rowModel, orderedColumns: columns, onCellClick: undefined, onCellDoubleClick: undefined });
      notifier.handleCellClick({ row: 0, col: 0 }, event);

      const onCellClick = vi.fn();
      notifier.update({ rowModel, orderedColumns: columns, onCellClick, onCellDoubleClick: undefined });
      notifier.handleCellClick({ row: 0, col: 0 }, event);
      expect(onCellClick).toHaveBeenCalledTimes(1);
      expect(onCellClick).toHaveBeenCalledWith(
        expect.objectContaining({ row: rows[1], rowKey: 'b', rowIndex: 0, sourceRowIndex: 1, columnKey: 'name', event }),
      );
      notifier.handleCellClick({ row: 5, col: 0 }, event);
      expect(onCellClick).toHaveBeenCalledTimes(1);
    });

    it('ダブルクリックは preventDefault() されたときだけ true を返す', () => {
      const notifier = createCellEventNotifier<Row>();
      const event = { type: 'dblclick' } as unknown as MouseEvent;
      const rowModel = makeModel([0, 1]);
      notifier.update({ rowModel, orderedColumns: columns, onCellClick: undefined, onCellDoubleClick: undefined });
      expect(notifier.notifyCellDoubleClick({ row: 0, col: 0 }, event)).toBe(false);

      const observe = vi.fn();
      notifier.update({ rowModel, orderedColumns: columns, onCellClick: undefined, onCellDoubleClick: observe });
      expect(notifier.notifyCellDoubleClick({ row: 1, col: 0 }, event)).toBe(false);
      expect(observe).toHaveBeenCalledWith(expect.objectContaining({ rowKey: 'b', event }));

      notifier.update({
        rowModel,
        orderedColumns: columns,
        onCellClick: undefined,
        onCellDoubleClick: (params) => params.preventDefault(),
      });
      expect(notifier.notifyCellDoubleClick({ row: 1, col: 0 }, event)).toBe(true);
      // 対象外のセルでは呼ばず、既定の動作も止めない。
      expect(notifier.notifyCellDoubleClick({ row: 9, col: 0 }, event)).toBe(false);
    });
  });

  describe('createActiveCellNotifier', () => {
    it('初回は通知せず、別のセルになったときだけ通知する(同じセルへの再設定 / 入力の参照不変では呼ばない)', () => {
      const notifier = createActiveCellNotifier<Row>();
      const onActiveCellChange = vi.fn();
      const rowModel = makeModel([0, 1]);
      notifier.update({ activeCell: { row: 0, col: 0 }, rowModel, orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).not.toHaveBeenCalled();

      notifier.update({ activeCell: { row: 1, col: 0 }, rowModel, orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ row: rows[1], rowKey: 'b', rowIndex: 1, columnKey: 'name' }),
      );
      // 同じ座標の新しいオブジェクト(同じセルへの再設定)では呼ばない。
      notifier.update({ activeCell: { row: 1, col: 0 }, rowModel, orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenCalledTimes(1);

      notifier.update({ activeCell: null, rowModel, orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenLastCalledWith(null);
      expect(onActiveCellChange).toHaveBeenCalledTimes(2);
    });

    it('座標が同じでも行が入れ替わったら通知し、データセル以外へ移ったら null を通知する', () => {
      const notifier = createActiveCellNotifier<Row>();
      const onActiveCellChange = vi.fn();
      const activeCell = { row: 0, col: 0 };
      notifier.update({ activeCell, rowModel: makeModel([0, 1]), orderedColumns: columns, onActiveCellChange });
      notifier.update({ activeCell, rowModel: makeModel([1, 0]), orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenLastCalledWith(expect.objectContaining({ rowKey: 'b' }));
      // 行の並びは変わらない新しい rowModel(rows の中身だけ変わった等)では呼ばない。
      notifier.update({ activeCell, rowModel: makeModel([1, 0]), orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenCalledTimes(1);
      // 範囲外(行数の減少前の一瞬など)= データセル以外。
      notifier.update({ activeCell: { row: 5, col: 0 }, rowModel: makeModel([1, 0]), orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenLastCalledWith(null);
    });

    it('コールバック未指定のあいだも追跡し、後から付いても過去の変化は通知しない', () => {
      const notifier = createActiveCellNotifier<Row>();
      const rowModel = makeModel([0, 1]);
      notifier.update({ activeCell: null, rowModel, orderedColumns: columns, onActiveCellChange: undefined });
      notifier.update({ activeCell: { row: 1, col: 0 }, rowModel, orderedColumns: columns, onActiveCellChange: undefined });
      const onActiveCellChange = vi.fn();
      notifier.update({ activeCell: { row: 1, col: 0 }, rowModel, orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).not.toHaveBeenCalled();
      notifier.update({ activeCell: { row: 0, col: 0 }, rowModel, orderedColumns: columns, onActiveCellChange });
      expect(onActiveCellChange).toHaveBeenCalledWith(expect.objectContaining({ rowKey: 'a' }));
    });
  });
});