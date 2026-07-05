// 追加(FM-1)の view テスト: FilterManagementPanel の表示と操作コールバックの配線を固定します。
//   - 適用中フィルターの行(列名 / 要約)の描画と、非表示列の ✎ disabled。
//   - ✎ / × / すべてクリア / フィルターを追加 / グローバル行 × の各コールバック発火。
//   - フッターの disabled 条件(entries 0 件 / addable 0 件)と空表示。
//   - isOpen=false / layout=null で描画しないこと。
//   CSS の見た目(トークン適用)は jsdom で検証できないため、表示テキストと
//   コールバック発火のみを固定します(THEME-2/3 と同じ方針)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';

import FilterManagementPanel, {
  type FilterManagementEntry,
} from './FilterManagementPanel';
import type { FilterManagementLayout } from '../hooks/useFilterManagementController';

afterEach(() => {
  cleanup();
});

const layout: FilterManagementLayout = { top: 20, left: 40, width: 360 };

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
  isOpen: true,
  entries: makeEntries(),
  addableColumns: [{ key: 'name', title: '品名' }],
  showGlobalFilterRow: false,
  globalFilterText: '',
  canFilter: true,
  layout,
  panelRef: createRef<HTMLDivElement>(),
  onEditFilter: vi.fn(),
  onAddFilter: vi.fn(),
  onClearFilter: vi.fn(),
  onClearAllFilters: vi.fn(),
  onClearGlobalFilter: vi.fn(),
  onRequestClose: vi.fn(),
});

describe('FilterManagementPanel', () => {
  it('適用中フィルターの行(列名 / 要約)を描画する', () => {
    render(<FilterManagementPanel {...makeProps()} />);
    expect(screen.getByText('フィルター管理')).toBeTruthy();
    expect(screen.getByText('単価')).toBeTruthy();
    expect(screen.getByText('>= 1000')).toBeTruthy();
    expect(screen.getByText('納期')).toBeTruthy();
    expect(screen.getByText('"2026-07" を含む')).toBeTruthy();
    // 非表示列には注記が付きます。
    expect(screen.getByText('(非表示列)')).toBeTruthy();
  });

  it('✎ で onEditFilter(columnKey) を呼ぶ / 非表示列の ✎ は disabled', () => {
    const props = makeProps();
    render(<FilterManagementPanel {...props} />);
    fireEvent.click(screen.getByLabelText('単価 のフィルターを編集'));
    expect(props.onEditFilter).toHaveBeenCalledWith('price');
    const hiddenEdit = screen.getByLabelText(
      '納期 のフィルターを編集',
    ) as HTMLButtonElement;
    expect(hiddenEdit.disabled).toBe(true);
  });

  it('× で onClearFilter(columnKey) を呼ぶ(非表示列でも可)', () => {
    const props = makeProps();
    render(<FilterManagementPanel {...props} />);
    const hiddenClear = screen.getByLabelText(
      '納期 のフィルターをクリア',
    ) as HTMLButtonElement;
    expect(hiddenClear.disabled).toBe(false);
    fireEvent.click(hiddenClear);
    expect(props.onClearFilter).toHaveBeenCalledWith('due');
  });

  it('「すべてクリア」で onClearAllFilters を呼ぶ / 0 件時は disabled + 空表示', () => {
    const props = makeProps();
    const { unmount } = render(<FilterManagementPanel {...props} />);
    fireEvent.click(screen.getByText('すべてクリア'));
    expect(props.onClearAllFilters).toHaveBeenCalledTimes(1);
    unmount();

    const emptyProps = { ...makeProps(), entries: [] };
    render(<FilterManagementPanel {...emptyProps} />);
    expect(screen.getByText('適用中の列フィルターはありません')).toBeTruthy();
    const clearAll = screen.getByText('すべてクリア') as HTMLButtonElement;
    expect(clearAll.disabled).toBe(true);
  });

  it('「フィルターを追加」の <select> で onAddFilter(columnKey) を呼ぶ / 候補 0 件時は disabled', () => {
    const props = makeProps();
    const { unmount } = render(<FilterManagementPanel {...props} />);
    fireEvent.change(screen.getByLabelText('フィルターを追加する列を選択'), {
      target: { value: 'name' },
    });
    expect(props.onAddFilter).toHaveBeenCalledWith('name');
    unmount();

    const noAdd = { ...makeProps(), addableColumns: [] };
    render(<FilterManagementPanel {...noAdd} />);
    const select = screen.getByLabelText(
      'フィルターを追加する列を選択',
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText('+ 追加できる列がありません')).toBeTruthy();
  });

  it('グローバルフィルター行は showGlobalFilterRow=true のときだけ描画し、× で onClearGlobalFilter を呼ぶ', () => {
    const props = {
      ...makeProps(),
      showGlobalFilterRow: true,
      globalFilterText: 'ねじ',
    };
    const { unmount } = render(<FilterManagementPanel {...props} />);
    expect(screen.getByText('グローバルフィルター')).toBeTruthy();
    expect(screen.getByText('"ねじ" を含む行')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('グローバルフィルターをクリア'));
    expect(props.onClearGlobalFilter).toHaveBeenCalledTimes(1);
    unmount();

    render(<FilterManagementPanel {...makeProps()} />);
    expect(screen.queryByText('グローバルフィルター')).toBeNull();
  });

  it('タイトルの × で onRequestClose を呼ぶ', () => {
    const props = makeProps();
    render(<FilterManagementPanel {...props} />);
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('isOpen=false / layout=null では描画しない', () => {
    const closed = { ...makeProps(), isOpen: false };
    const { unmount } = render(<FilterManagementPanel {...closed} />);
    expect(screen.queryByText('フィルター管理')).toBeNull();
    unmount();

    const noLayout = { ...makeProps(), layout: null };
    render(<FilterManagementPanel {...noLayout} />);
    expect(screen.queryByText('フィルター管理')).toBeNull();
  });
});