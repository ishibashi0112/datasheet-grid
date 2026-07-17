// SpreadsheetGrid を実際に render し、行グルーピング(grouping ③)の「列面の配線」を実行検証する
//   結合テストです。仮想化行の DOM は jsdom では描画されないため、本ファイルはヘッダー
//   (自動グループ列の注入 / グループ元列の非表示 / SSRM 無効化)を対象にします。
//   グループ行の表示リスト自体は logic/grouping.test.ts、開閉・consumer 契約は batch 4 の
//   統合テストで担保します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GROUP_AUTO_COLUMN_KEY } from './logic/grouping';
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

  it('エクスポートは自動グループ列を除外し leaf 行のみを出力する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(<SpreadsheetGrid ref={ref} columns={groupedColumns} rows={rows} />);

    const csv = ref.current?.exportCsv({ includeHeaders: true }) ?? '';
    const lines = csv.split('\r\n');
    // ヘッダーに自動グループ列(地域 › 担当)は現れず、leaf 2 行のみが出力されます。
    expect(lines[0]).toBe('数量');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('10');
    expect(lines[2]).toBe('20');

    const data = ref.current?.getExportData();
    expect(data?.columns.map((c) => c.key)).toEqual(['qty']);
    expect(data?.rows).toHaveLength(2);
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