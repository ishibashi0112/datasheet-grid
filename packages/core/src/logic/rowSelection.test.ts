import { describe, it, expect } from 'vitest';

import {
  addRowRange,
  clearRowSelection,
  countSelectedRows,
  countSelectedRowsInOrder,
  createEmptyRowSelection,
  createSelectedRowsInOrderCounter,
  getSelectAllState,
  removeRowKeys,
  resolveIsRowSelected,
  resolveSelectAllState,
  rowSelectionFromModel,
  rowSelectionModelEquals,
  rowSelectionStateEquals,
  rowSelectionToModel,
  selectAllRows,
  selectRowRange,
  selectSingleRow,
  toggleRowKey,
  type RowSelectionState,
} from './rowSelection';

const inc = (...keys: (string | number)[]): RowSelectionState => ({
  mode: 'include',
  keys: new Set(keys),
});
const exc = (...keys: (string | number)[]): RowSelectionState => ({
  mode: 'exclude',
  keys: new Set(keys),
});

describe('resolveIsRowSelected', () => {
  it('include は集合に含まれるものだけ選択', () => {
    const s = inc('a', 'c');
    expect(resolveIsRowSelected(s, 'a')).toBe(true);
    expect(resolveIsRowSelected(s, 'b')).toBe(false);
    expect(resolveIsRowSelected(s, 'c')).toBe(true);
  });

  it('exclude は除外集合以外がすべて選択(全選択の裏返し)', () => {
    const s = exc('b');
    expect(resolveIsRowSelected(s, 'a')).toBe(true);
    expect(resolveIsRowSelected(s, 'b')).toBe(false);
    expect(resolveIsRowSelected(s, 'z')).toBe(true);
  });
});

describe('toggleRowKey', () => {
  it('include: 未選択→選択、選択→未選択(mode 保持・immutable)', () => {
    const s0 = createEmptyRowSelection();
    const s1 = toggleRowKey(s0, 'a');
    expect(resolveIsRowSelected(s1, 'a')).toBe(true);
    expect(s1).not.toBe(s0);
    expect(s0.keys.size).toBe(0);
    const s2 = toggleRowKey(s1, 'a');
    expect(resolveIsRowSelected(s2, 'a')).toBe(false);
  });

  it('exclude: トグルは除外集合を加減する(選択→非選択)', () => {
    const s = exc();
    expect(resolveIsRowSelected(s, 'a')).toBe(true);
    const s1 = toggleRowKey(s, 'a');
    expect(s1.mode).toBe('exclude');
    expect(resolveIsRowSelected(s1, 'a')).toBe(false);
  });
});

describe('selectSingleRow / selectRowRange', () => {
  it('single はその行だけを include 選択', () => {
    const s = selectSingleRow('x');
    expect(s.mode).toBe('include');
    expect(Array.from(s.keys)).toEqual(['x']);
  });

  it('range は指定範囲キーで置換(base は温存しない)', () => {
    const s = selectRowRange(['a', 'b', 'c']);
    expect(s.mode).toBe('include');
    expect(s.keys.size).toBe(3);
    expect(resolveIsRowSelected(s, 'b')).toBe(true);
  });
});

describe('addRowRange', () => {
  it('include: base に範囲を和集合で追加', () => {
    const s = addRowRange(inc('a'), ['b', 'c']);
    expect(s.mode).toBe('include');
    expect(Array.from(s.keys).sort()).toEqual(['a', 'b', 'c']);
  });

  it('exclude: 範囲を除外集合から外す(=選択へ含める)', () => {
    const s = addRowRange(exc('a', 'b', 'c'), ['b']);
    expect(s.mode).toBe('exclude');
    expect(resolveIsRowSelected(s, 'b')).toBe(true);
    expect(resolveIsRowSelected(s, 'a')).toBe(false);
  });
});

describe('selectAllRows / clearRowSelection', () => {
  it('全選択は exclude・除外集合空(キーを列挙しない)', () => {
    const s = selectAllRows();
    expect(s.mode).toBe('exclude');
    expect(s.keys.size).toBe(0);
    expect(resolveIsRowSelected(s, 'anything')).toBe(true);
  });

  it('全解除は空の include', () => {
    const s = clearRowSelection();
    expect(s.mode).toBe('include');
    expect(s.keys.size).toBe(0);
  });
});

describe('countSelectedRows', () => {
  it('include は集合サイズ', () => {
    expect(countSelectedRows(inc('a', 'b'), 100)).toBe(2);
  });

  it('exclude は total − 除外数(大規模でも一定コスト)', () => {
    expect(countSelectedRows(exc('a', 'b'), 1_000_000)).toBe(999_998);
    expect(countSelectedRows(selectAllRows(), 1_000_000)).toBe(1_000_000);
  });

  it('exclude で除外が total を超えても負にならない', () => {
    expect(countSelectedRows(exc('a', 'b', 'c'), 2)).toBe(0);
  });
});

describe('getSelectAllState', () => {
  it('none / some / all を件数で判定', () => {
    expect(getSelectAllState(createEmptyRowSelection(), 10)).toBe('none');
    expect(getSelectAllState(inc('a'), 10)).toBe('some');
    expect(getSelectAllState(inc('a', 'b', 'c'), 3)).toBe('all');
    expect(getSelectAllState(selectAllRows(), 10)).toBe('all');
    expect(getSelectAllState(exc('a'), 10)).toBe('some');
  });

  it('total 0 のとき選択なしは none', () => {
    expect(getSelectAllState(createEmptyRowSelection(), 0)).toBe('none');
  });
});

describe('model 変換 / 等価判定', () => {
  it('toModel / fromModel は往復で等価', () => {
    const s = inc('a', 'b', 'c');
    const round = rowSelectionFromModel(rowSelectionToModel(s));
    expect(rowSelectionStateEquals(s, round)).toBe(true);
  });

  it('exclude も往復で保持', () => {
    const s = exc('x');
    const model = rowSelectionToModel(s);
    expect(model.type).toBe('exclude');
    expect(rowSelectionStateEquals(rowSelectionFromModel(model), s)).toBe(true);
  });

  it('stateEquals は順不同で比較', () => {
    expect(rowSelectionStateEquals(inc('a', 'b'), inc('b', 'a'))).toBe(true);
    expect(rowSelectionStateEquals(inc('a'), inc('a', 'b'))).toBe(false);
    expect(rowSelectionStateEquals(inc('a'), exc('a'))).toBe(false);
  });

  it('modelEquals は順不同で比較', () => {
    expect(
      rowSelectionModelEquals(
        { type: 'include', rowKeys: [1, 2, 3] },
        { type: 'include', rowKeys: [3, 2, 1] },
      ),
    ).toBe(true);
    expect(
      rowSelectionModelEquals(
        { type: 'include', rowKeys: [1] },
        { type: 'exclude', rowKeys: [1] },
      ),
    ).toBe(false);
  });
});

describe('フィルター中の全選択の部品(1.0.1 / AP-03)', () => {
  it('removeRowKeys: include は集合から外し、exclude は除外集合へ足す', () => {
    const include = rowSelectionFromModel({ type: 'include', rowKeys: [1, 2, 3] });
    expect(rowSelectionToModel(removeRowKeys(include, [2, 9]))).toEqual({ type: 'include', rowKeys: [1, 3] });
    const exclude = selectAllRows();
    expect(rowSelectionToModel(removeRowKeys(exclude, [2]))).toEqual({ type: 'exclude', rowKeys: [2] });
  });

  it('countSelectedRowsInOrder / resolveSelectAllState: order の行だけで数える', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const order = Int32Array.from([1, 3]);
    const keyOf = (row: { id: number }) => row.id;
    const state = rowSelectionFromModel({ type: 'include', rowKeys: [1, 2] });
    expect(countSelectedRowsInOrder(state, rows, order, keyOf)).toBe(1);
    expect(resolveSelectAllState(1, 2)).toBe('some');
    expect(countSelectedRowsInOrder(selectAllRows(), rows, order, keyOf)).toBe(2);
    expect(resolveSelectAllState(2, 2)).toBe('all');
    expect(resolveSelectAllState(0, 2)).toBe('none');
    expect(resolveSelectAllState(0, 0)).toBe('none');
  });

  // 1.0.1 のレビュー RA-7: インラインの rowKeyGetter で、描くたびに見えている行の数だけ数えていた。
  it('createSelectedRowsInOrderCounter: 選択・行・並びが同じ間は rowKeyGetter の参照が変わっても数え直さない', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const order = Int32Array.from([1, 3]);
    const state = rowSelectionFromModel({ type: 'include', rowKeys: [2, 4] });
    const count = createSelectedRowsInOrderCounter();
    let reads = 0;
    const inlineGetter = () => (row: { id: number }) => ((reads += 1), row.id);
    expect(count(state, rows, order, inlineGetter())).toBe(2);
    expect(reads).toBe(2);
    expect(count(state, rows, order, inlineGetter())).toBe(2);
    expect(reads).toBe(2);
    // 選択・並び・行が変われば数え直す。
    expect(count(rowSelectionFromModel({ type: 'include', rowKeys: [2] }), rows, order, inlineGetter())).toBe(1);
    expect(count(state, rows, Int32Array.from([0, 1]), inlineGetter())).toBe(1);
    expect(count(state, [...rows], Int32Array.from([0, 1]), inlineGetter())).toBe(1);
    expect(reads).toBe(8);
  });
});