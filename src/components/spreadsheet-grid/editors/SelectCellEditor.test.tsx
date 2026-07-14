// SelectCellEditor(select エディタ)の単体テストです。CellEditorLayer の種別ディスパッチ経由で
//   描画し、body 直下ポータルの候補リスト・キーボード操作・確定 / キャンセルを検証します。
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { CellEditorLayer } from '../CellEditorLayer';
import type { GridSelectEditorOption } from '../model/gridTypes';

afterEach(() => {
  cleanup();
});

type Row = { fruit: string };

const rect = { left: 0, top: 0, width: 120, height: 32 };

const options: GridSelectEditorOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'berry', label: 'Berry' },
];

const renderSelectEditor = ({
  editorOptions = options,
  value = 'banana',
  themeClassName,
}: {
  editorOptions?:
    | GridSelectEditorOption[]
    | ((row: Row) => GridSelectEditorOption[]);
  value?: unknown;
  themeClassName?: string;
} = {}) => {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <CellEditorLayer<Row>
      rect={rect}
      headerHeight={40}
      leadingWidth={56}
      initialValue={String(value ?? '')}
      editor={{ type: 'select', options: editorOptions }}
      editorSession={{
        row: { fruit: 'banana' },
        rowIndex: 0,
        colIndex: 0,
        value,
      }}
      themeClassName={themeClassName}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );
  const input = container.querySelector<HTMLInputElement>(
    '.ssg-cell-editor-input',
  );
  if (!input) {
    throw new Error('ssg-cell-editor-input が見つかりません');
  }
  const popover = document.querySelector<HTMLDivElement>(
    '.ssg-select-editor-popover',
  );
  if (!popover) {
    throw new Error('ssg-select-editor-popover が見つかりません');
  }
  return { onCommit, onCancel, input, popover };
};

describe('SelectCellEditor', () => {
  it('body 直下ポータルに候補リストが描画され、現在値がハイライトされる', () => {
    const { input, popover } = renderSelectEditor({
      themeClassName: 'ssg-theme-dark',
    });
    expect(popover.parentElement).toBe(document.body);
    expect(popover.classList.contains('ssg-theme-dark')).toBe(true);

    const optionElements = popover.querySelectorAll('[role="option"]');
    expect(optionElements).toHaveLength(3);
    expect(optionElements[1].getAttribute('aria-selected')).toBe('true');
    // インセル input は readOnly でハイライト中の label を表示します。
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe('Banana');
  });

  it('ArrowDown + Enter でハイライト候補の value を down 方向 commit する', () => {
    const { onCommit, input } = renderSelectEditor();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('berry', 'down');
  });

  it('Escape / blur は cancel する(select にドラフト概念はない)', () => {
    const { onCommit, onCancel, input } = renderSelectEditor();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('候補クリックで方向なし commit する', () => {
    const { onCommit, popover } = renderSelectEditor();
    const optionElements = popover.querySelectorAll('[role="option"]');
    fireEvent.click(optionElements[0]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('apple', undefined);
  });

  it('IME 変換中(isComposing)の Enter は commit しない', () => {
    const { onCommit, input } = renderSelectEditor();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('タイプアヘッド(label 前方一致)でハイライトがジャンプする', () => {
    const { onCommit, input } = renderSelectEditor({ value: 'apple' });
    fireEvent.keyDown(input, { key: 'b' });
    fireEvent.keyDown(input, { key: 'e' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('berry', 'down');
  });

  it('動的 options(行依存関数)は編集中の行で解決される', () => {
    const { popover } = renderSelectEditor({
      editorOptions: (row) => [
        { value: row.fruit, label: `動的:${row.fruit}` },
      ],
    });
    const optionElements = popover.querySelectorAll('[role="option"]');
    expect(optionElements).toHaveLength(1);
    expect(optionElements[0].textContent).toBe('動的:banana');
  });

  it('候補 0 件のとき Enter は cancel し、空表示を出す', () => {
    const { onCommit, onCancel, input, popover } = renderSelectEditor({
      editorOptions: [],
    });
    expect(popover.querySelector('.ssg-select-editor-empty')).not.toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});