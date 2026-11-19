// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の操作の機能を同じ操作で動かして、DOM と通知と命令的 API の結果が
//   同じかを見る(段階 2-2)。
import { afterAll, beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number; price: number; note: string; status: string };

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
  { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number' } },
  { key: 'status', title: '状態', width: 100 },
  { key: 'note', title: 'メモ', width: 160, pinned: 'right' },
];

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    qty: i * 10,
    price: 100 + (i % 7) * 25,
    note: i % 3 === 0 ? `Memo 品目の控え ${i}` : '',
    status: i % 2 === 0 ? '在庫あり' : '品切れ',
  }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

const findInput = (ctx: ParityContext) => ctx.container.querySelector<HTMLInputElement>('.ssg-find-bar-input');

describe('セル内検索(find)', () => {
  it.each([
    ['あり', ['find']],
    ['なし(空)', []],
  ])('Ctrl+F・入力・次 / 前・命令的 API・閉じる(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFindChange'],
      props: () => ({ rows: makeRows(12), columns, rowKeyGetter: (row: Row) => row.id, height: 360, find: true }),
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          ctx.log('Ctrl+F を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'f', ctrlKey: true }));
        });
        ctx.snapshot('Ctrl+F');
        const input = findInput(ctx);
        if (input) {
          await ctx.act(() => {
            fireEvent.input(input, { target: { value: '品目' } });
          }, 120);
          ctx.snapshot('「品目」を入力');
          // ヒットやカレントが変わっても、セルの箱と中身の span と印は使い回す(下で値を変える 2 行目とは別の行で見る。
          //   値が変わったセルの中身を作り直すのは既知の差 = docs/solid/README.md の 2-1)。
          ctx.track('ヒットのあるセル', () => ctx.cell(3, 'name'));
          ctx.track('ヒットのあるセルの文字', () => ctx.cell(3, 'name').querySelector('.ssg-cell-value'));
          ctx.track('ヒットの印', () => ctx.cell(3, 'name').querySelector('mark'));
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'Enter' });
          });
          ctx.snapshot('Enter で次');
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'ArrowDown' });
          });
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
          });
          ctx.snapshot('↓ と Shift+Enter');
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'ArrowUp' });
          });
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'ArrowUp' });
          });
          ctx.snapshot('↑ を 2 回(先頭から末尾へ回る)');
          // 当たらない文字。
          await ctx.act(() => {
            fireEvent.input(input, { target: { value: 'ない文字' } });
          }, 120);
          ctx.snapshot('当たらない');
          await ctx.act(() => {
            fireEvent.keyDown(input, { key: 'Escape' });
          });
          ctx.snapshot('Escape で閉じる');
        }
        // 命令的 API。
        await ctx.act(() => {
          call(ctx, 'openFind', '控え');
        }, 120);
        ctx.snapshot('openFind("控え")');
        await ctx.act(() => {
          call(ctx, 'findNext');
        });
        await ctx.act(() => {
          call(ctx, 'findNext');
        });
        ctx.snapshot('findNext を 2 回');
        await ctx.act(() => {
          call(ctx, 'findPrev');
        });
        ctx.snapshot('findPrev');
        // 行が変わったら探し直す(カレントはそのまま)。
        await ctx.setProps({
          rows: (ctx.rows() as Row[]).map((row) => (row.id === 2 ? { ...row, name: '控えの品' } : row)),
        });
        await ctx.act(() => {}, 120);
        ctx.snapshot('行が変わって探し直す');
        // × で閉じる(グリッドの本体へフォーカスを戻す)。
        const close = ctx.container.querySelector<HTMLButtonElement>('.ssg-find-bar-btn:last-child');
        if (close) {
          await ctx.act(() => {
            fireEvent.click(close);
          });
        }
        ctx.snapshot('× で閉じる');
        await ctx.act(() => {
          call(ctx, 'closeFind');
        });
        // shortcut: false では Ctrl+F を横取りしない。
        await ctx.setProps({ find: { shortcut: false } });
        await ctx.act(() => {
          ctx.log('shortcut: false の Ctrl+F を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'f', ctrlKey: true }));
        });
        ctx.snapshot('shortcut: false');
        // caseSensitive(大文字と小文字を分ける)と、find={false} にしたら閉じる。
        await ctx.setProps({ find: { caseSensitive: true } });
        await ctx.act(() => {
          call(ctx, 'openFind', 'memo');
        }, 120);
        ctx.snapshot('caseSensitive の「memo」');
        await ctx.setProps({ find: true });
        await ctx.act(() => {}, 120);
        ctx.snapshot('caseSensitive をやめる');
        await ctx.setProps({ find: false });
        ctx.snapshot('find={false}');
      },
    });
  }, 20_000);

  it.each([
    ['あり', ['find', 'conditionalFormat']],
    ['検索だけ', ['find']],
  ])('状態チップの文字・データバーの showValue: false・renderCell(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onFindChange'],
      props: () => ({
        rows: makeRows(8),
        columns: [
          ...columns.slice(0, 2),
          {
            key: 'qty',
            title: '数量',
            width: 80,
            align: 'right',
            conditionalFormat: { dataBar: { showValue: false } },
          },
          {
            key: 'price',
            title: '単価',
            width: 90,
            // renderCell の列は強調しない(既定のセルだけ)。
            renderCell: ({ value }: { value: unknown }) => `¥${String(value)}`,
          },
          {
            key: 'status',
            title: '状態',
            width: 120,
            conditionalFormat: {
              chips: { 在庫あり: { tone: 'good', label: '在庫あり(倉庫)' }, 品切れ: 'critical' },
            },
          },
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        find: true,
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'openFind', '1');
        }, 120);
        ctx.snapshot('「1」');
        await ctx.act(() => {
          call(ctx, 'openFind', '倉庫');
        }, 120);
        ctx.snapshot('「倉庫」(チップの文字)');
        await ctx.act(() => {
          call(ctx, 'openFind', '品切れ');
        }, 120);
        ctx.snapshot('「品切れ」');
        await ctx.act(() => {
          call(ctx, 'openFind', '¥');
        }, 120);
        ctx.snapshot('「¥」(renderCell の列)');
      },
    });
  }, 20_000);
});

describe('IME オンのままの直接入力(imeDirectInput)', () => {
  const imeInput = (ctx: ParityContext) => ctx.container.querySelector<HTMLInputElement>('.ssg-ime-input');
  // 入力受けで変換して確定する(jsdom には IME が無いので、ブラウザと同じ順でイベントを送る)。
  const compose = async (ctx: ParityContext, text: string) => {
    const input = imeInput(ctx);
    if (!input) {
      return;
    }
    await ctx.act(() => {
      fireEvent.compositionStart(input, { data: '' });
    });
    ctx.snapshot(`「${text}」を変換中`);
    await ctx.act(() => {
      input.value = text;
      fireEvent.input(input, { data: text, isComposing: true });
      fireEvent.compositionEnd(input, { data: text });
    });
  };

  it.each([
    ['あり', ['imeDirectInput']],
    ['なし(空)', []],
  ])('入力受けへのフォーカス・変換の確定で編集・数値の列・編集できない列・無効にする(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onRowsChange'],
      props: () => ({ rows: makeRows(8), columns, rowKeyGetter: (row: Row) => row.id, height: 360, imeDirectInput: true }),
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(1, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        ctx.snapshot('セルを押す(入力受けへフォーカス)');
        await compose(ctx, 'あいう');
        ctx.snapshot('「あいう」を確定(編集を始める)');
        const editor = ctx.container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
        if (editor) {
          await ctx.act(() => {
            fireEvent.keyDown(editor, { key: 'Enter' });
          }, 120);
        }
        ctx.snapshot('Enter で確定(下のセルへ・入力受けへ戻る)');
        // 数値の列: 全角の数字は半角へ。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(3, 'qty'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await compose(ctx, '１２３');
        ctx.snapshot('数値の列で「１２３」を確定');
        await ctx.act(() => {
          fireEvent.keyDown(ctx.container.querySelector('.ssg-cell-editor-input') ?? ctx.shell(), {
            key: 'Escape',
          });
        }, 120);
        // 数値として読めない変換は捨てる。
        await compose(ctx, 'あ');
        ctx.snapshot('数値の列で「あ」(捨てる)');
        // 編集できない列(id)。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(2, 'id'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await compose(ctx, 'え');
        ctx.snapshot('編集できない列で「え」(捨てる)');
        // 命令的 API の focus() も入力受けへ。
        await ctx.act(() => {
          (ctx.container.querySelector('.ssg-shell') as HTMLElement | null)?.blur();
          call(ctx, 'focus');
        });
        ctx.snapshot('focus()');
        await ctx.setProps({ imeDirectInput: false });
        ctx.snapshot('imeDirectInput={false}');
        await ctx.act(() => {
          call(ctx, 'focus');
        });
        ctx.snapshot('無効の後の focus()');
      },
    });
  }, 20_000);
});


describe('列幅の自動調整(columnAutosize)', () => {
  // jsdom の canvas には measureText が無く、要素の offsetWidth も 0 なので、どちらも文字数で決める(1 文字 7px。全角も同じ。
  //   要素は左右の余白 16px を足す)。計測は実 DOM の経路(要素の offsetWidth)を通る。
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return { font: '', measureText: (text: string) => ({ width: Array.from(text).length * 7 }) };
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return Array.from(this.textContent ?? '').length * 7 + 16;
      },
    });
  });
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    }
  });
  const widths = (ctx: ParityContext) => (call(ctx, 'getState') as { columnWidths: Record<string, number> }).columnWidths;
  const resizeHandle = (ctx: ParityContext, key: string) => {
    const handle = ctx.header(key).querySelector('.ssg-header-resize');
    if (!handle) {
      throw new Error(`列幅のつまみがありません: ${key}`);
    }
    return handle;
  };

  it.each([
    ['あり', ['columnAutosize']],
    ['合計行・チップ・固定行も', ['columnAutosize', 'totalRow', 'conditionalFormat', 'pinnedRows']],
    ['なし(空)', []],
  ])('autoSizeColumns・境界のダブルクリック・データの差し替え(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      watch: ['onStateChange'],
      props: () => ({
        rows: makeRows(6),
        columns: [
          ...columns.slice(0, 2),
          { key: 'qty', title: '数量', width: 80, align: 'right', aggFunc: 'sum' },
          { key: 'price', title: '単価', width: 90, align: 'right', aggFunc: 'avg' },
          {
            key: 'status',
            title: '状態',
            width: 100,
            conditionalFormat: { chips: { 在庫あり: 'good', 品切れ: { tone: 'critical', label: '品切れ(入荷待ち)' } } },
          },
          columns[5],
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        autoSizeColumns: 'onMount',
        totalRow: { label: '合計の行の見出しはとても長い' },
        pinnedTopRows: [{ id: 0, name: '固定行の品名はとても長い文字', qty: 1, price: 1, note: '', status: '在庫あり' }],
      }),
      steps: async (ctx) => {
        await ctx.act(() => {}, 300);
        ctx.snapshot('作った直後(onMount)');
        ctx.log('列幅(onMount)', widths(ctx));
        // 品名を手で狭める。
        await ctx.act(() => {
          fireEvent.pointerDown(resizeHandle(ctx, 'name'), { ...pointer, clientX: 300 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 240 });
          fireEvent.pointerUp(window, { ...pointer, clientX: 240 });
        });
        ctx.log('列幅(手で狭める)', widths(ctx));
        // 境界のダブルクリック(押す 2 回。機能が無ければ通常のリサイズ)。
        await ctx.act(() => {
          const handle = resizeHandle(ctx, 'name');
          fireEvent.pointerDown(handle, { ...pointer, clientX: 240 });
          fireEvent.pointerUp(window, { ...pointer, clientX: 240 });
          fireEvent.pointerDown(handle, { ...pointer, clientX: 240 });
          fireEvent.pointerUp(window, { ...pointer, clientX: 240 });
        }, 300);
        ctx.snapshot('境界のダブルクリック');
        ctx.log('列幅(境界のダブルクリック)', widths(ctx));
        // onDataChange: 行を差し替えると測り直す。
        await ctx.setProps({ autoSizeColumns: 'onDataChange' });
        await ctx.setProps({
          rows: [...(ctx.rows() as Row[]), { id: 99, name: 'とても長い品名の行を足した', qty: 123456789, price: 5, note: '', status: '品切れ' }],
        });
        await ctx.act(() => {}, 300);
        ctx.snapshot('onDataChange で行を足す');
        ctx.log('列幅(onDataChange)', widths(ctx));
      },
    });
  }, 20_000);
});
describe('列の並べ替え(columnReorder)', () => {
  // jsdom の要素の矩形はどれも (0, 0)〜(800, 400) なので、ポインタはいつも左の固定ペインにいる扱いになる(左の固定ペインの中の
  //   並べ替えと、中央 / 右から左への固定はこれで通る。中央の中の並べ替えと実際の位置は Chromium のデモで見る)。
  type ColumnLike = { key: string; pinned?: string };
  const reorderColumns = [
    { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
    { key: 'name', title: '品名', width: 120, pinned: 'left' },
    { key: 'qty', title: '数量', width: 80, align: 'right' },
    { key: 'price', title: '単価', width: 90, align: 'right' },
    { key: 'status', title: '状態', width: 100 },
    { key: 'note', title: 'メモ', width: 160, pinned: 'right' },
  ];
  const grip = (ctx: ParityContext, key: string) => {
    const element = ctx.header(key).querySelector('.ssg-header-grip');
    if (!element) {
      throw new Error(`[${ctx.framework}] grip がありません: ${key}`);
    }
    return element;
  };
  const describeColumns = (next: readonly ColumnLike[] | null) =>
    next === null ? 'なし' : next.map((column) => `${column.key}${column.pinned ? `:${column.pinned}` : ''}`).join(' ');

  it.each([
    ['あり・ghost', ['columnReorder'], 'ghost', 'auto'],
    ['あり・live', ['columnReorder'], 'live', 'auto'],
    ['あり・live + motion off', ['columnReorder'], 'live', 'off'],
    ['なし(空)', [], 'live', 'auto'],
  ])('grip を引いて落とす・固定のまたぎ・Escape でやめる(機能%s)', async (_label, features, columnDragMotion, motion) => {
    let latest: readonly ColumnLike[] | null = null;
    await expectParity({
      features,
      watch: ['onStateChange'],
      props: () => ({
        rows: makeRows(8),
        columns: reorderColumns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        columnDragMotion,
        motion,
        onColumnsChange: (next: readonly ColumnLike[]) => {
          latest = next;
        },
      }),
      steps: async (ctx) => {
        const commit = async (label: string) => {
          ctx.log(`onColumnsChange(${label})`, describeColumns(latest));
          if (latest !== null) {
            await ctx.setProps({ columns: latest });
          }
          latest = null;
          await ctx.act(() => {}, 450);
          ctx.snapshot(label);
        };
        ctx.snapshot('はじめ');
        if (!ctx.header('qty').querySelector('.ssg-header-grip')) {
          return;
        }
        // 左の固定ペインの中で、品名を ID の前へ。
        await ctx.act(() => {
          fireEvent.pointerDown(grip(ctx, 'name'), { ...pointer, clientX: 150, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 120, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 50, clientY: 10 });
        });
        ctx.snapshot('左のペインの中を引いている');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 50, clientY: 10 });
        });
        await commit('左のペインの中で落とす');
        // 中央の数量を左の固定ペインの末尾へ(固定する)。
        await ctx.act(() => {
          fireEvent.pointerDown(grip(ctx, 'qty'), { ...pointer, clientX: 300, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 260, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 230, clientY: 10 });
        });
        ctx.snapshot('中央から左へ引いている');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 230, clientY: 10 });
        });
        await commit('左の固定ペインへ落とす');
        // 右の固定のメモを引いて、Escape でやめる(onColumnsChange は呼ばない)。
        await ctx.act(() => {
          fireEvent.pointerDown(grip(ctx, 'note'), { ...pointer, clientX: 700, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 600, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, clientX: 80, clientY: 10 });
        });
        ctx.snapshot('右から引いている');
        await ctx.act(() => {
          ctx.log('Escape を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'Escape' }));
        }, 450);
        ctx.snapshot('Escape でやめる');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 80, clientY: 10 });
        });
        await commit('Escape の後に離す');
        // 動かさずに離す(jsdom では離した点が左のペインの末尾になるので、単価が左へ固定される)。
        await ctx.act(() => {
          fireEvent.pointerDown(grip(ctx, 'price'), { ...pointer, clientX: 400, clientY: 10 });
          fireEvent.pointerUp(window, { ...pointer, clientX: 400, clientY: 10 });
        });
        await commit('動かさずに離す');
        // 右ボタンでは始めない。
        await ctx.act(() => {
          fireEvent.pointerDown(grip(ctx, 'status'), { ...pointer, button: 2, clientX: 500, clientY: 10 });
          fireEvent.pointerMove(window, { ...pointer, button: 2, clientX: 20, clientY: 10 });
          fireEvent.pointerUp(window, { ...pointer, button: 2, clientX: 20, clientY: 10 });
        });
        await commit('右ボタン');
        // onColumnsChange を外すと grip も消える。
        await ctx.setProps({ onColumnsChange: undefined });
        ctx.snapshot('onColumnsChange なし');
      },
    });
  }, 20_000);
});