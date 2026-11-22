// React 版の結合テストのうち、Solid 版でまだ同じ場面を見ていなかった状態の初期値・値の見せ方・まだ使っていなかった props を、
//   React 版と比べるテストへ移した(段階 4-1。docs/audits/2026-11-22-solid-quality/test-inventory.md)。React 版の元のテストは
//   packages/react/src の SpreadsheetGrid.initialState / valueLabels / multilineEditor / checkboxEditor の各 integration.test.tsx と
//   view/ColumnFilterPopover.test.tsx(日付のプリセット)。
import { afterAll, beforeAll, describe, it, vi, type MockInstance } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import type { ServerSideDataSource, ServerSideGetRowsParams } from '@ishibashi0112/spreadsheet-grid-core';
import { restoreColumnsFromState } from '../index';
import { expectParity, type ParityContext } from './harness';

type Row = { id: number; name: string; qty: number };

const ROWS: Row[] = [
  { id: 1, name: 'alpha', qty: 3 },
  { id: 2, name: 'beta', qty: 1 },
  { id: 3, name: 'gamma', qty: 2 },
  { id: 4, name: 'delta', qty: 5 },
];
const columns = [
  { key: 'name', title: '名前', width: 160, filterType: 'text' },
  { key: 'qty', title: '数量', width: 100, filterType: 'number' },
];
const makeInitialState = () => ({
  columnWidths: { name: 220 },
  filters: { columnFilters: { name: { kind: 'text', value: 'l' } } },
  sort: [{ columnKey: 'qty', direction: 'asc' }],
});

let warnings: string[] = [];
let warnSpy: MockInstance<typeof console.warn>;
let copied: string[] = [];
beforeAll(() => {
  installJsdomLayoutStubs({ width: 900, height: 400 });
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    // グリッドの警告だけを控える(Solid の開発ビルドの性能の知らせなどは比べない)。
    if (message.startsWith('[spreadsheet-grid]') || message.startsWith('[SpreadsheetGrid]')) {
      warnings.push(message);
    }
  });
  // jsdom には navigator.clipboard が無いので、書き込んだ文字を控える。
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (text: string) => void copied.push(text) },
    configurable: true,
  });
});
afterAll(() => {
  warnSpy.mockRestore();
  Reflect.deleteProperty(navigator, 'clipboard');
});
// 警告を並べ替えて控え、空にする(React 版と Solid 版で effect の順が違うことがあるので順番は問わない)。
const logWarnings = (ctx: ParityContext, label: string) => {
  ctx.log(label, warnings.slice().sort());
  warnings = [];
};
const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);
const pointer = { button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('initialState(DU-12)', () => {
  it('最初の描画から絞り込み / 並べ替え / 列幅が効き、マウント時は通知しない・後から変えても今の状態は変わらない', async () => {
    await expectParity({
      features: ['filtering'],
      watch: ['onStateChange', 'onFiltersChange', 'onSortChange'],
      props: () => {
        warnings = [];
        return { rows: ROWS, columns, rowKeyGetter: (row: Row) => row.id, height: 300, initialState: makeInitialState() };
      },
      steps: async (ctx) => {
        ctx.snapshot('最初の描画');
        ctx.log('getState', call(ctx, 'getState'));
        await ctx.setProps({ initialState: { sort: [{ columnKey: 'name', direction: 'desc' }] } });
        ctx.log('initialState を変えた後の sort', (call(ctx, 'getState') as { sort: unknown }).sort);
        logWarnings(ctx, '警告');
      },
    });
  });

  const saved = {
    version: 2,
    columnWidths: { qty: 140 },
    filters: { globalText: '', columnFilters: {} },
    sort: [],
    columns: [{ key: 'gone' }, { key: 'qty', pinned: 'left' }, { key: 'name', visible: false }],
  };
  it.each([
    ['今の列定義に無い列は捨てて知らせる', () => ({ columns, initialState: { sort: [{ columnKey: 'gone', direction: 'asc' }, { columnKey: 'qty', direction: 'desc' }] } })],
    ['restoreColumnsFromState と一緒なら知らせない', () => ({ columns: restoreColumnsFromState(columns, saved), initialState: saved })],
    [
      '途中の列を固定した状態を戻しても知らせない',
      () => {
        const state = { ...saved, columnWidths: {}, columns: [{ key: 'id', pinned: 'left' }, { key: 'name' }, { key: 'qty', pinned: 'left' }] };
        return { columns: restoreColumnsFromState([{ key: 'id', title: 'ID', width: 60 }, ...columns], state), initialState: state };
      },
    ],
    [
      '並びが columns prop と違う columns は知らせる',
      () => ({ columns, initialState: { ...saved, columnWidths: {}, columns: [{ key: 'qty' }, { key: 'name', pinned: 'left' }] } }),
    ],
  ] as const)('%s', async (label, makeProps) => {
    await expectParity({
      features: ['filtering'],
      props: () => {
        warnings = [];
        return { rows: ROWS, rowKeyGetter: (row: Row) => row.id, height: 300, ...makeProps() };
      },
      steps: async (ctx) => {
        ctx.snapshot(label);
        ctx.log('getState', call(ctx, 'getState'));
        logWarnings(ctx, '警告');
      },
    });
  });

  it('getState() の値をそのまま次のグリッドへ渡しても知らせない', async () => {
    let state: unknown = null;
    await expectParity({
      features: ['filtering'],
      props: () => ({ rows: ROWS, columns, rowKeyGetter: (row: Row) => row.id, height: 300, initialState: makeInitialState() }),
      steps: async (ctx) => {
        state = call(ctx, 'getState');
      },
    });
    await expectParity({
      features: ['filtering'],
      props: () => {
        warnings = [];
        return { rows: ROWS, columns, rowKeyGetter: (row: Row) => row.id, height: 300, initialState: state };
      },
      steps: async (ctx) => {
        ctx.snapshot('getState() の値を渡した');
        logWarnings(ctx, '警告');
      },
    });
  });

  it('自動グループ列の幅も最初の描画から効き、columns を渡し直しても残る', async () => {
    const grouped = [
      { key: 'name', title: '名前', width: 160, rowGroup: true },
      { key: 'qty', title: '数量', width: 100 },
    ];
    await expectParity({
      features: ['grouping'],
      props: () => ({
        rows: ROWS,
        columns: grouped,
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
        initialState: { columnWidths: { __ssg_group__: 333, qty: 150 } },
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初の描画');
        ctx.log('列幅', (call(ctx, 'getState') as { columnWidths: unknown }).columnWidths);
        await ctx.setProps({ columns: grouped.map((column) => ({ ...column })) });
        ctx.log('columns を渡し直した後の列幅', (call(ctx, 'getState') as { columnWidths: unknown }).columnWidths);
      },
    });
  });

  it.each([
    ['列フィルターと並べ替え', () => makeInitialState(), columns],
    [
      '相対日付のプリセット(thisMonth)',
      () => ({ filters: { columnFilters: { d: { kind: 'dateSet', condition: { mode: 'preset', preset: 'thisMonth' }, set: null } } } }),
      [{ key: 'd', title: '日付', width: 120, filterType: 'dateSet' }],
    ],
    [
      '相対日付のプリセット(サーバーだけのプリセット)',
      () => ({ filters: { columnFilters: { d: { kind: 'dateSet', condition: { mode: 'preset', preset: 'serverOnlyPreset' }, set: null } } } }),
      [{ key: 'd', title: '日付', width: 120, filterType: 'dateSet' }],
    ],
  ] as const)('serverSide: 最初の取得から initialState を載せ、最初のブロックは 1 回だけ取る(%s)', async (_label, makeState, cols) => {
    let calls: ServerSideGetRowsParams[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) => {
        calls.push(params);
        return Promise.resolve({ rows: ROWS.slice(params.startIndex, params.endIndex), totalRowCount: ROWS.length });
      },
    };
    await expectParity({
      features: ['filtering', 'serverSide'],
      props: () => {
        calls = [];
        return { rows: [], columns: cols, rowKeyGetter: (row: Row) => row.id, height: 300, dataSource, initialState: makeState() };
      },
      controlledRows: false,
      steps: async (ctx) => {
        await ctx.act(() => sleep(700));
        ctx.log(
          '取得',
          calls.map((params) => ({ startIndex: params.startIndex, sort: params.query.sort, columnFilters: params.query.columnFilters })),
        );
        ctx.snapshot('届いた');
      },
    });
  });
});

describe('値の見せ方(valueLabels)', () => {
  type Sale = { id: number; region: string; amount: number };
  const REGIONS = [
    { value: 'kanto', label: '関東' },
    { value: 'chubu', label: '中部' },
  ];
  const regionLabel = new Map(REGIONS.map((option) => [option.value, option.label]));
  const SALES: Sale[] = [
    { id: 1, region: 'kanto', amount: 796000 },
    { id: 2, region: 'chubu', amount: 1200 },
    { id: 3, region: 'kanto', amount: 5 },
  ];
  const saleColumns = (extra: Record<string, unknown> = {}, clipboard?: 'label') => [
    {
      key: 'region',
      title: '地域',
      width: 120,
      editable: true,
      editor: { type: 'select', options: REGIONS, clipboard },
      valueFormatter: ({ value }: { value: unknown }) => regionLabel.get(String(value)) ?? String(value ?? ''),
      ...extra,
    },
    {
      key: 'amount',
      title: '金額',
      width: 120,
      editable: true,
      editor: { type: 'number' },
      valueFormatter: ({ value }: { value: unknown }) => Number(value).toLocaleString('en-US'),
      aggFunc: 'sum',
    },
  ];
  const groupLabels = (ctx: ParityContext) => (call(ctx, 'getGroupRows') as { label: string }[]).map((group) => group.label);

  it.each([
    ['既定(値の文字)', {}],
    ["'formatted'(valueFormatter の表示名)", { groupLabel: 'formatted' }],
    ['関数', { groupLabel: ({ value, row }: { value: unknown; row?: Sale }) => `${String(value)}:${row?.id}` }],
  ] as const)('groupLabel: %s', async (_label, extra) => {
    await expectParity({
      features: ['grouping', 'filtering'],
      props: () => ({ rows: SALES, columns: saleColumns({ rowGroup: true, ...extra }), rowKeyGetter: (row: Sale) => row.id, globalFilterMatch: 'both' }),
      steps: async (ctx) => {
        ctx.log('getGroupRows', groupLabels(ctx));
        ctx.snapshot('グループ行');
        // グルーピング中のグループ元の列も画面の文字で探せる。
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '中部', columnFilters: {} } });
        });
        ctx.log('「中部」で絞った getGroupRows', groupLabels(ctx));
      },
    });
  });

  it.each([
    ["既定('value')", undefined],
    ["'label'", 'label'],
  ] as const)('select エディタの clipboard: %s のコピー・書き出し・貼り付け', async (_label, clipboard) => {
    await expectParity({
      features: ['export'],
      watch: ['onRowsChange'],
      props: () => {
        copied = [];
        return { rows: SALES, columns: saleColumns({}, clipboard), rowKeyGetter: (row: Sale) => row.id };
      },
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'selectCell', 0, 0);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: 'c', ctrlKey: true });
        });
        ctx.log('コピーした文字', copied.slice());
        const exported = call(ctx, 'getExportData', { scope: 'view' }) as { rows: { text: string; value: unknown }[][] };
        ctx.log(
          '書き出し',
          exported.rows.map((cells) => [cells[0]?.text, cells[0]?.value]),
        );
        await ctx.act(() => {
          fireEvent.paste(ctx.shell(), { clipboardData: { getData: () => '中部\n関東 \nkanto\n九州' } });
        });
        await ctx.act(() => {
          call(ctx, 'selectCell', 2, 0);
        });
        await ctx.act(() => {
          fireEvent.paste(ctx.shell(), { clipboardData: { getData: () => '九州' } });
        });
        ctx.snapshot('貼り付けた');
      },
    });
  });
});

describe('まだ Solid 版で使っていなかった props', () => {
  it("複数行の text エディタの enterKey: 'newline'(Enter で改行、Ctrl / ⌘+Enter で確定)", async () => {
    await expectParity({
      watch: ['onRowsChange'],
      props: () => ({
        rows: ROWS.map((row) => ({ ...row, memo: 'a' })),
        columns: [{ key: 'memo', title: 'メモ', width: 200, editor: { type: 'text', multiline: true, enterKey: 'newline' } }, ...columns],
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
      }),
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'startEditing', 0, 0);
        });
        const editor = () => {
          const element = ctx.container.querySelector<HTMLTextAreaElement>('textarea.ssg-cell-editor-input');
          if (!element) {
            throw new Error(`[${ctx.framework}] 複数行のエディタがありません`);
          }
          return element;
        };
        ctx.log('Enter を止めたか', !fireEvent.keyDown(editor(), { key: 'Enter' }));
        await ctx.act(() => {});
        ctx.snapshot('Enter(改行は入力欄に任せる)');
        await ctx.act(() => {
          fireEvent.input(editor(), { target: { value: 'a\nb' } });
        });
        await ctx.act(() => {
          fireEvent.keyDown(editor(), { key: 'Enter', ctrlKey: true });
        });
        ctx.snapshot('Ctrl+Enter で確定');
        await ctx.act(() => {
          call(ctx, 'startEditing', 1, 0);
        });
        await ctx.act(() => {
          fireEvent.keyDown(editor(), { key: 'Enter', metaKey: true });
        });
        ctx.snapshot('⌘+Enter で確定');
      },
    });
  });

  it('checkbox エディタの checkedValue / uncheckedValue', async () => {
    await expectParity({
      watch: ['onRowsChange'],
      props: () => ({
        rows: ROWS.map((row, index) => ({ ...row, done: index % 2 === 0 ? 'Y' : 'N' })),
        columns: [{ key: 'done', title: '済', width: 60, editor: { type: 'checkbox', checkedValue: 'Y', uncheckedValue: 'N' } }, ...columns],
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
      }),
      steps: async (ctx) => {
        ctx.snapshot('最初');
        await ctx.act(() => {
          call(ctx, 'selectCell', 1, 0);
        });
        await ctx.act(() => {
          fireEvent.keyDown(ctx.shell(), { key: ' ' });
        });
        await ctx.act(() => {
          const box = ctx.container.querySelector('.ssg-body-row[data-row-index="0"] .ssg-cell-checkbox');
          if (!box) {
            throw new Error(`[${ctx.framework}] チェックボックスがありません`);
          }
          fireEvent.pointerDown(box, pointer);
          fireEvent.pointerUp(window, pointer);
          fireEvent.click(box, pointer);
        });
        ctx.snapshot('Space と押して切り替えた');
      },
    });
  });

  it('列の dateFilterPresets(カスタムのプリセット・false で出さない)', async () => {
    const reactLite = (await import(/* @vite-ignore */ new URL('../../../react/src/lite.ts', import.meta.url).pathname)) as {
      preloadGridPopups: () => Promise<void>;
    };
    await reactLite.preloadGridPopups();
    type Dated = { id: number; d: string; e: string };
    const dated: Dated[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, d: `2026-0${i + 1}-15`, e: `2026-0${i + 1}-01` }));
    await expectParity({
      features: ['filtering', 'columnMenu'],
      watch: ['onFiltersChange'],
      props: () => ({
        rows: dated,
        columns: [
          {
            key: 'd',
            title: '日付',
            width: 140,
            filterType: 'dateSet',
            dateFilterPresets: ['today', { id: 'firstHalf', label: '上半期', resolve: () => ({ from: '2026-01-01', to: '2026-06-30' }) }],
          },
          { key: 'e', title: '開始', width: 140, filterType: 'dateSet', dateFilterPresets: false },
        ],
        rowKeyGetter: (row: Dated) => row.id,
        height: 300,
      }),
      steps: async (ctx) => {
        for (const key of ['d', 'e']) {
          await ctx.act(() => {
            const button = ctx.header(key).querySelector<HTMLButtonElement>('[data-ssg-tooltip="列メニュー"]');
            if (!button) {
              throw new Error(`[${ctx.framework}] ⋮ がありません`);
            }
            fireEvent.pointerDown(button, pointer);
            fireEvent.pointerUp(button, pointer);
            fireEvent.click(button, { detail: 1 });
          });
          await ctx.act(() => {
            const item = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((el) =>
              el.textContent?.includes('フィルター…'),
            );
            if (!item) {
              throw new Error(`[${ctx.framework}] 「フィルター…」がありません`);
            }
            fireEvent.click(item, { detail: 1 });
          });
          ctx.snapshot(`${key} の列フィルター`);
          if (key === 'd') {
            await ctx.act(() => {
              const chip = Array.from(document.querySelectorAll<HTMLElement>('.ssg-filter-preset-chip')).find((el) =>
                el.textContent?.includes('上半期'),
              );
              if (!chip) {
                throw new Error(`[${ctx.framework}] 上半期のチップがありません`);
              }
              fireEvent.pointerDown(chip, pointer);
            });
            ctx.snapshot('上半期を選んだ');
          }
          await ctx.act(() => {
            fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
          });
        }
        ctx.log('getState の列フィルター', (call(ctx, 'getState') as { filters: unknown }).filters);
        ctx.snapshot('閉じた');
      },
    });
  });

  it('setRowSelection(uncontrolled / controlled の行の選択)', async () => {
    for (const controlled of [false, true]) {
      await expectParity({
        watch: ['onRowSelectionChange'],
        props: () => ({
          rows: ROWS,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          enableRowSelection: true,
          ...(controlled ? { rowSelection: { type: 'include', rowKeys: [1] } } : {}),
        }),
        steps: async (ctx) => {
          await ctx.act(() => {
            call(ctx, 'setRowSelection', { type: 'include', rowKeys: [2, 3] });
          });
          ctx.log('getRowSelection', call(ctx, 'getRowSelection'));
          ctx.log('getSelectedRowKeys', call(ctx, 'getSelectedRowKeys'));
          ctx.snapshot(controlled ? 'controlled で setRowSelection(親が変えるまでそのまま)' : 'setRowSelection');
          await ctx.act(() => {
            call(ctx, 'setRowSelection', { type: 'exclude', rowKeys: [4] });
          });
          ctx.log('getRowSelection(exclude)', call(ctx, 'getRowSelection'));
          ctx.snapshot('exclude');
        },
      });
    }
  });
});

describe('列幅の状態と非表示の列(RD-5 / M-03 / L-02)', () => {
  const widthColumns = [
    { key: 'id', title: 'ID', width: 60 },
    { key: 'name', title: '名前', width: 120 },
    { key: 'qty', title: '数量', width: 80 },
  ];

  it('列幅の状態は columns の参照の変化で消えず、width の指定し直しと列の削除でだけ捨てる・applyState(getState()) は同じ', async () => {
    await expectParity({
      watch: ['onStateChange'],
      props: () => ({ rows: ROWS, columns: widthColumns, rowKeyGetter: (row: Row) => row.id, height: 300 }),
      steps: async (ctx) => {
        const widths = (label: string) => ctx.log(label, (call(ctx, 'getState') as { columnWidths: unknown }).columnWidths);
        widths('最初');
        await ctx.act(() => {
          call(ctx, 'applyState', { columnWidths: { name: 300 } });
        });
        widths('applyState で名前を 300');
        await ctx.setProps({ columns: widthColumns.map((column) => ({ ...column })) });
        widths('同じ中身の columns を作り直す');
        const widened = widthColumns.map((column) => (column.key === 'id' ? { ...column, width: 90 } : { ...column }));
        await ctx.setProps({ columns: widened });
        widths('ほかの列の width を変える');
        const renamed = widened.map((column) => (column.key === 'name' ? { ...column, width: 220 } : column));
        await ctx.setProps({ columns: renamed });
        widths('名前の width を指定し直す');
        ctx.snapshot('指定し直した後');
        await ctx.act(() => {
          call(ctx, 'applyState', { columnWidths: { qty: 150 } });
        });
        await ctx.setProps({ columns: renamed.filter((column) => column.key !== 'qty') });
        widths('数量の列を消す');
        const before = call(ctx, 'getState');
        await ctx.act(() => {
          call(ctx, 'applyState', before);
        });
        ctx.log('applyState(getState()) の後も同じ', JSON.stringify(call(ctx, 'getState')) === JSON.stringify(before));
      },
    });
  });

  it('非表示の列(visible: false)の列フィルター / 並べ替えも行に効く', async () => {
    await expectParity({
      features: ['filtering', 'export'],
      watch: ['onStateChange'],
      props: () => ({
        rows: ROWS,
        columns: widthColumns.map((column) => (column.key === 'name' ? { ...column, visible: false } : column)),
        rowKeyGetter: (row: Row) => row.id,
        height: 300,
      }),
      steps: async (ctx) => {
        const ids = (label: string) =>
          ctx.log(label, (call(ctx, 'getExportData', { scope: 'view' }) as { rows: { value: unknown }[][] }).rows.map((row) => row[0]?.value));
        ids('最初');
        await ctx.act(() => {
          call(ctx, 'applyState', {
            filters: { globalText: '', columnFilters: { name: { kind: 'text', value: 'a' } } },
            sort: [{ columnKey: 'name', direction: 'desc' }],
          });
        });
        ids('名前に a・名前の降順');
        ctx.snapshot('名前に a・名前の降順');
        await ctx.act(() => {
          call(ctx, 'applyState', { filters: { globalText: '', columnFilters: { name: { kind: 'text', value: 'be' } } }, sort: [] });
        });
        ids('名前に be');
      },
    });
  });
});
