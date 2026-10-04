// 追加(監査 RD-5 / M-03): reconcileColumnWidths(columns 変化時の列幅 state 整合)のテストです。
import { describe, expect, it } from 'vitest';
import { reconcileColumnWidths } from './columnWidthState';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { a: string };
const col = (key: string, extra: Partial<GridColumn<Row>> = {}): GridColumn<Row> => ({
  key,
  title: key,
  width: 100,
  ...extra,
});

describe('reconcileColumnWidths', () => {
  it('エントリが無ければ同じ参照を返す', () => {
    const widths = {};
    expect(reconcileColumnWidths(widths, null, [col('a')])).toBe(widths);
  });

  it('同内容・別参照の columns ではエントリを保全し、同じ参照を返す', () => {
    const widths = { a: 250 };
    const prev = [col('a'), col('b')];
    const next = prev.map((c) => ({ ...c }));
    expect(reconcileColumnWidths(widths, prev, next)).toBe(widths);
  });

  it('列が無くなったエントリは捨てる', () => {
    expect(reconcileColumnWidths({ a: 250, b: 80 }, [col('a'), col('b')], [col('a')])).toEqual({ a: 250 });
  });

  it('width がエントリと異なる値に変わったら捨て、同値への書き戻しなら保全する', () => {
    expect(reconcileColumnWidths({ a: 250 }, [col('a')], [col('a', { width: 120 })])).toEqual({});
    expect(reconcileColumnWidths({ a: 250 }, [col('a')], [col('a', { width: 250 })])).toEqual({ a: 250 });
  });

  it('flex 指定 / flex するかどうか(pinned 変化)が変わったら捨てる', () => {
    expect(reconcileColumnWidths({ a: 250 }, [col('a')], [col('a', { flex: 1 })])).toEqual({});
    expect(reconcileColumnWidths({ a: 250 }, [col('a', { flex: 1 })], [col('a', { flex: 2 })])).toEqual({});
    expect(
      reconcileColumnWidths({ a: 250 }, [col('a', { flex: 1 })], [col('a', { flex: 1, pinned: 'left' })]),
    ).toEqual({});
    // flex 列の手動幅は、その列の定義が変わらなければ保全
    expect(reconcileColumnWidths({ a: 250 }, [col('a', { flex: 1 })], [col('a', { flex: 1 })])).toEqual({ a: 250 });
  });

  it('前回 columns が無い(初回)ときは列の存在だけを見る', () => {
    expect(reconcileColumnWidths({ a: 250, z: 10 }, null, [col('a', { width: 50 })])).toEqual({ a: 250 });
  });
});
