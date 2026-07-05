// エクスポート scope('view' / 'raw' / 'rendered' / 'selection' + 後方互換 'all' / 'visible')の
//   「配線」を実行検証する結合テストです。純ロジック(logic/exportScope.test.ts)は正規化のみを固定し、
//   ここでは実コンポーネントを通して SS2603 のバグ報告(「'visible' が描画中の行だけを返し、出力が
//   スクロール位置に依存して変わる」)の再発防止を確認します:
//   - 'view'(既定)がフィルター/ソート適用後の「全」ビュー行を返す(描画ウィンドウ非依存。jsdom は
//     viewport 実測 0 で描画ウィンドウが極小のため、全行が返ること自体がウィンドウ非依存の証明になる)。
//   - 'raw' がフィルターもソートも無視した全ソース行を rows 配列順で返す。
//   - 旧 'all' / 'visible' が新 'view' / 'rendered' と厳密に同一の結果を返す(後方互換)。
//   既存の結合テストと同じく DOM を要するため、本ファイルは jsdom で回します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { GRID_STATE_VERSION } from './logic/gridState';
import type {
  GridColumn,
  GridExportData,
  GridState,
  SpreadsheetGridHandle,
} from './model/gridTypes';

// jsdom には ResizeObserver / Element.scrollTo が無いため、最小スタブを入れます(既存の結合テストと同じ)。
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
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 160 },
  { key: 'qty', title: 'Qty', width: 100 },
];

// フィルター('be' 部分一致)とソート(qty 昇順)の効果が判別できるデータです。
//   ソース順 = id [1,2,3,4,5] / フィルター後 = id {2,3,5} / ソート後ビュー順 = id [5,2,3] と、
//   3 つの並びがすべて異なるため、各 scope がどの段階を読んでいるかを一意に識別できます。
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 30 },
  { id: 2, name: 'beta', qty: 10 },
  { id: 3, name: 'abbey', qty: 20 },
  { id: 4, name: 'gamma', qty: 40 },
  { id: 5, name: 'berry', qty: 5 },
];

// name 列に text フィルター('be' 部分一致) + qty 昇順ソートを適用する状態です。
const filteredSortedState: GridState = {
  version: GRID_STATE_VERSION,
  columnWidths: {},
  filters: {
    globalText: '',
    columnFilters: { name: { kind: 'text', value: 'be' } },
  },
  sort: [{ columnKey: 'qty', direction: 'asc' }],
};

// エクスポートデータから id 列(先頭列)の生値を並びで取り出します。
const idsOf = (data: GridExportData): unknown[] =>
  data.rows.map((cells) => cells[0].value);

// グリッドを mount し、フィルター + ソートを適用済みのハンドルを返します。
const setupFilteredSorted = (): SpreadsheetGridHandle<Row> => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} />);
  act(() => {
    ref.current?.applyState(filteredSortedState);
  });
  const handle = ref.current;
  expect(handle).not.toBeNull();
  return handle as SpreadsheetGridHandle<Row>;
};

describe('SpreadsheetGrid エクスポート scope(結合)', () => {
  it("'view' はフィルター/ソート適用後の全ビュー行を返す(描画ウィンドウ非依存)", () => {
    const handle = setupFilteredSorted();

    const view = handle.getExportData({ scope: 'view' });
    // フィルター後 3 行がソート順(qty 昇順 = id 5,2,3)で「すべて」返ること。jsdom の描画ウィンドウは
    //   極小(viewport 実測 0)のため、3 行全部が返る = ウィンドウ非依存であることの実証になります。
    expect(idsOf(view)).toEqual([5, 2, 3]);

    // CSV も同一規則(resolveExportScope を共有)。
    const csv = handle.exportCsv({ scope: 'view', includeHeaders: false });
    expect(csv).toBe('5,berry,5\r\n2,beta,10\r\n3,abbey,20');
  });

  it("既定 scope は 'view'(オプション省略時も同一結果)", () => {
    const handle = setupFilteredSorted();
    expect(handle.getExportData()).toEqual(handle.getExportData({ scope: 'view' }));
    expect(handle.exportCsv()).toBe(handle.exportCsv({ scope: 'view' }));
  });

  it("'raw' はフィルターもソートも無視した全ソース行を rows 配列順で返す", () => {
    const handle = setupFilteredSorted();

    const raw = handle.getExportData({ scope: 'raw' });
    // フィルター前の 5 行がソース順(id 1..5)で返ること(= フィルターにもソートにも影響されない)。
    expect(idsOf(raw)).toEqual([1, 2, 3, 4, 5]);

    // 列は可視列・固定順に従います(本テストでは宣言順 = ID / Name / Qty)。
    expect(raw.columns.map((c) => c.key)).toEqual(['id', 'name', 'qty']);
  });

  it("後方互換: 'all' は 'view' と、'visible' は 'rendered' と厳密に同一の結果を返す", () => {
    const handle = setupFilteredSorted();

    // deprecated エイリアスの実行時挙動は新名称と完全同一(既存利用者を壊さない)。
    expect(handle.getExportData({ scope: 'all' })).toEqual(
      handle.getExportData({ scope: 'view' }),
    );
    expect(handle.getExportData({ scope: 'visible' })).toEqual(
      handle.getExportData({ scope: 'rendered' }),
    );
    expect(handle.exportCsv({ scope: 'all' })).toBe(
      handle.exportCsv({ scope: 'view' }),
    );
    expect(handle.exportCsv({ scope: 'visible' })).toBe(
      handle.exportCsv({ scope: 'rendered' }),
    );
  });

  it("'rendered' は描画ウィンドウのみを対象にする(ビュー全体とは独立の範囲)", () => {
    const handle = setupFilteredSorted();

    const rendered = handle.getExportData({ scope: 'rendered' });
    const view = handle.getExportData({ scope: 'view' });
    // 'rendered' の行集合は 'view'(ビュー全体)の部分集合(jsdom では viewport 実測 0 のため極小)。
    expect(rendered.rows.length).toBeLessThanOrEqual(view.rows.length);
    // 'rendered' に含まれる行は必ずビュー行(フィルター後集合)に属します。
    const viewIds = new Set(idsOf(view));
    for (const id of idsOf(rendered)) {
      expect(viewIds.has(id)).toBe(true);
    }
  });
});