// 追加(本体分解 E-1): 列解決 / 3 ペインレイアウトのリゾルバの単体テストです。旧 SpreadsheetGrid.tsx の
//   useMemo 群と同じ結果・同じ参照安定性(11-B4: 幅が変わらないペインの geometry 参照は不変)を検証します。
import { describe, it, expect } from 'vitest';
import { createColumnResolver, createPaneLayoutResolver } from './columnLayout';
import type { GridColumn } from '../model/gridTypes.unbound';
import { DETAIL_TOGGLE_COLUMN_KEY } from '../logic/detailRow';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '../logic/rowReorder';
import { GROUP_AUTO_COLUMN_KEY } from '../logic/grouping';

type Row = { id: number; name: string; group: string };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名前', width: 120 },
  { key: 'group', title: 'グループ', width: 100, visible: false },
];
const renderDetailToggleCell = () => null;

const baseInputs = {
  columns,
  isServerSide: false,
  enableRowDrag: false,
  hasRowsChange: false,
  detailToggleColumnActive: false,
  renderDetailToggleCell,
};

describe('createColumnResolver', () => {
  it('合成列なし・グルーピング無効なら effectiveColumns は columns と同一参照、可視列は visible=false を除く', () => {
    const resolve = createColumnResolver<Row>();
    const result = resolve(baseInputs);
    expect(result.effectiveColumns).toBe(columns);
    expect(result.visibleColumns.map((column) => column.key)).toEqual(['id', 'name']);
    expect(result.rowGroupingActive).toBe(false);
    expect(result.rowDragAvailable).toBe(false);
    // 同じ入力なら派生値の参照は不変(useMemo 相当)。
    const again = resolve({ ...baseInputs });
    expect(again.visibleColumns).toBe(result.visibleColumns);
    expect(again.orderedColumns).toBe(result.orderedColumns);
  });

  it('行ドラッグハンドル列 → 展開行トグル列 → 元の列 の順で注入し、左固定列があれば左へ pin する', () => {
    const resolve = createColumnResolver<Row>();
    const result = resolve({
      ...baseInputs,
      enableRowDrag: true,
      hasRowsChange: true,
      detailToggleColumnActive: true,
    });
    expect(result.effectiveColumns.map((column) => column.key)).toEqual([
      ROW_DRAG_HANDLE_COLUMN_KEY,
      DETAIL_TOGGLE_COLUMN_KEY,
      'id',
      'name',
      'group',
    ]);
    expect(result.effectiveColumns[0].pinned).toBeUndefined();
    expect(result.effectiveColumns[1].renderCell).toBe(renderDetailToggleCell);

    const pinned = resolve({
      ...baseInputs,
      detailToggleColumnActive: true,
      columns: [{ ...columns[0], pinned: 'left' }, columns[1]],
    });
    expect(pinned.effectiveColumns[0].pinned).toBe('left');
    // SSRM では行ドラッグは出さない。
    const server = resolve({ ...baseInputs, enableRowDrag: true, hasRowsChange: true, isServerSide: true });
    expect(server.rowDragAvailable).toBe(false);
  });

  it('rowGroup 列があれば自動グループ列を先頭に置き、グループ元列を表示から外す(SSRM では無効)', () => {
    const resolve = createColumnResolver<Row>();
    const grouped: GridColumn<Row>[] = [columns[0], columns[1], { key: 'group', title: 'グループ', width: 100, rowGroup: true }];
    const result = resolve({ ...baseInputs, columns: grouped });
    expect(result.rowGroupingActive).toBe(true);
    expect(result.groupColumns.map((column) => column.key)).toEqual(['group']);
    expect(result.effectiveColumns.map((column) => column.key)).toEqual([GROUP_AUTO_COLUMN_KEY, 'id', 'name']);
    expect(result.effectiveColumns[0].title).toBe('グループ');
    expect(resolve({ ...baseInputs, columns: grouped, isServerSide: true }).rowGroupingActive).toBe(false);
  });
});

describe('createPaneLayoutResolver', () => {
  const ordered: GridColumn<Row>[] = [
    { key: 'id', title: 'ID', width: 80, pinned: 'left' },
    { key: 'name', title: '名前', width: 120 },
    { key: 'group', title: 'グループ', width: 100, pinned: 'right' },
  ];

  it('flex 列がなければ effectiveColumnWidths は columnWidths と同一参照、幅派生値は 3 ペイン合算', () => {
    const resolve = createPaneLayoutResolver<Row>();
    const columnWidths = { name: 150 };
    const result = resolve({ orderedColumns: ordered, columnWidths, viewportWidth: 600, rowHeaderWidth: 56 });
    expect(result.effectiveColumnWidths).toBe(columnWidths);
    expect(result.hasLeftPane).toBe(true);
    expect(result.centerOwnsRowHeader).toBe(false);
    expect(result.centerLeadingWidth).toBe(0);
    expect(result.leftPaneTotalWidth).toBe(56 + 80);
    expect(result.centerContentWidth).toBe(150);
    expect(result.rightPaneTotalWidth).toBe(100);
    expect(result.totalScrollWidth).toBe(136 + 150 + 100);
  });

  it('中央列の幅だけが変わっても左右ペインの geometry 参照は不変(11-B4)', () => {
    const resolve = createPaneLayoutResolver<Row>();
    const first = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 600, rowHeaderWidth: 56 });
    const second = resolve({ orderedColumns: ordered, columnWidths: { name: 200 }, viewportWidth: 600, rowHeaderWidth: 56 });
    expect(second.paneLayout).not.toBe(first.paneLayout);
    expect(second.paneLayout.left).toBe(first.paneLayout.left);
    expect(second.paneLayout.right).toBe(first.paneLayout.right);
    expect(second.paneLayout.center).not.toBe(first.paneLayout.center);
    expect(second.paneLayout.center.totalWidth).toBe(200);
  });

  it('flex 列は「ビューポート幅 − 固定分」を配分し、未計測(viewportWidth=0)では column.width にフォールバック', () => {
    const resolve = createPaneLayoutResolver<Row>();
    const flexColumns: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'name', title: '名前', width: 120, flex: 1 },
    ];
    const unmeasured = resolve({ orderedColumns: flexColumns, columnWidths: {}, viewportWidth: 0, rowHeaderWidth: 56 });
    expect(unmeasured.hasFlexColumn).toBe(true);
    expect(unmeasured.paneLayout.center.totalWidth).toBe(200);
    const measured = resolve({ orderedColumns: flexColumns, columnWidths: {}, viewportWidth: 500, rowHeaderWidth: 56 });
    // 利用可能幅 500 − 行ヘッダー 56 = 444、固定 id 80 → name は 364。
    expect(measured.effectiveColumnWidths).toEqual({ name: 364 });
    expect(measured.paneLayout.center.totalWidth).toBe(444);
    // 手動リサイズ済み(columnWidths)は flex より優先。
    const manual = resolve({ orderedColumns: flexColumns, columnWidths: { name: 100 }, viewportWidth: 500, rowHeaderWidth: 56 });
    expect(manual.effectiveColumnWidths).toEqual({ name: 100 });
  });
});