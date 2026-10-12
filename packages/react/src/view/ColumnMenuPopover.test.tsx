// ColumnMenuPopover(列メニュー)のスロット適用テストです。
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';

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