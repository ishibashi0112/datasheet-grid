// 追加(本体分解 E-6a): 外部通知の配線(ホバー行 / 展開行キー集合 / onStateChange)の単体テストです。
import { describe, it, expect, vi } from 'vitest';
import { createDetailKeysNotifier, createHoverRowNotifier, createStateChangeNotifier } from './notifiers';
import type { GridColumn } from '../model/gridTypes.unbound';

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
});