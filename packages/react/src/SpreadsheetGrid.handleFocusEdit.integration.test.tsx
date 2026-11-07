// 追加(dogfood DU-02 / DU-03): 実際にアプリを作って確かめたチェック(docs/audits/2026-11-07/)の、命令的 API の追加分です。
//   - focus(): キーを受ける要素へフォーカス(imeDirectInput 有効時は入力受けへ)。モーダルを閉じた後にキーが届かなかった。
//   - startEditing() / startEditing(viewRowIndex, colIndex): F2 と同じ編集開始 + 単一選択 + エディタへフォーカス。編集できないセルは false。
//   - getViewRowIndex(rowKey) / getColIndex(columnKey): ソート中に足した行を rows.findIndex で選ぶと別の行になっていた。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, startTransition } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string; qty: number; done: boolean };

const rows: Row[] = [
  { id: 10, name: 'alpha', qty: 3, done: false },
  { id: 20, name: 'beta', qty: 1, done: true },
  { id: 30, name: 'gamma', qty: 2, done: false },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
  { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
];

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

const setup = (props: Partial<SpreadsheetGridProps<Row>> = {}) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(
    <div>
      <button type="button">外</button>
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={() => {}}
        height={300}
        {...props}
      />
    </div>,
  );
  return { ...view, ref };
};

const editorInput = () => document.querySelector<HTMLInputElement>('.ssg-cell-editor-input');

describe('focus()(DU-02)', () => {
  it('キーを受けるシェルへフォーカスを移し、そのまま矢印キーが効く', () => {
    const { ref, container } = setup();
    (container.querySelector('button') as HTMLButtonElement).focus();
    act(() => {
      ref.current?.focus();
    });
    const shell = container.querySelector<HTMLElement>('.ssg-shell');
    expect(document.activeElement).toBe(shell);
    act(() => {
      fireEvent.keyDown(shell as HTMLElement, { key: 'ArrowDown' });
    });
    // アクティブセルが無いときの最初の矢印は先頭のセル(DU-16)。
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 0 });
  });

  it('imeDirectInput 有効時は入力受けへ', () => {
    const { ref, container } = setup({ imeDirectInput: true });
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 0 });
    });
    (container.querySelector('button') as HTMLButtonElement).focus();
    act(() => {
      ref.current?.focus();
    });
    expect(document.activeElement?.hasAttribute('data-ssg-ime-input')).toBe(true);
  });
});

describe('startEditing()(DU-02)', () => {
  it('指定したセルを今の値で編集し始め、単一選択にしてエディタへフォーカスする', () => {
    const { ref } = setup();
    let started = false;
    act(() => {
      started = ref.current?.startEditing(2, 1) ?? false;
    });
    expect(started).toBe(true);
    expect(editorInput()?.value).toBe('2');
    expect(document.activeElement).toBe(editorInput());
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 1 });
    expect(ref.current?.getSelection()).toEqual({ type: 'cell', range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } } });
  });

  it('引数を省略するとアクティブセル。無ければ false', () => {
    const { ref } = setup();
    let result: boolean | undefined;
    act(() => {
      result = ref.current?.startEditing();
    });
    expect(result).toBe(false);
    expect(editorInput()).toBeNull();
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 0 });
    });
    act(() => {
      result = ref.current?.startEditing();
    });
    expect(result).toBe(true);
    expect(editorInput()?.value).toBe('beta');
  });

  // 追加(別視点のレビュー): 片方だけ渡したら(型では渡せない)、アクティブセルを編集せずに false。
  it('引数を片方だけ渡すと false で何もしない', () => {
    const { ref } = setup();
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 0 });
    });
    let result: boolean | undefined;
    const loose = ref.current?.startEditing as unknown as (row?: number, col?: number) => boolean;
    act(() => {
      result = loose(2);
    });
    expect(result).toBe(false);
    expect(editorInput()).toBeNull();
    act(() => {
      result = loose(undefined, 1);
    });
    expect(result).toBe(false);
    expect(editorInput()).toBeNull();
  });

  it('編集できないセル・checkbox 列・範囲外・編集中は false で何もしない', () => {
    const { ref, rerender } = setup();
    let result: boolean | undefined;
    // checkbox 列は直接トグル方式のため編集セッションを開かない。
    act(() => {
      result = ref.current?.startEditing(0, 2);
    });
    expect(result).toBe(false);
    // 範囲外は詰めずに false(別のセルを編集し始めない)。
    act(() => {
      result = ref.current?.startEditing(9, 0);
    });
    expect(result).toBe(false);
    act(() => {
      result = ref.current?.startEditing(0, 0);
    });
    expect(result).toBe(true);
    // 編集中は始めない(今の編集を確定も取消もしない)。
    act(() => {
      result = ref.current?.startEditing(1, 0);
    });
    expect(result).toBe(false);
    expect(editorInput()?.value).toBe('alpha');
    act(() => {
      fireEvent.keyDown(editorInput() as HTMLInputElement, { key: 'Escape' });
    });
    rerender(
      <div>
        <SpreadsheetGrid<Row> ref={ref} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} readOnly height={300} />
      </div>,
    );
    act(() => {
      result = ref.current?.startEditing(1, 0);
    });
    expect(result).toBe(false);
    expect(editorInput()).toBeNull();
  });

  // 追加(作り直しの確認 N-1): イベントの外から呼ぶと、編集中のセル(store)が先に描かれ、エディタが 1 つ前の
  //   初期値で開いていた(React 18 ではタイマー / await の後でも起きた。React 19 では startTransition の中で起きる)。
  //   何も打たずに Enter で確定すると、前のセルの値が書き込まれていた。
  it('startTransition の中から呼んでも、エディタはそのセルの今の値で開く(前に開いたセルの値ではない)', () => {
    const { ref } = setup();
    act(() => {
      startTransition(() => {
        ref.current?.startEditing(1, 0);
      });
    });
    expect(editorInput()?.value).toBe('beta');
    act(() => {
      fireEvent.keyDown(editorInput() as HTMLInputElement, { key: 'Escape' });
    });
    act(() => {
      startTransition(() => {
        ref.current?.startEditing(2, 1);
      });
    });
    expect(editorInput()?.value).toBe('2');
  });
});

// 追加(作り直しの確認 N-3): 読み取りは store の今の値から(同じ処理の中で続けて読むと 1 つ前の値だった)。
describe('書いた直後の読み取り(N-3)', () => {
  it('selectCell / setActiveCell / setRowSelection の直後に、同じ処理の中で読むと今の値を返す', () => {
    const { ref } = setup({ enableRowSelection: true });
    let active: unknown;
    let selection: unknown;
    act(() => {
      ref.current?.selectCell(2, 1);
      active = ref.current?.getActiveCell();
      selection = ref.current?.getSelection();
    });
    expect(active).toEqual({ row: 2, col: 1 });
    expect(selection).toEqual({ type: 'cell', range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } } });
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
      active = ref.current?.getActiveCell();
    });
    expect(active).toEqual({ row: 0, col: 0 });
    let keys: unknown;
    act(() => {
      ref.current?.setRowSelection({ type: 'include', rowKeys: [20] });
      keys = ref.current?.getSelectedRowKeys();
    });
    expect(keys).toEqual([20]);
  });
});

describe('getViewRowIndex() / getColIndex()(DU-03)', () => {
  it('並べ替え・絞り込みの中でも行キーから今の表示位置を返す(無い行は -1)', () => {
    const { ref } = setup();
    expect(ref.current?.getViewRowIndex(30)).toBe(2);
    act(() => {
      ref.current?.applyState({ sort: [{ columnKey: 'qty', direction: 'asc' }] });
    });
    // qty 昇順: beta(1) → gamma(2) → alpha(3)。rows の位置(gamma = 2)ではなく表示位置(1)。
    expect(ref.current?.getViewRowIndex(30)).toBe(1);
    expect(ref.current?.getViewRowIndex(10)).toBe(2);
    act(() => {
      ref.current?.applyState({ filters: { columnFilters: { name: { kind: 'text', value: 'be' } } } });
    });
    expect(ref.current?.getViewRowIndex(20)).toBe(0);
    expect(ref.current?.getViewRowIndex(30)).toBe(-1);
    expect(ref.current?.getViewRowIndex(999)).toBe(-1);
  });

  // 追加(作り直しの確認 N-2): 表示されているラベル行のキーで -1 が返っていた(viewRowIndex はラベル行も数える)。
  it('ラベル行のキーからも表示位置を返す', () => {
    type LabeledRow = Row & { label?: string };
    const labeledRows: LabeledRow[] = [
      { id: 1, name: '', qty: 0, done: false, label: '第1節' },
      ...rows,
      { id: 2, name: '', qty: 0, done: false, label: '第2節' },
      { id: 40, name: 'delta', qty: 4, done: false },
    ];
    const labeledRef = createRef<SpreadsheetGridHandle<LabeledRow>>();
    render(
      <SpreadsheetGrid<LabeledRow>
        ref={labeledRef}
        rows={labeledRows}
        columns={columns as GridColumn<LabeledRow>[]}
        rowKeyGetter={(row) => row.id}
        labelRow={{ isLabelRow: (row) => row.label !== undefined, getLabel: (row) => row.label ?? '' }}
        height={300}
      />,
    );
    expect(labeledRef.current?.getViewRowIndex(1)).toBe(0);
    expect(labeledRef.current?.getViewRowIndex(2)).toBe(4);
    expect(labeledRef.current?.getViewRowIndex(40)).toBe(5);
    expect(labeledRef.current?.getViewRowIndex(20)).toBe(2);
  });

  it('列キーから colIndex(ライブラリが足す列を含む視覚順)を返し、表示していない列は -1', () => {
    const { ref } = setup({
      enableRowDrag: true,
      columns: [...columns, { key: 'memo', title: 'メモ', width: 80, visible: false }],
    });
    // 先頭に行ドラッグのハンドル列があるので 1 つずれる。
    expect(ref.current?.getColIndex('name')).toBe(1);
    expect(ref.current?.getColIndex('qty')).toBe(2);
    expect(ref.current?.getColIndex('memo')).toBe(-1);
    expect(ref.current?.getColIndex('nope')).toBe(-1);
    // 引いた位置はそのまま selectCell などに渡せる。
    act(() => {
      ref.current?.selectCell(ref.current.getViewRowIndex(20), ref.current.getColIndex('qty'));
    });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 2 });
  });
});