// B: gridSelectors の正規化 / 選択判定 / SelectionSnapshot 等価性テスト(純関数・node)。
//   本番コードは無改修。要点は buildSelectionSnapshot が
//   selectIsCellSelected / selectIsRowSelected / selectIsColumnSelected と「完全に等価」
//   であること(11-A の memo 最適化はこの等価性に依存します)。
import { describe, it, expect } from 'vitest';
import type { GridSelection, GridUiState } from './gridTypes';
// 追加(行選択): テスト用の空行選択を組みます。
import { createEmptyRowSelection } from '../logic/rowSelection';
import {
  buildSelectionSnapshot,
  isSameCellCoord,
  normalizeCellRange,
  normalizeColumnRange,
  normalizeRowRange,
  selectIsActiveCell,
  selectIsCellSelected,
  selectIsColumnSelected,
  selectIsEditingCell,
  selectIsRowSelected,
  type SelectionSnapshot,
} from './gridSelectors';

// selection だけ差し替えられる最小の GridUiState を組みます(他フィールドは既定値)。
const makeState = (overrides: Partial<GridUiState> = {}): GridUiState => ({
  activeCell: null,
  selection: null,
  rowSelection: createEmptyRowSelection(),
  editingCell: null,
  dragState: null,
  columnWidths: {},
  filters: { globalText: '', columnFilters: {} },
  sort: [],
  ...overrides,
});

// SelectionSnapshot からのメンバーシップ判定(GridBodyLayer の導出と同じ規則)。
const isSelectedFromSnapshot = (
  snapshot: SelectionSnapshot,
  row: number,
  col: number,
): boolean => {
  switch (snapshot.kind) {
    case 'none':
      return false;
    case 'cell':
      return (
        row >= snapshot.startRow &&
        row <= snapshot.endRow &&
        col >= snapshot.startCol &&
        col <= snapshot.endCol
      );
    case 'row':
      return row >= snapshot.startRow && row <= snapshot.endRow;
    case 'col':
      return col >= snapshot.startCol && col <= snapshot.endCol;
  }
};

describe('normalize* range helpers', () => {
  it('orders cell range corners into top-left / bottom-right', () => {
    expect(
      normalizeCellRange({ start: { row: 3, col: 4 }, end: { row: 1, col: 2 } }),
    ).toEqual({ start: { row: 1, col: 2 }, end: { row: 3, col: 4 } });
    // 既に正規化済みなら不変。
    expect(
      normalizeCellRange({ start: { row: 1, col: 2 }, end: { row: 3, col: 4 } }),
    ).toEqual({ start: { row: 1, col: 2 }, end: { row: 3, col: 4 } });
  });

  it('orders row / column ranges', () => {
    expect(normalizeRowRange(5, 2)).toEqual({ startRow: 2, endRow: 5 });
    expect(normalizeRowRange(2, 5)).toEqual({ startRow: 2, endRow: 5 });
    expect(normalizeColumnRange(7, 3)).toEqual({ startCol: 3, endCol: 7 });
    expect(normalizeColumnRange(3, 7)).toEqual({ startCol: 3, endCol: 7 });
  });
});

describe('isSameCellCoord', () => {
  it('treats null operands as not-equal', () => {
    expect(isSameCellCoord(null, null)).toBe(false);
    expect(isSameCellCoord({ row: 1, col: 1 }, null)).toBe(false);
    expect(isSameCellCoord(null, { row: 1, col: 1 })).toBe(false);
  });

  it('compares row and col', () => {
    expect(isSameCellCoord({ row: 2, col: 3 }, { row: 2, col: 3 })).toBe(true);
    expect(isSameCellCoord({ row: 2, col: 3 }, { row: 2, col: 4 })).toBe(false);
    expect(isSameCellCoord({ row: 2, col: 3 }, { row: 9, col: 3 })).toBe(false);
  });
});

describe('selectIsActiveCell / selectIsEditingCell', () => {
  it('matches only the exact coordinate', () => {
    const state = makeState({
      activeCell: { row: 2, col: 3 },
      editingCell: { row: 4, col: 5 },
    });
    expect(selectIsActiveCell(state, 2, 3)).toBe(true);
    expect(selectIsActiveCell(state, 2, 4)).toBe(false);
    expect(selectIsActiveCell(makeState(), 0, 0)).toBe(false);

    expect(selectIsEditingCell(state, 4, 5)).toBe(true);
    expect(selectIsEditingCell(state, 4, 6)).toBe(false);
    expect(selectIsEditingCell(makeState(), 0, 0)).toBe(false);
  });
});

describe('buildSelectionSnapshot', () => {
  it('returns kind:none for null selection', () => {
    expect(buildSelectionSnapshot(null)).toEqual({ kind: 'none' });
  });

  it('normalizes reversed ranges into the snapshot', () => {
    expect(
      buildSelectionSnapshot({
        type: 'cell',
        range: { start: { row: 3, col: 4 }, end: { row: 1, col: 2 } },
      }),
    ).toEqual({ kind: 'cell', startRow: 1, endRow: 3, startCol: 2, endCol: 4 });

    expect(
      buildSelectionSnapshot({ type: 'row', startRow: 5, endRow: 2 }),
    ).toEqual({ kind: 'row', startRow: 2, endRow: 5 });

    expect(
      buildSelectionSnapshot({ type: 'col', startCol: 7, endCol: 3 }),
    ).toEqual({ kind: 'col', startCol: 3, endCol: 7 });
  });
});

describe('buildSelectionSnapshot is equivalent to the selectIs* selectors', () => {
  // 6x5 グリッド上で、各 selection について「スナップショット由来の判定」と
  // 「selectIsCellSelected(state, ...)」が全セルで一致することを確認します。
  const ROWS = 6;
  const COLS = 5;

  const selections: Array<{ label: string; selection: GridSelection }> = [
    { label: 'null', selection: null },
    {
      label: 'cell (normalized)',
      selection: {
        type: 'cell',
        range: { start: { row: 1, col: 1 }, end: { row: 3, col: 3 } },
      },
    },
    {
      label: 'cell (reversed)',
      selection: {
        type: 'cell',
        range: { start: { row: 3, col: 3 }, end: { row: 1, col: 1 } },
      },
    },
    {
      label: 'cell (single)',
      selection: {
        type: 'cell',
        range: { start: { row: 2, col: 2 }, end: { row: 2, col: 2 } },
      },
    },
    { label: 'row', selection: { type: 'row', startRow: 1, endRow: 3 } },
    {
      label: 'row (reversed)',
      selection: { type: 'row', startRow: 3, endRow: 1 },
    },
    { label: 'col', selection: { type: 'col', startCol: 1, endCol: 3 } },
    {
      label: 'col (reversed)',
      selection: { type: 'col', startCol: 3, endCol: 1 },
    },
  ];

  for (const { label, selection } of selections) {
    it(`matches selectIsCellSelected for every cell — ${label}`, () => {
      const state = makeState({ selection });
      const snapshot = buildSelectionSnapshot(selection);
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          expect(isSelectedFromSnapshot(snapshot, row, col)).toBe(
            selectIsCellSelected(state, row, col),
          );
        }
      }
    });
  }

  it('row-kind snapshot matches selectIsRowSelected', () => {
    const selection: GridSelection = { type: 'row', startRow: 3, endRow: 1 };
    const state = makeState({ selection });
    const snapshot = buildSelectionSnapshot(selection);
    for (let row = 0; row < ROWS; row += 1) {
      const fromSnapshot =
        snapshot.kind === 'row' &&
        row >= snapshot.startRow &&
        row <= snapshot.endRow;
      expect(fromSnapshot).toBe(selectIsRowSelected(state, row));
    }
    // cell / col 選択では行ヘッダー判定は常に false。
    expect(
      selectIsRowSelected(makeState({ selection: { type: 'col', startCol: 0, endCol: 2 } }), 0),
    ).toBe(false);
  });

  it('col-kind snapshot matches selectIsColumnSelected', () => {
    const selection: GridSelection = { type: 'col', startCol: 3, endCol: 1 };
    const state = makeState({ selection });
    const snapshot = buildSelectionSnapshot(selection);
    for (let col = 0; col < COLS; col += 1) {
      const fromSnapshot =
        snapshot.kind === 'col' &&
        col >= snapshot.startCol &&
        col <= snapshot.endCol;
      expect(fromSnapshot).toBe(selectIsColumnSelected(state, col));
    }
    // cell / row 選択では列ヘッダー判定は常に false。
    expect(
      selectIsColumnSelected(makeState({ selection: { type: 'row', startRow: 0, endRow: 2 } }), 0),
    ).toBe(false);
  });
});