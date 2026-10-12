// 追加(audit V-16): renderHeader の中のボタン / 入力欄から始まった pointerdown では列の範囲選択を始めない、
//   ラベル部分(操作できない要素)からは従来どおり列を選択する、という結合テストです。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 5 },
  { id: 2, name: 'beta', qty: 12 },
];

describe('renderHeader 内の操作要素と列の範囲選択(audit V-16)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  const setup = () => {
    const onButtonClick = vi.fn();
    const columns: GridColumn<Row>[] = [
      {
        key: 'name',
        title: '名前',
        width: 160,
        renderHeader: () => (
          <span>
            <span data-testid="label-text">名前</span>
            <button type="button" data-testid="hdr-button" onClick={onButtonClick}>
              ★
            </button>
            <input data-testid="hdr-input" aria-label="絞り込み" />
          </span>
        ),
      },
      { key: 'qty', title: '数量', width: 100 },
    ];
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(<SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} />);
    return { ...view, ref, onButtonClick };
  };

  it('ボタン / 入力欄の pointerdown では列を選択せず、既定動作も止めない', () => {
    const { getByTestId, ref } = setup();
    for (const testId of ['hdr-button', 'hdr-input']) {
      const target = getByTestId(testId);
      let notPrevented = true;
      act(() => {
        notPrevented = fireEvent.pointerDown(target, { button: 0, pointerType: 'mouse', pointerId: 1 });
      });
      fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
      expect(notPrevented).toBe(true);
      expect(ref.current?.getSelection()).toBeNull();
    }
  });

  it('ラベル(操作できない要素)の pointerdown では従来どおり列を選択する', () => {
    const { getByTestId, ref } = setup();
    act(() => {
      fireEvent.pointerDown(getByTestId('label-text'), { button: 0, pointerType: 'mouse', pointerId: 1 });
    });
    fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
    expect(ref.current?.getSelection()).toMatchObject({ type: 'col' });
  });
});