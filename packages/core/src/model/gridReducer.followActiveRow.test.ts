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

  it('列選択と選択なしはそのまま', () => {
    const col = withState({ row: 4, col: 2 }, { type: 'col', startCol: 2, endCol: 3 });
    const next = gridUiReducer(col, gridActions.followActiveRow(9));
    expect(next.activeCell).toEqual({ row: 9, col: 2 });
    expect(next.selection).toBe(col.selection);
    expect(gridUiReducer(withState({ row: 4, col: 2 }, null), gridActions.followActiveRow(9)).selection).toBeNull();
  });
});
