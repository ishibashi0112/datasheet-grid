// 追加(1.2.0 / 2026-11-09 実アプリの総点検 B-04): 並びが変わったときにアクティブセルを行の新しい位置へ動かす reducer
//   (selection/followActiveRow。activeCellFollows: 'row')の契約テスト。
import { describe, it, expect } from 'vitest';
import { gridActions } from './gridActions';
import { createInitialGridUiState, gridUiReducer } from './gridReducer';
import type { GridSelection, GridUiState } from './gridTypes.unbound';

const withState = (activeCell: { row: number; col: number } | null, selection: GridSelection): GridUiState => ({
  ...createInitialGridUiState(),
  activeCell,
  selection,
});

describe('gridUiReducer (selection/followActiveRow)', () => {
  it('アクティブセルが無い・同じ位置なら同一参照', () => {
    const none = withState(null, null);
    expect(gridUiReducer(none, gridActions.followActiveRow(3))).toBe(none);
    const same = withState({ row: 3, col: 1 }, null);
    expect(gridUiReducer(same, gridActions.followActiveRow(3))).toBe(same);
  });

  it('アクティブセルの行だけのセル範囲は同じ形のまま動く(列はそのまま)', () => {
    const s = withState({ row: 2, col: 1 }, { type: 'cell', range: { start: { row: 2, col: 0 }, end: { row: 2, col: 3 } } });
    const next = gridUiReducer(s, gridActions.followActiveRow(7));
    expect(next.activeCell).toEqual({ row: 7, col: 1 });
    expect(next.selection).toEqual({ type: 'cell', range: { start: { row: 7, col: 0 }, end: { row: 7, col: 3 } } });
  });

  it('何行かにまたがるセル範囲は外してアクティブセルの 1 セル', () => {
    const s = withState({ row: 2, col: 1 }, { type: 'cell', range: { start: { row: 2, col: 1 }, end: { row: 5, col: 2 } } });
    const next = gridUiReducer(s, gridActions.followActiveRow(0));
    expect(next.activeCell).toEqual({ row: 0, col: 1 });
    expect(next.selection).toEqual({ type: 'cell', range: { start: { row: 0, col: 1 }, end: { row: 0, col: 1 } } });
  });

  it('行選択: アクティブセルの 1 行なら動き、何行かなら 1 セル', () => {
    const one = withState({ row: 4, col: 0 }, { type: 'row', startRow: 4, endRow: 4 });
    expect(gridUiReducer(one, gridActions.followActiveRow(1)).selection).toEqual({ type: 'row', startRow: 1, endRow: 1 });
    const many = withState({ row: 4, col: 0 }, { type: 'row', startRow: 2, endRow: 4 });
    expect(gridUiReducer(many, gridActions.followActiveRow(1)).selection).toEqual({
      type: 'cell',
      range: { start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
    });
  });

  // 追加(1.2.0 の見直し QG-1): 全部の行にまたがる範囲(Ctrl+A など)は中の行が変わらないのでそのまま。
  it('全部の行にまたがるセル範囲 / 行選択はそのまま(アクティブセルだけ動く)', () => {
    const all = withState({ row: 0, col: 0 }, { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 9, col: 4 } } });
    const next = gridUiReducer(all, gridActions.followActiveRow(6, 10));
    expect(next.activeCell).toEqual({ row: 6, col: 0 });
    expect(next.selection).toBe(all.selection);
    const allRows = withState({ row: 0, col: 0 }, { type: 'row', startRow: 9, endRow: 0 });
    expect(gridUiReducer(allRows, gridActions.followActiveRow(6, 10)).selection).toBe(allRows.selection);
    // 1 行足りない範囲は今までどおり 1 セル。
    const most = withState({ row: 0, col: 0 }, { type: 'cell', range: { start: { row: 0, col: 0 }, end: { row: 8, col: 4 } } });
    expect(gridUiReducer(most, gridActions.followActiveRow(6, 10)).selection).toEqual({
      type: 'cell',
      range: { start: { row: 6, col: 0 }, end: { row: 6, col: 0 } },
    });
  });

  it('列選択と選択なしはそのまま', () => {
    const col = withState({ row: 4, col: 2 }, { type: 'col', startCol: 2, endCol: 3 });
    const next = gridUiReducer(col, gridActions.followActiveRow(9));
    expect(next.activeCell).toEqual({ row: 9, col: 2 });
    expect(next.selection).toBe(col.selection);
    expect(gridUiReducer(withState({ row: 4, col: 2 }, null), gridActions.followActiveRow(9)).selection).toBeNull();
  });
  // 追加(1.2.0 の確かめ直し B)。
  it('selection/collapseToActiveCell: 範囲をアクティブセルの 1 セルにする(アクティブセルは同じ参照)。もう 1 セルなら同一参照', () => {
    const s = withState({ row: 2, col: 1 }, { type: 'row', startRow: 1, endRow: 4 });
    const next = gridUiReducer(s, gridActions.collapseSelectionToActiveCell());
    expect(next.activeCell).toBe(s.activeCell);
    expect(next.selection).toEqual({ type: 'cell', range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } } });
    expect(gridUiReducer(next, gridActions.collapseSelectionToActiveCell())).toBe(next);
    const none = withState(null, null);
    expect(gridUiReducer(none, gridActions.collapseSelectionToActiveCell())).toBe(none);
  });
  // 追加(1.2.0 の確かめ直し J): 編集中のセルの付いていきでは、アクティブセルと選択も一緒に動く。
  it('edit/retarget: 編集中のセル・アクティブセル・1 セルの選択が新しい位置へ動く(列が変わるときの範囲は 1 セル)', () => {
    const s = {
      ...withState({ row: 3, col: 2 }, { type: 'cell', range: { start: { row: 3, col: 2 }, end: { row: 3, col: 2 } } }),
      editingCell: { row: 3, col: 2 },
    };
    const next = gridUiReducer(s, gridActions.retargetEdit({ row: 1, col: 2 }, 10));
    expect(next.editingCell).toEqual({ row: 1, col: 2 });
    expect(next.activeCell).toEqual({ row: 1, col: 2 });
    expect(next.selection).toEqual({ type: 'cell', range: { start: { row: 1, col: 2 }, end: { row: 1, col: 2 } } });
    // 同じ所なら同一参照。
    expect(gridUiReducer(next, gridActions.retargetEdit({ row: 1, col: 2 }, 10))).toBe(next);
    // 列も変わった(列の並べ替え)ときは、同じ行の範囲でも 1 セル。
    const wide = {
      ...withState({ row: 3, col: 2 }, { type: 'cell', range: { start: { row: 3, col: 1 }, end: { row: 3, col: 4 } } }),
      editingCell: { row: 3, col: 2 },
    };
    expect(gridUiReducer(wide, gridActions.retargetEdit({ row: 5, col: 0 }, 10)).selection).toEqual({
      type: 'cell',
      range: { start: { row: 5, col: 0 }, end: { row: 5, col: 0 } },
    });
    expect(gridUiReducer(wide, gridActions.retargetEdit({ row: 5, col: 2 }, 10)).selection).toEqual({
      type: 'cell',
      range: { start: { row: 5, col: 1 }, end: { row: 5, col: 4 } },
    });
  });
});