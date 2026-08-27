// 追加(date-picker B): 内製日付フィールド(FilterDateField)の view テストです。
//   カレンダー計算そのものは logic/datePickerCalendar.test.ts でカバー済みのため、
//   ここでは 自由入力の正規化と確定規則 / カレンダーの開閉とドリルアップ / 今日・クリア を
//   検証します(pointer 操作はコンポーネントの規約どおり pointerDown で発火します)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { FilterDateField } from './FilterDateField';
import { formatDateKey } from '../logic/filtering';

afterEach(() => {
  cleanup();
});

const makeProps = () => ({
  value: '2026-08-27',
  onCommit: vi.fn(),
  ariaLabel: '開始日',
  onRequestClose: vi.fn(),
});

const getInput = () => screen.getByLabelText('開始日') as HTMLInputElement;
const openCalendar = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'カレンダーを開く' }));

describe('FilterDateField の自由入力', () => {
  it('value は YYYY/MM/DD 表示になり、表記ゆれ入力は Enter で正規化して確定する', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    expect(getInput().value).toBe('2026/08/27');
    fireEvent.change(getInput(), { target: { value: '2026/7/1' } });
    fireEvent.keyDown(getInput(), { key: 'Enter' });
    expect(props.onCommit).toHaveBeenCalledWith('2026-07-01');
  });

  it('blur でも確定し、空にすればクリアとして確定する', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    fireEvent.change(getInput(), { target: { value: '' } });
    fireEvent.blur(getInput());
    expect(props.onCommit).toHaveBeenCalledWith('');
  });

  it('解釈できない入力は確定せず aria-invalid になる', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    fireEvent.change(getInput(), { target: { value: '日付じゃない' } });
    fireEvent.keyDown(getInput(), { key: 'Enter' });
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(getInput().getAttribute('aria-invalid')).toBe('true');
    // 再編集でエラー表示は解除されます。
    fireEvent.change(getInput(), { target: { value: '2026-01-01' } });
    expect(getInput().getAttribute('aria-invalid')).toBeNull();
  });

  it('Escape はカレンダー非表示なら popover close を要求する', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    fireEvent.keyDown(getInput(), { key: 'Escape' });
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });
});

describe('FilterDateField のカレンダー', () => {
  it('日クリックで確定して閉じる(選択日は value 由来の月で開く)', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    openCalendar();
    expect(screen.getByText('2026年 8月')).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: '2026-08-15' }));
    expect(props.onCommit).toHaveBeenCalledWith('2026-08-15');
    // パネルは閉じています。
    expect(screen.queryByText('2026年 8月')).toBeNull();
  });

  it('ドリルアップ: タイトル → 月一覧 → 年一覧、選択で下の段へ戻る', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    openCalendar();
    const title = () =>
      screen.getByRole('button', { name: '表示単位を切り替える' });
    fireEvent.pointerDown(title());
    expect(screen.getByRole('button', { name: '3月' })).toBeTruthy();
    fireEvent.pointerDown(title());
    // 2026 の 12 年ページは 2016–2027 です。
    expect(screen.getByRole('button', { name: '2016' })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: '2020' }));
    // 年選択 → 月一覧へ。
    fireEvent.pointerDown(screen.getByRole('button', { name: '5月' }));
    // 月選択 → 日ビュー(2020 年 5 月)へ。
    expect(screen.getByText('2020年 5月')).toBeTruthy();
  });

  it('月送り矢印と Escape(カレンダー表示中はパネルだけ閉じる)', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    openCalendar();
    fireEvent.pointerDown(screen.getByRole('button', { name: '前へ' }));
    expect(screen.getByText('2026年 7月')).toBeTruthy();
    fireEvent.keyDown(getInput(), { key: 'Escape' });
    expect(screen.queryByText('2026年 7月')).toBeNull();
    expect(props.onRequestClose).not.toHaveBeenCalled();
  });

  it('今日 / クリアのフッターで確定して閉じる', () => {
    const props = makeProps();
    render(<FilterDateField {...props} />);
    openCalendar();
    fireEvent.pointerDown(screen.getByRole('button', { name: '今日' }));
    expect(props.onCommit).toHaveBeenCalledWith(formatDateKey(new Date()));

    openCalendar();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'クリア' }));
    expect(props.onCommit).toHaveBeenCalledWith('');
  });
});
