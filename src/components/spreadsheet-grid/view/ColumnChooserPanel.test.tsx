// 追加(13-B2-4)の view テスト: ColumnChooserPanel の全選択トグルの配線を固定します。
//   - 全表示時の master クリック → onHideAllColumns(全解除・1 列残し側)のみ発火。
//   - 一部非表示時の master クリック → onShowAllColumns(すべて表示側)のみ発火。
//   - canToggle=false では master は disabled でどちらも発火しない。
//   - ツールチップ / aria-label が状態で切り替わる。
//   - 最後の 1 列(表示中が 1 列だけ)の個別チェックは disabled(既存挙動の固定)。
//   CSS の見た目は jsdom で検証できないため、ラベルとコールバック発火のみを固定します
//   (FilterManagementPanel.test.tsx と同じ方針)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';

import ColumnChooserPanel, {
  type ColumnChooserItem,
} from './ColumnChooserPanel';
import type { ColumnChooserLayout } from '../hooks/useColumnChooserController';

afterEach(() => {
  cleanup();
});

const layout: ColumnChooserLayout = { top: 20, left: 40, width: 280 };

const makeItems = (visibles: boolean[]): ColumnChooserItem[] =>
  visibles.map((visible, index) => ({
    key: `col${index}`,
    title: `列${index}`,
    visible,
    pane: 'center',
  }));

const makeProps = (items: ColumnChooserItem[], canToggle = true) => ({
  isOpen: true,
  items,
  canToggle,
  layout,
  panelRef: createRef<HTMLDivElement>(),
  onToggleColumnVisibility: vi.fn(),
  onShowAllColumns: vi.fn(),
  onHideAllColumns: vi.fn(),
  onResetColumns: vi.fn(),
  onReorderColumns: vi.fn(),
  onRequestClose: vi.fn(),
  onPanelMove: vi.fn(),
});

describe('ColumnChooserPanel(全選択トグル 13-B2-4)', () => {
  it('全表示時の master クリックで onHideAllColumns のみ発火する', () => {
    const props = makeProps(makeItems([true, true, true]));
    render(<ColumnChooserPanel {...props} />);

    const master = screen.getByRole('button', {
      name: 'すべての列を非表示(先頭の列は残ります)',
    });
    fireEvent.click(master);

    expect(props.onHideAllColumns).toHaveBeenCalledTimes(1);
    expect(props.onShowAllColumns).not.toHaveBeenCalled();
  });

  it('一部非表示時の master クリックで onShowAllColumns のみ発火する', () => {
    const props = makeProps(makeItems([true, false, true]));
    render(<ColumnChooserPanel {...props} />);

    const master = screen.getByRole('button', { name: 'すべての列を表示' });
    fireEvent.click(master);

    expect(props.onShowAllColumns).toHaveBeenCalledTimes(1);
    expect(props.onHideAllColumns).not.toHaveBeenCalled();
  });

  it('ツールチップ(data-ssg-tooltip)が状態で切り替わる', () => {
    const allVisibleProps = makeProps(makeItems([true, true]));
    const { unmount } = render(<ColumnChooserPanel {...allVisibleProps} />);
    expect(
      screen
        .getByRole('button', {
          name: 'すべての列を非表示(先頭の列は残ります)',
        })
        .getAttribute('data-ssg-tooltip'),
    ).toBe('すべての列を非表示(先頭の列は残ります)');
    unmount();

    const partialProps = makeProps(makeItems([true, false]));
    render(<ColumnChooserPanel {...partialProps} />);
    expect(
      screen
        .getByRole('button', { name: 'すべての列を表示' })
        .getAttribute('data-ssg-tooltip'),
    ).toBe('すべての列を表示');
  });

  it('canToggle=false では master は disabled でどちらも発火しない', () => {
    const props = makeProps(makeItems([true, true]), false);
    render(<ColumnChooserPanel {...props} />);

    const master = screen.getByRole('button', {
      name: 'すべての列を非表示(先頭の列は残ります)',
    });
    expect((master as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(master);

    expect(props.onHideAllColumns).not.toHaveBeenCalled();
    expect(props.onShowAllColumns).not.toHaveBeenCalled();
  });

  it('最後の 1 列(表示中 1 列)の個別チェックは disabled で発火しない', () => {
    const props = makeProps(makeItems([true, false, false]));
    render(<ColumnChooserPanel {...props} />);

    // 表示中の col0 だけがガード対象。非表示列(col1)のチェックは有効なままです。
    const onlyVisibleToggle = screen
      .getByText('列0')
      .closest('button') as HTMLButtonElement;
    expect(onlyVisibleToggle.disabled).toBe(true);
    fireEvent.click(onlyVisibleToggle);
    expect(props.onToggleColumnVisibility).not.toHaveBeenCalled();

    const hiddenToggle = screen
      .getByText('列1')
      .closest('button') as HTMLButtonElement;
    expect(hiddenToggle.disabled).toBe(false);
    fireEvent.click(hiddenToggle);
    expect(props.onToggleColumnVisibility).toHaveBeenCalledWith('col1', true);
  });
});