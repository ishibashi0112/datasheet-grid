// row-drag batch 1: 行ドラッグ並び替えの純ロジック(配列移動 / スロット解決 / ゲート)の契約テスト。
import { describe, it, expect } from 'vitest';
import {
  isIdentityOrder,
  isRowDragAvailable,
  isRowDragOperable,
  moveArrayItem,
  resolveMoveTargetIndex,
  resolveRowDropSlot,
  resolveRowDropSlotTop,
} from './rowReorder';
import {
  createDetailRowMetrics,
  createUniformRowMetrics,
} from './verticalGeometry';

describe('moveArrayItem', () => {
  const items = ['a', 'b', 'c', 'd', 'e'] as const;

  it('前方の要素を後方へ移動する(from < to)', () => {
    expect(moveArrayItem(items, 1, 3)).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('後方の要素を前方へ移動する(from > to)', () => {
    expect(moveArrayItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c', 'e']);
  });

  it('末尾へ移動できる', () => {
    expect(moveArrayItem(items, 0, 4)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('入力配列を破壊しない', () => {
    const source = ['a', 'b', 'c'];
    const next = moveArrayItem(source, 0, 2);
    expect(source).toEqual(['a', 'b', 'c']);
    expect(next).not.toBe(source);
  });

  it('同一位置 / 範囲外 / 非整数は no-op として同じ参照を返す', () => {
    expect(moveArrayItem(items, 2, 2)).toBe(items);
    expect(moveArrayItem(items, -1, 2)).toBe(items);
    expect(moveArrayItem(items, 2, 5)).toBe(items);
    expect(moveArrayItem(items, 1.5, 2)).toBe(items);
    expect(moveArrayItem([], 0, 0)).toEqual([]);
  });
});

describe('resolveMoveTargetIndex', () => {
  it('掴んだ行の直上 / 直下の境界は no-op(null)', () => {
    expect(resolveMoveTargetIndex(2, 2)).toBeNull();
    expect(resolveMoveTargetIndex(2, 3)).toBeNull();
  });

  it('後方スロットは 1 つ前へ詰める(from を抜いた分)', () => {
    expect(resolveMoveTargetIndex(1, 4)).toBe(3);
    // 末尾スロット(rowCount=5 のとき 5)→ 最終 index 4。
    expect(resolveMoveTargetIndex(1, 5)).toBe(4);
  });

  it('前方スロットはそのまま', () => {
    expect(resolveMoveTargetIndex(4, 0)).toBe(0);
    expect(resolveMoveTargetIndex(4, 2)).toBe(2);
  });

  it('moveArrayItem と組み合わせて表示上の期待どおりになる', () => {
    const items = ['a', 'b', 'c', 'd'];
    // 'a' を 'c' と 'd' の間(slot 3)へ → [b, c, a, d]
    const to = resolveMoveTargetIndex(0, 3);
    expect(to).toBe(2);
    expect(moveArrayItem(items, 0, to as number)).toEqual(['b', 'c', 'a', 'd']);
    // 'd' を先頭(slot 0)へ → [d, a, b, c]
    expect(moveArrayItem(items, 3, resolveMoveTargetIndex(3, 0) as number)).toEqual([
      'd',
      'a',
      'b',
      'c',
    ]);
  });
});

describe('resolveRowDropSlot(uniform)', () => {
  const metrics = createUniformRowMetrics(4, 20); // 行 0..3、各 20px、全高 80

  it('行の上半分はその行の上(= index)、下半分は下(= index + 1)', () => {
    expect(resolveRowDropSlot(0, metrics)).toBe(0);
    expect(resolveRowDropSlot(9, metrics)).toBe(0);
    expect(resolveRowDropSlot(10, metrics)).toBe(1);
    expect(resolveRowDropSlot(29, metrics)).toBe(1);
    expect(resolveRowDropSlot(30, metrics)).toBe(2);
    expect(resolveRowDropSlot(75, metrics)).toBe(4);
  });

  it('全高以上 / 負値は端へ clamp する', () => {
    expect(resolveRowDropSlot(80, metrics)).toBe(4);
    expect(resolveRowDropSlot(500, metrics)).toBe(4);
    expect(resolveRowDropSlot(-30, metrics)).toBe(0);
  });

  it('0 行では常に 0', () => {
    expect(resolveRowDropSlot(10, createUniformRowMetrics(0, 20))).toBe(0);
  });
});

describe('resolveRowDropSlot(展開行あり)', () => {
  // 行 1 の直下に 100px の detail 帯。行 top: 0 / 20 / 140 / 160、全高 180。
  const metrics = createDetailRowMetrics(createUniformRowMetrics(4, 20), [
    { index: 1, height: 100 },
  ]);

  it('detail 帯の上は「マスター行の下」(帯ごと一緒に動く)', () => {
    expect(resolveRowDropSlot(25, metrics)).toBe(1); // 行 1 セル上半分
    expect(resolveRowDropSlot(35, metrics)).toBe(2); // 行 1 セル下半分
    expect(resolveRowDropSlot(60, metrics)).toBe(2); // 帯の途中
    expect(resolveRowDropSlot(139, metrics)).toBe(2); // 帯の末尾
    expect(resolveRowDropSlot(140, metrics)).toBe(2); // 行 2 の上端
    expect(resolveRowDropSlot(150, metrics)).toBe(3);
  });
});

describe('resolveRowDropSlotTop', () => {
  const metrics = createDetailRowMetrics(createUniformRowMetrics(4, 20), [
    { index: 1, height: 100 },
  ]);

  it('スロット = 行 top、末尾スロットは全高', () => {
    expect(resolveRowDropSlotTop(0, metrics)).toBe(0);
    expect(resolveRowDropSlotTop(1, metrics)).toBe(20);
    expect(resolveRowDropSlotTop(2, metrics)).toBe(140);
    expect(resolveRowDropSlotTop(4, metrics)).toBe(180);
    expect(resolveRowDropSlotTop(9, metrics)).toBe(180);
    expect(resolveRowDropSlotTop(-1, metrics)).toBe(0);
  });

  it('0 行では 0', () => {
    expect(resolveRowDropSlotTop(0, createUniformRowMetrics(0, 20))).toBe(0);
  });
});

describe('isIdentityOrder', () => {
  it('恒等順なら true', () => {
    expect(isIdentityOrder(Int32Array.from([0, 1, 2]), 3)).toBe(true);
    expect(isIdentityOrder([], 0)).toBe(true);
  });

  it('並び替え / 行数不一致(フィルター)なら false', () => {
    expect(isIdentityOrder(Int32Array.from([1, 0, 2]), 3)).toBe(false);
    expect(isIdentityOrder(Int32Array.from([0, 2]), 3)).toBe(false);
  });
});

describe('isRowDragAvailable / isRowDragOperable', () => {
  const base = {
    enableRowDrag: true,
    isServerSide: false,
    rowGroupingActive: false,
    hasRowsChange: true,
  };

  it('clientSide + onRowsChange + 非グルーピングでのみ利用可能', () => {
    expect(isRowDragAvailable(base)).toBe(true);
    expect(isRowDragAvailable({ ...base, enableRowDrag: false })).toBe(false);
    expect(isRowDragAvailable({ ...base, isServerSide: true })).toBe(false);
    expect(isRowDragAvailable({ ...base, rowGroupingActive: true })).toBe(false);
    expect(isRowDragAvailable({ ...base, hasRowsChange: false })).toBe(false);
  });

  it('操作可否は利用可能かつ表示順が恒等のとき', () => {
    expect(isRowDragOperable(true, true)).toBe(true);
    expect(isRowDragOperable(true, false)).toBe(false);
    expect(isRowDragOperable(false, true)).toBe(false);
  });
});