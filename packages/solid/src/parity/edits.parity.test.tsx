// React 版の結合テストのうち、Solid 版でまだ同じ場面を見ていなかった編集の確定・ハンドルの命令・スクロールの API・手動の絞り込み・
//   コピー範囲の点線を、React 版と比べるテストへ移した(段階 4-1。docs/audits/2026-11-22-solid-quality/test-inventory.md)。
//   React 版の元のテストは packages/react/src の SpreadsheetGrid.editSession / handleFocusEdit / scrollApi / manualMode / copyRange の
//   各 integration.test.tsx。
import { afterAll, beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import type { ServerSideDataSource } from '@ishibashi0112/spreadsheet-grid-core';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name?: unknown; qty?: unknown; due?: unknown; memo?: unknown; done?: boolean; kind?: 'label'; label?: string };

beforeAll(() => {
  installJsdomLayoutStubs({ width: 900, height: 400 });
});

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const focused = (): Element => document.activeElement ?? document.body;
const pointer = { button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
const editorInput = (ctx: ParityContext) => ctx.container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
const requireEditor = (ctx: ParityContext): HTMLInputElement => {
  const element = editorInput(ctx);
  if (!element) {
    throw new Error(`[${ctx.framework}] エディタがありません`);
  }
  return element;
};
const keyOn = async (ctx: ParityContext, target: Element | null | undefined, init: KeyboardEventInit & { key: string; keyCode?: number }) => {
  await ctx.act(() => {
    fireEvent.keyDown(target ?? focused(), init);
  });
};
// エディタの今の様子(開いているか・種類・値・フォーカス)を控える。
const logEditor = (ctx: ParityContext, label: string) => {
  const input = editorInput(ctx);
  ctx.log(label, input ? { type: input.type, value: input.value, focused: document.activeElement === input } : null);
};

describe('編集の確定(editSession)', () => {
  const columns = [
    { key: 'id', title: 'ID', width: 80 },
    { key: 'due', title: 'Due', width: 140, editable: true, editor: { type: 'date' } },
    { key: 'qty', title: 'Qty', width: 100, editable: true },
    { key: 'memo', title: 'Memo', width: 100, editable: true, editor: { type: 'number' } },
  ];

  it.each([
    ['date の ISO 日時(時刻を落とさない)', 1, 'due', '2026-07-14T09:30:00Z'],
    ['date の読めない値(null にしない)', 1, 'due', '未定'],
    ['text の数値(文字列にしない)', 2, 'qty', 5],
    ['text の null(空文字にしない)', 2, 'qty', null],
    ['number の 3 桁区切りの文字列', 3, 'memo', '1,234'],
  ] as const)('FC-09: 何も変えずに確定しても書き直さない(%s)', async (_label, col, key, value) => {
    await expectParity({
      watch: ['onRowsChange'],
      props: () => ({ rows: [{ id: 1, [key]: value }, { id: 2, [key]: value }], columns, rowKeyGetter: (row: Row) => row.id }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col });
        });
        await keyOn(ctx, ctx.shell(), { key: 'F2' });
        logEditor(ctx, 'F2 で開いた');
        await keyOn(ctx, requireEditor(ctx), { key: 'Enter' });
        ctx.log('Enter の後', { value: (ctx.rows()[0] as Row)[key], canUndo: call(ctx, 'canUndo'), active: call(ctx, 'getActiveCell') });
        // フォーカスが外へ移って閉じても同じ(fireEvent.blur は React の onBlur = focusout に届かないので、本当にフォーカスを移す)。
        await keyOn(ctx, ctx.shell(), { key: 'Enter' });
        const outside = document.createElement('button');
        document.body.append(outside);
        await ctx.act(() => outside.focus());
        outside.remove();
        ctx.log('blur の後', { value: (ctx.rows()[1] as Row)[key], canUndo: call(ctx, 'canUndo') });
        ctx.snapshot('確定した後');
      },
    });
  });

  it('FC-17: number 列を英字から打ち始めると text で開き、数字なら number。全角の文字列の値は半角の数値で開く', async () => {
    await expectParity({
      watch: ['onRowsChange'],
      props: () => ({
        rows: [
          { id: 1, qty: 10 },
          { id: 2, qty: '１２' },
        ],
        columns: [
          { key: 'id', title: 'ID', width: 80 },
          { key: 'qty', title: 'Qty', width: 100, editable: true, editor: { type: 'number' } },
        ],
        rowKeyGetter: (row: Row) => row.id,
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 1 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'a' });
        logEditor(ctx, '英字で開いた');
        await keyOn(ctx, requireEditor(ctx), { key: 'Enter' });
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 1 });
        });
        await keyOn(ctx, ctx.shell(), { key: '7' });
        logEditor(ctx, '数字で開いた');
        await keyOn(ctx, requireEditor(ctx), { key: 'Escape' });
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 1, col: 1 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'F2' });
        logEditor(ctx, '全角の値を F2 で開いた');
        ctx.snapshot('全角の値の編集');
      },
    });
  });

  it('FC-13: Safari の変換を確定する Enter(keyCode 229)では確定せず、ふつうの Enter で確定する', async () => {
    await expectParity({
      watch: ['onRowsChange'],
      props: () => ({
        rows: [{ id: 1, memo: 'a' }],
        columns: [
          { key: 'id', title: 'ID', width: 80 },
          { key: 'memo', title: 'Memo', width: 160, editable: true },
        ],
        rowKeyGetter: (row: Row) => row.id,
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 1 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'F2' });
        await ctx.act(() => {
          fireEvent.input(requireEditor(ctx), { target: { value: 'a東京' } });
        });
        await keyOn(ctx, requireEditor(ctx), { key: 'Enter', keyCode: 229, isComposing: false });
        logEditor(ctx, '変換を確定する Enter の後');
        await keyOn(ctx, requireEditor(ctx), { key: 'Escape', keyCode: 229 });
        logEditor(ctx, '変換を取り消す Escape の後');
        await keyOn(ctx, requireEditor(ctx), { key: 'Enter', keyCode: 13 });
        ctx.snapshot('ふつうの Enter で確定');
      },
    });
  });

  it('FC-10 / FC-11: 編集中に selectCell しても確定は編集中のセルへ・終わった custom の ctx は効かない', async () => {
    let captured: { commit: (value: unknown) => unknown; cancel: () => void }[] = [];
    await expectParity({
      watch: ['onRowsChange'],
      props: () => {
        captured = [];
        return {
          rows: [
            { id: 1, memo: 'a', qty: 'x' },
            { id: 2, memo: 'b', qty: 'y' },
            { id: 3, memo: 'c', qty: 'z' },
          ],
          columns: [
            { key: 'id', title: 'ID', width: 80 },
            { key: 'memo', title: 'Memo', width: 160, editable: true },
            {
              key: 'qty',
              title: 'Custom',
              width: 120,
              editable: true,
              editor: {
                type: 'custom',
                render: (ctx: { value: unknown; commit: (value: unknown) => unknown; cancel: () => void }) => {
                  captured.push({ commit: ctx.commit, cancel: ctx.cancel });
                  return `custom:${String(ctx.value)}`;
                },
              },
            },
          ],
          rowKeyGetter: (row: Row) => row.id,
        };
      },
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 1 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'F2' });
        const top = () => ctx.container.querySelector<HTMLElement>('.ssg-cell-editor')?.style.top;
        const before = top();
        await ctx.act(() => {
          call(ctx, 'selectCell', 2, 1);
        });
        ctx.log('selectCell の後もエディタは同じ位置', top() === before);
        await ctx.act(() => {
          fireEvent.input(requireEditor(ctx), { target: { value: 'XYZ' } });
        });
        await keyOn(ctx, requireEditor(ctx), { key: 'Enter' });
        ctx.snapshot('編集中のセルへ確定');

        // custom: 取り消した編集の ctx.commit / ctx.cancel は、後で始めた別のセルの編集へ効かない。
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 0, col: 2 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'F2' });
        const first = captured[captured.length - 1];
        await ctx.act(() => {
          first?.cancel();
        });
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 1, col: 2 });
        });
        await keyOn(ctx, ctx.shell(), { key: 'F2' });
        await ctx.act(() => {
          ctx.log('前の ctx.commit', first?.commit('late'));
          first?.cancel();
        });
        ctx.snapshot('前の ctx を呼んだ後(開いたまま)');
        const second = captured[captured.length - 1];
        await ctx.act(() => {
          second?.commit('B!');
        });
        ctx.snapshot('今の ctx で確定');
      },
    });
  });

  it.each([
    ['down', 0],
    ['up', 2],
  ] as const)('FC-18: Enter で確定した後の移動はラベル行を読み飛ばす(editorEnterMove=%s)・先がラベル行だけなら留まる', async (move, from) => {
    await expectParity({
      features: ['labelRow'],
      watch: ['onRowsChange', 'onActiveCellChange'],
      props: () => ({
        rows: [
          { id: 1, memo: 'a' },
          { id: 2, memo: 'S2', kind: 'label' },
          { id: 3, memo: 'c' },
          { id: 4, memo: 'S4', kind: 'label' },
        ],
        columns: [
          { key: 'id', title: 'ID', width: 80 },
          { key: 'memo', title: 'Memo', width: 160, editable: true },
        ],
        rowKeyGetter: (row: Row) => row.id,
        labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => String(row.memo) },
        editorEnterMove: move,
      }),
      steps: async (ctx) => {
        for (const row of [from, 2]) {
          await ctx.act(() => {
            call(ctx, 'setActiveCell', { row, col: 1 });
          });
          await keyOn(ctx, ctx.shell(), { key: 'F2' });
          await ctx.act(() => {
            fireEvent.input(requireEditor(ctx), { target: { value: `X${row}` } });
          });
          await keyOn(ctx, requireEditor(ctx), { key: 'Enter' });
          ctx.log(`${row} 行目で Enter の後`, call(ctx, 'getActiveCell'));
        }
        ctx.snapshot('確定した後');
      },
    });
  });
});

describe('ハンドルの命令(handleFocusEdit)', () => {
  const rows = [
    { id: 10, name: 'alpha', qty: 3, done: false },
    { id: 20, name: 'beta', qty: 1, done: true },
    { id: 30, name: 'gamma', qty: 2, done: false },
  ];
  const columns = [
    { key: 'name', title: '名前', width: 160 },
    { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
    { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
  ];

  it.each([
    ['imeDirectInput なし', false],
    ['imeDirectInput あり', true],
  ] as const)('focus()(DU-02): キーを受ける要素へ移し、矢印キーが効く(%s)', async (_label, imeDirectInput) => {
    await expectParity({
      features: imeDirectInput ? ['imeDirectInput'] : [],
      props: () => ({ rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300, imeDirectInput }),
      steps: async (ctx) => {
        const outside = document.createElement('button');
        document.body.append(outside);
        try {
          await ctx.act(() => outside.focus());
          await ctx.act(() => {
            call(ctx, 'focus');
          });
          ctx.snapshot('focus()');
          await keyOn(ctx, null, { key: 'ArrowDown' });
          ctx.log('↓ の後', call(ctx, 'getActiveCell'));
          await ctx.act(() => outside.focus());
          await ctx.act(() => {
            call(ctx, 'focus');
          });
          ctx.snapshot('アクティブセルがあるときの focus()');
        } finally {
          outside.remove();
        }
      },
    });
  });

  it('startEditing()(DU-02): 指定したセル / アクティブセル / 片方だけ / 編集できない・範囲外・編集中・readOnly', async () => {
    await expectParity({
      watch: ['onActiveCellChange'],
      props: () => ({ rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300, onRowsChange: () => {} }),
      controlledRows: false,
      steps: async (ctx) => {
        const start = async (label: string, ...args: unknown[]) => {
          await ctx.act(() => {
            ctx.log(`${label}: 戻り値`, call(ctx, 'startEditing', ...args));
          });
          logEditor(ctx, `${label}: エディタ`);
        };
        await start('アクティブセルなしで引数を省略');
        await start('(2, 1)', 2, 1);
        ctx.log('(2, 1) の後の選択', call(ctx, 'getSelection'));
        ctx.snapshot('(2, 1) を編集');
        await keyOn(ctx, requireEditor(ctx), { key: 'Escape' });
        await ctx.act(() => {
          call(ctx, 'setActiveCell', { row: 1, col: 0 });
        });
        await start('片方だけ(行)', 2);
        await start('片方だけ(列)', undefined, 1);
        await start('アクティブセル');
        await start('編集中に別のセル', 0, 0);
        await keyOn(ctx, requireEditor(ctx), { key: 'Escape' });
        await start('checkbox の列', 0, 2);
        await start('範囲外', 9, 0);
        await ctx.setProps({ readOnly: true });
        await start('readOnly', 1, 0);
        ctx.snapshot('最後');
      },
    });
  });

  it('書いた直後の読み取り(N-3): selectCell / setActiveCell / setRowSelection の直後に同じ処理の中で読む', async () => {
    await expectParity({
      props: () => ({ rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300, enableRowSelection: true }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'selectCell', 2, 1);
          ctx.log('selectCell の直後', { active: call(ctx, 'getActiveCell'), selection: call(ctx, 'getSelection') });
          call(ctx, 'setActiveCell', { row: 0, col: 0 });
          ctx.log('setActiveCell の直後', call(ctx, 'getActiveCell'));
          call(ctx, 'setRowSelection', { type: 'include', rowKeys: [20] });
          ctx.log('setRowSelection の直後', call(ctx, 'getSelectedRowKeys'));
        });
        ctx.snapshot('書いた後');
      },
    });
  });

  it('選択の API でラベル行を指したとき(N2-1)', async () => {
    const labeledRows = [
      { id: 1, name: '', qty: 0, done: false, label: '第1節' },
      ...rows,
      { id: 2, name: '', qty: 0, done: false, label: '第2節' },
      { id: 40, name: 'delta', qty: 4, done: false },
      { id: 3, name: '', qty: 0, done: false, label: '末尾' },
    ];
    await expectParity({
      features: ['labelRow'],
      watch: ['onActiveCellChange'],
      props: () => ({
        rows: labeledRows,
        columns,
        rowKeyGetter: (row: Row) => row.id,
        labelRow: { isLabelRow: (row: Row) => row.label !== undefined, getLabel: (row: Row) => row.label ?? '' },
        height: 300,
      }),
      steps: async (ctx) => {
        // アクティブセルが無いときの列見出しのクリックは、アクティブセルを最初のデータ行にする。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.header('qty'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.log('列見出しのクリック', { active: call(ctx, 'getActiveCell'), selection: call(ctx, 'getSelection') });
        for (const [label, name, args] of [
          ['selectCell(ラベル行)', 'selectCell', [4, 1]],
          ['setActiveCell(先頭のラベル行)', 'setActiveCell', [{ row: 0, col: 0 }]],
          ['selectCell(最後のラベル行)', 'selectCell', [6, 2]],
          ['selectRange(ラベル行から)', 'selectRange', [{ start: { row: 4, col: 0 }, end: { row: 5, col: 2 } }]],
          ['selectRange(上向き)', 'selectRange', [{ start: { row: 4, col: 1 }, end: { row: 1, col: 1 } }]],
          ['selectRange(ラベル行だけ)', 'selectRange', [{ start: { row: 4, col: 0 }, end: { row: 4, col: 2 } }]],
          ['selectRange(最後のラベル行だけ)', 'selectRange', [{ start: { row: 6, col: 1 }, end: { row: 6, col: 1 } }]],
        ] as const) {
          await ctx.act(() => {
            call(ctx, name, ...args);
          });
          ctx.log(label, { active: call(ctx, 'getActiveCell'), selection: call(ctx, 'getSelection') });
        }
        ctx.snapshot('最後');
      },
    });
  });

  it('行キー / 列キーから位置を引く(DU-03 / N-2 / N-4): 並べ替え・絞り込み・ラベル行・足した列・表示していない列', async () => {
    const labeledRows = [
      { id: 1, name: '', qty: 0, done: false, label: '第1節' },
      ...rows,
      { id: 2, name: '', qty: 0, done: false, label: '第2節' },
      { id: 40, name: 'delta', qty: 4, done: false },
    ];
    await expectParity({
      features: ['labelRow', 'filtering', 'rowDrag'],
      props: () => ({
        rows: labeledRows,
        columns: [...columns, { key: 'memo', title: 'メモ', width: 80, visible: false }],
        rowKeyGetter: (row: Row) => row.id,
        labelRow: { isLabelRow: (row: Row) => row.label !== undefined, getLabel: (row: Row) => row.label ?? '' },
        enableRowDrag: true,
        height: 300,
      }),
      steps: async (ctx) => {
        const read = (label: string) =>
          ctx.log(label, {
            viewRowIndex: [1, 2, 10, 20, 30, 40, 999].map((key) => call(ctx, 'getViewRowIndex', key)),
            rowNumber: [1, 2, 10, 20, 30, 40, 999].map((key) => call(ctx, 'getRowNumber', key)),
            colIndex: ['name', 'qty', 'done', 'memo', 'nope'].map((key) => call(ctx, 'getColIndex', key)),
          });
        read('最初');
        await ctx.act(() => {
          call(ctx, 'applyState', { sort: [{ columnKey: 'qty', direction: 'asc' }] });
        });
        read('数量の昇順');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { columnFilters: { name: { kind: 'text', value: 'be' } } } });
        });
        read('名前に be');
        // 引いた位置はそのまま selectCell に渡せる。
        await ctx.act(() => {
          call(ctx, 'selectCell', call(ctx, 'getViewRowIndex', 20), call(ctx, 'getColIndex', 'qty'));
        });
        ctx.log('引いた位置で selectCell', call(ctx, 'getActiveCell'));
        ctx.snapshot('最後');
      },
    });
  });

  it('イベントの外(タイマーの中)から startEditing しても、エディタはそのセルの今の値で開く(N-1)', async () => {
    await expectParity({
      watch: ['onRowsChange'],
      props: () => ({ rows, columns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      steps: async (ctx) => {
        const later = (fn: () => void) =>
          ctx.act(async () => {
            await new Promise<void>((resolve) => {
              setTimeout(() => {
                fn();
                resolve();
              }, 0);
            });
          });
        await later(() => {
          call(ctx, 'startEditing', 1, 0);
        });
        logEditor(ctx, 'タイマーの中で 1 行目');
        await keyOn(ctx, editorInput(ctx), { key: 'Escape' });
        await later(() => {
          call(ctx, 'startEditing', 2, 1);
        });
        logEditor(ctx, 'タイマーの中で 2 行目の数量');
        // 何も打たずに Enter で確定しても、前に開いたセルの値を書かない。
        await keyOn(ctx, editorInput(ctx), { key: 'Enter' });
        ctx.snapshot('Enter で確定');
      },
    });
  });

  it('右クリックメニューの onSelect で startEditing() を呼ぶと、メニューを閉じた後もエディタは開いたまま(AP-10)', async () => {
    const holder: { ctx: ParityContext | null } = { ctx: null };
    await expectParity({
      features: ['contextMenu'],
      props: () => ({
        rows,
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        enableContextMenu: true,
        getContextMenuItems: () => [
          {
            kind: 'action',
            key: 'edit',
            label: 'このセルを編集',
            onSelect: () => {
              if (holder.ctx) {
                call(holder.ctx, 'startEditing');
              }
            },
          },
        ],
      }),
      steps: async (ctx) => {
        holder.ctx = ctx;
        const cell = ctx.cell(1, 'name');
        await ctx.act(() => {
          fireEvent.pointerDown(cell, pointer);
          fireEvent.pointerUp(window, pointer);
          fireEvent.contextMenu(cell, { clientX: 10, clientY: 10 });
        });
        ctx.snapshot('右クリックメニュー');
        await ctx.act(() => {
          const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((element) =>
            element.textContent?.includes('このセルを編集'),
          );
          if (!item) {
            throw new Error(`[${ctx.framework}] 項目がありません`);
          }
          fireEvent.click(item);
        }, 120);
        logEditor(ctx, 'メニューを閉じた後');
        ctx.snapshot('メニューを閉じた後');
      },
    });
  });
});

describe('スクロール位置の API(scrollApi)', () => {
  // jsdom はスクロールしないので、器の大きさと scrollTo を差し替える(React 版の元のテストと同じ)。
  const saved: { scrollHeight?: PropertyDescriptor; scrollWidth?: PropertyDescriptor; scrollTo?: typeof Element.prototype.scrollTo } =
    {};
  beforeAll(() => {
    saved.scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    saved.scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    saved.scrollTo = Element.prototype.scrollTo;
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 10000 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 5000 });
    Element.prototype.scrollTo = function scrollToStub(this: Element, optionsOrX?: ScrollToOptions | number, y?: number) {
      const options: ScrollToOptions = typeof optionsOrX === 'number' ? { left: optionsOrX, top: y } : (optionsOrX ?? {});
      const before = { top: this.scrollTop, left: this.scrollLeft };
      if (options.top !== undefined) {
        this.scrollTop = options.top;
      }
      if (options.left !== undefined) {
        this.scrollLeft = options.left;
      }
      if (before.top !== this.scrollTop || before.left !== this.scrollLeft) {
        this.dispatchEvent(new Event('scroll'));
      }
    } as typeof Element.prototype.scrollTo;
  });
  afterAll(() => {
    for (const name of ['scrollHeight', 'scrollWidth'] as const) {
      const descriptor = saved[name];
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, name);
      }
    }
    if (saved.scrollTo) {
      Element.prototype.scrollTo = saved.scrollTo;
    }
  });

  it('get / setScrollPosition・範囲へのクランプ・onScroll の source と atBottom・変わらない位置は知らせない・間引き', async () => {
    await expectParity({
      watch: ['onScroll'],
      props: () => ({
        rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `row-${i}` })),
        columns: [
          { key: 'id', title: 'ID', width: 100 },
          { key: 'name', title: '名前', width: 200 },
        ],
      }),
      steps: async (ctx) => {
        const scroller = ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
        if (!scroller) {
          throw new Error('スクロールの器がありません');
        }
        const userScroll = (top: number) =>
          ctx.act(() => {
            scroller.scrollTop = top;
            scroller.dispatchEvent(new Event('scroll'));
          });
        const logPosition = (label: string) =>
          ctx.log(label, { position: call(ctx, 'getScrollPosition'), atBottom: call(ctx, 'isAtBottom') });
        logPosition('最初');
        await ctx.act(() => {
          call(ctx, 'setScrollPosition', { top: 0, left: 0 });
        });
        await userScroll(50);
        logPosition('変わらない setScrollPosition の後のユーザーのスクロール');
        await ctx.act(() => {
          call(ctx, 'setScrollPosition', { top: 300 });
        });
        await ctx.act(() => {
          call(ctx, 'setScrollPosition', { left: 120 });
        });
        logPosition('top 300 → left 120');
        await ctx.act(() => {
          call(ctx, 'setScrollPosition', { top: 999999, left: -50 });
        });
        logPosition('クランプ');
        const bottom = (call(ctx, 'getScrollPosition') as { top: number }).top;
        await userScroll(bottom - 0.5);
        logPosition('末尾から 0.5px');
        await userScroll(9300);
        logPosition('末尾から離れた');
        await ctx.act(() => {
          call(ctx, 'scrollToTop');
        });
        // 同じフレームの続けてのスクロールは 1 回にまとめ、最後の位置で知らせる。
        await ctx.act(() => {
          for (const top of [10, 20, 30]) {
            scroller.scrollTop = top;
            scroller.dispatchEvent(new Event('scroll'));
          }
        });
        logPosition('続けてスクロール');
      },
    });
  });
});

describe('手動の絞り込み / 並べ替え(manualMode)と点線(copyRange)', () => {
  type Item = { id: number; name: string; qty: number };
  const items: Item[] = [
    { id: 1, name: 'alpha', qty: 5 },
    { id: 2, name: 'beta', qty: 12 },
    { id: 3, name: 'gamma', qty: 30 },
  ];
  const itemColumns = [
    { key: 'name', title: '名前', width: 160, editable: true, filterType: 'text' },
    { key: 'qty', title: '数量', width: 100, editable: true, filterType: 'number' },
  ];

  it('manualFiltering で 0 件・serverSide で 0 件のとき、フィルターが載っていれば noMatchingRowsText を出す', async () => {
    await expectParity({
      features: ['filtering'],
      watch: ['onFiltersChange', 'onSortChange'],
      props: () => ({
        rows: [],
        columns: itemColumns,
        rowKeyGetter: (row: Item) => row.id,
        manualFiltering: true,
        noMatchingRowsText: '当てはまる行がありません',
        emptyText: '行がありません',
      }),
      steps: async (ctx) => {
        ctx.snapshot('フィルターなし');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: 'zzz', columnFilters: {} } });
        });
        ctx.snapshot('フィルターあり');
      },
    });
    const dataSource: ServerSideDataSource<Item> = {
      getRows: () => Promise.resolve({ rows: [], totalRowCount: 0 }),
    };
    await expectParity({
      features: ['filtering', 'serverSide'],
      controlledRows: false,
      props: () => ({
        rows: items,
        columns: itemColumns,
        rowKeyGetter: (row: Item) => row.id,
        dataSource,
        noMatchingRowsText: '当てはまる行がありません',
        emptyText: '行がありません',
      }),
      steps: async (ctx) => {
        await ctx.act(() => {}, 300);
        ctx.snapshot('serverSide でフィルターなし');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: 'zzz', columnFilters: {} } });
        }, 300);
        ctx.snapshot('serverSide でフィルターあり');
      },
    });
  });

  describe('コピー範囲の点線(showCopyRange)', () => {
    beforeAll(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
    });
    afterAll(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });
    const copy = (ctx: ParityContext) =>
      ctx.act(() => {
        call(ctx, 'selectCell', 0, 0);
        call(ctx, 'selectRange', { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
      }).then(() =>
        ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
        }),
      );
    const overlays = (ctx: ParityContext, label: string) => ctx.log(label, document.querySelectorAll('.ssg-copy-range-overlay').length);

    it('移動では残り、編集・ソート・列の入れ替えで消える・showCopyRange={false}', async () => {
      await expectParity({
        features: ['motionExtras'],
        props: () => ({ rows: items, columns: itemColumns, rowKeyGetter: (row: Item) => row.id }),
        steps: async (ctx) => {
          await copy(ctx);
          overlays(ctx, 'コピーした');
          await ctx.act(() => {
            call(ctx, 'selectCell', 2, 1);
          });
          overlays(ctx, '貼り付け先へ移った');
          await keyOn(ctx, ctx.shell(), { key: 'Enter' });
          overlays(ctx, '編集を始めた');
          await keyOn(ctx, null, { key: 'Escape' });
          await copy(ctx);
          await ctx.act(() => {
            call(ctx, 'applyState', { sort: [{ columnKey: 'qty', direction: 'desc' }] });
          });
          overlays(ctx, 'ソートした');
          await ctx.act(() => {
            call(ctx, 'applyState', { sort: [] });
          });
          await copy(ctx);
          await ctx.setProps({ columns: itemColumns.map((column) => ({ ...column })) });
          overlays(ctx, 'columns を作り直した');
          ctx.snapshot('作り直した後の点線');
          await ctx.setProps({ columns: [itemColumns[1], itemColumns[0]] });
          overlays(ctx, '列を入れ替えた');
          await ctx.setProps({ showCopyRange: false });
          await copy(ctx);
          overlays(ctx, 'showCopyRange={false}');
        },
      });
    });
  });
});

// FC-01: 固定列でのキーボード移動も縦に追従する(固定列は横へ動かさない)。
describe('固定列でのキーボード移動の縦の追従(FC-01)', () => {
  it.each([
    ['固定なし', undefined],
    ['左に固定', 'left'],
    ['右に固定', 'right'],
  ] as const)('%s', async (_label, pinned) => {
    const manyRows = Array.from({ length: 200 }, (_, i) => ({ id: i, memo: `n${i}`, qty: i }));
    const original = Element.prototype.scrollTo;
    const calls: { top?: number | undefined; left?: number | undefined }[] = [];
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      const options = args[0] as ScrollToOptions | undefined;
      calls.push({ top: options?.top, left: options?.left });
    } as Element['scrollTo'];
    try {
      await expectParity({
        watch: ['onActiveCellChange'],
        props: () => ({
          rows: manyRows,
          columns: [
            { key: 'memo', title: '名前', width: 160, pinned },
            { key: 'qty', title: '数量', width: 100 },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
        }),
        steps: async (ctx) => {
          calls.length = 0;
          const col = pinned === 'right' ? 1 : 0;
          await ctx.act(() => {
            call(ctx, 'setActiveCell', { row: 0, col });
          });
          for (let i = 0; i < 30; i += 1) {
            await ctx.act(() => {
              fireEvent.keyDown(ctx.shell(), { key: 'ArrowDown' });
            }, 0);
          }
          await ctx.act(() => {});
          ctx.log('アクティブセル', call(ctx, 'getActiveCell'));
          ctx.log('縦に追従した', calls.length > 5 && (calls[calls.length - 1]?.top ?? 0) > 0);
          ctx.log('横へは動かさない', pinned ? calls.every((entry) => entry.left === undefined || entry.left === 0) : null);
          ctx.snapshot('30 回 ↓');
        },
      });
    } finally {
      Element.prototype.scrollTo = original;
    }
  });
});