// 追加(1.5.0 / 速さの案 B): 行の枠の割り当て(primitives/rowSlots)。
import { describe, expect, it } from 'vitest';
import { assignRowSlots, type RowSlotKind } from './rowSlots';

type Item = { key: string; kind: RowSlotKind };
const items = (...specs: string[]): Item[] =>
  specs.map((spec) => ({
    key: spec.replace(/^[sk]:/, ''),
    kind: spec.startsWith('s:') ? 'skeleton' : spec.startsWith('k:') ? 'keyed' : 'data',
  }));
const kindOf = (item: Item) => item.kind;
const slotsOf = (state: { items: readonly { slot: string }[] }) => state.items.map((item) => item.slot);

describe('assignRowSlots', () => {
  it('初めは種類ごとに新しい枠を作り、グループ行 / ラベル行(keyed)は行のキーを枠にする', () => {
    const state = assignRowSlots(undefined, items('a', 'b', 's:x', 'k:g1'), kindOf, false);
    expect(slotsOf(state)).toEqual(['r0', 'r1', 's2', 'kg1']);
    expect(state.next).toBe(3);
  });

  it('残った行は同じ枠のまま(並びが変わっても)、使い回さないときは入ってきた行に新しい枠を作る', () => {
    const first = assignRowSlots(undefined, items('a', 'b', 'c'), kindOf, false);
    const next = assignRowSlots(first, items('c', 'a', 'd'), kindOf, false);
    expect(slotsOf(next)).toEqual(['r2', 'r0', 'r3']);
    expect(next.next).toBe(4);
  });

  it('使い回すときは、範囲から出た行の枠を前の並びの順に入ってきた行へ渡し、足りなければ新しく作る', () => {
    const first = assignRowSlots(undefined, items('a', 'b', 'c', 'd'), kindOf, false);
    // 遠くへ飛んだ: 全部入れ替わり、1 行増えた。
    const far = assignRowSlots(first, items('w', 'x', 'y', 'z', 'v'), kindOf, true);
    expect(slotsOf(far)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    // 少し進んだ: 先頭の 2 行が出て、後ろに 2 行入る(出た行の枠を使う)。
    const near = assignRowSlots(far, items('y', 'z', 'v', 'u', 't'), kindOf, true);
    expect(slotsOf(near)).toEqual(['r2', 'r3', 'r4', 'r0', 'r1']);
    expect(near.next).toBe(5);
  });

  it('データ行と読み込み中の行は互いの枠を使わず、keyed の行は使い回しに加わらない', () => {
    const first = assignRowSlots(undefined, items('a', 's:p1', 'k:g1'), kindOf, false);
    expect(slotsOf(first)).toEqual(['r0', 's1', 'kg1']);
    const next = assignRowSlots(first, items('s:p2', 'b', 'k:g2'), kindOf, true);
    expect(slotsOf(next)).toEqual(['s1', 'r0', 'kg2']);
    // キーが同じでも種類が変わったら(データ行 → ラベル行)、前の枠は使わない。
    const relabeled = assignRowSlots(next, items('k:b', 's:p2'), kindOf, true);
    expect(slotsOf(relabeled)).toEqual(['kb', 's1']);
  });

  it('同じキーが 2 回来ても、2 つ目は別の枠になる', () => {
    const first = assignRowSlots(undefined, items('a', 'b'), kindOf, false);
    const next = assignRowSlots(first, items('a', 'a'), kindOf, true);
    expect(slotsOf(next)).toEqual(['r0', 'r1']);
  });
});
