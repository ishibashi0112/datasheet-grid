// 追加(G-2): IME オンのままの直接入力の判定(canStartImeEdit)と、入力受けをグリッド本体として扱うガード
//   (domGuards の isImeInputTarget / shouldIgnoreGridKeydown)の契約テストです。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { GridColumn, GridGroupRow, GridLabelRow, RowModel } from '../model/gridTypes.unbound';
import { canStartImeEdit } from './imeInput';
import { IME_INPUT_ATTRIBUTE, isImeInputTarget, shouldIgnoreGridKeydown } from './domGuards';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from './rowReorder';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 1 },
  { id: 2, name: 'beta', qty: 2 },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 100 },
  { key: 'memo', title: 'メモ', width: 100, editor: { type: 'text' } },
  { key: 'qty', title: '数量', width: 80, editor: { type: 'number' } },
  { key: 'locked', title: '固定', width: 80, readOnly: true },
  { key: ROW_DRAG_HANDLE_COLUMN_KEY, title: '', width: 28 },
];

const makeModel = (extra: Partial<RowModel<Row>> = {}): RowModel<Row> => ({
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id,
  ...extra,
});

const ctx = (extra: Partial<Parameters<typeof canStartImeEdit<Row>>[0]> = {}) => ({
  rowModel: makeModel(),
  columns,
  readOnly: false,
  canEditCell: undefined,
  ...extra,
});

describe('canStartImeEdit', () => {
  it('text エディタ(未指定 / type text)の編集可能なデータセルだけ true', () => {
    expect(canStartImeEdit(ctx(), { row: 0, col: 0 })).toBe(true);
    expect(canStartImeEdit(ctx(), { row: 1, col: 1 })).toBe(true);
  });

  it('text 以外のエディタ / 読み取り専用 / 合成列 / 範囲外は false', () => {
    expect(canStartImeEdit(ctx(), { row: 0, col: 2 })).toBe(false);
    expect(canStartImeEdit(ctx(), { row: 0, col: 3 })).toBe(false);
    expect(canStartImeEdit(ctx(), { row: 0, col: 4 })).toBe(false);
    expect(canStartImeEdit(ctx(), { row: 2, col: 0 })).toBe(false);
    expect(canStartImeEdit(ctx(), { row: 0, col: 9 })).toBe(false);
    expect(canStartImeEdit(ctx({ readOnly: true }), { row: 0, col: 0 })).toBe(false);
    expect(canStartImeEdit(ctx({ canEditCell: (rowIndex) => rowIndex !== 1 }), { row: 1, col: 0 })).toBe(false);
  });

  it('グループ行 / ラベル行 / 未ロード行は false', () => {
    const group = makeModel({ getGroupRow: (i) => (i === 0 ? ({ groupKey: 'g' } as unknown as GridGroupRow) : undefined) });
    expect(canStartImeEdit(ctx({ rowModel: group }), { row: 0, col: 0 })).toBe(false);
    const label = makeModel({ getLabelRow: (i) => (i === 1 ? ({ kind: 'label' } as unknown as GridLabelRow<Row>) : undefined) });
    expect(canStartImeEdit(ctx({ rowModel: label }), { row: 1, col: 0 })).toBe(false);
    const unloaded = makeModel({ getRow: () => undefined as unknown as Row });
    expect(canStartImeEdit(ctx({ rowModel: unloaded }), { row: 0, col: 0 })).toBe(false);
  });
});

describe('入力受けのガード(domGuards)', () => {
  it('入力受けは input でもグリッド本体として扱う(キー操作 / 貼り付けを無視しない)', () => {
    const sink = document.createElement('input');
    sink.setAttribute(IME_INPUT_ATTRIBUTE, '');
    const editor = document.createElement('input');
    expect(isImeInputTarget(sink)).toBe(true);
    expect(isImeInputTarget(editor)).toBe(false);
    expect(isImeInputTarget(null)).toBe(false);
    expect(shouldIgnoreGridKeydown(sink)).toBe(false);
    expect(shouldIgnoreGridKeydown(editor)).toBe(true);
  });
});