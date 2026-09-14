// CheckboxCell(checkbox 列の既定セル)の単体テストです。クリックトグルと readOnly 抑止、
//   aria 属性を検証します(セル内クリックの結合経路は jsdom で仮想化行が描画されないため、
//   統合テスト側は keyboard 経路で担保します)。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CheckboxCell } from './CheckboxCell';

afterEach(() => {
  cleanup();
});

describe('CheckboxCell', () => {
  it('role=checkbox / aria-checked が値に追従し、glyph が data-state を持つ', () => {
    const { container, rerender } = render(
      <CheckboxCell checked={false} readOnly={false} onToggle={() => {}} />,
    );
    const cell = container.querySelector('.ssg-cell-checkbox');
    expect(cell?.getAttribute('role')).toBe('checkbox');
    expect(cell?.getAttribute('aria-checked')).toBe('false');
    expect(
      cell?.querySelector('.ssg-row-checkbox')?.getAttribute('data-state'),
    ).toBe('unchecked');

    rerender(
      <CheckboxCell checked={true} readOnly={false} onToggle={() => {}} />,
    );
    expect(cell?.getAttribute('aria-checked')).toBe('true');
    expect(
      cell?.querySelector('.ssg-row-checkbox')?.getAttribute('data-state'),
    ).toBe('checked');
  });

  it('クリックで onToggle が呼ばれる', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CheckboxCell checked={false} readOnly={false} onToggle={onToggle} />,
    );
    fireEvent.click(container.querySelector('.ssg-cell-checkbox')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('readOnly はクリックしても onToggle が呼ばれず、aria-disabled / disabled 見た目になる', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CheckboxCell checked={true} readOnly={true} onToggle={onToggle} />,
    );
    const cell = container.querySelector('.ssg-cell-checkbox');
    expect(cell?.getAttribute('aria-disabled')).toBe('true');
    expect(
      cell?.querySelector('.ssg-row-checkbox')?.getAttribute('data-disabled'),
    ).toBe('true');
    fireEvent.click(cell!);
    expect(onToggle).not.toHaveBeenCalled();
  });
});