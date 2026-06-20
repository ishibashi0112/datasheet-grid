// B: gridBarHelpers の表示テキスト / 選択統計テスト(純関数・node)。
//   本番コードは無改修。ツールバー / ステータスバーが見せる文字列(A1 整形・件数・
//   フィルター/ソート要約)と getGridSelectionStats の cell/row/col 分岐を固定します。
import { describe, it, expect } from 'vitest';
import type { GridColumn, GridSelection } from '../model/gridTypes';
import {
  buildGridDerivedSummary,
  formatGridCellLabel,
  formatGridColumnSummary,
  formatGridFilterSummary,
  formatGridRowSummary,
  formatGridSelectionLabel,
  formatGridSelectionStatsLabel,
  formatGridSortSummary,
  getGridSelectionStats,
} from './gridBarHelpers';

type Row = { id: number };

const makeCol = (key: string, title?: string): GridColumn<Row> => ({
  key,
  title,
  width: 100,
});

const makeCols = (count: number): GridColumn<Row>[] =>
  Array.from({ length: count }, (_, i) => makeCol(`c${i}`, `列${i}`));

describe('formatGridCellLabel (A1 形式)', () => {
  it('returns なし for null', () => {
    expect(formatGridCellLabel(null)).toBe('なし');
  });

  it('formats column letter + 1-based row', () => {
    expect(formatGridCellLabel({ row: 0, col: 0 })).toBe('A1');
    expect(formatGridCellLabel({ row: 2, col: 0 })).toBe('A3');
    expect(formatGridCellLabel({ row: 0, col: 26 })).toBe('AA1');
    expect(formatGridCellLabel({ row: 4, col: 27 })).toBe('AB5');
  });
});

describe('formatGridSelectionLabel', () => {
  it('returns なし for null', () => {
    expect(formatGridSelectionLabel(null)).toBe('なし');
  });

  it('formats cell selection (normalized regardless of corner order)', () => {
    const normalized: GridSelection = {
      type: 'cell',
      range: { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
    };
    const reversed: GridSelection = {
      type: 'cell',
      range: { start: { row: 1, col: 1 }, end: { row: 0, col: 0 } },
    };
    expect(formatGridSelectionLabel(normalized)).toBe('A1 - B2');
    expect(formatGridSelectionLabel(reversed)).toBe('A1 - B2');
  });

  it('formats single-cell, row and col selections', () => {
    expect(
      formatGridSelectionLabel({
        type: 'cell',
        range: { start: { row: 2, col: 2 }, end: { row: 2, col: 2 } },
      }),
    ).toBe('C3 - C3');
    expect(
      formatGridSelectionLabel({ type: 'row', startRow: 2, endRow: 0 }),
    ).toBe('Row 1 - 3');
    expect(
      formatGridSelectionLabel({ type: 'col', startCol: 2, endCol: 0 }),
    ).toBe('Col A - C');
  });
});

describe('formatGridRowSummary / formatGridColumnSummary', () => {
  it('shows filtered / total counts', () => {
    expect(
      formatGridRowSummary({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }, 2),
    ).toBe('Rows: 2 / 3');
  });

  it('shows visible / total columns', () => {
    expect(
      formatGridColumnSummary({
        columns: makeCols(5),
        visibleColumns: makeCols(3),
      }),
    ).toBe('Columns: 3 / 5');
  });
});

describe('getGridSelectionStats (cell / row / col 分岐)', () => {
  it('returns zeros when nothing is selected', () => {
    expect(
      getGridSelectionStats({ selection: null, visibleColumns: makeCols(5) }, 100),
    ).toEqual({
      selectedCellCount: 0,
      selectedRowCount: 0,
      selectedColumnCount: 0,
    });
  });

  it('cell selection counts rows x cols within the normalized range', () => {
    expect(
      getGridSelectionStats(
        {
          selection: {
            type: 'cell',
            range: { start: { row: 2, col: 2 }, end: { row: 0, col: 0 } },
          },
          visibleColumns: makeCols(5),
        },
        100,
      ),
    ).toEqual({
      selectedCellCount: 9,
      selectedRowCount: 3,
      selectedColumnCount: 3,
    });
  });

  it('row selection spans all visible columns', () => {
    expect(
      getGridSelectionStats(
        {
          selection: { type: 'row', startRow: 0, endRow: 1 },
          visibleColumns: makeCols(5),
        },
        100,
      ),
    ).toEqual({
      selectedCellCount: 10,
      selectedRowCount: 2,
      selectedColumnCount: 5,
    });
  });

  it('col selection spans all filtered rows (count passed in)', () => {
    expect(
      getGridSelectionStats(
        {
          selection: { type: 'col', startCol: 0, endCol: 2 },
          visibleColumns: makeCols(5),
        },
        100,
      ),
    ).toEqual({
      selectedCellCount: 300,
      selectedRowCount: 100,
      selectedColumnCount: 3,
    });
  });

  it('formatGridSelectionStatsLabel renders cells / rows', () => {
    expect(
      formatGridSelectionStatsLabel(
        {
          selection: {
            type: 'cell',
            range: { start: { row: 0, col: 0 }, end: { row: 2, col: 2 } },
          },
          visibleColumns: makeCols(5),
        },
        100,
      ),
    ).toBe('Cells: 9 / Rows: 3');
  });
});

describe('formatGridFilterSummary (4 分岐 + 短縮)', () => {
  it('none', () => {
    expect(
      formatGridFilterSummary({ globalFilterText: '', columnFilterValues: {} }),
    ).toBe('Filter: なし');
  });

  it('global only', () => {
    expect(
      formatGridFilterSummary({
        globalFilterText: 'abc',
        columnFilterValues: {},
      }),
    ).toBe('Filter: Global("abc")');
  });

  it('column only (空文字の列は無効として数えない)', () => {
    expect(
      formatGridFilterSummary({
        globalFilterText: '',
        columnFilterValues: { c0: 'x', c1: '', c2: 'y' },
      }),
    ).toBe('Filter: 2列');
  });

  it('both global and columns', () => {
    expect(
      formatGridFilterSummary({
        globalFilterText: 'abc',
        columnFilterValues: { c0: 'x', c1: 'y' },
      }),
    ).toBe('Filter: Global("abc") + 2列');
  });

  it('truncates a long global filter preview to 16 chars + …', () => {
    expect(
      formatGridFilterSummary({
        globalFilterText: 'abcdefghijklmnopqrstuvwxyz',
        columnFilterValues: {},
      }),
    ).toBe('Filter: Global("abcdefghijklmnop…")');
  });
});

describe('formatGridSortSummary', () => {
  it('returns なし for empty sort state', () => {
    expect(
      formatGridSortSummary({ columns: makeCols(3), sortState: [] }),
    ).toBe('Sort: なし');
  });

  it('formats a single sort entry with title and direction', () => {
    const columns = [makeCol('amount', '金額')];
    expect(
      formatGridSortSummary({
        columns,
        sortState: [{ columnKey: 'amount', direction: 'asc' }],
      }),
    ).toBe('Sort: 金額 (昇順)');
    expect(
      formatGridSortSummary({
        columns,
        sortState: [{ columnKey: 'amount', direction: 'desc' }],
      }),
    ).toBe('Sort: 金額 (降順)');
  });

  it('joins multiple entries in priority order', () => {
    const columns = [makeCol('amount', '金額'), makeCol('qty', '数量')];
    expect(
      formatGridSortSummary({
        columns,
        sortState: [
          { columnKey: 'amount', direction: 'asc' },
          { columnKey: 'qty', direction: 'desc' },
        ],
      }),
    ).toBe('Sort: 金額 (昇順), 数量 (降順)');
  });

  it('falls back to the column key when the column is missing', () => {
    expect(
      formatGridSortSummary({
        columns: [],
        sortState: [{ columnKey: 'missing', direction: 'asc' }],
      }),
    ).toBe('Sort: missing (昇順)');
  });
});

describe('buildGridDerivedSummary composes the individual helpers', () => {
  it('matches the standalone helper outputs for the same context', () => {
    const context = {
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }] as Row[],
      columns: [makeCol('amount', '金額'), makeCol('qty', '数量')],
      visibleColumns: [makeCol('amount', '金額')],
      globalFilterText: 'foo',
      columnFilterValues: { amount: 'x' } as Record<string, unknown>,
      sortState: [{ columnKey: 'amount', direction: 'asc' as const }],
      activeCell: { row: 2, col: 0 },
      selection: {
        type: 'cell' as const,
        range: { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      },
    };
    const filteredRowCount = 3;
    const summary = buildGridDerivedSummary(context, filteredRowCount);

    expect(summary.rowSummaryText).toBe(
      formatGridRowSummary(context, filteredRowCount),
    );
    expect(summary.columnSummaryText).toBe(formatGridColumnSummary(context));
    expect(summary.filterSummaryText).toBe(formatGridFilterSummary(context));
    expect(summary.sortSummaryText).toBe(formatGridSortSummary(context));
    expect(summary.activeCellLabel).toBe(
      formatGridCellLabel(context.activeCell),
    );
    expect(summary.selectionLabel).toBe(
      formatGridSelectionLabel(context.selection),
    );
    expect(summary.selectionStats).toEqual(
      getGridSelectionStats(context, filteredRowCount),
    );
    expect(summary.hasGlobalFilter).toBe(true);
    expect(summary.activeColumnFilterCount).toBe(1);
    expect(summary.hasAnyFilter).toBe(true);
    expect(summary.hasSorting).toBe(true);
    expect(summary.sortedColumnLabel).toBe('金額');
  });
});