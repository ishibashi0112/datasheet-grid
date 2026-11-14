// 追加(本体分解 E-1): 列解決 / 3 ペインレイアウトのリゾルバの単体テストです。旧 SpreadsheetGrid.tsx の
//   useMemo 群と同じ結果・同じ参照安定性(11-B4: 幅が変わらないペインの geometry 参照は不変)を検証します。
import { describe, it, expect } from 'vitest';
import { createColumnResolver, createPaneLayoutResolver, resolvePinnedOverflowKey } from './columnLayout';
import type { GridColumn } from '../model/gridTypes.unbound';
import { DETAIL_TOGGLE_COLUMN_KEY } from '../logic/detailRow';
import { ROW_DRAG_HANDLE_COLUMN_KEY } from '../logic/rowReorder';
import { GROUP_AUTO_COLUMN_KEY } from '../logic/grouping';
import { fullCoreFeatures } from './fullFeatures';

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
    const resolve = createColumnResolver<Row>(fullCoreFeatures);
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
    const resolve = createColumnResolver<Row>(fullCoreFeatures);
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
    // 追加(audit B-07): 左固定列が非表示なら合成列は左へ pin しない(合成列だけの左ペインを作らない)。
    const hiddenPinned = resolve({
      ...baseInputs,
      detailToggleColumnActive: true,
      columns: [{ ...columns[0], pinned: 'left', visible: false }, columns[1]],
    });
    expect(hiddenPinned.effectiveColumns[0].pinned).toBeUndefined();
    // 追加(audit B-07 補足): グルーピング中のグループ元列は表示から外れるため、左固定でも数えない。
    const groupedPinned = resolve({
      ...baseInputs,
      detailToggleColumnActive: true,
      columns: [{ ...columns[0], pinned: 'left', rowGroup: true }, columns[1]],
    });
    expect(groupedPinned.rowGroupingActive).toBe(true);
    expect(groupedPinned.orderedColumns.some((column) => column.pinned === 'left')).toBe(false);
    // SSRM ではグルーピングは無効なので、グループ元列も表示されたまま左固定として数える。
    const serverPinned = resolve({
      ...baseInputs,
      isServerSide: true,
      detailToggleColumnActive: true,
      columns: [{ ...columns[0], pinned: 'left', rowGroup: true }, columns[1]],
    });
    expect(serverPinned.effectiveColumns[0].pinned).toBe('left');
    // SSRM では行ドラッグは出さない。
    const server = resolve({ ...baseInputs, enableRowDrag: true, hasRowsChange: true, isServerSide: true });
    expect(server.rowDragAvailable).toBe(false);
  });

  it('rowGroup 列があれば自動グループ列を先頭に置き、グループ元列を表示から外す(SSRM では無効)', () => {
    const resolve = createColumnResolver<Row>(fullCoreFeatures);
    const grouped: GridColumn<Row>[] = [columns[0], columns[1], { key: 'group', title: 'グループ', width: 100, rowGroup: true }];
    const result = resolve({ ...baseInputs, columns: grouped });
    expect(result.rowGroupingActive).toBe(true);
    expect(result.groupColumns.map((column) => column.key)).toEqual(['group']);
    expect(result.effectiveColumns.map((column) => column.key)).toEqual([GROUP_AUTO_COLUMN_KEY, 'id', 'name']);
    expect(result.effectiveColumns[0].title).toBe('グループ');
    expect(result.effectiveColumns[0].pinned).toBeUndefined();
    expect(resolve({ ...baseInputs, columns: grouped, isServerSide: true }).rowGroupingActive).toBe(false);
  });

  // 追加(段階 2 DU-22): 左固定列があれば自動グループ列も左固定(展開トグル列と同じ)。左ペインの先頭に入る。
  it('左固定列があるときは自動グループ列も左に固定する', () => {
    const resolve = createColumnResolver<Row>(fullCoreFeatures);
    const grouped: GridColumn<Row>[] = [
      { ...columns[0], pinned: 'left' },
      columns[1],
      { key: 'group', title: 'グループ', width: 100, rowGroup: true },
    ];
    const result = resolve({ ...baseInputs, columns: grouped });
    expect(result.effectiveColumns[0]).toMatchObject({ key: GROUP_AUTO_COLUMN_KEY, pinned: 'left' });
    expect(result.orderedColumns.map((column) => `${column.key}:${column.pinned ?? '-'}`)).toEqual([
      `${GROUP_AUTO_COLUMN_KEY}:left`,
      'id:left',
      'name:-',
    ]);
  });

  it('機能セットに grouping が無ければ行グルーピングは無効で、rowGroup 列もそのまま表示する', () => {
    const resolve = createColumnResolver<Row>({});
    const grouped: GridColumn<Row>[] = [columns[0], columns[1], { key: 'group', title: 'グループ', width: 100, rowGroup: true }];
    const result = resolve({ ...baseInputs, columns: grouped });
    expect(result.rowGroupingActive).toBe(false);
    expect(result.effectiveColumns).toBe(grouped);
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

  // 追加(段階 2 DU-22): 行番号の列は左固定列が無くても左ペイン(横スクロールで流れない)。幅 0 なら左ペインを作らない。
  it('左固定列が無くても行番号の列は左ペインに置く(rowHeaderWidth 0 のときだけ中央)', () => {
    const resolve = createPaneLayoutResolver<Row>();
    const plain: GridColumn<Row>[] = [
      { key: 'id', title: 'ID', width: 80 },
      { key: 'name', title: '名前', width: 120 },
    ];
    const result = resolve({ orderedColumns: plain, columnWidths: {}, viewportWidth: 600, rowHeaderWidth: 56 });
    expect(result.hasLeftPane).toBe(true);
    expect(result.paneLayout.left.entries).toHaveLength(0);
    expect(result.centerOwnsRowHeader).toBe(false);
    expect(result.leftPaneTotalWidth).toBe(56);
    expect(result.centerLeadingWidth).toBe(0);
    expect(result.centerContentWidth).toBe(200);
    expect(result.totalScrollWidth).toBe(256);
    const noHeader = createPaneLayoutResolver<Row>()({ orderedColumns: plain, columnWidths: {}, viewportWidth: 600, rowHeaderWidth: 0 });
    expect(noHeader.hasLeftPane).toBe(false);
    expect(noHeader.leftPaneTotalWidth).toBe(0);
    expect(noHeader.totalScrollWidth).toBe(200);
  });
});

// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-23): 固定列が入りきらないときは表示の上だけ固定を外す。
describe('入りきらない固定列(AP-23)', () => {
  type R = { id: number };
  const ordered: GridColumn<R>[] = [
    { key: 'no', title: 'No.', width: 70, pinned: 'left' },
    { key: 'customer', title: '顧客', width: 160, pinned: 'left' },
    { key: 'date', title: '受注日', width: 120 },
    { key: 'note', title: '備考', width: 200 },
    { key: 'amount', title: '金額', width: 130, pinned: 'right' },
  ];
  const keys = (items: { column: GridColumn<R> }[]) => items.map(({ column }) => column.key);

  it('広い表では何もしない(列ソースは分けただけ)', () => {
    const resolve = createPaneLayoutResolver<R>();
    const result = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 1200, rowHeaderWidth: 56 });
    expect(keys(result.paneSourceColumns.left)).toEqual(['no', 'customer']);
    expect(keys(result.paneSourceColumns.right)).toEqual(['amount']);
  });

  it('幅 340px: 右の固定列、次に左の固定列の内側から中央へ回す(並びの index は変わらない)', () => {
    const resolve = createPaneLayoutResolver<R>();
    const result = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 340, rowHeaderWidth: 56 });
    expect(keys(result.paneSourceColumns.left)).toEqual(['no']);
    expect(keys(result.paneSourceColumns.center)).toEqual(['customer', 'date', 'note', 'amount']);
    expect(result.paneSourceColumns.center.map(({ logicalIndex }) => logicalIndex)).toEqual([1, 2, 3, 4]);
    expect(result.paneSourceColumns.center.every(({ column }) => column.pinned === undefined)).toBe(true);
    expect(result.hasRightPane).toBe(false);
    expect(result.leftPaneTotalWidth).toBe(56 + 70);
    // 列の定義(pinned)は変えない。
    expect(ordered[1].pinned).toBe('left');
  });

  // 1.0.1 のレビュー RB-1: 残す幅が幅の 1/4 だと、重なっていない表でも固定が外れていた。
  it('中央に 120px が残る間は外さない(固定列が幅の 75% を超えていても)', () => {
    const resolve = createPaneLayoutResolver<R>();
    // 固定列の合計 = 56 + 70 + 160 + 130 = 416px。幅 545px なら中央に 129px が残る。
    const fits = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 545, rowHeaderWidth: 56 });
    expect(keys(fits.paneSourceColumns.left)).toEqual(['no', 'customer']);
    expect(keys(fits.paneSourceColumns.right)).toEqual(['amount']);
    // 幅 535px では 119px しか残らないので、右の固定列を中央へ回す。
    const tight = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 535, rowHeaderWidth: 56 });
    expect(keys(tight.paneSourceColumns.left)).toEqual(['no', 'customer']);
    expect(keys(tight.paneSourceColumns.right)).toEqual([]);
  });

  it('外す列が変わらない間は列ソースが同じ参照(列幅のドラッグ中に作り直さない)。幅が戻れば固定に戻る', () => {
    const resolve = createPaneLayoutResolver<R>();
    const a = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 340, rowHeaderWidth: 56 });
    const b = resolve({ orderedColumns: ordered, columnWidths: { date: 140 }, viewportWidth: 341, rowHeaderWidth: 56 });
    expect(b.paneSourceColumns).toBe(a.paneSourceColumns);
    const c = resolve({ orderedColumns: ordered, columnWidths: {}, viewportWidth: 900, rowHeaderWidth: 56 });
    expect(keys(c.paneSourceColumns.left)).toEqual(['no', 'customer']);
  });

  it('列ソースの単位: 未計測(幅 0)は外さない、右が無ければ左の内側から、合成列の掴み手は外さない', () => {
    const split = (columns: GridColumn<R>[]) => ({
      left: columns.filter((c) => c.pinned === 'left').map((column, logicalIndex) => ({ column, logicalIndex })),
      center: [],
      right: columns.filter((c) => c.pinned === 'right').map((column, logicalIndex) => ({ column, logicalIndex })),
    });
    expect(resolvePinnedOverflowKey(split(ordered), {}, 0, 56)).toBe('');
    const withHandle = split([
      { key: ROW_DRAG_HANDLE_COLUMN_KEY, title: '', width: 28, pinned: 'left' },
      { key: 'a', title: 'A', width: 300, pinned: 'left' },
    ]);
    expect(resolvePinnedOverflowKey(withHandle, {}, 200, 40)).toBe('a');
  });
});