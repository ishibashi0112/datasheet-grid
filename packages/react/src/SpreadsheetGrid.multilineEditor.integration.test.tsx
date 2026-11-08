// 追加(段階 2 DU-14): 改行を含む値の複数行のエディタ(editor: { type: 'text', multiline: true })。
//   - 1 行の入力欄(<input>)は改行を消すので、F2 で開いて確定すると改行が消えていた。複数行の入力欄(<textarea>)で開く。
//   - enterKey 'commit'(既定。Excel と同じ): Enter / Shift+Enter で確定、Alt+Enter と Ctrl / ⌘+Enter で改行。
//   - enterKey 'newline': Enter で改行、Ctrl / ⌘+Enter で確定。どちらも Tab は確定して右へ、Escape は取り消し。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, GridTextEditorEnterKey, SpreadsheetGridHandle } from './model/gridTypes';
import stylesCss from './styles.css?raw';

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

type Row = { id: number; memo: string; other: string };

let currentRows: Row[] = [];
let changeCount = 0;

function Harness({ gridRef, columns, initialRows }: { gridRef: Ref<SpreadsheetGridHandle<Row>>; columns: GridColumn<Row>[]; initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid
      ref={gridRef}
      columns={columns}
      rows={rows}
      onRowsChange={(next) => {
        changeCount += 1;
        setRows(next);
      }}
      rowKeyGetter={(row) => row.id}
    />
  );
}

const makeColumns = (enterKey?: GridTextEditorEnterKey, multiline = true): GridColumn<Row>[] => [
  { key: 'id', title: 'ID', width: 60 },
  {
    key: 'memo',
    title: 'メモ',
    width: 200,
    editable: true,
    editor: { type: 'text', multiline, ...(enterKey ? { enterKey } : {}) },
  },
  { key: 'other', title: 'ほか', width: 100, editable: true },
];

const initialRows: Row[] = [
  { id: 1, memo: '倉庫 B の棚 3 から。\n残りは来週入荷。', other: 'x' },
  { id: 2, memo: '至急', other: 'y' },
];

const open = (columns: GridColumn<Row>[]) => {
  changeCount = 0;
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const utils = render(<Harness gridRef={ref} columns={columns} initialRows={initialRows} />);
  act(() => {
    ref.current?.setActiveCell({ row: 0, col: 1 });
  });
  const shell = utils.container.querySelector<HTMLElement>('.ssg-shell')!;
  fireEvent.keyDown(shell, { key: 'F2' });
  return { ...utils, ref };
};

const textarea = (container: HTMLElement) => container.querySelector<HTMLTextAreaElement>('textarea.ssg-cell-editor-input');
const activeCell = (ref: { current: SpreadsheetGridHandle<Row> | null }) => ref.current?.getActiveCell();
// 確定の後の移動と単一選択は次のフレームで決まります。
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

describe('複数行のエディタ(DU-14)', () => {
  it('改行を含む値をそのまま複数行の入力欄で開き、何も変えない Enter では書き込まない', async () => {
    const { container, ref } = open(makeColumns());
    const editor = textarea(container);
    expect(editor?.value).toBe('倉庫 B の棚 3 から。\n残りは来週入荷。');
    expect(container.querySelector('input.ssg-cell-editor-input')).toBeNull();
    // 高さはエディタが中身に合わせて書く(下限はセルの高さ)。
    expect(editor?.style.height).toMatch(/px$/);
    fireEvent.keyDown(editor!, { key: 'Enter' });
    expect(textarea(container)).toBeNull();
    expect(changeCount).toBe(0);
    await nextFrame();
    expect(activeCell(ref)).toEqual({ row: 1, col: 1 });
  });

  it("既定('commit'): Alt+Enter / Ctrl+Enter / ⌘+Enter で改行し、Enter で改行ごと確定する", () => {
    const { container } = open(makeColumns());
    const editor = textarea(container)!;
    fireEvent.change(editor, { target: { value: 'A' } });
    editor.setSelectionRange(1, 1);
    fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
    expect(textarea(container)?.value).toBe('A\n');
    fireEvent.change(editor, { target: { value: 'A\nB' } });
    editor.setSelectionRange(3, 3);
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    fireEvent.change(editor, { target: { value: 'A\nB\nC' } });
    editor.setSelectionRange(5, 5);
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    expect(textarea(container)?.value).toBe('A\nB\nC\n');
    expect(changeCount).toBe(0);
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(textarea(container)).toBeNull();
    expect(currentRows[0].memo).toBe('A\nB\nC\n');
  });

  it("既定('commit'): 改行はキャレットの位置に入る", () => {
    const { container } = open(makeColumns());
    const editor = textarea(container)!;
    fireEvent.change(editor, { target: { value: 'AB' } });
    editor.setSelectionRange(1, 1);
    fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
    expect(textarea(container)?.value).toBe('A\nB');
    expect(textarea(container)?.selectionStart).toBe(2);
  });

  it("'newline': Enter では確定せず(改行は入力欄が入れる)、Ctrl+Enter / ⌘+Enter で確定する", async () => {
    const { container, ref } = open(makeColumns('newline'));
    const editor = textarea(container)!;
    const enter = fireEvent.keyDown(editor, { key: 'Enter' });
    // 既定の動き(改行を入れる)を止めない。
    expect(enter).toBe(true);
    expect(textarea(container)).not.toBeNull();
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });
    expect(textarea(container)).not.toBeNull();
    fireEvent.change(editor, { target: { value: '1 行目\n2 行目' } });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    expect(textarea(container)).toBeNull();
    expect(currentRows[0].memo).toBe('1 行目\n2 行目');
    await nextFrame();
    expect(activeCell(ref)).toEqual({ row: 1, col: 1 });
    // ⌘+Enter でも確定する。
    const shell = container.querySelector<HTMLElement>('.ssg-shell')!;
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.change(textarea(container)!, { target: { value: '至急\n本日中' } });
    fireEvent.keyDown(textarea(container)!, { key: 'Enter', metaKey: true });
    expect(textarea(container)).toBeNull();
    expect(currentRows[1].memo).toBe('至急\n本日中');
  });

  it("'newline': Alt+Enter も改行", () => {
    const { container } = open(makeColumns('newline'));
    const editor = textarea(container)!;
    fireEvent.change(editor, { target: { value: 'A' } });
    editor.setSelectionRange(1, 1);
    fireEvent.keyDown(editor, { key: 'Enter', altKey: true });
    expect(textarea(container)?.value).toBe('A\n');
  });

  it('Tab は確定して右へ、Escape は取り消し、変換中の Enter は確定しない', async () => {
    const { container, ref } = open(makeColumns());
    fireEvent.change(textarea(container)!, { target: { value: '変換中' } });
    fireEvent.keyDown(textarea(container)!, { key: 'Enter', isComposing: true });
    expect(textarea(container)).not.toBeNull();
    fireEvent.keyDown(textarea(container)!, { key: 'Escape' });
    expect(textarea(container)).toBeNull();
    expect(changeCount).toBe(0);
    await nextFrame();
    const shell = container.querySelector<HTMLElement>('.ssg-shell')!;
    fireEvent.keyDown(shell, { key: 'F2' });
    fireEvent.change(textarea(container)!, { target: { value: 'X\nY' } });
    fireEvent.keyDown(textarea(container)!, { key: 'Tab' });
    expect(currentRows[0].memo).toBe('X\nY');
    await nextFrame();
    expect(activeCell(ref)).toEqual({ row: 0, col: 2 });
  });

  // 注記(段階 2 の見直し): 複数行の入力欄でも PageUp / PageDown は止める(中がスクロールするときも)。入力欄に任せると、
  //   Chromium は入力欄の中と一緒にグリッドもスクロールし、エディタの上の方が見出しの下へ隠れたため。
  it('PageUp / PageDown は入力欄の中がスクロールするときも止め、編集は続く', () => {
    const { container } = open(makeColumns());
    const input = textarea(container)!;
    Object.defineProperty(input, 'clientHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(input, 'scrollHeight', { configurable: true, get: () => 300 });
    input.scrollTop = 100;
    expect(fireEvent.keyDown(input, { key: 'PageDown' })).toBe(false);
    expect(fireEvent.keyDown(input, { key: 'PageUp' })).toBe(false);
    expect(textarea(container)).not.toBeNull();
    expect(changeCount).toBe(0);
  });

  // 追加(段階 2 の確かめ直し N2-2): 開くと文の折り返しの位置と行の間隔がセルと変わっていた(入力欄は行の間隔 20px 固定・
  //   word-break は既定のまま、セルはページの行の間隔と列の wordBreak / lineBreak)。
  it('列の wordBreak / lineBreak を入力欄にも使い、行の間隔はセルと同じくページから受け継ぐ', () => {
    const columns = makeColumns().map((column) =>
      column.key === 'memo' ? { ...column, autoHeight: true, wordBreak: 'keep-all' as const, lineBreak: 'strict' as const } : column,
    );
    const { container } = open(columns);
    const editor = textarea(container)!;
    expect(editor.style.wordBreak).toBe('keep-all');
    expect((editor.style as unknown as Record<string, string>).lineBreak).toBe('strict');
    const rule = /\.ssg-cell-editor-input--multiline \{[^}]*\}/.exec(stylesCss)?.[0] ?? '';
    expect(rule).toMatch(/line-height: inherit;/);
  });

  it('上下の余白は、受け継いだ行の間隔で 1 行目を基準の行の高さの真ん中に置く量', () => {
    const original = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = original(element, pseudo);
      if (element instanceof HTMLTextAreaElement) {
        return new Proxy(style, {
          get: (target, key) => (key === 'lineHeight' ? '24px' : Reflect.get(target, key)),
        });
      }
      return style;
    });
    try {
      const { container } = open(makeColumns());
      // 行の高さ 36px: (36 - 枠 4 - 24) / 2 = 4px(行の間隔 20px のときは 6px)。
      expect(textarea(container)?.style.paddingTop).toBe('4px');
    } finally {
      spy.mockRestore();
    }
  });

  // 追加(段階 2 の 3 回目の確かめ直し N3-2): 背の高い行(上にそろえたセル)でも余白が 6px で、文字がセルより下へずれ、入力欄も
  //   その分セルより高くなっていた。上にそろえたセルは余白 0、真ん中にそろえたセルは中身をセルの真ん中に置く量。
  //   jsdom のレイアウトスタブでは auto-height の行は 600px(基準の 36px より高い)、1 行の高さは読めないので 20px。
  it('背の高い行の上にそろえたセルでは上下の余白 0、真ん中にそろえたセルでは中身を真ん中に置く量', () => {
    const tallColumns = (verticalAlign?: 'top' | 'center'): GridColumn<Row>[] =>
      makeColumns().map((column) =>
        column.key === 'memo' ? { ...column, autoHeight: true, ...(verticalAlign ? { verticalAlign } : {}) } : column,
      );
    const openTall = (columns: GridColumn<Row>[]) => {
      const ref = createRef<SpreadsheetGridHandle<Row>>();
      const utils = render(
        <SpreadsheetGrid ref={ref} columns={columns} rows={initialRows} rowKeyGetter={(row) => row.id} autoHeight />,
      );
      act(() => {
        ref.current?.setActiveCell({ row: 0, col: 1 });
      });
      fireEvent.keyDown(utils.container.querySelector<HTMLElement>('.ssg-shell')!, { key: 'F2' });
      return utils;
    };
    const top = openTall(tallColumns());
    expect(textarea(top.container)?.style.paddingTop).toBe('0px');
    expect(textarea(top.container)?.style.paddingBottom).toBe('0px');
    cleanup();
    const center = openTall(tallColumns('center'));
    // (600 - 枠 4 - 20) / 2 = 288px
    expect(textarea(center.container)?.style.paddingTop).toBe('288px');
  });

  it('multiline を付けない text 列は今までどおり 1 行の入力欄', () => {
    const { container } = open(makeColumns(undefined, false));
    expect(textarea(container)).toBeNull();
    expect(container.querySelector('input.ssg-cell-editor-input')).not.toBeNull();
  });
});
