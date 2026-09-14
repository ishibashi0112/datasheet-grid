// 追加(本体分解 E-5): 命令的 API の実体(createGridApi)の単体テストです(update 前の既定値 / 選択 API の dispatch /
//   スクロール target と markApiScroll / エクスポート scope / getState / 展開行ガード / パネル委譲)。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createGridApi, type GridApiArgs } from './gridApi';
import type { GridColumn, RowModel } from '../model/gridTypes.unbound';
import type { GridUiAction } from '../model/gridActions';
import { createInitialGridUiState } from '../model/gridReducer';
import { createUniformRowMetrics } from '../logic/verticalGeometry';
import { createDetailIndexCache } from '../logic/detailRow';
import type { GridPaneLayout } from '../logic/geometry';

type Row = { id: number; name: string };

const rows: Row[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
  { id: 3, name: 'c' },
];
const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名前', width: 120 },
];
const rowModel: RowModel<Row> = {
  getRowCount: () => rows.length,
  getRow: (i) => rows[i],
  getSourceIndex: (i) => i,
  getRowKey: (i) => rows[i]?.id ?? i,
};
const paneLayout: GridPaneLayout<Row> = {
  left: { pane: 'left', entries: [], totalWidth: 0 },
  center: {
    pane: 'center',
    entries: columns.map((column, logicalIndex) => ({
      column,
      logicalIndex,
      paneLocalStart: logicalIndex * 100,
      paneLocalSize: 100,
      paneLocalEnd: logicalIndex * 100 + 100,
    })),
    totalWidth: 200,
  },
  right: { pane: 'right', entries: [], totalWidth: 0 },
};

const makeScrollElement = () => {
  const el = document.createElement('div');
  let scrollTop = 0;
  let scrollLeft = 0;
  Object.defineProperty(el, 'scrollTop', { get: () => scrollTop, set: (v: number) => (scrollTop = v) });
  Object.defineProperty(el, 'scrollLeft', { get: () => scrollLeft, set: (v: number) => (scrollLeft = v) });
  Object.defineProperty(el, 'clientHeight', { value: 100 });
  Object.defineProperty(el, 'clientWidth', { value: 300 });
  Object.defineProperty(el, 'scrollHeight', { value: 1000 });
  Object.defineProperty(el, 'scrollWidth', { value: 300 });
  el.scrollTo = ((options: ScrollToOptions) => {
    if (typeof options.top === 'number') scrollTop = options.top;
    if (typeof options.left === 'number') scrollLeft = options.left;
  }) as typeof el.scrollTo;
  return el;
};

const makeArgs = (overrides: Partial<GridApiArgs<Row>> = {}) => {
  const actions: GridUiAction[] = [];
  const markApiScroll = vi.fn();
  const args: GridApiArgs<Row> = {
    scrollContainerRef: { current: makeScrollElement() },
    dispatch: (action) => {
      actions.push(action);
    },
    rowModel,
    viewRowCount: rows.length,
    leafRowCount: rows.length,
    groupTree: null,
    rowMetrics: createUniformRowMetrics(rows.length, 30),
    paneLayout,
    orderedColumns: columns,
    columns,
    onColumnsChange: undefined,
    uiState: createInitialGridUiState(columns),
    headerHeight: 36,
    verticalScaleFactor: 1,
    leftPaneTotalWidth: 0,
    rightPaneTotalWidth: 0,
    centerLeadingWidth: 56,
    windowFirstRow: 0,
    windowLastRow: 2,
    physicalBodyHeight: 90,
    rows,
    isServerSide: false,
    serverSideRefresh: vi.fn(),
    resolvedRowKeyGetter: (row) => row.id,
    isRowExportable: undefined,
    activeToolPanelTab: null,
    openToolPanel: vi.fn(),
    closeToolPanel: vi.fn(),
    undoRows: vi.fn(),
    redoRows: vi.fn(),
    canUndoRows: () => true,
    canRedoRows: () => false,
    clearUndoHistory: vi.fn(),
    detailRowEnabled: false,
    detailIsExpandable: undefined,
    detailIndexCacheRef: { current: createDetailIndexCache() },
    moveRowByKey: vi.fn(),
    commitRowSelection: vi.fn(),
    markApiScroll,
    ...overrides,
  };
  return { args, actions, markApiScroll };
};

describe('createGridApi', () => {
  it('update 前は安全な既定値を返し、update 後は最新 args を読む(ハンドルの参照は不変)', () => {
    const api = createGridApi<Row>();
    const handle = api.handle;
    expect(handle.getActiveCell()).toBeNull();
    expect(handle.getSelectedRows()).toEqual([]);
    expect(handle.exportCsv()).toBe('');
    expect(handle.canUndo()).toBe(false);
    const { args } = makeArgs();
    api.update(args);
    expect(api.handle).toBe(handle);
    expect(handle.canUndo()).toBe(true);
    expect(handle.getVisibleRowRange()).toEqual({ startIndex: 0, endIndex: 3 });
  });

  it('選択 API は reducer への dispatch に翻訳され、scrollIntoView で位置が変わると markApiScroll が呼ばれる', () => {
    const api = createGridApi<Row>();
    const { args, actions, markApiScroll } = makeArgs();
    api.update(args);
    api.handle.selectCell(2, 1, { scrollIntoView: true });
    expect(actions.map((action) => action.type)).toEqual(['selection/start', 'selection/end']);
    // 行 2 の top(60)+ 高さ 30 + ヘッダー 36 = 126 > viewport 100 → 下端揃えでスクロール。
    expect(args.scrollContainerRef.current?.scrollTop).toBe(26);
    expect(markApiScroll).toHaveBeenCalledTimes(1);
    // 既に可視なら 'auto' は no-op(markApiScroll も呼ばれない)。
    api.handle.scrollToRow(2);
    expect(markApiScroll).toHaveBeenCalledTimes(1);
    api.handle.setRowSelection({ type: 'include', rowKeys: [2] });
    expect(args.commitRowSelection).toHaveBeenCalledWith({ mode: 'include', keys: new Set([2]) });
  });

  it('exportCsv は scope に応じて行 / 列を解決し、selection 無しの scope=selection は空文字', () => {
    const api = createGridApi<Row>();
    const { args } = makeArgs();
    api.update(args);
    expect(api.handle.exportCsv()).toBe('ID,名前\r\n1,a\r\n2,b\r\n3,c');
    expect(api.handle.exportCsv({ scope: 'selection' })).toBe('');
    api.update({
      ...args,
      uiState: {
        ...args.uiState,
        selection: { type: 'cell', range: { start: { row: 1, col: 1 }, end: { row: 2, col: 1 } } },
      },
    });
    expect(api.handle.exportCsv({ scope: 'selection', includeHeaders: false })).toBe('b\r\nc');
    expect(api.handle.getExportData({ scope: 'rendered' }).rows).toHaveLength(3);
  });

  it('getState は永続スライス + 列メタを返し、openFilterManager / closeFilterManager はツールパネルへ委譲', () => {
    const api = createGridApi<Row>();
    const { args } = makeArgs({ activeToolPanelTab: 'filter' });
    api.update(args);
    const state = api.handle.getState();
    expect(state.columns?.map((column) => column.key)).toEqual(['id', 'name']);
    api.handle.openFilterManager();
    expect(args.openToolPanel).toHaveBeenCalledWith('filter');
    api.handle.closeFilterManager();
    expect(args.closeToolPanel).toHaveBeenCalledTimes(1);
    api.update({ ...args, activeToolPanelTab: 'columns' });
    api.handle.closeFilterManager();
    expect(args.closeToolPanel).toHaveBeenCalledTimes(1);
  });

  it('展開行 API: detailRow 無効では no-op、isExpandable=false の行は展開しない', () => {
    const api = createGridApi<Row>();
    const disabled = makeArgs();
    api.update(disabled.args);
    api.handle.setDetailRowExpanded(1, true);
    expect(disabled.actions).toEqual([]);
    const enabled = makeArgs({ detailRowEnabled: true, detailIsExpandable: (row) => row.id !== 1 });
    api.update(enabled.args);
    api.handle.setDetailRowExpanded(1, true);
    expect(enabled.actions).toEqual([]);
    api.handle.setDetailRowExpanded(2, true);
    expect(enabled.actions.map((action) => action.type)).toEqual(['detail/setExpanded']);
  });
});