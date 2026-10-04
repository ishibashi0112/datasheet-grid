// 追加(監査 B-05 補足): 表示行数の減少で activeCell / selection を範囲内へ詰める reducer の契約テスト。
import { describe, it, expect } from 'vitest';
import { gridActions } from './gridActions';
import { createInitialGridUiState, gridUiReducer } from './gridReducer';
import type { GridUiState } from './gridTypes.unbound';

const withCellRange = (): GridUiState => {
  let s = createInitialGridUiState();
  s = gridUiReducer(s, gridActions.startSelection({ row: 2, col: 1 }));
  s = gridUiReducer(s, gridActions.updateSelection({ row: 8, col: 3 }));
  s = gridUiReducer(s, gridActions.endSelection());
  s = gridUiReducer(s, gridActions.activateCell({ row: 8, col: 3 }));
  return s;
};

describe('gridUiReducer (selection/clampToRowCount)', () => {
  it('はみ出しが無ければ同一参照を返す', () => {
    const s = withCellRange();
    expect(gridUiReducer(s, gridActions.clampSelectionToRowCount(9))).toBe(s);
    expect(gridUiReducer(s, gridActions.clampSelectionToRowCount(100))).toBe(s);
    const empty = createInitialGridUiState();
    expect(gridUiReducer(empty, gridActions.clampSelectionToRowCount(0))).toBe(empty);
  });

  it('セル範囲ははみ出した部分を切り詰め、activeCell は最終行へ寄せる(列は保持)', () => {
    const next = gridUiReducer(withCellRange(), gridActions.clampSelectionToRowCount(3));
    expect(next.activeCell).toEqual({ row: 2, col: 3 });
    expect(next.selection).toEqual({
      type: 'cell',
      range: { start: { row: 2, col: 1 }, end: { row: 2, col: 3 } },
    });
  });

  it('範囲全体がはみ出した場合は最終行 1 行に詰める', () => {
    const next = gridUiReducer(withCellRange(), gridActions.clampSelectionToRowCount(1));
    expect(next.activeCell).toEqual({ row: 0, col: 3 });
    expect(next.selection).toEqual({
      type: 'cell',
      range: { start: { row: 0, col: 1 }, end: { row: 0, col: 3 } },
    });
  });

  it('行選択も切り詰める', () => {
    let s = createInitialGridUiState();
    s = gridUiReducer(s, gridActions.startRowSelection(1));
    s = gridUiReducer(s, gridActions.updateRowSelection(6));
    s = gridUiReducer(s, gridActions.endSelection());
    const next = gridUiReducer(s, gridActions.clampSelectionToRowCount(4));
    expect(next.selection).toEqual({ type: 'row', startRow: 1, endRow: 3 });
    expect(next.activeCell).toEqual({ row: 1, col: 0 });
  });

  it('ドラッグ中の起点も詰め、以降の update が範囲内から始まる', () => {
    let s = createInitialGridUiState();
    s = gridUiReducer(s, gridActions.startSelection({ row: 7, col: 0 }));
    s = gridUiReducer(s, gridActions.clampSelectionToRowCount(5));
    expect(s.dragState).toEqual({ type: 'selection', selectionKind: 'cell', anchor: { row: 4, col: 0 } });
    s = gridUiReducer(s, gridActions.updateSelection({ row: 2, col: 1 }));
    expect(s.selection).toEqual({
      type: 'cell',
      range: { start: { row: 4, col: 0 }, end: { row: 2, col: 1 } },
    });
  });

  it('0 行になったら activeCell とセル選択を解除し、列選択は保持する', () => {
    const cleared = gridUiReducer(withCellRange(), gridActions.clampSelectionToRowCount(0));
    expect(cleared.activeCell).toBeNull();
    expect(cleared.selection).toBeNull();

    let s = createInitialGridUiState();
    s = gridUiReducer(s, gridActions.startColumnSelection(2));
    s = gridUiReducer(s, gridActions.endSelection());
    const next = gridUiReducer(s, gridActions.clampSelectionToRowCount(0));
    expect(next.activeCell).toBeNull();
    expect(next.selection).toEqual({ type: 'col', startCol: 2, endCol: 2 });
  });
});