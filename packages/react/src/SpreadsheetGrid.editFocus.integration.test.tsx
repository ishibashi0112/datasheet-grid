// 追加(編集確定後のフォーカス奪取)の回帰テスト: 実グリッドを StrictMode で render し、セル編集中に
//   ①グリッド外の入力欄(グリッドの上の登録フォーム / 上部バーのグローバルフィルター)をクリックすると、
//     エディタの blur で値は確定し、フォーカスはクリックした入力欄に残る(グリッドへ奪い返さない)
//   ②Enter / Tab / Escape(キー操作)での確定・取消は従来どおりグリッドへ戻る
//   ③グリッド内の別のセルをクリックして確定したときはグリッドに残り、クリックしたセルがアクティブになる
//     (追加: 確定後のアクティブセル上書き。行ヘッダーの行選択も編集していたセルへ戻さない)
//   を imeDirectInput の有無それぞれで検証します(有効時は「グリッドへ戻る」= 入力受けへ回る)。
//   実ブラウザでの追試は audit/harness の t-verify。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { StrictMode, createRef, useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; memo: string };

const initialRows: Row[] = [
  { id: 1, name: 'alpha', memo: 'a' },
  { id: 2, name: 'beta', memo: 'b' },
  { id: 3, name: 'gamma', memo: 'c' },
];

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'memo', title: 'メモ', width: 160 },
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

let currentRows: Row[] = initialRows;

// グリッドの上に登録フォーム(グリッド外の入力欄)がある画面。
function Harness({
  gridRef,
  imeDirectInput,
}: {
  gridRef: RefObject<SpreadsheetGridHandle<Row> | null>;
  imeDirectInput: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <>
      <input data-testid="outside-form" />
      <SpreadsheetGrid<Row>
        ref={gridRef}
        rows={rows}
        onRowsChange={setRows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        imeDirectInput={imeDirectInput}
      />
    </>
  );
}

const renderGrid = (imeDirectInput: boolean) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const utils = render(
    <StrictMode>
      <Harness gridRef={ref} imeDirectInput={imeDirectInput} />
    </StrictMode>,
  );
  return { ref, ...utils };
};

const getCell = (container: HTMLElement, rowIndex: number, colIndex: number): HTMLElement => {
  const rowEl = container.querySelectorAll('[data-pane="center"].ssg-body-row')[rowIndex];
  const cell = rowEl?.querySelectorAll<HTMLElement>('.ssg-body-cell')[colIndex];
  if (!cell) {
    throw new Error(`セル (${rowIndex}, ${colIndex}) が見つかりません`);
  }
  return cell;
};

const clickCell = (cell: HTMLElement) => {
  fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 });
  fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
};

// 確定後の後処理(rAF)まで進めます。
const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

// セルをクリック → F2 で編集を始め、値を書き換えたエディタを返します。
const startEditing = (container: HTMLElement, rowIndex: number, colIndex: number, value: string) => {
  clickCell(getCell(container, rowIndex, colIndex));
  fireEvent.keyDown(document.activeElement!, { key: 'F2' });
  const editor = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
  if (!editor) {
    throw new Error('エディタが開いていません');
  }
  expect(document.activeElement).toBe(editor);
  fireEvent.change(editor, { target: { value } });
  return editor;
};

describe.each([
  { imeDirectInput: false, label: 'imeDirectInput なし' },
  { imeDirectInput: true, label: 'imeDirectInput あり' },
])('編集確定後のフォーカス復帰($label)', ({ imeDirectInput }) => {
  // 「グリッドへ戻る」ときのフォーカス先(有効時はルートへの focus が入力受けへ回る)。
  const gridFocusTarget = (container: HTMLElement) =>
    imeDirectInput
      ? container.querySelector('[data-ssg-ime-input]')
      : container.querySelector('.ssg-shell');

  it('グリッド外の入力欄をクリックすると値は確定し、フォーカスはその入力欄に残る', async () => {
    const { container, getByTestId } = renderGrid(imeDirectInput);
    const outside = getByTestId('outside-form') as HTMLInputElement;
    startEditing(container, 0, 0, 'abc');

    await act(async () => {
      outside.focus(); // クリックでフォーカスが移る(エディタの blur で確定)
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('abc');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('上部バーのグローバルフィルター入力をクリックしたときも、フォーカスはその入力欄に残る', async () => {
    const { container } = renderGrid(imeDirectInput);
    const barInput = container.querySelector<HTMLInputElement>('.ssg-bar-input');
    expect(barInput).not.toBeNull();
    startEditing(container, 1, 0, 'xyz');

    await act(async () => {
      barInput!.focus();
      await nextFrame();
    });

    expect(currentRows[1]?.name).toBe('xyz');
    expect(document.activeElement).toBe(barInput);
  });

  it('Enter で確定するとグリッドへ戻り、下へ移動する', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 0, 0, 'enter');

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'Enter' });
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('enter');
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });

  // 追加(1.0.1 / 実アプリの総点検 AP-05): 次のフレームを待たずに、確定の直後からグリッドがキーを受ける(速い入力の
  //   確定直後のキーが body に落ちて捨てられていた)。
  it('Enter / Tab で確定した直後(次のフレームの前)からグリッドがフォーカスを持ち、移動も済んでいる', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 0, 0, 'fast');
    // 次のフレーム(rAF)が来ない間に、マイクロタスクだけを進めて確かめます。
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      fireEvent.keyDown(editor, { key: 'Enter' });
      await Promise.resolve();
      expect(currentRows[0]?.name).toBe('fast');
      expect(document.activeElement).toBe(gridFocusTarget(container));
      expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });

      if (!imeDirectInput) {
        // 続けて打った文字は移動先のセルの編集になる(前のセルを書き換えない)。
        fireEvent.keyDown(document.activeElement!, { key: 'x' });
        const next = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
        expect(next).not.toBeNull();
        fireEvent.change(next!, { target: { value: 'next' } });
        fireEvent.keyDown(next!, { key: 'Tab' });
        await Promise.resolve();
        expect(currentRows[1]?.name).toBe('next');
        expect(currentRows[0]?.name).toBe('fast');
        expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 1 });
        expect(document.activeElement).toBe(gridFocusTarget(container));
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('Tab で確定するとグリッドへ戻り、右へ移動する', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 0, 0, 'tab');

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'Tab' });
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('tab');
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 1 });
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });

  it('Escape で取り消すとグリッドへ戻る(値は不変)', async () => {
    const { container } = renderGrid(imeDirectInput);
    const editor = startEditing(container, 2, 0, 'cancelled');

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'Escape' });
      await nextFrame();
    });

    expect(currentRows[2]?.name).toBe('gamma');
    expect(container.querySelector('.ssg-cell-editor-input')).toBeNull();
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });

  it('グリッド内の別のセルをクリックして確定したときはグリッドに残り、クリックしたセルがアクティブになる', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    startEditing(container, 0, 0, 'moved');

    await act(async () => {
      clickCell(getCell(container, 2, 1)); // pointerdown でルートへフォーカス → エディタの blur で確定
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('moved');
    expect(document.activeElement).toBe(gridFocusTarget(container));
    // 確定後の後処理で編集していたセル (0, 0) へ戻さない。
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 1 });
    expect(ref.current?.getSelection()).toEqual({
      type: 'cell',
      range: { start: { row: 2, col: 1 }, end: { row: 2, col: 1 } },
    });
  });

  it('行ヘッダーを押して確定したときは、その行の選択を編集していたセルへ戻さない', async () => {
    const { container, ref } = renderGrid(imeDirectInput);
    startEditing(container, 0, 0, 'row');
    const rowHeader = container.querySelector<HTMLElement>(
      '.ssg-body-row[data-row-index="1"] .ssg-row-header-cell',
    );
    expect(rowHeader).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(rowHeader!, { button: 0, pointerType: 'mouse', pointerId: 1 });
      fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
      await nextFrame();
    });

    expect(currentRows[0]?.name).toBe('row');
    expect(ref.current?.getSelection()).toEqual({ type: 'row', startRow: 1, endRow: 1 });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(document.activeElement).toBe(gridFocusTarget(container));
  });
});

// 変更(1.0.1 のレビュー RA-3): 開いたままの custom エディタの編集を押したときに終える修正(AP-11)は戻した。onBlur で
//   非同期の検査を待ってから ctx.commit する作りの値が消えていたため。onBlur で確定する作りなら、押した後に届いた値も
//   編集していたセルに書かれる(1.0.0 と同じ)。
describe('onBlur で遅れて確定する custom エディタ(AP-11 / RA-3)', () => {
  const customColumns: GridColumn<Row>[] = [
    {
      key: 'name',
      title: '名前',
      width: 160,
      editor: {
        type: 'custom',
        render: (ctx) => (
          <input
            className="custom-editor"
            autoFocus
            defaultValue={ctx.initialText}
            onBlur={(event) => {
              const value = event.currentTarget.value;
              // サーバーの検査を待ってから確定する作り
              setTimeout(() => ctx.commit(value), 10);
            }}
          />
        ),
      },
    },
    { key: 'memo', title: 'メモ', width: 160 },
  ];

  function CustomHarness({ gridRef }: { gridRef: RefObject<SpreadsheetGridHandle<Row> | null> }) {
    const [rows, setRows] = useState(initialRows);
    useEffect(() => {
      currentRows = rows;
    }, [rows]);
    return (
      <SpreadsheetGrid<Row>
        ref={gridRef}
        rows={rows}
        onRowsChange={setRows}
        columns={customColumns}
        rowKeyGetter={(row) => row.id}
      />
    );
  }

  it('別のセルを押した後に届いた ctx.commit の値を、編集していたセルに書く', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <StrictMode>
        <CustomHarness gridRef={ref} />
      </StrictMode>,
    );
    clickCell(getCell(container, 0, 0));
    fireEvent.keyDown(document.activeElement!, { key: 'F2' });
    const editor = container.querySelector<HTMLInputElement>('.custom-editor');
    expect(editor).not.toBeNull();
    fireEvent.change(editor!, { target: { value: 'draft' } });

    await act(async () => {
      clickCell(getCell(container, 2, 1));
      await new Promise((resolve) => setTimeout(resolve, 30));
      await nextFrame();
    });
    expect(currentRows[0]?.name).toBe('draft');
    expect(container.querySelector('.custom-editor')).toBeNull();
  });
});


// 変更(1.0.1 のレビュー RA-1): 編集中にグリッドごとアンマウントされたときは、1.0.0 と同じく確定しない(外れたグリッドが
//   持っている古い rows で onRowsChange を呼ぶと、外すのと同じ更新で親が変えた rows を上書きするため)。残したいときは
//   外す前に入力欄の blur で確定する(ドキュメントの書き方)。
describe('編集中のアンマウント(AP-12 / RA-1)', () => {
  let hideGrid: (options?: { blurFirst?: boolean; nextRows?: Row[] }) => void = () => {};
  function TogglingHarness({ gridRef }: { gridRef: RefObject<SpreadsheetGridHandle<Row> | null> }) {
    const [rows, setRows] = useState(initialRows);
    const [shown, setShown] = useState(true);
    useEffect(() => {
      currentRows = rows;
    }, [rows]);
    useEffect(() => {
      hideGrid = ({ blurFirst = false, nextRows } = {}) => {
        if (blurFirst && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (nextRows) {
          setRows(nextRows);
        }
        setShown(false);
      };
    }, []);
    return shown ? (
      <SpreadsheetGrid<Row>
        ref={gridRef}
        rows={rows}
        onRowsChange={setRows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
      />
    ) : null;
  }

  it('外すのと同じ更新で親が rows を変えても、外れたグリッドの古い rows で上書きしない', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <StrictMode>
        <TogglingHarness gridRef={ref} />
      </StrictMode>,
    );
    startEditing(container, 1, 0, 'draft');
    const replaced: Row[] = [{ id: 9, name: 'other', memo: 'z' }];
    await act(async () => {
      hideGrid({ nextRows: replaced });
      await Promise.resolve();
    });
    expect(container.querySelector('.ssg-shell')).toBeNull();
    expect(currentRows).toEqual(replaced);
  });

  it('外す前に入力欄を blur すると、打っていた値を確定してから外れる', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <StrictMode>
        <TogglingHarness gridRef={ref} />
      </StrictMode>,
    );
    startEditing(container, 1, 0, 'draft');
    await act(async () => {
      hideGrid({ blurFirst: true });
      await Promise.resolve();
    });
    expect(container.querySelector('.ssg-shell')).toBeNull();
    expect(currentRows[1]?.name).toBe('draft');
  });
});

// 追加(1.0.1 / 実アプリの総点検 AP-10): 右クリックメニューの onSelect で startEditing() を呼ぶと、メニューを閉じたときの
//   フォーカスの戻しが開いたエディタを閉じていた(setTimeout で後へずらすと開いた)。
describe('右クリックメニューから編集を始める(AP-10)', () => {
  it('onSelect の startEditing() で開いたエディタは、メニューを閉じた後も開いたまま', async () => {
    const gridRef = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <StrictMode>
        <SpreadsheetGrid<Row>
          ref={gridRef}
          rows={initialRows}
          onRowsChange={() => {}}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          enableContextMenu
          getContextMenuItems={() => [
            { kind: 'action', key: 'edit', label: 'このセルを編集', onSelect: () => void gridRef.current?.startEditing() },
          ]}
        />
      </StrictMode>,
    );
    const cell = container.querySelector('[data-row-index="1"] [data-ssg-col-key="name"]') as HTMLElement;
    fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerUp(window, { button: 0, pointerType: 'mouse', pointerId: 1 });
    fireEvent.contextMenu(cell, { clientX: 10, clientY: 10 });
    const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((element) =>
      element.textContent?.includes('このセルを編集'),
    );
    expect(item).toBeDefined();
    act(() => {
      fireEvent.click(item!);
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const editor = container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
    expect(editor).not.toBeNull();
    expect(editor?.value).toBe('beta');
    expect(document.activeElement).toBe(editor);
  });
});