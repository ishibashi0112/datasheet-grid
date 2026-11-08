// 追加(FM-2)の view テスト: GridFilterChipBar の表示と操作コールバックの配線を固定します。
//   - チップ(列名 + 要約)の描画と、非表示列ラベルの disabled + 注記。
//   - ラベルクリック → onEditFilter / × → onClearFilter / すべてクリア → onClearAllFilters。
//   - entries 0 件で null を返すこと(空バーは出さない = ユーザー合意)。
//   CSS の見た目(トークン適用)は jsdom で検証できないため、表示テキストと
//   コールバック発火のみを固定します(FilterManagementPanel.test と同じ方針)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as renderBase, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { GridLocaleTextContext, mergeFeatureLocaleDefaults } from '../hooks/useGridLocaleText';
import { fullGridFeatures } from '../features/full';

import GridFilterChipBar from './GridFilterChipBar';
import type { FilterManagementEntry } from './FilterManagementPanel';

// 追加(英語対応): 機能だけが使う文言(列メニュー・チップ・スクロールの吹き出しなど)は、シェルが機能の既定を重ねて
//   context で渡します。部品だけを描くテストでは全部入りの機能セットの既定を渡します。
const fullLocaleTexts = mergeFeatureLocaleDefaults(fullGridFeatures);
const FeatureLocaleTextWrapper = ({ children }: { children: ReactNode }) => (
  <GridLocaleTextContext.Provider value={fullLocaleTexts}>{children}</GridLocaleTextContext.Provider>
);
const render = (ui: ReactElement) => renderBase(ui, { wrapper: FeatureLocaleTextWrapper });


afterEach(() => {
  cleanup();
});

const makeEntries = (): FilterManagementEntry[] => [
  { columnKey: 'price', title: '単価', summaryText: '>= 1000', isHidden: false },
  {
    columnKey: 'due',
    title: '納期',
    summaryText: '"2026-07" を含む',
    isHidden: true,
  },
];

const makeProps = () => ({
  entries: makeEntries(),
  canFilter: true,
  onEditFilter: vi.fn(),
  onClearFilter: vi.fn(),
  onClearAllFilters: vi.fn(),
});

describe('GridFilterChipBar', () => {
  it('チップ(列名 + 要約)と「すべてクリア」を描画する', () => {
    render(<GridFilterChipBar {...makeProps()} />);
    expect(screen.getByText('単価')).toBeTruthy();
    expect(screen.getByText('>= 1000')).toBeTruthy();
    expect(screen.getByText('納期(非表示列)')).toBeTruthy();
    expect(screen.getByText('"2026-07" を含む')).toBeTruthy();
    expect(screen.getByText('すべてクリア')).toBeTruthy();
  });

  it('ラベルクリックで onEditFilter(columnKey) を呼ぶ / 非表示列のラベルは disabled', () => {
    const props = makeProps();
    render(<GridFilterChipBar {...props} />);
    fireEvent.click(screen.getByLabelText('単価 のフィルターを編集'));
    expect(props.onEditFilter).toHaveBeenCalledWith('price');
    const hiddenLabel = screen.getByLabelText(
      '納期 のフィルターを編集',
    ) as HTMLButtonElement;
    expect(hiddenLabel.disabled).toBe(true);
  });

  it('× で onClearFilter(columnKey) を呼ぶ(非表示列でも可)', () => {
    const props = makeProps();
    render(<GridFilterChipBar {...props} />);
    const hiddenClear = screen.getByLabelText(
      '納期 のフィルターをクリア',
    ) as HTMLButtonElement;
    expect(hiddenClear.disabled).toBe(false);
    fireEvent.click(hiddenClear);
    expect(props.onClearFilter).toHaveBeenCalledWith('due');
  });

  it('「すべてクリア」で onClearAllFilters を呼ぶ', () => {
    const props = makeProps();
    render(<GridFilterChipBar {...props} />);
    fireEvent.click(screen.getByText('すべてクリア'));
    expect(props.onClearAllFilters).toHaveBeenCalledTimes(1);
  });

  it('canFilter=false では全ボタンが disabled になる', () => {
    const props = { ...makeProps(), canFilter: false };
    render(<GridFilterChipBar {...props} />);
    const label = screen.getByLabelText(
      '単価 のフィルターを編集',
    ) as HTMLButtonElement;
    const clear = screen.getByLabelText(
      '単価 のフィルターをクリア',
    ) as HTMLButtonElement;
    const clearAll = screen.getByText('すべてクリア') as HTMLButtonElement;
    expect(label.disabled).toBe(true);
    expect(clear.disabled).toBe(true);
    expect(clearAll.disabled).toBe(true);
  });

  it('entries 0 件では何も描画しない(空バーを出さない)', () => {
    const props = { ...makeProps(), entries: [] };
    const { container } = render(<GridFilterChipBar {...props} />);
    expect(container.firstChild).toBeNull();
  });
});