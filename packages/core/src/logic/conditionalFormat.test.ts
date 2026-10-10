// 追加(F-3 / 条件付き書式): logic/conditionalFormat のテストです(集計のメモ化 / データバーの軸 / カラースケールの
//   color-mix 式 / チップの正規化)。
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CONDITIONAL_FORMAT_STATS,
  collectConditionalFormatStats,
  createConditionalFormatStatsResolver,
  resolveChipSpec,
  resolveChipTone,
  resolveColorScaleBackground,
  resolveDataBar,
} from './conditionalFormat';
import type { CellStyleContext, GridColumn, RowModel } from '../model/gridTypes.unbound';

type Row = { id: number; qty: number | null; delta: number; status: string };
const rows: Row[] = [
  { id: 1, qty: 10, delta: -30, status: 'ok' },
  { id: 2, qty: null, delta: 0, status: 'warn' },
  { id: 3, qty: 50, delta: 15, status: 'ng' },
  { id: 4, qty: 20, delta: 30, status: 'other' },
];
const makeRowModel = (data: Row[]): RowModel<Row> => ({
  getRow: (i) => data[i],
  getRowCount: () => data.length,
  getSourceIndex: (i) => i,
  getRowKey: (i) => data[i]?.id ?? i,
});
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60 },
  { key: 'qty', title: 'Qty', width: 80, conditionalFormat: { dataBar: {} } },
  { key: 'delta', title: 'Delta', width: 80, conditionalFormat: { colorScale: { type: 'diverging' } } },
  { key: 'status', title: 'Status', width: 80, conditionalFormat: { chips: { ok: 'good', warn: 'warning', ng: { tone: 'critical', label: 'NG' } } } },
];

describe('collectConditionalFormatStats / createConditionalFormatStatsResolver', () => {
  it('dataBar / colorScale で min / max を省略した列だけ集計し、数値以外(null)は読み飛ばす', () => {
    const stats = collectConditionalFormatStats(makeRowModel(rows), columns);
    expect([...stats.keys()]).toEqual(['qty', 'delta']);
    expect(stats.get('qty')).toEqual({ min: 10, max: 50 });
    expect(stats.get('delta')).toEqual({ min: -30, max: 30 });
    // min / max を明示した列や conditionalFormat のない列は集計しない(空 Map は共有定数)。
    const fixed: GridColumn<Row>[] = [{ key: 'qty', title: 'Qty', width: 80, conditionalFormat: { dataBar: { min: 0, max: 100 } } }];
    expect(collectConditionalFormatStats(makeRowModel(rows), fixed)).toBe(EMPTY_CONDITIONAL_FORMAT_STATS);
  });

  it('リゾルバは入力の参照が同じなら再集計せず、内容が同じなら前回の Map の参照を返す', () => {
    const resolve = createConditionalFormatStatsResolver<Row>();
    const model = makeRowModel(rows);
    const first = resolve(model, columns);
    expect(resolve(model, columns)).toBe(first);
    // 行 2 の qty を編集(min / max は不変)→ 同じ参照。
    const edited = rows.map((r) => (r.id === 2 ? { ...r, qty: 30 } : r));
    expect(resolve(makeRowModel(edited), columns)).toBe(first);
    // max が変わる編集 → 新しい Map。
    const grown = rows.map((r) => (r.id === 3 ? { ...r, qty: 80 } : r));
    const third = resolve(makeRowModel(grown), columns);
    expect(third).not.toBe(first);
    expect(third.get('qty')).toEqual({ min: 10, max: 80 });
  });
});

describe('resolveDataBar', () => {
  it('正だけの列は左端から、負を含む列は 0 の軸から伸びる', () => {
    expect(resolveDataBar({}, 25, { min: 0, max: 100 })).toEqual({ start: 0, end: 25, negative: false });
    expect(resolveDataBar({}, 10, { min: 10, max: 50 })).toBeNull(); // 最小値は幅 0 = 帯なし
    expect(resolveDataBar({}, 50, { min: 10, max: 50 })).toEqual({ start: 0, end: 100, negative: false });
    // -30..30: 軸は 50%。+15 は 50〜75、-30 は 0〜50(負の色)。
    expect(resolveDataBar({}, 15, { min: -30, max: 30 })).toEqual({ start: 50, end: 75, negative: false });
    expect(resolveDataBar({}, -30, { min: -30, max: 30 })).toEqual({ start: 0, end: 50, negative: true });
    // 負だけの列は右端が軸。
    expect(resolveDataBar({}, -20, { min: -40, max: -10 })).toEqual({ start: 66.67, end: 100, negative: true });
    expect(resolveDataBar({}, -40, { min: -40, max: -10 })).toEqual({ start: 0, end: 100, negative: true });
  });

  it('明示の min / max が集計より優先され、範囲外はクランプ。数値以外・範囲不明は null', () => {
    expect(resolveDataBar({ min: 0, max: 10 }, 25, { min: 0, max: 100 })).toEqual({ start: 0, end: 100, negative: false });
    expect(resolveDataBar({ max: 100 }, 25, undefined)).toBeNull();
    expect(resolveDataBar({ min: 0, max: 100 }, 'x', undefined)).toBeNull();
    expect(resolveDataBar({ min: 0, max: 100 }, null, undefined)).toBeNull();
    // 全行が同じ値: 0 以外は帯いっぱい。
    expect(resolveDataBar({}, 7, { min: 7, max: 7 })).toEqual({ start: 0, end: 100, negative: false });
    expect(resolveDataBar({}, 0, { min: 0, max: 0 })).toBeNull();
  });
});

describe('resolveColorScaleBackground', () => {
  it('sequential は淡 → 濃を 0〜100% で混ぜる(既定はトークン、colors で差し替え)', () => {
    expect(resolveColorScaleBackground({}, 50, { min: 0, max: 100 })).toBe(
      'color-mix(in srgb, var(--ssg-cf-seq-max) 50%, var(--ssg-cf-seq-min))',
    );
    expect(resolveColorScaleBackground({ colors: ['#fff', '#f00'] }, 100, { min: 0, max: 100 })).toBe(
      'color-mix(in srgb, #f00 100%, #fff)',
    );
    expect(resolveColorScaleBackground({}, 'x', { min: 0, max: 100 })).toBeNull();
  });

  it('diverging は mid を中立色に、負側 / 正側を 12〜60% で混ぜる(mid 省略時は 0 を含めば 0)', () => {
    const stats = { min: -30, max: 30 };
    expect(resolveColorScaleBackground({ type: 'diverging' }, 0, stats)).toBe('var(--ssg-cf-div-mid)');
    expect(resolveColorScaleBackground({ type: 'diverging' }, 30, stats)).toBe(
      'color-mix(in srgb, var(--ssg-cf-div-positive) 60%, var(--ssg-cf-div-mid))',
    );
    expect(resolveColorScaleBackground({ type: 'diverging' }, -15, stats)).toBe(
      'color-mix(in srgb, var(--ssg-cf-div-negative) 36%, var(--ssg-cf-div-mid))',
    );
    // 0 を含まない範囲は中央が mid。
    expect(resolveColorScaleBackground({ type: 'diverging' }, 50, { min: 0, max: 100 })).toBe('var(--ssg-cf-div-mid)');
    expect(resolveColorScaleBackground({ type: 'diverging', mid: 80 }, 80, { min: 0, max: 100 })).toBe('var(--ssg-cf-div-mid)');
  });
});

describe('resolveChipSpec / resolveChipTone', () => {
  const ctx = (value: unknown): CellStyleContext<Row> => ({
    row: rows[0],
    rowIndex: 0,
    sourceRowIndex: 0,
    rowKey: 1,
    colIndex: 3,
    value,
    column: columns[3],
    isActive: false,
    isSelected: false,
    isEditing: false,
    readOnly: false,
  });
  it('マップは String(value) で引き、色味文字列は spec に正規化、載っていない値は null', () => {
    const chips = columns[3].conditionalFormat!.chips!;
    expect(resolveChipSpec(chips, ctx('ok'))).toEqual({ tone: 'good' });
    expect(resolveChipSpec(chips, ctx('ng'))).toEqual({ tone: 'critical', label: 'NG' });
    expect(resolveChipSpec(chips, ctx('other'))).toBeNull();
    expect(resolveChipSpec(chips, ctx(null))).toBeNull();
  });
  it('関数版はコンテキストから返し、不明な色味は neutral に倒す', () => {
    const fn = (c: CellStyleContext<Row>) => (c.row.delta < 0 ? 'critical' : null);
    expect(resolveChipSpec(fn, ctx('x'))).toEqual({ tone: 'critical' });
    expect(resolveChipTone({ tone: 'bogus' as never })).toBe('neutral');
    expect(resolveChipTone({})).toBe('neutral');
  });
});
