// 追加(差し込み式 段階 6): `/lite` の入口(src/lite.ts)の公開物を確かめます。
//   - 機能の部品は「機能セットのキー + Feature」の名前で、全部入りの表(features/full.ts)と同じものを全部公開する
//     (開発時の警告もこの名前で案内するため、名前がずれると案内が嘘になる)。
//   - プリセット standardFeatures の中身と、それで作ったグリッドの入口(検索欄 / 列メニュー)。
//   - コンポーネント以外の公開物は全部入りの入口と同じもの(common)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import * as lite from './lite';
import * as full from './index';
import { fullGridFeatures } from './features/full';
import { installJsdomLayoutStubs } from './testing';
import { resetUnregisteredFeatureWarnings } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/featureWarnings';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160, filterType: 'text' }];

const plainColumns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }];

const StandardGrid = lite.createSpreadsheetGrid({ features: lite.standardFeatures });
const BareGrid = lite.createSpreadsheetGrid({ features: {} });

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  resetUnregisteredFeatureWarnings();
  vi.restoreAllMocks();
});

describe('/lite の入口', () => {
  it('全部入りの表の機能をすべて「キー + Feature」の名前で公開し、中身は同じもの', () => {
    const exported = lite as unknown as Record<string, unknown>;
    for (const [name, feature] of Object.entries(fullGridFeatures)) {
      expect(exported[`${name}Feature`], `${name}Feature`).toBe(feature);
    }
    const featureExports = Object.keys(lite).filter((key) => key.endsWith('Feature') && key !== 'standardFeatures');
    expect(featureExports.sort()).toEqual(Object.keys(fullGridFeatures).map((name) => `${name}Feature`).sort());
  });

  // preloadGridPopups は src では同じ関数だが、公開する dist では入口ごとに別のビルドなので別の関数になり、それぞれの
  //   入口の部品だけを読み込む(vite.lite.config.ts)。ここでは同じであることを確かめない。
  it('全部入りのコンポーネントは公開せず、コンポーネント以外の公開物は全部入りの入口と同じ名前で公開する', () => {
    expect('SpreadsheetGrid' in lite).toBe(false);
    expect(lite.numberFormatter).toBe(full.numberFormatter);
    expect(typeof lite.preloadGridPopups).toBe('function');
  });

  it('standardFeatures はフィルター / 列メニュー / ツールパネル / 列幅の自動調整 / エクスポートで、全部入りと同じ部品', () => {
    expect(Object.keys(lite.standardFeatures).sort()).toEqual(
      ['columnAutosize', 'columnMenu', 'export', 'filtering', 'toolPanel'].sort(),
    );
    for (const [name, feature] of Object.entries(lite.standardFeatures)) {
      expect(feature, name).toBe(fullGridFeatures[name as keyof typeof fullGridFeatures]);
    }
  });

  it('standardFeatures のグリッドは検索欄で絞り込め、列メニューに「フィルター…」が出る', () => {
    const { container } = render(<StandardGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    const input = container.querySelector<HTMLInputElement>('input.ssg-bar-input');
    expect(input).not.toBeNull();
    act(() => {
      fireEvent.change(input as HTMLInputElement, { target: { value: 'bet' } });
    });
    expect(
      Array.from(container.querySelectorAll('.ssg-body-cell[data-ssg-col-key="name"]')).map((cell) => cell.textContent),
    ).toEqual(['beta']);
    const menuButton = container.querySelector<HTMLElement>('[aria-label="列メニュー"]');
    expect(menuButton).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(menuButton as HTMLElement, { button: 0 });
    });
    const labels = Array.from(document.querySelectorAll('.ssg-menu-label')).map((el) => el.textContent);
    expect(labels).toContain('フィルター…');
  });

  it('機能なしのグリッドに機能の prop を渡すと、足すべき機能を名指しして開発時に警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <BareGrid rows={rows} columns={plainColumns} rowKeyGetter={(r) => r.id} onRowsChange={() => {}} fillHandle />,
    );
    expect(container.querySelector('input.ssg-bar-input')).toBeNull();
    expect(container.querySelector('[aria-label="列メニュー"]')).toBeNull();
    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages.filter((message) => message.includes('`fillHandle: fillHandleFeature`'))).toHaveLength(1);
  });
});