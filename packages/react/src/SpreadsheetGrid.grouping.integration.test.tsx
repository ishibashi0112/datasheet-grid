// SpreadsheetGrid を実際に render し、行グルーピング(grouping ③)の「列面の配線」を実行検証する
//   結合テストです。仮想化行の DOM は jsdom では描画されないため、本ファイルはヘッダー
//   (自動グループ列の注入 / グループ元列の非表示 / SSRM 無効化)を対象にします。
//   グループ行の表示リスト自体は logic/grouping.test.ts、開閉・consumer 契約は batch 4 の
//   統合テストで担保します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';
import { createRef, useState } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GROUP_AUTO_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/grouping';
import type {
  GridColumn,
  ServerSideDataSource,
  SpreadsheetGridHandle,
} from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  // jsdom はレイアウトを持たず要素寸法が常に 0 のため、列仮想化(@tanstack/react-virtual の
  //   getRect = offsetWidth / offsetHeight)が 1 列も描画しません。本ファイルはヘッダー DOM を
  //   検証するので、寸法を広い固定値でスタブして全列を可視化します(他の統合テストは
  //   DOM 非依存の経路で検証するためスタブ不要)。
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1600,
  });
  // @tanstack/virtual-core 3.19 から、列の仮想化は見える幅を clientWidth で読みます(3.17 までは offsetWidth)。
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 900,
  });
});

afterEach(() => {
  cleanup();
});

type Row = { region: string; rep: string; qty: number };

const rows: Row[] = [
  { region: '関東', rep: '佐藤', qty: 10 },
  { region: '関西', rep: '田中', qty: 20 },
];

const groupedColumns: GridColumn<Row>[] = [
  { key: 'region', title: '地域', width: 100, rowGroup: true },
  { key: 'rep', title: '担当', width: 100, rowGroup: true },
  { key: 'qty', title: '数量', width: 100, aggFunc: 'sum' },
];

// ヘッダーセル(.ssg-header-cell は data-ssg-col-key を持つ)を列 key で引きます。
const headerCell = (container: HTMLElement, key: string) =>
  container.querySelector(`.ssg-header-row [data-ssg-col-key="${key}"]`);

// center ペインのグループ行 / 全ボディ行です(left ペインの行ヘッダー複製を数えないため
//   ペインを固定します)。
const centerGroupRows = (container: HTMLElement) =>
  container.querySelectorAll('[data-pane="center"][data-ssg-group-row]');
const centerBodyRows = (container: HTMLElement) =>
  container.querySelectorAll('[data-pane="center"].ssg-body-row');

describe('行グルーピングの列面(結合)', () => {
  it('rowGroup 指定時: 自動グループ列が先頭に注入され、グループ元列はヘッダーから消える', () => {
    const { container } = render(
      <SpreadsheetGrid columns={groupedColumns} rows={rows} />,
    );

    const autoCell = headerCell(container, GROUP_AUTO_COLUMN_KEY);
    expect(autoCell).not.toBeNull();
    // タイトルはグループ列タイトルの連結です。
    expect(autoCell?.textContent).toContain('地域 › 担当');
    expect(headerCell(container, 'region')).toBeNull();
    expect(headerCell(container, 'rep')).toBeNull();
    // 非グループ列は従来どおり表示されます。
    expect(headerCell(container, 'qty')).not.toBeNull();
  });

  it('自動グループ列には列メニュー(⋮)を出さない(他列には出る)', () => {
    const { container } = render(
      <SpreadsheetGrid columns={groupedColumns} rows={rows} />,
    );

    const autoCell = headerCell(container, GROUP_AUTO_COLUMN_KEY);
    const qtyCell = headerCell(container, 'qty');
    expect(autoCell?.querySelector('.ssg-icon-btn')).toBeNull();
    expect(qtyCell?.querySelector('.ssg-icon-btn')).not.toBeNull();
  });

  it('rowGroup 指定なしでは自動グループ列を注入しない(従来経路)', () => {
    const plainColumns: GridColumn<Row>[] = groupedColumns.map((column) => ({
      ...column,
      rowGroup: undefined,
    }));
    const { container } = render(
      <SpreadsheetGrid columns={plainColumns} rows={rows} />,
    );

    expect(headerCell(container, GROUP_AUTO_COLUMN_KEY)).toBeNull();
    expect(headerCell(container, 'region')).not.toBeNull();
    expect(headerCell(container, 'rep')).not.toBeNull();
  });

  it('グループ行が描画され、開閉(シェブロン click / ref API / Enter)と集計表示が機能する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} />,
    );

    // 全展開: グループ行 4(関東 / 佐藤 / 関西 / 田中)+ leaf 2 = 6 行。
    expect(centerGroupRows(container)).toHaveLength(4);
    expect(centerBodyRows(container)).toHaveLength(6);

    // グループセル: ラベル + 件数 + 集計値(qty sum)が同じ行に出ます。
    const firstGroup = centerGroupRows(container)[0] as HTMLElement;
    expect(firstGroup.textContent).toContain('関東');
    expect(firstGroup.textContent).toContain('(1件)');
    expect(
      firstGroup.querySelector('[data-ssg-col-key="qty"]')?.textContent,
    ).toBe('10');

    // シェブロン click で折りたたみ: 関東配下(佐藤グループ行 + leaf)が消えます。
    const toggle = firstGroup.querySelector(
      '.ssg-group-toggle',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(centerGroupRows(container)).toHaveLength(3);
    expect(centerBodyRows(container)).toHaveLength(4);
    expect(
      (
        centerGroupRows(container)[0].querySelector(
          '.ssg-group-toggle',
        ) as HTMLButtonElement
      ).getAttribute('aria-expanded'),
    ).toBe('false');

    // ref API: expandAllGroups で全展開へ戻ります。
    act(() => {
      ref.current?.expandAllGroups();
    });
    expect(centerBodyRows(container)).toHaveLength(6);

    // collapseAllGroups: 最上位 2 グループ行のみになります。
    act(() => {
      ref.current?.collapseAllGroups();
    });
    expect(centerGroupRows(container)).toHaveLength(2);
    expect(centerBodyRows(container)).toHaveLength(2);

    // getGroupRows は開閉に関わらず全グループ(DFS 順)を返します。
    const groupRows = ref.current?.getGroupRows() ?? [];
    expect(groupRows.map((g) => g.label)).toEqual([
      '関東',
      '佐藤',
      '関西',
      '田中',
    ]);

    // setGroupCollapsed(false) で個別展開できます(関東のみ展開 → 佐藤グループが出る)。
    act(() => {
      ref.current?.setGroupCollapsed(groupRows[0].groupKey, false);
      ref.current?.setGroupCollapsed(groupRows[1].groupKey, false);
    });
    expect(centerGroupRows(container)).toHaveLength(3);

    // Enter キー開閉: アクティブセルをグループ行(view 0 = 関東)へ置いて Enter。
    act(() => {
      ref.current?.expandAllGroups();
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(centerBodyRows(container)).toHaveLength(4);
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(centerBodyRows(container)).toHaveLength(6);
  });

  it('aggFunc 列の valueFormatter は集計値にも適用される(row は undefined)', () => {
    const formatterColumns: GridColumn<Row>[] = [
      { key: 'region', title: '地域', width: 100, rowGroup: true },
      {
        key: 'qty',
        title: '数量',
        width: 100,
        aggFunc: 'sum',
        valueFormatter: ({ value }) =>
          `¥${Number(value).toLocaleString('ja-JP')}`,
      },
    ];
    const bigRows: Row[] = [
      { region: '関東', rep: 'a', qty: 1234567 },
      { region: '関東', rep: 'b', qty: 1 },
    ];
    const { container } = render(
      <SpreadsheetGrid columns={formatterColumns} rows={bigRows} />,
    );
    const firstGroup = centerGroupRows(container)[0] as HTMLElement;
    expect(
      firstGroup.querySelector('[data-ssg-col-key="qty"]')?.textContent,
    ).toBe('¥1,234,568');
  });

  // 追加(段階 2 DU-23): グループ行の集計を合計行と同じ書式にしました(これまでは「4115.333333」「6220」と素の値)。
  it('DU-23: グループ行の集計は合計行と同じ書式(桁区切り・小数 4 桁まで・平均 / 最小 / 最大 / 個数の見出し)', () => {
    type Sale = { region: string; amount: number; price: number; orders: number; low: number; custom: number };
    const saleColumns: GridColumn<Sale>[] = [
      { key: 'region', title: '地域', width: 100, rowGroup: true },
      { key: 'amount', title: '金額', width: 120, aggFunc: 'sum' },
      { key: 'price', title: '単価', width: 120, aggFunc: 'avg' },
      { key: 'orders', title: '注文', width: 120, aggFunc: 'count' },
      { key: 'low', title: '最安', width: 120, aggFunc: 'min' },
      { key: 'custom', title: '独自', width: 120, aggFunc: ({ values }) => values.length * 1000.5 },
    ];
    const sales: Sale[] = [
      { region: '関東', amount: 1234500, price: 4120, orders: 1, low: 3, custom: 0 },
      { region: '関東', amount: 1000, price: 4120, orders: 1, low: 7, custom: 0 },
      { region: '関東', amount: 5, price: 4106, orders: 1, low: 5, custom: 0 },
    ];
    const { container } = render(<SpreadsheetGrid columns={saleColumns} rows={sales} />);
    const group = centerGroupRows(container)[0] as HTMLElement;
    const cell = (key: string) => group.querySelector(`[data-ssg-col-key="${key}"]`);
    expect(cell('amount')?.textContent).toBe('1,235,505');
    expect(cell('amount')?.querySelector('.ssg-group-caption')).toBeNull();
    expect(cell('price')?.querySelector('.ssg-group-caption')?.textContent).toBe('平均');
    expect(cell('price')?.textContent).toBe('平均4,115.3333');
    expect(cell('orders')?.textContent).toBe('個数3');
    expect(cell('low')?.textContent).toBe('最小3');
    // カスタムの集計も数値なら同じ書式(見出しは付けない)。
    expect(cell('custom')?.textContent).toBe('3,001.5');
  });

  // 変更(段階 2 DU-10): 表示から外れているグループ元の列(地域・担当)を先頭に入れます(これまでは「数量」だけの表で、
  //   どの行がどのグループか分からなかった)。自動グループ列(合成列)は今までどおり出しません。
  it('エクスポートは自動グループ列を除き、グループ元の列を先頭に入れて leaf 行を出力する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} />);

    const csv = ref.current?.exportCsv({ includeHeaders: true }) ?? '';
    expect(csv.split('\r\n')).toEqual(['地域,担当,数量', '関東,佐藤,10', '関西,田中,20']);

    const data = ref.current?.getExportData();
    expect(data?.columns.map((c) => c.key)).toEqual(['region', 'rep', 'qty']);
    expect(data?.rows).toHaveLength(2);
    expect(data?.rowKinds).toBeUndefined();
    // scope 'raw'(全ソース行)も同じ列。
    expect(ref.current?.exportCsv({ scope: 'raw' })).toBe('地域,担当,数量\r\n関東,佐藤,10\r\n関西,田中,20');
  });

  // 追加(段階 2 DU-10): includeGroupRows で各グループの先頭に小計の行(帳票向け)。
  it('includeGroupRows: 各グループの先頭に小計の行を入れる(祖先の値 + 「<ラベル> 小計」 + 集計値)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const twoPerRegion: Row[] = [
      { region: '関東', rep: '佐藤', qty: 10 },
      { region: '関西', rep: '田中', qty: 20 },
      { region: '関東', rep: '鈴木', qty: 5 },
    ];
    render(<SpreadsheetGrid ref={ref} columns={groupedColumns} rows={twoPerRegion} />);
    // 折りたたんでいても全部のグループを出す。
    act(() => {
      ref.current?.collapseAllGroups();
    });
    expect(ref.current?.exportCsv({ includeGroupRows: true }).split('\r\n')).toEqual([
      '地域,担当,数量',
      '関東 小計,,15',
      '関東,佐藤 小計,10',
      '関東,佐藤,10',
      '関東,鈴木 小計,5',
      '関東,鈴木,5',
      '関西 小計,,20',
      '関西,田中 小計,20',
      '関西,田中,20',
    ]);
    const data = ref.current?.getExportData({ includeGroupRows: true });
    expect(data?.rowKinds).toEqual(['group', 'group', 'data', 'group', 'data', 'group', 'group', 'data']);
    // 集計値は生値(数値のまま)。
    expect(data?.rows[0]?.map((cell) => cell.value)).toEqual(['関東 小計', null, 15]);
    // 小計の行は scope 'view' だけ('raw' はフィルター / グループを無視するので入れない)。
    expect(ref.current?.exportCsv({ scope: 'raw', includeGroupRows: true }).split('\r\n')).toHaveLength(4);
  });

  it('エクスポート(view)は折りたたみに関係なく全 leaf 行を出力する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const isRowExportable = vi.fn(() => true);
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={groupedColumns}
        rows={rows}
        isRowExportable={isRowExportable}
      />,
    );

    act(() => {
      ref.current?.collapseAllGroups();
    });
    // 折りたたみ後もグループ順(関東 → 関西)で leaf 2 行が出ます。
    expect(ref.current?.exportCsv()).toBe('地域,担当,数量\r\n関東,佐藤,10\r\n関西,田中,20');
    expect(ref.current?.getExportData().rows).toHaveLength(2);
    // isRowExportable の viewRowIndex は全展開時のビュー行 index(グループ行 2 段の直下 = 2 / 5)。
    expect(isRowExportable.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { viewRowIndex: 2, rowKey: 0 },
      { viewRowIndex: 5, rowKey: 1 },
      { viewRowIndex: 2, rowKey: 0 },
      { viewRowIndex: 5, rowKey: 1 },
    ]);
  });

  it('行選択の件数はグループ行を除いた leaf 行数で数える', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid
        ref={ref}
        columns={groupedColumns}
        rows={rows}
        enableRowSelection
      />,
    );

    act(() => {
      ref.current?.selectAllRows();
    });
    // 全選択(exclude モード)の件数は leaf 2 件です(グループ行 4 を含まない)。
    expect(ref.current?.getSelectedRowCount()).toBe(2);
    expect(ref.current?.getSelectedRowKeys()).toHaveLength(2);
  });

  it('serverSide(dataSource)では rowGroup を無視し、開発時警告を出す', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const dataSource: ServerSideDataSource<Row> = {
        getRows: async () => ({ rows: [], totalRowCount: 0 }),
      };
      const { container } = render(
        <SpreadsheetGrid
          columns={groupedColumns}
          rows={[]}
          dataSource={dataSource}
        />,
      );

      // 自動グループ列は注入されず、rowGroup 列はそのまま表示されます。
      expect(headerCell(container, GROUP_AUTO_COLUMN_KEY)).toBeNull();
      expect(headerCell(container, 'region')).not.toBeNull();
      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes('行グルーピング(rowGroup)は未対応'),
        ),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// 追加(1.0 前の最終チェック FC-08): グルーピング中もグループ元列のソート / 列フィルターが効く(ドキュメントどおり)。
describe('グルーピング中のグループ元列のソート / フィルター', () => {
  type SalesRow = { region: string; qty: number };
  const salesRows: SalesRow[] = [
    { region: 'b-関東', qty: 10 },
    { region: 'a-関西', qty: 20 },
    { region: 'c-北海道', qty: 30 },
    { region: 'b-関東', qty: 5 },
  ];
  const salesColumns: GridColumn<SalesRow>[] = [
    { key: 'region', title: '地域', width: 100, rowGroup: true, filterType: 'select' },
    { key: 'qty', title: '数量', width: 100, aggFunc: 'sum' },
  ];
  const groupLabels = (ref: { current: SpreadsheetGridHandle<SalesRow> | null }) =>
    (ref.current?.getGroupRows() ?? []).map((group) => group.label);

  it('グループ元列でソートするとグループごと並び替わり、列フィルターで絞れる', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    render(<SpreadsheetGrid ref={ref} columns={salesColumns} rows={salesRows} />);
    expect(groupLabels(ref)).toEqual(['b-関東', 'a-関西', 'c-北海道']);
    act(() => {
      ref.current?.applyState({
        ...ref.current.getState(),
        sort: [{ columnKey: 'region', direction: 'desc' }],
      });
    });
    expect(groupLabels(ref)).toEqual(['c-北海道', 'b-関東', 'a-関西']);
    act(() => {
      ref.current?.applyState({
        ...ref.current.getState(),
        filters: { globalText: '', columnFilters: { region: { kind: 'select', value: 'b-関東' } } },
      });
    });
    expect(groupLabels(ref)).toEqual(['b-関東']);
  });

  // 追加(FC-08 の見直し): グループ元列のフィルターはチップバー / 管理パネルに出る(外す手段を残す)。
  // 変更(段階 2 DU-11): 非表示列ではなく「(グループ化中)」と出し、ラベルから編集できる。
  it('グループ元列の列フィルターはチップバーに「グループ化中」として出て、× で外せる', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    render(<SpreadsheetGrid ref={ref} columns={salesColumns} rows={salesRows} showFilterChipBar />);
    act(() => {
      ref.current?.applyState({
        ...ref.current.getState(),
        filters: { globalText: '', columnFilters: { region: { kind: 'select', value: 'b-関東' } } },
      });
    });
    expect(groupLabels(ref)).toEqual(['b-関東']);
    expect(screen.getByText('地域(グループ化中)')).toBeTruthy();
    expect(screen.getByLabelText<HTMLButtonElement>('地域 のフィルターを編集').disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('地域 のフィルターをクリア'));
    expect(ref.current?.getState().filters.columnFilters).toEqual({});
    expect(groupLabels(ref)).toEqual(['b-関東', 'a-関西', 'c-北海道']);
  });

  // 追加(段階 2 DU-11): グループ元列の列フィルターを画面から足せる(これまでは applyState でしか掛けられなかった)。
  it('DU-11: フィルターの管理の「フィルターを追加」にグループ元列が入り、選ぶと自動グループ列の見出しの下に開く', async () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const { container } = render(<SpreadsheetGrid ref={ref} columns={salesColumns} rows={salesRows} />);
    act(() => {
      ref.current?.openFilterManager();
    });
    const addSelect = screen.getByLabelText<HTMLSelectElement>('フィルターを追加する列を選択');
    const option = Array.from(addSelect.options).find((candidate) => candidate.value === 'region');
    expect(option?.textContent).toBe('地域(グループ化中)');
    act(() => {
      fireEvent.change(addSelect, { target: { value: 'region' } });
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    // 地域の select フィルターのポップオーバーが開く(候補に地域の値)。
    const popover = document.querySelector<HTMLElement>('.ssg-filter-popover');
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain('b-関東');
    expect(popover?.textContent).toContain('c-北海道');
    // 位置の基準は自動グループ列の見出し(グループ元の列は見出しに無い)。
    expect(headerCell(container, GROUP_AUTO_COLUMN_KEY)).not.toBeNull();
    expect(headerCell(container, 'region')).toBeNull();
  });

  it('DU-11: グルーピングしていないときは「(グループ化中)」と出ない', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const plainColumns = salesColumns.map((column) => ({ ...column, rowGroup: false }));
    render(<SpreadsheetGrid ref={ref} columns={plainColumns} rows={salesRows} />);
    act(() => {
      ref.current?.openFilterManager();
    });
    const addSelect = screen.getByLabelText<HTMLSelectElement>('フィルターを追加する列を選択');
    const option = Array.from(addSelect.options).find((candidate) => candidate.value === 'region');
    expect(option?.textContent).toBe('地域');
  });

  it('並び替えの管理パネルの列の候補にグループ元列が入り、自動グループ列は入らない', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const { container } = render(<SpreadsheetGrid ref={ref} columns={salesColumns} rows={salesRows} />);
    act(() => {
      ref.current?.applyState({ ...ref.current.getState(), sort: [{ columnKey: 'qty', direction: 'asc' }] });
    });
    const menuButton = container.querySelector<HTMLElement>(
      '.ssg-header-row [data-ssg-col-key="qty"] [data-ssg-tooltip="列メニュー"]',
    );
    expect(menuButton).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(menuButton as HTMLElement, { button: 0 });
    });
    const manageItem = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find((item) =>
      item.textContent?.includes('並び替えを管理'),
    );
    expect(manageItem).toBeDefined();
    act(() => {
      fireEvent.click(manageItem as HTMLButtonElement);
    });
    const select = document.querySelector<HTMLSelectElement>('.ssg-sort-select');
    expect(select).not.toBeNull();
    const optionKeys = Array.from(select?.options ?? []).map((option) => option.value);
    expect(optionKeys).toContain('region');
    expect(optionKeys).toContain('qty');
    expect(optionKeys).not.toContain(GROUP_AUTO_COLUMN_KEY);
  });
});

// 追加(段階 2 DU-24): 列メニューからのグループ化と、集計のある列の並べ替えでグループを集計値の順に並べること。
describe('列メニューからのグループ化 / 集計値の順(DU-24)', () => {
  type SalesRow = { id: number; region: string; rep: string; qty: number };
  const salesRows: SalesRow[] = [
    { id: 1, region: '関東', rep: '佐藤', qty: 10 },
    { id: 2, region: '関西', rep: '田中', qty: 50 },
    { id: 3, region: '関東', rep: '鈴木', qty: 30 },
    { id: 4, region: '九州', rep: '伊藤', qty: 20 },
  ];
  const baseColumns: GridColumn<SalesRow>[] = [
    { key: 'region', title: '地域', width: 100, rowGroup: false },
    { key: 'rep', title: '担当', width: 100 },
    { key: 'qty', title: '数量', width: 100, aggFunc: 'sum' },
  ];
  const Controlled = ({
    initialColumns,
    gridRef,
    onColumns,
  }: {
    initialColumns: GridColumn<SalesRow>[];
    gridRef?: { current: SpreadsheetGridHandle<SalesRow> | null };
    onColumns?: (columns: GridColumn<SalesRow>[]) => void;
  }) => {
    const [columns, setColumns] = useState(initialColumns);
    return (
      <SpreadsheetGrid
        ref={gridRef}
        columns={columns}
        rows={salesRows}
        rowKeyGetter={(row) => row.id}
        onColumnsChange={(next) => {
          onColumns?.(next);
          setColumns(next);
        }}
      />
    );
  };
  const openMenu = (container: HTMLElement, key: string) => {
    const button = container.querySelector<HTMLElement>(
      `.ssg-header-row [data-ssg-col-key="${key}"] [data-ssg-tooltip="列メニュー"]`,
    );
    expect(button).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(button as HTMLElement, { button: 0 });
    });
  };
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find(
      (item) => item.querySelector('.ssg-menu-label')?.textContent === label,
    );

  it('「この列でグループ化」で rowGroup が付き、「グループ化を外す」ですべて外れる', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const received: GridColumn<SalesRow>[][] = [];
    const { container } = render(
      <Controlled initialColumns={baseColumns} gridRef={ref} onColumns={(next) => received.push(next)} />,
    );
    openMenu(container, 'region');
    expect(menuItem('グループ化を外す')).toBeUndefined();
    act(() => {
      fireEvent.click(menuItem('この列でグループ化') as HTMLButtonElement);
    });
    expect(received.at(-1)?.map((column) => [column.key, column.rowGroup])).toEqual([
      ['region', true],
      ['rep', undefined],
      ['qty', undefined],
    ]);
    expect(headerCell(container, GROUP_AUTO_COLUMN_KEY)).not.toBeNull();
    expect(headerCell(container, 'region')).toBeNull();
    expect(ref.current?.getGroupRows().map((group) => group.label)).toEqual(['関東', '関西', '九州']);

    openMenu(container, 'rep');
    act(() => {
      fireEvent.click(menuItem('グループ化を外す') as HTMLButtonElement);
    });
    expect(received.at(-1)?.map((column) => [column.key, column.rowGroup])).toEqual([
      ['region', false],
      ['rep', undefined],
      ['qty', undefined],
    ]);
    expect(headerCell(container, GROUP_AUTO_COLUMN_KEY)).toBeNull();
    expect(headerCell(container, 'region')).not.toBeNull();
  });

  it('前にある列でグループ化すると階層の一番下に足す(columns の中で最後のグループ元の列の後ろへ移す)', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const received: GridColumn<SalesRow>[][] = [];
    const { container } = render(
      <Controlled
        initialColumns={[
          { key: 'rep', title: '担当', width: 100 },
          { key: 'region', title: '地域', width: 100, rowGroup: true },
          { key: 'qty', title: '数量', width: 100, aggFunc: 'sum' },
        ]}
        gridRef={ref}
        onColumns={(next) => received.push(next)}
      />,
    );
    openMenu(container, 'rep');
    act(() => {
      fireEvent.click(menuItem('この列でグループ化') as HTMLButtonElement);
    });
    expect(received.at(-1)?.map((column) => column.key)).toEqual(['region', 'rep', 'qty']);
    const levels = ref.current?.getGroupRows().map((group) => `${group.level}:${group.label}`);
    expect(levels?.slice(0, 3)).toEqual(['0:関東', '1:佐藤', '1:鈴木']);
  });

  it('集計のある列には出さない / rowGroup を書いていない表と onColumnsChange の無い表には出さない', () => {
    const { container, unmount } = render(<Controlled initialColumns={baseColumns} />);
    openMenu(container, 'qty');
    expect(menuItem('この列でグループ化')).toBeUndefined();
    expect(menuItem('昇順で並び替え')).toBeDefined();
    unmount();

    const plain: GridColumn<SalesRow>[] = baseColumns.map((column) => {
      const copy = { ...column };
      delete copy.rowGroup;
      return copy;
    });
    const second = render(<Controlled initialColumns={plain} />);
    openMenu(second.container, 'region');
    expect(menuItem('この列でグループ化')).toBeUndefined();
    second.unmount();

    const third = render(<SpreadsheetGrid columns={baseColumns} rows={salesRows} />);
    openMenu(third.container, 'region');
    expect(menuItem('この列でグループ化')).toBeUndefined();
  });

  it('集計のある列で並べ替えると、グループもその集計値の順に並ぶ', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const grouped = baseColumns.map((column) => (column.key === 'region' ? { ...column, rowGroup: true } : column));
    render(<SpreadsheetGrid ref={ref} columns={grouped} rows={salesRows} />);
    const labels = () => ref.current?.getGroupRows().map((group) => group.label);
    expect(labels()).toEqual(['関東', '関西', '九州']);
    act(() => {
      ref.current?.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
    });
    // 合計: 関西 50 / 関東 40 / 九州 20。
    expect(labels()).toEqual(['関西', '関東', '九州']);
    act(() => {
      ref.current?.applyState({ sort: [{ columnKey: 'qty', direction: 'asc' }] });
    });
    expect(labels()).toEqual(['九州', '関東', '関西']);
    // グループ元の列の並べ替えが先なら、その列の順(今までどおり。後ろの集計の条件では並べ替えない)。
    act(() => {
      ref.current?.applyState({ sort: [{ columnKey: 'region', direction: 'desc' }] });
    });
    const byRegion = labels();
    act(() => {
      ref.current?.applyState({
        sort: [
          { columnKey: 'region', direction: 'desc' },
          { columnKey: 'qty', direction: 'desc' },
        ],
      });
    });
    expect(labels()).toEqual(byRegion);
    expect(byRegion).not.toEqual(['関西', '関東', '九州']);
  });

  it('manualSorting では集計値の順に並べない(行も並べないため)', () => {
    const ref = createRef<SpreadsheetGridHandle<SalesRow>>();
    const grouped = baseColumns.map((column) => (column.key === 'region' ? { ...column, rowGroup: true } : column));
    render(<SpreadsheetGrid ref={ref} columns={grouped} rows={salesRows} manualSorting />);
    act(() => {
      ref.current?.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
    });
    expect(ref.current?.getGroupRows().map((group) => group.label)).toEqual(['関東', '関西', '九州']);
  });
});

// 追加(dogfood DF-01 / DF-22 / DU-05): 実際にアプリを作って見つかったグルーピングの所見の回帰テストです。
describe('グルーピングの操作(dogfood)', () => {
  it('DF-01: グループ行のセルを押すとアクティブセルになり、Enter はその行の開閉になる(直前の葉のセルを編集しない)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} onRowsChange={onRowsChange} />,
    );
    // view: 0=関東 1=佐藤 2=leaf(佐藤) 3=関西 4=田中 5=leaf(田中)。先に葉のセルを選んでおく。
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    const kanto = centerGroupRows(container)[0] as HTMLElement;
    const qtyCell = kanto.querySelector<HTMLElement>('[data-ssg-col-key="qty"]');
    expect(qtyCell).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(qtyCell!, { button: 0, pointerId: 1, pointerType: 'mouse' });
      fireEvent.pointerUp(window, { button: 0, pointerId: 1, pointerType: 'mouse' });
    });
    expect(ref.current?.getActiveCell()?.row).toBe(0);
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    fireEvent.keyDown(shell, { key: 'Enter' });
    // 関東が閉じる(佐藤グループ行と葉が消える)。編集は始まらない。
    expect(centerBodyRows(container)).toHaveLength(4);
    expect(container.querySelector('.ssg-cell-editor')).toBeNull();
    expect(onRowsChange).not.toHaveBeenCalled();
  });

  // 追加(段階 2 G1): 自動グループ列のセルの番地は、先頭のデータ列と同じ文字ではなく見出しの名前と行番号。
  it('G1: 自動グループ列のセルの番地は「見出しの名前 行番号」', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} />);
    const kanto = centerGroupRows(container)[0] as HTMLElement;
    const groupCell = kanto.querySelector<HTMLElement>(`[data-ssg-col-key="${GROUP_AUTO_COLUMN_KEY}"]`);
    expect(groupCell).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(groupCell!, { button: 0, pointerId: 1, pointerType: 'mouse' });
      fireEvent.pointerUp(window, { button: 0, pointerId: 1, pointerType: 'mouse' });
    });
    const bottomBar = container.querySelector('.ssg-bar--bottom');
    expect(bottomBar?.textContent).toContain('セル 地域 › 担当 1');
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    expect(container.querySelector('.ssg-bar--bottom')?.textContent).toContain('セル A1');
  });

  it('DU-05: グローバルフィルターはグループ元列の値でも探せる', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} enableGlobalFilter />);
    act(() => {
      ref.current?.applyState({ ...ref.current.getState(), filters: { globalText: '関西', columnFilters: {} } });
    });
    expect((ref.current?.getGroupRows() ?? []).map((group) => group.label)).toEqual(['関西', '田中']);
  });

  it('DF-22: ツールパネルの列一覧では、グループ元列を「グループ化中」として切り替えられないようにする', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    // 表に出る列が 2 つ(数量・数量(倍))。グループ元列は表に出る列として数えない(別視点のレビュー: 数えると最後の 1 列を
    //   外せていた)ので、数量は外せる。
    const columnsWithTwo: GridColumn<Row>[] = [
      ...groupedColumns,
      { key: 'double', title: '数量(倍)', width: 100, getValue: (row) => (row ? row.qty * 2 : null) },
    ];
    render(<SpreadsheetGrid ref={ref} columns={columnsWithTwo} rows={rows} onColumnsChange={() => {}} />);
    act(() => {
      ref.current?.openFilterManager();
    });
    const columnsTab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) =>
      tab.textContent?.includes('列'),
    );
    expect(columnsTab).toBeDefined();
    act(() => {
      fireEvent.click(columnsTab!);
    });
    const regionToggle = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-chooser-toggle')).find(
      (button) => button.textContent?.includes('地域'),
    );
    expect(regionToggle?.textContent).toContain('地域(グループ化中)');
    expect(regionToggle?.disabled).toBe(true);
    const qtyToggle = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-chooser-toggle')).find((button) =>
      button.textContent?.includes('数量'),
    );
    expect(qtyToggle?.disabled).toBe(false);
  });

  // 追加(別視点のレビュー): 表に出ている列が 1 つだけなら、グループ元列が表示中でも、その 1 列は外せない(表が空になるため)。
  it('グループ元列は表に出る列として数えず、最後の 1 列は外せない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} onColumnsChange={() => {}} />);
    act(() => {
      ref.current?.openFilterManager();
    });
    const columnsTab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) =>
      tab.textContent?.includes('列'),
    );
    act(() => {
      fireEvent.click(columnsTab!);
    });
    const qtyToggle = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-chooser-toggle')).find((button) =>
      button.textContent?.includes('数量'),
    );
    expect(qtyToggle?.disabled).toBe(true);
  });
});
