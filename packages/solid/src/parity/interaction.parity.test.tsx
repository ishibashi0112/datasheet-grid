// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版の操作の機能を同じ操作で動かして、DOM と通知と命令的 API の結果が
//   同じかを見る(段階 2-2)。
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createEvent, fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { createElement } from 'react';
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
      allowMissingFeatures: ['find'],
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
      allowMissingFeatures: ['conditionalFormat'],
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
      allowMissingFeatures: ['imeDirectInput'],
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

  // F-06: custom エディタの列は imeDirectInput: true を付けたときだけ、確定した文字を initialText にして開く(付けない列は捨てる)。
  it('custom エディタの imeDirectInput(F-06)', async () => {
    type Ctx = { initialText: string; commit: (value: unknown, move?: string) => void };
    const reactEditor = (ctx: Ctx) =>
      createElement('input', {
        className: 'test-custom-editor',
        defaultValue: ctx.initialText,
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            ctx.commit((event.target as HTMLInputElement).value, 'down');
          }
        },
      });
    const solidEditor = (ctx: Ctx) => (
      <input
        class="test-custom-editor"
        value={ctx.initialText}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            ctx.commit(event.currentTarget.value, 'down');
          }
        }}
      />
    );
    await expectParity({
      features: ['imeDirectInput'],
      watch: ['onRowsChange'],
      props: (framework) => {
        const render = framework === 'react' ? reactEditor : solidEditor;
        return {
          rows: [
            { id: 1, city: '大阪', note: 'メモ' },
            { id: 2, city: '京都', note: '' },
          ],
          columns: [
            { key: 'city', title: '都市', width: 120, editor: { type: 'custom', render, imeDirectInput: true } },
            { key: 'note', title: 'メモ', width: 120, editor: { type: 'custom', render } },
          ],
          rowKeyGetter: (row: { id: number }) => row.id,
          height: 300,
          imeDirectInput: true,
        };
      },
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'city'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await compose(ctx, '東京');
        ctx.log('付けた列のエディタ', ctx.container.querySelector<HTMLInputElement>('.test-custom-editor')?.value ?? null);
        ctx.snapshot('付けた列で「東京」を確定');
        await ctx.act(() => {
          const editor = ctx.container.querySelector<HTMLInputElement>('.test-custom-editor');
          if (editor) {
            fireEvent.keyDown(editor, { key: 'Enter' });
          }
        }, 120);
        ctx.snapshot('Enter で書いた');
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(0, 'note'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await compose(ctx, '大阪');
        ctx.log('付けていない列のエディタ', ctx.container.querySelector<HTMLInputElement>('.test-custom-editor')?.value ?? null);
        ctx.snapshot('付けていない列で「大阪」(捨てる)');
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
      allowMissingFeatures: ['columnAutosize', 'totalRow', 'conditionalFormat', 'pinnedRows'],
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
      allowMissingFeatures: ['columnReorder'],
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
describe('行のドラッグ(rowDrag)', () => {
  // 縦の位置は行の高さの計算で決まる(jsdom でも行ごとの矩形は要らない)。見出し 40px・行 36px なので、行 k の中ほどは
  //   y = 40 + 36k + 18、行 k の上の境界の少し下は y = 40 + 36k + 4。
  const rowY = (k: number) => 40 + 36 * k + 18;
  const rowTopY = (k: number) => 40 + 36 * k + 4;
  const handleOf = (ctx: ParityContext, row: number) => {
    const element = ctx.container.querySelector(
      `.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="__ssg_row_drag_handle__"] .ssg-row-drag-handle`,
    );
    if (!element) {
      throw new Error(`[${ctx.framework}] ハンドルがありません: ${row}`);
    }
    return element;
  };
  const names = (ctx: ParityContext) => (ctx.rows() as Row[]).map((row) => row.id).join(' ');

  it.each([
    ['あり・ghost', ['rowDrag'], 'ghost', 'auto'],
    ['あり・live', ['rowDrag'], 'live', 'auto'],
    ['あり・live + motion off', ['rowDrag'], 'live', 'off'],
    ['なし(空)', [], 'live', 'auto'],
  ])('ハンドルで引いて落とす・Escape・isRowDraggable・canDropRow・ソート中・moveRow・元に戻す(機能%s)', async (_label, features, rowDragMotion, motion) => {
    await expectParity({
      features,
      allowMissingFeatures: ['rowDrag'],
      watch: ['onRowMove', 'onActiveCellChange'],
      props: () => ({
        rows: makeRows(8),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        enableRowDrag: true,
        rowDragMotion,
        motion,
        // 3 の倍数の id の行は掴めない。先頭(スロット 0)へは落とせない。
        isRowDraggable: (row: Row) => row.id % 3 !== 0,
        canDropRow: (params: { toIndex: number }) => params.toIndex !== 0,
      }),
      steps: async (ctx) => {
        ctx.snapshot('はじめ');
        const hasHandle = ctx.container.querySelector('.ssg-row-drag-handle') !== null;
        ctx.log('ハンドル', hasHandle);
        if (hasHandle) {
          // 2 行目(id 2)を 5 行目の上へ。
          await ctx.act(() => {
            fireEvent.pointerDown(handleOf(ctx, 1), { ...pointer, clientX: 30, clientY: rowY(1) });
            fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(2) });
            fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowTopY(5) });
          });
          ctx.snapshot('引いている');
          await ctx.act(() => {
            fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowTopY(5) });
          }, 450);
          ctx.snapshot('落とす');
          ctx.log('行の並び(落とす)', names(ctx));
          // Escape でやめる。
          await ctx.act(() => {
            fireEvent.pointerDown(handleOf(ctx, 3), { ...pointer, clientX: 30, clientY: rowY(3) });
            fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowTopY(7) });
          });
          await ctx.act(() => {
            ctx.log('Escape を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'Escape' }));
          }, 450);
          ctx.snapshot('Escape でやめる');
          await ctx.act(() => {
            fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowTopY(7) });
          }, 450);
          ctx.log('行の並び(Escape)', names(ctx));
          // 先頭へは落とせない(canDropRow)。
          await ctx.act(() => {
            fireEvent.pointerDown(handleOf(ctx, 3), { ...pointer, clientX: 30, clientY: rowY(3) });
            fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(2) });
            fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowTopY(0) });
          });
          ctx.snapshot('落とせない位置');
          await ctx.act(() => {
            fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowTopY(0) });
          }, 450);
          ctx.log('行の並び(canDropRow)', names(ctx));
          // 元に戻す(行の移動も履歴に入る)。
          await ctx.act(() => {
            fireEvent.keyDown(ctx.shell(), { key: 'z', ctrlKey: true });
          }, 120);
          ctx.log('行の並び(元に戻す)', names(ctx));
          ctx.snapshot('元に戻す');
        }
        // 命令的 API の moveRow(機能が無くても動く)。
        await ctx.act(() => {
          call(ctx, 'moveRow', 7, 0);
        }, 450);
        ctx.log('行の並び(moveRow)', names(ctx));
        ctx.snapshot('moveRow');
        // ソート中はハンドルが淡色になり、押すとセルの選択になる(Shift + 見出しでソート)。
        await ctx.act(() => {
          const header = ctx.header('qty');
          fireEvent.pointerDown(header, { ...pointer, shiftKey: true });
          fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
        });
        ctx.log('ソートの印', ctx.header('qty').getAttribute('aria-sort'));
        ctx.snapshot('ソート中');
        if (hasHandle) {
          await ctx.act(() => {
            fireEvent.pointerDown(handleOf(ctx, 1), { ...pointer, clientX: 30, clientY: rowY(1) });
            fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowY(1) });
          });
          ctx.snapshot('ソート中にハンドルを押す');
        }
        // enableRowDrag を外す。
        await ctx.setProps({ enableRowDrag: false });
        ctx.snapshot('enableRowDrag なし');
      },
    });
  }, 20_000);

  // 引いている間に行が変わっても、掴んだ行を追いかける(1.0 前の最終チェック FC-12。行が増えたら新しい位置へ、消えたらやめる)。
  it.each([
    ['ghost', 'ghost'],
    ['live', 'live'],
  ])('引いている間に行が増える / 掴んだ行が消える(%s)', async (_label, rowDragMotion) => {
    await expectParity({
      features: ['rowDrag'],
      watch: ['onRowMove'],
      props: () => ({
        rows: makeRows(8),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        enableRowDrag: true,
        rowDragMotion,
      }),
      steps: async (ctx) => {
        // 2 行目(id 2)を掴んで 5 行目の上へ。引いている間に先頭へ 1 行足す。
        await ctx.act(() => {
          fireEvent.pointerDown(handleOf(ctx, 1), { ...pointer, clientX: 30, clientY: rowY(1) });
          fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(2) });
          fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowTopY(5) });
        });
        await ctx.setProps({ rows: [{ ...makeRows(1)[0], id: 100, name: '足した行' }, ...(ctx.rows() as Row[])] });
        ctx.snapshot('引いている間に行が増える');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowTopY(5) });
        }, 450);
        ctx.snapshot('落とす(行が増えた後)');
        ctx.log('行の並び(行が増えた後)', names(ctx));
        // 4 行目を掴み、引いている間にその行を消す = やめる。
        const grabbed = (ctx.rows() as Row[])[3]?.id;
        await ctx.act(() => {
          fireEvent.pointerDown(handleOf(ctx, 3), { ...pointer, clientX: 30, clientY: rowY(3) });
          fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(4) });
          fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowTopY(7) });
        });
        await ctx.setProps({ rows: (ctx.rows() as Row[]).filter((row) => row.id !== grabbed) });
        ctx.snapshot('掴んだ行が消える');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowTopY(7) });
        }, 450);
        ctx.snapshot('離す(掴んだ行が消えた後)');
        ctx.log('行の並び(掴んだ行が消えた後)', names(ctx));
      },
    });
  }, 20_000);

  // FC-02: rowKeyGetter が無い(行キー = 位置)ときも、確定後の画面の並びと滑り込みがデータの並びと合う。
  // FC-31: 利用側が並びを反映しなかったとき(onRowsChange で rows を変えない)は滑らず、後の無関係な変化でも古い位置から滑らない。
  it.each([
    ['ghost・行キーなし', 'ghost', false, true],
    ['live・行キーなし', 'live', false, true],
    ['ghost・反映しない', 'ghost', true, false],
    ['live・反映しない', 'live', true, false],
    ['live・行キーなし・反映しない', 'live', false, false],
  ] as const)('行キーが無い / 利用側が並びを反映しない(FC-02 / FC-31・%s)', async (_label, rowDragMotion, withKey, applies) => {
    const initial = makeRows(5);
    await expectParity({
      features: ['rowDrag'],
      controlledRows: applies,
      watch: ['onRowMove', 'onRowsChange'],
      props: () => ({
        rows: initial,
        columns,
        rowKeyGetter: withKey ? (row: Row) => row.id : undefined,
        height: 400,
        enableRowDrag: true,
        rowDragMotion,
        motion: 'on',
        ...(applies ? null : { onRowsChange: () => {} }),
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          fireEvent.pointerDown(handleOf(ctx, 0), { ...pointer, clientX: 30, clientY: rowY(0) });
          fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(1) });
          fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(2) + 10 });
        });
        ctx.snapshot('引いている');
        await ctx.act(() => {
          fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowY(2) + 10 });
        }, 0);
        ctx.snapshot('離した直後');
        await ctx.act(() => {}, 450);
        ctx.snapshot('滑り終えた後');
        if (!applies) {
          // 後で利用側が別の並びに変えても、予約した滑り込みを使わない。
          await ctx.setProps({ rows: [initial[2], initial[0], initial[1], initial[3], initial[4]] });
          ctx.snapshot('後で並びが変わった直後');
        }
      },
    });
  }, 20_000);

  // AP-15: 外の入力欄にフォーカスがあってもハンドルを押すとグリッドへ移る(直後の Ctrl+Z で行の移動を戻せる)。
  // E-06: ゴーストは値を文字で出さない列(renderCell / チェックボックス)を飛ばして、次の列の値を出す。
  it('外の入力欄から掴むとグリッドへフォーカス・Ctrl+Z で戻す・ゴーストの文字(AP-15 / E-06)', async () => {
    await expectParity({
      features: ['rowDrag'],
      watch: ['onRowMove'],
      props: (framework) => ({
        rows: makeRows(5),
        columns: [
          {
            key: 'id',
            title: '画像',
            width: 80,
            renderCell: ({ value }: { value: unknown }) =>
              framework === 'react' ? createElement('img', { alt: '', src: `/thumbs/${String(value)}.svg` }) : <img alt="" src={`/thumbs/${String(value)}.svg`} />,
          },
          { key: 'status', title: '在庫', width: 80, editor: { type: 'checkbox', checkedValue: '在庫あり', uncheckedValue: '品切れ' } },
          ...columns.slice(1, 4),
        ],
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        enableRowDrag: true,
      }),
      steps: async (ctx) => {
        const outside = document.createElement('input');
        document.body.append(outside);
        try {
          await ctx.act(() => outside.focus());
          await ctx.act(() => {
            fireEvent.pointerDown(handleOf(ctx, 1), { ...pointer, clientX: 30, clientY: rowY(1) });
          });
          ctx.log('掴んだ後のフォーカス', document.activeElement === ctx.shell() ? 'シェル' : document.activeElement?.tagName);
          ctx.log('ゴーストの文字', document.querySelector('[data-grid-drag-ghost]')?.textContent ?? null);
          ctx.snapshot('掴んだ');
          await ctx.act(() => {
            fireEvent.pointerMove(window, { ...pointer, clientX: 30, clientY: rowY(3) + 10 });
          });
          await ctx.act(() => {
            fireEvent.pointerUp(window, { ...pointer, clientX: 30, clientY: rowY(3) + 10 });
          }, 450);
          ctx.log('行の並び(落とす)', names(ctx));
          await ctx.act(() => {
            fireEvent.keyDown(document.activeElement ?? document.body, { key: 'z', ctrlKey: true });
          }, 120);
          ctx.log('行の並び(Ctrl+Z)', names(ctx));
          ctx.snapshot('Ctrl+Z');
        } finally {
          outside.remove();
        }
      },
    });
  }, 20_000);
});

describe('フィルハンドル(fillHandle)', () => {
  // 固定列なし(jsdom の矩形はどれも (0, 0) からなので、中央ペインの左端も 0)。見出し 40px・行 30px・行番号 56px。
  const fillColumns = [
    { key: 'id', title: 'ID', width: 60, editable: false },
    { key: 'name', title: '品名', width: 120 },
    { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number' } },
    { key: 'price', title: '単価', width: 90, align: 'right', editor: { type: 'number' } },
    { key: 'status', title: '状態', width: 100 },
  ];
  // 数量 / 単価は先頭の 2 行だけ値があり、下は空(ダブルクリックは空のセルへ埋める)。
  const fillRows = (): Row[] =>
    makeRows(10).map((row, index) => ({
      ...row,
      qty: index < 2 ? [3, 8][index] : (null as unknown as number),
      price: index < 2 ? [5, 7][index] : (null as unknown as number),
    }));
  const columnLeft = (col: number) => fillColumns.slice(0, col).reduce((sum, column) => sum + column.width, 0);
  const cellPoint = (row: number, col: number) => ({
    clientX: columnLeft(col) + (fillColumns[col]?.width ?? 0) / 2,
    clientY: 40 + row * 30 + 15,
  });
  // 押した時刻(ダブルクリックの判定)をそろえて送る。
  const send = (
    target: Element | Window,
    type: 'pointerDown' | 'pointerMove' | 'pointerUp',
    init: { clientX: number; clientY: number; ctrlKey?: boolean },
    timeStamp: number,
  ) => {
    const event = createEvent[type](target, { ...pointer, ...init });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    fireEvent(target, event);
  };
  const fillHandleOf = (ctx: ParityContext) => {
    const element = ctx.container.querySelector('.ssg-fill-handle');
    if (!element) {
      throw new Error(`[${ctx.framework}] ハンドルがありません`);
    }
    return element;
  };
  const values = (ctx: ParityContext) =>
    (ctx.rows() as Row[]).map((row) => `${row.name}/${row.qty}/${row.price}`).join(' | ');
  const select = (ctx: ParityContext, start: [number, number], end: [number, number]) =>
    ctx.act(() => {
      call(ctx, 'selectRange', { start: { row: start[0], col: start[1] }, end: { row: end[0], col: end[1] } });
    });
  // ハンドルを押して、指定のセルまで引いて離す。
  const dragTo = async (ctx: ParityContext, row: number, col: number, timeStamp: number, ctrlKey = false) => {
    await ctx.act(() => {
      send(fillHandleOf(ctx), 'pointerDown', { clientX: 0, clientY: 0 }, timeStamp);
      send(window, 'pointerMove', { ...cellPoint(row, col), ctrlKey }, timeStamp + 50);
    });
    ctx.snapshot(`引いている(${row}, ${col})`);
    await ctx.act(() => {
      send(window, 'pointerUp', { ...cellPoint(row, col), ctrlKey }, timeStamp + 100);
    });
  };

  it.each([
    ['あり', ['fillHandle'], true],
    ['あり・getFillValue', ['fillHandle'], 'getFillValue'],
    ['なし(空)', [], true],
  ])('引いて埋める・ボタンで選び直す・Ctrl・Escape・ダブルクリック・元に戻す・出さない条件(機能%s)', async (_label, features, option) => {
    await expectParity({
      features,
      allowMissingFeatures: ['fillHandle'],
      watch: ['onActiveCellChange'],
      props: () => ({
        rows: fillRows(),
        columns: fillColumns,
        rowKeyGetter: (row: Row) => row.id,
        height: 400,
        rowHeight: 30,
        headerHeight: 40,
        rowHeaderWidth: 56,
        fillHandle:
          option === 'getFillValue'
            ? {
                // 数値の列は既定の値の 2 倍を書く(ドラッグ中のツールチップでも呼ばれる)。
                getFillValue: (params: { column: { key: string }; defaultValue: unknown }) =>
                  params.column.key === 'qty' && typeof params.defaultValue === 'number'
                    ? params.defaultValue * 2
                    : params.defaultValue,
              }
            : option,
      }),
      steps: async (ctx) => {
        ctx.snapshot('はじめ');
        // 数量の 2 セル(3, 8)を選ぶと右下に四角が出る。
        await select(ctx, [0, 2], [1, 2]);
        ctx.snapshot('範囲を選ぶ');
        const hasHandle = ctx.container.querySelector('.ssg-fill-handle') !== null;
        ctx.log('ハンドル', hasHandle);
        if (hasHandle) {
          // 下の 5 行目まで引く(連続データ = 13, 18, 23)。
          await dragTo(ctx, 4, 2, 1000);
          ctx.snapshot('埋めた');
          ctx.log('値(埋めた)', values(ctx));
          // ボタンでメニューを開き、↓ で次の項目へ、「セルのコピー」を選び直す。
          await ctx.act(() => {
            const chip = ctx.container.querySelector('.ssg-fill-options');
            if (chip) {
              fireEvent.click(chip);
            }
          });
          ctx.snapshot('メニューを開く');
          await ctx.act(() => {
            const menu = document.querySelector('.ssg-fill-menu');
            if (menu) {
              fireEvent.keyDown(document.activeElement ?? menu, { key: 'ArrowDown' });
            }
          });
          ctx.snapshot('メニューで ↓');
          await ctx.act(() => {
            const items = document.querySelectorAll('.ssg-fill-menu [role="menuitemradio"]');
            const copy = items[1];
            if (copy) {
              fireEvent.click(copy);
            }
          });
          ctx.snapshot('コピーに選び直す');
          ctx.log('値(コピー)', values(ctx));
          // 元に戻す 1 回で埋める前へ。
          await ctx.act(() => {
            fireEvent.keyDown(ctx.shell(), { key: 'z', ctrlKey: true });
          }, 120);
          ctx.log('値(元に戻す)', values(ctx));
          ctx.snapshot('元に戻す');
          // 品名(文字)を Ctrl を押しながら下へ = 埋め方を入れ替える(連続データ)。
          await select(ctx, [0, 1], [0, 1]);
          await dragTo(ctx, 3, 1, 3000, true);
          ctx.log('値(Ctrl)', values(ctx));
          ctx.snapshot('Ctrl で埋めた');
          // 引いている途中に Escape でやめる。
          await select(ctx, [5, 2], [5, 2]);
          await ctx.act(() => {
            send(fillHandleOf(ctx), 'pointerDown', { clientX: 0, clientY: 0 }, 5000);
            send(window, 'pointerMove', cellPoint(8, 2), 5050);
          });
          await ctx.act(() => {
            ctx.log('Escape を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'Escape' }));
          });
          ctx.snapshot('Escape でやめる');
          await ctx.act(() => {
            send(window, 'pointerUp', cellPoint(8, 2), 5100);
          });
          ctx.log('値(Escape)', values(ctx));
          // ダブルクリック: 隣の列に値が続くところまで下へ(単価。左隣の数量は空なので、右隣の状態に合わせて最後の行まで)。
          await select(ctx, [0, 3], [1, 3]);
          await ctx.act(() => {
            send(fillHandleOf(ctx), 'pointerDown', { clientX: 0, clientY: 0 }, 7000);
            send(window, 'pointerUp', { clientX: 0, clientY: 0 }, 7050);
            send(fillHandleOf(ctx), 'pointerDown', { clientX: 0, clientY: 0 }, 7200);
            send(window, 'pointerUp', { clientX: 0, clientY: 0 }, 7250);
          });
          ctx.log('値(ダブルクリック)', values(ctx));
          ctx.snapshot('ダブルクリック');
          // 編集中は出さない。
          await select(ctx, [2, 2], [2, 2]);
          await ctx.act(() => {
            fireEvent.keyDown(ctx.shell(), { key: 'F2' });
          });
          ctx.snapshot('編集中');
          await ctx.act(() => {
            const input = ctx.container.querySelector('.ssg-cell-editor input');
            if (input) {
              fireEvent.keyDown(input, { key: 'Escape' });
            }
          });
        }
        // readOnly では出さない。
        await ctx.setProps({ readOnly: true });
        ctx.snapshot('readOnly');
        await ctx.setProps({ readOnly: false, fillHandle: false });
        ctx.snapshot('fillHandle なし');
      },
    });
  }, 30_000);
});
describe('右クリックメニュー(contextMenu)', () => {
  // 項目を選んだときに控える先(シナリオごとに steps の頭で差し替える。React 版と Solid 版は順に動く)。
  let onPick: (label: string) => void = () => {};
  const menuItems = (params: { target: { type: string; column?: { key: string } } }) => {
    if (params.target.type === 'rowHeader') {
      return [{ kind: 'action', id: 'remove', label: '行を削除', danger: true, onSelect: () => onPick('行を削除') }];
    }
    // 状態の列は項目なし = ブラウザの標準のメニューのまま。
    if (params.target.column?.key === 'status') {
      return [];
    }
    return [
      { kind: 'label', label: 'セルの操作' },
      { id: 'copy', label: 'コピー', icon: '⧉', onSelect: () => onPick('コピー') },
      { label: '使えない', disabled: true, onSelect: () => onPick('使えない') },
      { kind: 'separator' },
      { label: '消す', danger: true, onSelect: () => onPick('消す') },
      { kind: 'custom', render: () => '自由に描く項目' },
    ];
  };
  const focused = () => document.activeElement ?? document.body;
  const rightClick = (ctx: ParityContext, target: Element, label: string) =>
    ctx.act(() => {
      ctx.log(`${label} の標準のメニューを止めたか`, !fireEvent.contextMenu(target, { button: 2, clientX: 210, clientY: 130 }));
    });
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) => el.textContent?.includes(label));

  it.each([
    ['あり', ['contextMenu']],
    ['なし(空)', []],
  ])('セル / 行番号の右クリック・キー操作・閉じ方・項目なし(機能%s)', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: ['contextMenu'],
      watch: ['onContextMenuOpen', 'getContextMenuItems'],
      props: () => ({
        rows: makeRows(12),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        height: 360,
        enableContextMenu: true,
        getContextMenuItems: menuItems,
      }),
      steps: async (ctx) => {
        onPick = (label) => ctx.log('選んだ項目', label);
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(1, 'name'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        // セルの右クリック(パネルへフォーカス)。
        await rightClick(ctx, ctx.cell(2, 'qty'), 'セル');
        ctx.snapshot('セルの右クリック');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'ArrowDown' });
        });
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'ArrowDown' });
        });
        ctx.snapshot('↓ を 2 回(使えない項目を飛ばす)');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'End' });
        });
        ctx.snapshot('End');
        // 項目を押すと実行して閉じ、グリッドへフォーカスを戻す。
        const copy = menuItem('コピー');
        if (copy) {
          await ctx.act(() => {
            fireEvent.click(copy);
          });
        }
        ctx.snapshot('項目を押して閉じる');
        // 使えない項目は押しても何もしない。
        await rightClick(ctx, ctx.cell(3, 'name'), 'セル(2 回目)');
        const disabled = menuItem('使えない');
        if (disabled) {
          await ctx.act(() => {
            fireEvent.click(disabled);
          });
        }
        ctx.snapshot('使えない項目を押す');
        // メニューの中のキーはグリッドへ届かない(Escape で閉じる)。
        await ctx.act(() => {
          ctx.log('Escape を止めたか', !fireEvent.keyDown(focused(), { key: 'Escape' }));
        });
        ctx.snapshot('Escape で閉じる');
        // 行番号の右クリックと、外を押して閉じる。
        const rowHeader = ctx.container.querySelector('[data-row-index="4"] .ssg-row-header-cell');
        if (rowHeader) {
          await rightClick(ctx, rowHeader, '行番号');
        }
        ctx.snapshot('行番号の右クリック');
        await ctx.act(() => {
          fireEvent.pointerDown(document.body, pointer);
        });
        ctx.snapshot('外を押して閉じる');
        // 項目が空なら標準のメニューのまま。
        await rightClick(ctx, ctx.cell(2, 'status'), '項目が空');
        ctx.snapshot('項目が空');
        // Shift+F10: アクティブセルのメニューをセルの左下に開き、先頭の項目へフォーカス。続けて来る contextmenu は止める。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(5, 'price'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          ctx.log('Shift+F10 を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'F10', shiftKey: true }));
          ctx.log('続く contextmenu を止めたか', !fireEvent.contextMenu(focused(), { button: 0 }));
        });
        ctx.snapshot('Shift+F10');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Tab' });
        });
        ctx.snapshot('Tab で閉じる');
        // keydown を経ずにシェルへ来た contextmenu(OS がメニューキーを変える)はアクティブセルのメニューを開く。
        await ctx.act(() => {}, 1100);
        await ctx.act(() => {
          ctx.log('シェルの contextmenu を止めたか', !fireEvent.contextMenu(ctx.shell(), { button: 0 }));
        });
        ctx.snapshot('シェルの contextmenu');
        await ctx.act(() => {
          fireEvent.keyDown(focused(), { key: 'Escape' });
        });
        // 項目が空のセルでの Shift+F10 は何もしない。
        await ctx.act(() => {
          fireEvent.pointerDown(ctx.cell(5, 'status'), pointer);
          fireEvent.pointerUp(window, pointer);
        });
        await ctx.act(() => {
          ctx.log('項目が空の Shift+F10 を止めたか', !fireEvent.keyDown(ctx.shell(), { key: 'F10', shiftKey: true }));
          ctx.log('項目が空の続く contextmenu を止めたか', !fireEvent.contextMenu(ctx.shell(), { button: 0 }));
        });
        ctx.snapshot('項目が空の Shift+F10');
        // enableContextMenu: false では標準のメニュー。
        await ctx.setProps({ enableContextMenu: false });
        await rightClick(ctx, ctx.cell(2, 'qty'), 'enableContextMenu なし');
        ctx.snapshot('enableContextMenu なし');
      },
    });
  }, 30_000);
});