// SpreadsheetGrid を実際に render し、行グルーピング(grouping ③)の「列面の配線」を実行検証する
//   結合テストです。仮想化行の DOM は jsdom では描画されないため、本ファイルはヘッダー
//   (自動グループ列の注入 / グループ元列の非表示 / SSRM 無効化)を対象にします。
//   グループ行の表示リスト自体は logic/grouping.test.ts、開閉・consumer 契約は batch 4 の
//   統合テストで担保します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GROUP_AUTO_COLUMN_KEY } from './logic/grouping';
import type { GridColumn, ServerSideDataSource } from './model/gridTypes';

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