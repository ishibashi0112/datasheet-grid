// 追加(1.2.0 / 2026-11-09 実アプリの総点検 B-04): activeCellFollows: 'row' のコントローラ(controllers/activeRowFollowController)の
//   テストです。行モデルは「キーの並び」だけの最小の形で作ります。
import { describe, it, expect, vi } from 'vitest';
import { createActiveRowFollowController, type ActiveRowFollowArgs } from './activeRowFollowController';
import type { CellCoord, RowModel } from '../model/gridTypes.unbound';

type Row = { id: string };

const model = (keys: string[]): RowModel<Row> =>
  ({
    getRowCount: () => keys.length,
    getRow: (index: number) => (index >= 0 && index < keys.length ? { id: keys[index] } : undefined),
    getRowKey: (index: number) => keys[index],
  }) as unknown as RowModel<Row>;

const makeArgs = (
  activeCell: CellCoord | null,
  rowModel: RowModel<Row>,
  dispatch: ActiveRowFollowArgs<Row>['dispatch'],
  extra: Partial<ActiveRowFollowArgs<Row>> = {},
): ActiveRowFollowArgs<Row> => ({
  enabled: true,
  activeCell,
  selection: null,
  rowModel,
  dragging: false,
  editing: false,
  dispatch,
  ...extra,
});

describe('createActiveRowFollowController', () => {
  it('並びだけが変わったら、覚えた行の新しい位置へ動かす(次の描画まで pending)', () => {
    const controller = createActiveRowFollowController<Row>();
    const dispatch = vi.fn();
    const cell = { row: 1, col: 0 };
    controller.update(makeArgs(cell, model(['a', 'b', 'c']), dispatch));
    controller.update(makeArgs(cell, model(['b', 'c', 'a']), dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: 'selection/followActiveRow', row: 0, rowCount: 3 });
    expect(controller.isFollowPending()).toBe(true);
    // 動いた後の描画(アクティブセルが変わった)では覚え直すだけ。
    controller.update(makeArgs({ row: 0, col: 0 }, model(['b', 'c', 'a']), dispatch));
    expect(controller.isFollowPending()).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('isFollowMove: 動かした先は、アクティブセルがほかの所へ動くまで true(viewportSync がスクロールしないため)', () => {
    const controller = createActiveRowFollowController<Row>();
    const dispatch = vi.fn();
    const cell = { row: 1, col: 2 };
    controller.update(makeArgs(cell, model(['a', 'b', 'c']), dispatch));
    expect(controller.isFollowMove(cell)).toBe(false);
    controller.update(makeArgs(cell, model(['b', 'c', 'a']), dispatch));
    expect(controller.isFollowMove({ row: 0, col: 2 })).toBe(true);
    // 動いた後の描画でもまだ true(viewportSync は描いた後に読む)。
    controller.update(makeArgs({ row: 0, col: 2 }, model(['b', 'c', 'a']), dispatch));
    expect(controller.isFollowMove({ row: 0, col: 2 })).toBe(true);
    expect(controller.isFollowMove({ row: 0, col: 1 })).toBe(false);
    // 人が別のセルへ動かしたら外れる。
    controller.update(makeArgs({ row: 2, col: 2 }, model(['b', 'c', 'a']), dispatch));
    expect(controller.isFollowMove({ row: 0, col: 2 })).toBe(false);
  });

  it('同じ位置に同じ行がある・アクティブセルが動いた・無効のときは動かさない', () => {
    const controller = createActiveRowFollowController<Row>();
    const dispatch = vi.fn();
    const cell = { row: 1, col: 0 };
    controller.update(makeArgs(cell, model(['a', 'b', 'c']), dispatch));
    controller.update(makeArgs(cell, model(['x', 'b', 'c']), dispatch));
    // 変更(1.2.0 の確かめ直し K): 並びとアクティブセルが同時に変わった(確定の Enter / Tab、キー操作など)ときは、前の並びで
    //   その位置にあった行(動かした先の行 = c)へ付いていく。
    controller.update(makeArgs({ row: 2, col: 0 }, model(['c', 'b', 'x']), dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: 'selection/followActiveRow', row: 0, rowCount: 3 });
    dispatch.mockClear();
    // 前の並びでもその位置が同じ行なら動かさない。
    const same = createActiveRowFollowController<Row>();
    same.update(makeArgs(cell, model(['a', 'b', 'c']), dispatch));
    same.update(makeArgs({ row: 2, col: 0 }, model(['b', 'a', 'c']), dispatch));
    expect(dispatch).not.toHaveBeenCalled();
    // 無効('position')。
    const off = createActiveRowFollowController<Row>();
    off.update(makeArgs(cell, model(['a', 'b']), dispatch, { enabled: false }));
    off.update(makeArgs(cell, model(['b', 'a']), dispatch, { enabled: false }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('追う行が消えたら位置に残り、その位置の行を覚え直す', () => {
    const controller = createActiveRowFollowController<Row>();
    const dispatch = vi.fn();
    const cell = { row: 1, col: 0 };
    controller.update(makeArgs(cell, model(['a', 'b', 'c']), dispatch));
    controller.update(makeArgs(cell, model(['a', 'c']), dispatch));
    expect(dispatch).not.toHaveBeenCalled();
    // 今度は c を追う。
    controller.update(makeArgs(cell, model(['c', 'a']), dispatch));
    expect(dispatch).toHaveBeenCalledWith({ type: 'selection/followActiveRow', row: 0, rowCount: 2 });
  });

  // 変更(1.2.0 の見直し QG-4): ドラッグ中に並びが変わったら、追う行を覚えたまま待ち、終わった描画で付いていく。
  it('選択のドラッグ中は動かさず追う行を覚えたまま、終わった描画で付いていく。編集中は動かさず覚えたまま', () => {
    const controller = createActiveRowFollowController<Row>();
    const dispatch = vi.fn();
    const cell = { row: 0, col: 0 };
    controller.update(makeArgs(cell, model(['a', 'b']), dispatch));
    const reordered = model(['b', 'a']);
    controller.update(makeArgs(cell, reordered, dispatch, { dragging: true }));
    expect(dispatch).not.toHaveBeenCalled();
    // ドラッグが終わった描画(行モデルは同じ)で a へ付いていく。
    controller.update(makeArgs(cell, reordered, dispatch));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'selection/followActiveRow', row: 1, rowCount: 2 });
    expect(controller.isFollowPending()).toBe(true);

    // ドラッグ中に元の並びへ戻ったら、終わっても動かさない。
    const back = createActiveRowFollowController<Row>();
    const dispatch3 = vi.fn();
    back.update(makeArgs(cell, model(['a', 'b']), dispatch3));
    back.update(makeArgs(cell, model(['b', 'a']), dispatch3, { dragging: true }));
    const restored = model(['a', 'b']);
    back.update(makeArgs(cell, restored, dispatch3, { dragging: true }));
    back.update(makeArgs(cell, restored, dispatch3));
    expect(dispatch3).not.toHaveBeenCalled();

    const editing = createActiveRowFollowController<Row>();
    const dispatch2 = vi.fn();
    editing.update(makeArgs(cell, model(['a', 'b']), dispatch2));
    editing.update(makeArgs(cell, model(['b', 'a']), dispatch2, { editing: true }));
    expect(dispatch2).not.toHaveBeenCalled();
  });
  // 追加(1.2.0 の確かめ直し B): アクティブセルの行は動かず、範囲の中のほかの行だけが入れ替わったときも 1 セルにする。
  it('何行かにまたがる範囲の中の行だけが入れ替わったら、範囲を外す(アクティブセルの行は動かさない)', () => {
    const controller = createActiveRowFollowController<Row>();
    const dispatch = vi.fn();
    const cell = { row: 1, col: 0 };
    const range = { type: 'cell' as const, range: { start: { row: 1, col: 0 }, end: { row: 3, col: 1 } } };
    controller.update(makeArgs(cell, model(['a', 'b', 'c', 'd', 'e']), dispatch, { selection: range }));
    // c が範囲の外(一番下)へ動いた。b は同じ位置。
    controller.update(makeArgs(cell, model(['a', 'b', 'd', 'e', 'c']), dispatch, { selection: range }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'selection/collapseToActiveCell' });
    // 範囲の外だけが変わったとき・全部の行の範囲・1 行の範囲・ドラッグ中は外さない。
    const quiet = vi.fn();
    const c2 = createActiveRowFollowController<Row>();
    c2.update(makeArgs(cell, model(['a', 'b', 'c', 'd', 'e']), quiet, { selection: range }));
    c2.update(makeArgs(cell, model(['a', 'b', 'c', 'd', 'x']), quiet, { selection: range }));
    const all = { type: 'row' as const, startRow: 0, endRow: 4 };
    c2.update(makeArgs(cell, model(['a', 'b', 'd', 'c', 'x']), quiet, { selection: all }));
    const one = { type: 'cell' as const, range: { start: { row: 1, col: 0 }, end: { row: 1, col: 3 } } };
    c2.update(makeArgs(cell, model(['a', 'b', 'c', 'd', 'x']), quiet, { selection: one }));
    c2.update(makeArgs(cell, model(['a', 'b', 'd', 'c', 'x']), quiet, { selection: range, dragging: true }));
    expect(quiet).not.toHaveBeenCalled();
  });
});