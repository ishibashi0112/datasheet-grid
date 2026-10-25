// ColumnMenuPopover(列メニュー)のスロット適用テストです。
// 追加(差し込み式 段階 3): ツールパネルを開く 3 項目を省いた構成(ツールパネルの機能なし)の項目と区切り。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';

import { ColumnMenuPopover } from './ColumnMenuPopover';

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe('ColumnMenuPopover の menuItem スロット', () => {
  // 修正(audit V-15): 「列のリセット」だけ menuItem スロットが付いていなかった。
  it.each([true, false])('ルートの全項目に menuItem の className / style が付く(canResetColumns=%s)', (canResetColumns) => {
    render(
      <ColumnMenuPopover
        isOpen
        slots={{ menuItem: { className: 'my-item', style: { letterSpacing: '1px' } } }}
        title="列 A"
        columnKey="a"
        canFilter
        onOpenFilter={noop}
        canSort
        sortDirection={null}
        onSortChange={noop}
        onOpenSortManager={noop}
        canManageFilters
        onOpenFilterManager={noop}
        pinned={undefined}
        canChangePinned
        layout={{ top: 0, left: 0, width: 240 }}
        popoverRef={createRef<HTMLDivElement>()}
        onPinnedChange={noop}
        onAutosizeColumn={noop}
        onAutosizeAllColumns={noop}
        onOpenColumnChooser={noop}
        canResetColumns={canResetColumns}
        onResetColumns={noop}
        onRequestClose={noop}
      />,
    );
    const items = Array.from(document.body.querySelectorAll<HTMLElement>('.ssg-menu-item'));
    const reset = items.find((item) => item.textContent?.includes('列のリセット'));
    expect(reset).toBeDefined();
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.classList.contains('my-item')).toBe(true);
      expect(item.style.letterSpacing).toBe('1px');
    }
    expect(reset?.classList.contains('ssg-menu-item--disabled')).toBe(!canResetColumns);
  });
});

describe('ColumnMenuPopover のツールパネルを開く項目(差し込み式 段階 3)', () => {
  const baseProps = (): ComponentProps<typeof ColumnMenuPopover> => ({
    isOpen: true,
    title: '列 A',
    columnKey: 'a',
    canFilter: true,
    onOpenFilter: noop,
    canSort: true,
    sortDirection: null,
    onSortChange: noop,
    onOpenSortManager: noop,
    canManageFilters: true,
    onOpenFilterManager: noop,
    pinned: undefined,
    canChangePinned: true,
    layout: { top: 0, left: 0, width: 240 },
    popoverRef: createRef<HTMLDivElement>(),
    onPinnedChange: noop,
    onOpenColumnChooser: noop,
    canResetColumns: true,
    onResetColumns: noop,
    onRequestClose: noop,
  });
  const labels = () => Array.from(document.body.querySelectorAll('.ssg-menu-label')).map((el) => el.textContent);
  const separatorCount = () => document.body.querySelectorAll('.ssg-menu-separator').length;
  const withoutToolPanel = (props: ComponentProps<typeof ColumnMenuPopover>) => ({
    ...props,
    onOpenSortManager: undefined,
    onOpenFilterManager: undefined,
    onOpenColumnChooser: undefined,
  });

  it('ハンドラを渡さなければ 3 項目を出さない(ほかの項目は出す)', () => {
    render(<ColumnMenuPopover {...withoutToolPanel(baseProps())} />);
    expect(labels()).toContain('昇順で並び替え');
    expect(labels()).toContain('列のリセット');
    expect(labels()).not.toContain('並び替えを管理…');
    expect(labels()).not.toContain('フィルターを管理…');
    expect(labels()).not.toContain('列の表示');
  });

  it('並び替えの区切り: 並び替えが無く「フィルターを管理…」も出さないときだけ省く', () => {
    const full = render(<ColumnMenuPopover {...baseProps()} canSort={false} />);
    const fullCount = separatorCount();
    full.unmount();
    render(<ColumnMenuPopover {...withoutToolPanel(baseProps())} canSort={false} />);
    expect(separatorCount()).toBe(fullCount - 1);
    cleanup();
    // 並び替えの項目があれば、3 項目を省いても区切りは残る。
    const sortable = render(<ColumnMenuPopover {...baseProps()} />);
    const sortableCount = separatorCount();
    sortable.unmount();
    render(<ColumnMenuPopover {...withoutToolPanel(baseProps())} />);
    expect(separatorCount()).toBe(sortableCount);
  });
});