// 修正(SF-ENTER fix)の回帰テスト: フィルター popover 内のキー操作が「popover ルートの
//   keydown 遮断」に殺されないことを検証します。
//   背景: ルートの遮断が onKeyDownCapture(capture 相)で登録されていたため、React 合成
//   イベントの仕様(capture 相の stopPropagation はネイティブ伝播ごと停止する)により、
//   それより深い要素の bubble 相 onKeyDown ── 検索ボックスの Enter 確定(SF-ENTER)/
//   Escape close / text フィルターの Enter 適用 ── が一切発火しませんでした
//   (文字入力は input イベント経由のため絞り込みだけは動く、という症状になります)。
//   bubble 相へ移すことで「内部要素のハンドラが先に処理 → 最後にルートで外側(React
//   ツリー上の親)への合成バブリングだけを遮断」になります。
//   本テストの 1〜4 件目は修正前の実装では落ちます(イベントがハンドラへ届かない)。
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRef } from 'react';

import { ColumnFilterPopover } from './ColumnFilterPopover';
import type { NumberFilterConditionDraft } from '../logic/numberFilterCondition';

afterEach(() => {
  cleanup();
});

// set フィルター(ready)最小構成の props です。
const makeProps = () => ({
  isOpen: true,
  title: '品番',
  filterType: 'set' as const,
  draftValue: '',
  // 追加(filter-ext A): number 条件 draft(set フィルターでは未使用のため null)。
  numberConditionDraft: null,
  onNumberConditionDraftChange: vi.fn(),
  // 追加(filter-ext B): numberSet の個別クリアとサマリー(set フィルターでは未使用)。
  onNumberSetConditionClear: vi.fn(),
  onNumberSetSelectionClear: vi.fn(),
  numberSetSummaryText: 'フィルターなし',
  currentValueText: '',
  layout: { top: 0, left: 0, width: 260 },
  selectOptions: [
    { label: 'A-1019', value: 'A-1019' },
    { label: 'A-1119', value: 'A-1119' },
    { label: 'B-2000', value: 'B-2000' },
  ],
  optionsStatus: 'ready' as const,
  optionsProgress: 1,
  setSelection: null,
  popoverRef: createRef<HTMLDivElement>(),
  textInputRef: createRef<HTMLInputElement>(),
  selectRef: createRef<HTMLSelectElement>(),
  onRequestClose: vi.fn(),
  onDraftChange: vi.fn(),
  onApply: vi.fn(),
  onClear: vi.fn(),
  onSetValueToggle: vi.fn(),
  onSetSelectAllChange: vi.fn(),
  onSetClear: vi.fn(),
  onSetReplaceSelection: vi.fn(),
  isServerSide: false,
});

const getSearchInput = () =>
  screen.getByPlaceholderText('検索（Enter で確定）');

describe('ColumnFilterPopover のキー操作(SF-ENTER fix)', () => {
  it('検索 → Enter で onSetReplaceSelection(一致値のみ)と close が発火する', () => {
    const props = makeProps();
    render(<ColumnFilterPopover {...props} />);
    const input = getSearchInput();
    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSetReplaceSelection).toHaveBeenCalledTimes(1);
    expect(props.onSetReplaceSelection).toHaveBeenCalledWith(['A-1119']);
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('IME 変換確定の Enter(isComposing)では発火しない', () => {
    const props = makeProps();
    render(<ColumnFilterPopover {...props} />);
    const input = getSearchInput();
    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(props.onSetReplaceSelection).not.toHaveBeenCalled();
    expect(props.onRequestClose).not.toHaveBeenCalled();
  });

  it('空検索の Enter は close のみ(置換なしで確定)', () => {
    const props = makeProps();
    render(<ColumnFilterPopover {...props} />);
    fireEvent.keyDown(getSearchInput(), { key: 'Enter' });
    expect(props.onSetReplaceSelection).not.toHaveBeenCalled();
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('Escape で close が発火する(検索ボックス内)', () => {
    const props = makeProps();
    render(<ColumnFilterPopover {...props} />);
    fireEvent.keyDown(getSearchInput(), { key: 'Escape' });
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('一致 0 件の Enter は no-op(置換もクローズもしない)', () => {
    const props = makeProps();
    render(<ColumnFilterPopover {...props} />);
    const input = getSearchInput();
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSetReplaceSelection).not.toHaveBeenCalled();
    expect(props.onRequestClose).not.toHaveBeenCalled();
  });

  it('popover 内のキーは外側(React ツリー上の親)へ合成バブリングしない(遮断の本来目的)', () => {
    const props = makeProps();
    const outerKeyDown = vi.fn();
    render(
      <div onKeyDown={outerKeyDown}>
        <ColumnFilterPopover {...props} />
      </div>,
    );
    // ルート div 上のキー(内部ハンドラを持たない要素相当)でも親へは漏れません。
    fireEvent.keyDown(props.popoverRef.current as HTMLDivElement, {
      key: 'a',
    });
    // 検索ボックス上のキーも同様です(input 側の stopPropagation + ルート遮断の二重防御)。
    fireEvent.keyDown(getSearchInput(), { key: 'b' });
    expect(outerKeyDown).not.toHaveBeenCalled();
  });
});

// 追加(filter-ext A): number 列の演算子セレクト UI の回帰テストです。
//   draft の合成・復元(logic/numberFilterCondition)は単体テスト側でカバー済みのため、
//   ここでは view の責務 ── 演算子で値入力の個数が変わる / 編集が draft へ通知される /
//   Enter・Escape の配線 ── だけを検証します。
const numberDraft = (
  partial: Partial<NumberFilterConditionDraft>,
): NumberFilterConditionDraft => ({
  operator: 'gte',
  value1: '',
  value2: '',
  ...partial,
});

const makeNumberProps = (draft: NumberFilterConditionDraft) => ({
  ...makeProps(),
  filterType: 'number' as const,
  numberConditionDraft: draft,
});

describe('ColumnFilterPopover の number 条件 UI(filter-ext A)', () => {
  it('演算子セレクト / 値入力の編集が draft へ通知される', () => {
    const props = makeNumberProps(numberDraft({ value1: '10' }));
    render(<ColumnFilterPopover {...props} />);
    fireEvent.change(screen.getByLabelText('条件の演算子'), {
      target: { value: 'between' },
    });
    expect(props.onNumberConditionDraftChange).toHaveBeenCalledWith({
      operator: 'between',
      value1: '10',
      value2: '',
    });
    fireEvent.change(screen.getByLabelText('条件の値'), {
      target: { value: '15' },
    });
    expect(props.onNumberConditionDraftChange).toHaveBeenCalledWith({
      operator: 'gte',
      value1: '15',
      value2: '',
    });
  });

  it('範囲は値入力 2 個(下限 / 上限)、空白系は 0 個', () => {
    const between = makeNumberProps(numberDraft({ operator: 'between' }));
    const { unmount } = render(<ColumnFilterPopover {...between} />);
    expect(screen.getByLabelText('下限')).toBeTruthy();
    expect(screen.getByLabelText('上限')).toBeTruthy();
    unmount();

    const blank = makeNumberProps(numberDraft({ operator: 'blank' }));
    render(<ColumnFilterPopover {...blank} />);
    expect(screen.queryByLabelText('条件の値')).toBeNull();
    expect(screen.getByText('この演算子は値入力を使いません')).toBeTruthy();
  });

  it('値入力の Enter で適用、Escape で close(text フィルターと同じ規則)', () => {
    const props = makeNumberProps(numberDraft({ value1: '10' }));
    render(<ColumnFilterPopover {...props} />);
    const input = screen.getByLabelText('条件の値');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onApply).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onRequestClose).toHaveBeenCalledTimes(1);
  });
});

// 追加(filter-ext B): numberSet(条件 AND 選択)複合 UI の回帰テストです。
//   候補連動・個別クリア・(すべて選択) の明示スコープ・サマリー表示を検証します
//   (候補リスト行そのものは仮想化のため、件数メタで確認します)。
const makeNumberSetProps = (draft: NumberFilterConditionDraft) => ({
  ...makeProps(),
  filterType: 'numberSet' as const,
  numberConditionDraft: draft,
  selectOptions: [
    { label: '(空白)', value: '' },
    { label: '5', value: '5' },
    { label: '10', value: '10' },
    { label: '12', value: '12' },
    { label: '48', value: '48' },
  ],
  numberSetSummaryText: '10 以上 かつ 1 件を除外',
});

describe('ColumnFilterPopover の numberSet 複合 UI(filter-ext B)', () => {
  it('条件で候補が連動して絞られる(候補連動 §2.3)', () => {
    const props = makeNumberSetProps(numberDraft({ value1: '10' }));
    render(<ColumnFilterPopover {...props} />);
    // gte 10 → 候補は 10 / 12 / 48 の 3 件((空白) と 5 は条件不一致で一覧から消える)。
    expect(screen.getByText('一致 3 件')).toBeTruthy();
    expect(screen.getByText('選択中: 3 / 3 件')).toBeTruthy();
  });

  it('条件なしでは全候補が対象', () => {
    const props = makeNumberSetProps(numberDraft({}));
    render(<ColumnFilterPopover {...props} />);
    expect(screen.getByText('全 5 件')).toBeTruthy();
    expect(screen.getByText('選択中: 5 / 5 件')).toBeTruthy();
  });

  it('保持中のチェック外し(候補外の選択)は件数へ二重計上されない', () => {
    // 条件 gte 10 で「5」の解除(exclude)が保持されているケース: 表示中候補は全選択扱い。
    const props = {
      ...makeNumberSetProps(numberDraft({ value1: '10' })),
      setSelection: { mode: 'exclude' as const, values: new Set(['5']) },
    };
    render(<ColumnFilterPopover {...props} />);
    expect(screen.getByText('選択中: 3 / 3 件')).toBeTruthy();
  });

  it('個別クリア: 条件 / 値がそれぞれのハンドラへ通知される(クリアの 3 粒度 §4-2)', () => {
    const props = {
      ...makeNumberSetProps(numberDraft({ value1: '10' })),
      setSelection: { mode: 'exclude' as const, values: new Set(['12']) },
    };
    render(<ColumnFilterPopover {...props} />);
    // 「クリア」ボタンは DOM 順に [条件, 値, フッター全消し] の 3 つです。
    const clearButtons = screen.getAllByRole('button', { name: 'クリア' });
    expect(clearButtons).toHaveLength(3);
    fireEvent.pointerDown(clearButtons[0]);
    expect(props.onNumberSetConditionClear).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(clearButtons[1]);
    expect(props.onNumberSetSelectionClear).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(clearButtons[2]);
    expect(props.onSetClear).toHaveBeenCalledTimes(1);
  });

  it('条件なし・全選択では個別クリアが disabled', () => {
    const props = makeNumberSetProps(numberDraft({}));
    render(<ColumnFilterPopover {...props} />);
    const clearButtons = screen.getAllByRole('button', { name: 'クリア' });
    expect((clearButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((clearButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('(すべて選択) は明示スコープ(表示中候補の values)で通知される(§4-1 の保持前提)', () => {
    const props = makeNumberSetProps(numberDraft({ value1: '10' }));
    render(<ColumnFilterPopover {...props} />);
    // 全選択状態からの解除 → 条件絞り後の表示中候補のみが対象になります('all' は使わない)。
    fireEvent.click(screen.getByRole('checkbox', { name: /すべて選択/ }));
    expect(props.onSetSelectAllChange).toHaveBeenCalledWith(
      ['10', '12', '48'],
      false,
    );
  });

  it('複合サマリーが表示される', () => {
    const props = makeNumberSetProps(numberDraft({ value1: '10' }));
    render(<ColumnFilterPopover {...props} />);
    expect(screen.getByText(/10 以上 かつ 1 件を除外/)).toBeTruthy();
  });
});