// React 版(機能なしの /lite)と Solid 版のエディタを同じ操作で動かして、DOM と通知が同じかを見る(段階 1-2)。
//   エディタ 6 種(text / number / select / date / checkbox / custom)・入力の検査(reject)とエラーの吹き出し。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { createElement } from 'react';
import { onSettled } from 'solid-js';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type Framework, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; fruit: string; due: string; done: boolean; memo: string };

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'durian', label: 'Durian' },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: i * 10,
    fruit: FRUITS[i % FRUITS.length]?.value ?? 'apple',
    due: `2026-0${(i % 9) + 1}-15`,
    done: i % 2 === 0,
    memo: i === 0 ? '1 行目\n2 行目' : '',
  }));

const baseColumns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  {
    key: 'qty',
    title: '数量',
    width: 80,
    align: 'right',
    editor: { type: 'number', min: 0, max: 100, step: 5 },
  },
  { key: 'fruit', title: '果物', width: 100, editor: { type: 'select', options: FRUITS } },
  { key: 'due', title: '期日', width: 120, editor: { type: 'date' } },
  { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
  { key: 'memo', title: 'メモ', width: 160, editor: { type: 'text', multiline: true } },
];

beforeAll(() => {
  installJsdomLayoutStubs({ width: 900, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const click = async (ctx: ParityContext, row: number, key: string) => {
  await ctx.act(() => {
    const target = ctx.cell(row, key);
    fireEvent.pointerDown(target, pointer);
    fireEvent.pointerUp(target, pointer);
    fireEvent.click(target, pointer);
  });
};

const doubleClick = async (ctx: ParityContext, row: number, key: string) => {
  await click(ctx, row, key);
  await ctx.act(() => {
    fireEvent.doubleClick(ctx.cell(row, key), pointer);
  });
};

const editorInput = (ctx: ParityContext): HTMLInputElement | HTMLTextAreaElement => {
  const element = ctx.container.querySelector<HTMLInputElement | HTMLTextAreaElement>('.ssg-cell-editor-input');
  if (!element) {
    throw new Error(`[${ctx.framework}] エディタがありません`);
  }
  return element;
};

const typeInto = async (ctx: ParityContext, value: string) => {
  await ctx.act(() => {
    fireEvent.input(editorInput(ctx), { target: { value } });
  });
};

const pressInEditor = async (ctx: ParityContext, key: string, init: Record<string, unknown> = {}) => {
  await ctx.act(() => {
    fireEvent.keyDown(editorInput(ctx), { key, ...init });
  });
};

const pressInShell = async (ctx: ParityContext, key: string, init: Record<string, unknown> = {}) => {
  await ctx.act(() => {
    fireEvent.keyDown(ctx.shell(), { key, ...init });
  });
};

const props = (overrides: Record<string, unknown> = {}) => () => ({
  rows: makeRows(12),
  columns: baseColumns,
  rowKeyGetter: (row: Row) => row.id,
  height: 300,
  ...overrides,
});

describe('React 版と同じエディタ', () => {
  it('text: ダブルクリック・打つ・Enter / F2・Esc / 打ち始め・Tab / 外へのフォーカスで確定', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange', 'onActiveCellChange', 'onCellDoubleClick'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'name');
        ctx.snapshot('開いた');
        await typeInto(ctx, '新しい名前');
        ctx.snapshot('打った');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('Enter で確定');
        await pressInShell(ctx, 'F2');
        ctx.snapshot('F2');
        await typeInto(ctx, '捨てる');
        await pressInEditor(ctx, 'Escape');
        ctx.snapshot('Esc で取り消し');
        await pressInShell(ctx, 'x');
        ctx.snapshot('打ち始め');
        await pressInEditor(ctx, 'Tab');
        ctx.snapshot('Tab で確定');
        await pressInShell(ctx, 'Enter');
        ctx.snapshot('Enter で開く');
        await typeInto(ctx, 'ぼかす');
        await ctx.act(() => {
          editorInput(ctx).blur();
        });
        ctx.snapshot('外へのフォーカスで確定');
      },
    });
  });

  it('text の複数行: textarea・修飾キー付きの Enter で改行・Enter で確定', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 0, 'memo');
        ctx.snapshot('開いた');
        await ctx.act(() => {
          const textarea = editorInput(ctx);
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
        });
        ctx.snapshot('Alt+Enter で改行');
        await typeInto(ctx, '1 行目\n2 行目\n3 行目');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('Enter で確定');
      },
    });
  });

  it('number: 「-」から打ち始める(text で開く)・範囲外は印・Esc', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await click(ctx, 2, 'qty');
        await pressInShell(ctx, '-');
        ctx.snapshot('「-」で開いた');
        await typeInto(ctx, '-5');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('確定');
        await doubleClick(ctx, 3, 'qty');
        ctx.snapshot('number で開いた');
        await typeInto(ctx, '500');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('範囲外(mark の列は書いて印)');
        await pressInShell(ctx, 'a');
        ctx.snapshot('英字から(text で開く)');
        await pressInEditor(ctx, 'Escape');
        ctx.snapshot('Esc');
      },
    });
  });

  it('入力の検査の reject: エラーの吹き出し・打ち直すと消える・Esc / 外へのフォーカスは取り消し', async () => {
    const rejectColumns = baseColumns.map((column) =>
      column.key === 'qty'
        ? { ...column, validationMode: 'reject' }
        : column.key === 'name'
          ? {
              ...column,
              validationMode: 'reject',
              validate: (ctx: { value: unknown }) => (String(ctx.value).length > 3 ? '3 文字までです' : true),
            }
          : column.key === 'fruit'
            ? {
                ...column,
                validationMode: 'reject',
                validate: (ctx: { value: unknown }) => (ctx.value === 'durian' ? 'ドリアンは選べません' : true),
              }
            : column,
    );
    await expectParity({
      props: props({ columns: rejectColumns }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'name');
        await typeInto(ctx, '長すぎる名前');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('reject の吹き出し');
        await typeInto(ctx, '短い');
        ctx.snapshot('打ち直すと消える');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('確定');
        await doubleClick(ctx, 2, 'qty');
        await typeInto(ctx, '500');
        await pressInEditor(ctx, 'Tab');
        ctx.snapshot('number の範囲外の reject');
        await ctx.act(() => {
          editorInput(ctx).blur();
        });
        ctx.snapshot('外へのフォーカスで取り消し');
        await doubleClick(ctx, 0, 'fruit');
        await pressInEditor(ctx, 'End');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('select の reject');
        await pressInEditor(ctx, 'ArrowUp');
        ctx.snapshot('select で選び直すと消える');
        await pressInEditor(ctx, 'Escape');
        ctx.snapshot('Esc');
      },
    });
  });

  it('select: 一覧・矢印・Home / End / PageDown・タイプアヘッド・押して選ぶ・打ち始め・Esc', async () => {
    await expectParity({
      props: props({ classNames: { popover: 'my-popover', cellEditor: 'my-editor' }, theme: 'dark' }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'fruit');
        ctx.snapshot('開いた(一覧)');
        await pressInEditor(ctx, 'ArrowDown');
        ctx.snapshot('ArrowDown');
        await pressInEditor(ctx, 'End');
        ctx.snapshot('End');
        await pressInEditor(ctx, 'Home');
        await pressInEditor(ctx, 'PageDown');
        ctx.snapshot('Home → PageDown');
        await pressInEditor(ctx, 'c');
        ctx.snapshot('タイプアヘッド c');
        await pressInEditor(ctx, 'Backspace');
        ctx.snapshot('Backspace は受けない');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('Enter で確定');
        await doubleClick(ctx, 2, 'fruit');
        await ctx.act(() => {
          const option = document.body.querySelectorAll('.ssg-select-editor-option')[1];
          if (!option) {
            throw new Error('候補がありません');
          }
          ctx.hover(option);
          fireEvent.pointerDown(option, pointer);
          fireEvent.click(option, pointer);
        });
        ctx.snapshot('押して選ぶ');
        await click(ctx, 3, 'fruit');
        await pressInShell(ctx, 'd');
        ctx.snapshot('打ち始め d');
        await pressInEditor(ctx, 'Escape');
        ctx.snapshot('Esc');
      },
    });
  });

  it('select の IME: 変換中の文字を見せる・確定した文字で候補を探す・変換中でない文字の変更は受けない', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 0, 'fruit');
        // 変換中でない文字の変更(Backspace など)は受けず、名前のまま。
        await typeInto(ctx, 'Appl');
        ctx.snapshot('変換中でない変更');
        await ctx.act(() => {
          const input = editorInput(ctx);
          fireEvent.keyDown(input, { key: 'Process', keyCode: 229 });
          fireEvent.compositionStart(input, { data: '' });
          fireEvent.input(input, { target: { value: 'ちぇ' }, isComposing: true });
        });
        ctx.snapshot('変換中');
        await ctx.act(() => {
          const input = editorInput(ctx);
          fireEvent.input(input, { target: { value: 'Che' }, isComposing: true });
          fireEvent.compositionEnd(input, { data: 'Che' });
        });
        ctx.snapshot('確定した文字で候補へ');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('Enter で確定');
      },
    });
  });

  it('date: 日付の欄で開く・確定 / 文字から打ち始める・読めない文字は reject の吹き出し', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'due');
        ctx.snapshot('開いた');
        await typeInto(ctx, '2026-12-24');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('確定');
        await click(ctx, 3, 'due');
        await pressInShell(ctx, '2');
        ctx.snapshot('文字から打ち始めた');
        await typeInto(ctx, '2026年3月1日');
        await pressInEditor(ctx, 'Tab');
        ctx.snapshot('読めて確定');
        await click(ctx, 4, 'due');
        await pressInShell(ctx, 'x');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('読めない文字');
        await pressInEditor(ctx, 'Escape');
        ctx.snapshot('Esc');
      },
    });
  });

  it('checkbox: Space で切り替え・Enter / F2 では開かない・読み取り専用', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await click(ctx, 1, 'done');
        await pressInShell(ctx, ' ');
        ctx.snapshot('Space');
        await pressInShell(ctx, 'Enter');
        ctx.snapshot('Enter');
        await pressInShell(ctx, 'F2');
        ctx.snapshot('F2');
        await ctx.setProps({ readOnly: true });
        await pressInShell(ctx, ' ');
        ctx.snapshot('読み取り専用');
      },
    });
  });

  it('custom: render の中身・ctx の値・ctx.commit / ctx.cancel', async () => {
    // React 版は createElement、Solid 版は JSX で同じ DOM の入力欄を描く。
    type EditorContext = {
      value: unknown;
      rowIndex: number;
      initialText: string;
      commit: (value: unknown, direction?: string) => unknown;
      cancel: () => void;
    };
    const keyHandler = (ctx: EditorContext, event: { key: string; currentTarget: EventTarget; preventDefault: () => void }) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        ctx.commit((event.currentTarget as HTMLInputElement).value.toUpperCase(), 'down');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        ctx.cancel();
      }
    };
    // フォーカスは利用側が受け持つ(React は autoFocus、Solid は描き終わった後に focus)。
    const render = (framework: Framework) =>
      framework === 'react'
        ? (ctx: EditorContext) =>
            createElement('input', {
              className: 'my-custom-editor',
              defaultValue: ctx.initialText,
              'data-row': String(ctx.rowIndex),
              autoFocus: true,
              onKeyDown: (event: { key: string; currentTarget: EventTarget; preventDefault: () => void }) =>
                keyHandler(ctx, event),
            })
        : (ctx: EditorContext) => {
            let input: HTMLInputElement | undefined;
            onSettled(() => input?.focus());
            return (
              <input
                ref={(element) => {
                  input = element;
                }}
                class="my-custom-editor"
                value={ctx.initialText}
                data-row={String(ctx.rowIndex)}
                onKeyDown={(event) => keyHandler(ctx, event)}
              />
            );
          };
    await expectParity({
      props: (framework) => ({
        ...props()(),
        columns: baseColumns.map((column) =>
          column.key === 'name' ? { ...column, editor: { type: 'custom', render: render(framework) } } : column,
        ),
      }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'name');
        ctx.snapshot('開いた');
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.my-custom-editor');
          if (!input) {
            throw new Error('custom の入力欄がありません');
          }
          fireEvent.input(input, { target: { value: 'abc' } });
          fireEvent.keyDown(input, { key: 'Enter' });
        });
        ctx.snapshot('ctx.commit');
        await pressInShell(ctx, 'F2');
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.my-custom-editor');
          if (input) {
            fireEvent.keyDown(input, { key: 'Escape' });
          }
        });
        ctx.snapshot('ctx.cancel');
      },
    });
  });

  it('編集中に上へ行が足されても打ちかけの文字とエディタを残す', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 2, 'name');
        await typeInto(ctx, '打ちかけ');
        ctx.track('エディタ', () => ctx.container.querySelector('.ssg-cell-editor-input'));
        const rows = ctx.rows() as Row[];
        await ctx.setProps({ rows: [{ ...rows[0], id: 99, name: '足した行' } as Row, ...rows] });
        ctx.snapshot('上へ行を足した');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('確定');
      },
    });
  });

  it('編集中に編集している行が消えてもエディタを閉じてキー操作を続けられる(RD-3)', async () => {
    await expectParity({
      props: props(),
      watch: ['onRowsChange', 'onActiveCellChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 5, 'name');
        await typeInto(ctx, '打ちかけ');
        const rows = ctx.rows() as Row[];
        await ctx.setProps({ rows: rows.slice(0, 2) });
        ctx.snapshot('編集している行が消えた');
        await click(ctx, 0, 'name');
        await pressInShell(ctx, 'ArrowRight');
        ctx.snapshot('矢印で動く');
      },
    });
  });

  it('編集中に列の editor を 1 行 → 複数行へ差し替えても打ちかけを引き継ぐ・列を固定してペインが変わると開き直す', async () => {
    const multilineName = baseColumns.map((column) =>
      column.key === 'name' ? { ...column, editor: { type: 'text', multiline: true } } : column,
    );
    const pinnedName = baseColumns.map((column) => (column.key === 'name' ? { ...column, pinned: 'left' } : column));
    await expectParity({
      props: props(),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'name');
        await typeInto(ctx, '打ちかけ');
        await ctx.setProps({ columns: multilineName });
        ctx.snapshot('複数行へ');
        await ctx.setProps({ columns: baseColumns });
        await pressInShell(ctx, 'Escape');
        await doubleClick(ctx, 2, 'name');
        await typeInto(ctx, '固定の前');
        await ctx.setProps({ columns: pinnedName });
        ctx.snapshot('左へ固定');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('確定');
      },
    });
  });

  it('エラーの文言が空(localeText で空にした)でも吹き出しを出す', async () => {
    await expectParity({
      props: props({ localeText: { enterDate: '' } }),
      watch: ['onRowsChange'],
      steps: async (ctx) => {
        await click(ctx, 1, 'due');
        await pressInShell(ctx, 'a');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('空の吹き出し');
      },
    });
  });

  // WebKitGTK は Shift+Tab の keydown を key='Unidentified'(keyCode 9)で送る。React の合成イベントは keyCode から 'Tab' に
  //   直すので、Solid 版も同じに読む(段階 3-2。実ブラウザのハーネスの WebKit で見つかった)。
  it('WebKitGTK の Shift+Tab(key が Unidentified・keyCode 9)もシェルとエディタで Tab として扱う', async () => {
    const webkitShiftTab = { keyCode: 9, shiftKey: true };
    await expectParity({
      props: props(),
      watch: ['onRowsChange', 'onActiveCellChange'],
      steps: async (ctx) => {
        await click(ctx, 1, 'fruit');
        await pressInShell(ctx, 'Unidentified', webkitShiftTab);
        ctx.snapshot('シェルの Shift+Tab');
        await pressInShell(ctx, 'Unidentified', { keyCode: 9 });
        ctx.snapshot('シェルの Tab');
        await doubleClick(ctx, 2, 'name');
        await typeInto(ctx, '左へ確定');
        await pressInEditor(ctx, 'Unidentified', webkitShiftTab);
        ctx.snapshot('text の Shift+Tab で確定');
        await doubleClick(ctx, 3, 'qty');
        await typeInto(ctx, '15');
        await pressInEditor(ctx, 'Unidentified', webkitShiftTab);
        ctx.snapshot('number の Shift+Tab で確定');
        await doubleClick(ctx, 4, 'fruit');
        await pressInEditor(ctx, 'ArrowDown');
        await pressInEditor(ctx, 'Unidentified', webkitShiftTab);
        ctx.snapshot('select の Shift+Tab で確定');
        await doubleClick(ctx, 5, 'due');
        await typeInto(ctx, '2026-12-01');
        await pressInEditor(ctx, 'Unidentified', webkitShiftTab);
        ctx.snapshot('date の Shift+Tab で確定');
      },
    });
  });

  it('editorEnterMove: right / none', async () => {
    await expectParity({
      props: props({ editorEnterMove: 'right' }),
      watch: ['onActiveCellChange'],
      steps: async (ctx) => {
        await doubleClick(ctx, 1, 'name');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('right');
        await ctx.setProps({ editorEnterMove: 'none' });
        await pressInShell(ctx, 'F2');
        await pressInEditor(ctx, 'Enter');
        ctx.snapshot('none');
      },
    });
  });
});
// R2-1(0.1.0 の全体レビュー): グループ化した表で編集中に上へ行が足され、編集している位置が一瞬グループ行を指しても、エディタの
//   種類を変えない(0.1.0 はエディタの種類を行から決めていたので、text に倒れて作り直し、number / date は打ちかけを失い、
//   複数行の入力欄はフォーカスを失った。React 版は列から決める)。custom エディタは React 版と同じく作り直す。
describe('グループ化した表で、編集中の位置にグループ行が来る(R2-1)', () => {
  type GroupRow = { id: number; cat: string; qty?: number; due?: string; memo?: string };
  const base: GroupRow[] = [
    { id: 1, cat: 'A', qty: 1, due: '2026-01-01', memo: 'x' },
    { id: 2, cat: 'A', qty: 2, due: '2026-01-02', memo: 'y' },
    { id: 3, cat: 'B', qty: 3, due: '2026-01-03', memo: 'z' },
  ];
  const added: GroupRow = { id: 4, cat: 'A', qty: 4, due: '2026-01-04', memo: 'w' };
  const groupColumns = (memoEditor: Record<string, unknown>) => [
    { key: 'id', title: 'ID', width: 60, editable: false },
    { key: 'cat', title: '分類', width: 100, rowGroup: true },
    { key: 'qty', title: '数量', width: 80, editor: { type: 'number' } },
    { key: 'due', title: '期日', width: 120, editor: { type: 'date' } },
    { key: 'memo', title: 'メモ', width: 160, editor: memoEditor },
  ];

  it.each([
    ['number', 'qty', '42', { type: 'text' }],
    ['date', 'due', '2026-05-05', { type: 'text' }],
    ['複数行の text', 'memo', '1 行目', { type: 'text', multiline: true }],
  ] as const)('%s のエディタは打ちかけとフォーカスを残す', async (_label, key, typed, memoEditor) => {
    await expectParity({
      features: ['grouping'],
      watch: ['onRowsChange'],
      props: () => ({ rows: base, columns: groupColumns(memoEditor), rowKeyGetter: (row: GroupRow) => row.id, height: 300, animateRows: false }),
      steps: async (ctx) => {
        // [G(A), 1, 2, G(B), 3] の 3 を編集する。
        await doubleClick(ctx, 4, key);
        ctx.track('エディタ', () => ctx.container.querySelector('.ssg-cell-editor-input'));
        await typeInto(ctx, typed);
        ctx.snapshot('打った');
        // A に 1 行足す → [G(A), 1, 2, 4, G(B), 3]。編集していた位置(4)はグループ行 B になる。
        await ctx.setProps({ rows: [...base, added] });
        ctx.log('エディタの値', editorInput(ctx).value);
        ctx.log('エディタにフォーカス', document.activeElement === editorInput(ctx));
        ctx.snapshot('上に行が足された');
        await pressInEditor(ctx, key === 'memo' ? 'Escape' : 'Enter');
        ctx.snapshot('閉じた');
      },
    });
  });

  it('custom のエディタは React 版と同じく作り直す(フォーカスもそろう)', async () => {
    await expectParity({
      features: ['grouping'],
      props: (framework) => ({
        rows: base,
        columns: groupColumns({
          type: 'custom',
          render: () => {
            if (framework === 'react') {
              return createElement('input', { className: 'my-custom', defaultValue: '' });
            }
            const input = document.createElement('input');
            input.className = 'my-custom';
            return input;
          },
        }),
        rowKeyGetter: (row: GroupRow) => row.id,
        height: 300,
        animateRows: false,
      }),
      steps: async (ctx) => {
        await doubleClick(ctx, 4, 'memo');
        ctx.track('custom', () => ctx.container.querySelector('.my-custom'));
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.my-custom');
          if (input) {
            input.value = '打ちかけ';
          }
        });
        ctx.snapshot('開いた');
        await ctx.setProps({ rows: [...base, added] });
        ctx.log('custom の値', ctx.container.querySelector<HTMLInputElement>('.my-custom')?.value ?? null);
        ctx.snapshot('上に行が足された');
      },
    });
  });
});
