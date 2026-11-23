// React 版と Solid 版の開発時の警告(console.warn)が、同じ props・同じ操作で同じ文言・同じ回数かを見る(段階 3-1)。
//   - 機能セットに無い機能の prop / メソッド / フィルターの状態(core logic/featureWarnings。1 つにつき 1 回)。
//   - シェルの警告(サーバーサイドの rowGroup / 行のグループ化とラベル行 / auto-height の上限とサーバーサイド / 展開行の高さ /
//     サーバーサイドの moveRow())。
//   core の「1 回だけ」の記録はモジュールに 1 つで React 版と Solid 版が共有するので、それぞれを描く前(props を作るとき)に消す。
//   警告は順番を問わない(React 版は passive effect を宣言の順に、Solid 版は effect の順が違うことがある)ので、並べ替えて比べる。
import { afterAll, beforeAll, describe, it, vi, type MockInstance } from 'vitest';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { resetUnregisteredFeatureWarnings } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/featureWarnings';
import type { ServerSideDataSource } from '@ishibashi0112/spreadsheet-grid-core';
import { expectParity, type ParityContext } from './harness';

let warnings: string[] = [];
let warnSpy: MockInstance<typeof console.warn>;

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    // グリッドの警告だけを控える(Solid の開発ビルドの性能の知らせなどは比べない)。行を store で持つときだけの Solid 版の
    //   警告(5 万行を超える store。PARITY_SOLID_ROWS=store / reconcile で回したとき)は React 版に無いので比べない。
    if (message.includes('Solid の store(createStore)を渡しています')) {
      return;
    }
    if (message.startsWith('[spreadsheet-grid]') || message.startsWith('[SpreadsheetGrid]')) {
      warnings.push(message);
    }
  });
});

afterAll(() => {
  warnSpy.mockRestore();
});

// 描く前に呼ぶ(控えと core の「1 回だけ」の記録を消す)。
const resetWarnings = () => {
  warnings = [];
  resetUnregisteredFeatureWarnings();
};

// ここまでに出た警告を並べ替えて控え、空にする。
const logWarnings = (ctx: ParityContext, label: string) => {
  ctx.log(label, warnings.slice().sort());
  warnings = [];
};

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

type Row = { id: number; kind?: 'label'; region: string; name: string; qty: number; note: string };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    region: i % 2 === 0 ? '東' : '西',
    name: `品目 ${i + 1}`,
    qty: (i * 7) % 50,
    note: `メモ ${i + 1}`,
  }));

// 答えを返さない擬似のサーバー(警告を見るだけなので行は届かなくてよい)。
const pendingDataSource = (rowCount: number): ServerSideDataSource<Row> => ({
  initialRowCount: rowCount,
  getRows: () => new Promise(() => {}),
});

describe('開発時の警告', () => {
  it('機能が無いときの prop・メソッド・フィルターの状態(1 つにつき 1 回)', async () => {
    await expectParity({
      features: [],
      allowMissingFeatures: true,
      props: () => {
        resetWarnings();
        return {
          rows: makeRows(6),
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'name', title: '品名', width: 140, filterType: 'text' },
            { key: 'qty', title: '数量', width: 90, conditionalFormat: { dataBar: {} } },
            { key: 'note', title: 'メモ', width: 140, autoHeight: true },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          find: true,
          fillHandle: true,
          onColumnsChange: () => {},
          columnDragMotion: 'live',
          enableRowDrag: true,
          scrollHint: true,
          imeDirectInput: true,
          totalRow: true,
          pinnedTopRows: [{ id: 0, region: '', name: '固定', qty: 0, note: '' }],
          autoSizeColumns: true,
          enableContextMenu: true,
          enableColumnMenu: true,
          showSelectionAggregates: true,
          highlightChanges: true,
          showCopyRange: true,
          hoverHighlight: 'cross',
          enableColumnFilter: true,
          enableGlobalFilter: true,
          showFilterChipBar: true,
          globalFilterPlaceholder: '探す',
          dataSource: pendingDataSource(6),
          serverSideRefreshToken: 0,
          onServerSideLoadError: () => {},
          showSaveStatus: true,
          autoHeight: true,
          labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => row.name },
        };
      },
      steps: async (ctx) => {
        logWarnings(ctx, '描いたとき');
        // 機能に属するメソッド(エクスポート / ツールパネル)と、フィルターの機能が無いのに入れたフィルターの状態。
        await ctx.act(() => {
          ctx.log('exportCsv', call(ctx, 'exportCsv'));
          ctx.log('getExportData', call(ctx, 'getExportData'));
          call(ctx, 'downloadCsv', 'rows.csv');
          call(ctx, 'openFilterManager');
          call(ctx, 'applyState', { filters: { globalFilterText: '品目', columnFilters: {} } });
        });
        logWarnings(ctx, 'メソッドとフィルターの状態');
        // 2 回目は出さない(props を変えても、同じ prop は 1 回だけ)。
        await ctx.act(() => {
          call(ctx, 'exportCsv');
          call(ctx, 'openFilterManager');
        });
        await ctx.setProps({ find: { initialOpen: false }, hoverHighlight: 'cross', rows: makeRows(4) });
        logWarnings(ctx, '2 回目');
        // 新しく使った prop は出す。
        await ctx.setProps({ manualFiltering: true });
        logWarnings(ctx, 'manualFiltering を足した');
        ctx.snapshot('最後');
      },
    });
  }, 20000);

  it.each([
    ['ツールパネルだけ(入口が無い)', ['toolPanel']],
    ['ツールパネルと列メニュー(フィルターが無い)', ['toolPanel', 'columnMenu']],
    ['ツールパネルとフィルター(警告なし)', ['toolPanel', 'filtering']],
  ])('openFilterManager と足りない機能: %s', async (_label, features) => {
    await expectParity({
      features,
      allowMissingFeatures: true,
      props: () => {
        resetWarnings();
        return {
          rows: makeRows(4),
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'name', title: '品名', width: 140 },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          motion: 'off',
        };
      },
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'openFilterManager');
        });
        logWarnings(ctx, 'openFilterManager');
        ctx.snapshot('開いた後');
        await ctx.act(() => {
          call(ctx, 'closeFilterManager');
          call(ctx, 'openFilterManager');
        });
        logWarnings(ctx, '2 回目');
      },
    });
  }, 20000);

  it('サーバーサイドの rowGroup・auto-height・moveRow()', async () => {
    await expectParity({
      features: ['serverSide', 'grouping', 'autoHeight'],
      props: () => {
        resetWarnings();
        return {
          dataSource: pendingDataSource(30),
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'note', title: 'メモ', width: 140, autoHeight: true },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          autoHeight: true,
          motion: 'off',
        };
      },
      steps: async (ctx) => {
        logWarnings(ctx, '描いたとき');
        await ctx.act(() => {
          call(ctx, 'moveRow', 1, 3);
          call(ctx, 'moveRow', 2, 4);
        });
        logWarnings(ctx, 'moveRow を 2 回');
        // rowGroup の列の数が同じなら、columns を新しい配列に替えても出し直さない(React 版の deps は列の数)。
        await ctx.setProps({
          columns: [
            { key: 'id', title: '番号', width: 60 },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'note', title: 'メモ', width: 140, autoHeight: true },
          ],
        });
        logWarnings(ctx, '見出しだけ替えた');
        // rowGroup の列が増えると出し直す(React 版は列の数が変わるたびに出す)。auto-height は 1 回だけ。
        await ctx.setProps({
          columns: [
            { key: 'id', title: 'ID', width: 60, rowGroup: true },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'note', title: 'メモ', width: 140, autoHeight: true },
          ],
        });
        logWarnings(ctx, 'rowGroup の列を足した');
      },
    });
  }, 20000);

  it('行のグループ化とラベル行の併用', async () => {
    const rows: Row[] = [{ id: 100, kind: 'label', region: '', name: '見出し', qty: 0, note: '' }, ...makeRows(4)];
    await expectParity({
      features: ['grouping', 'labelRow'],
      props: () => {
        resetWarnings();
        return {
          rows,
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'name', title: '品名', width: 140 },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          motion: 'off',
          labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => row.name },
        };
      },
      steps: async (ctx) => {
        logWarnings(ctx, '描いたとき');
        // グループ化もラベル行もそのままなら、columns を新しい配列に替えても出し直さない。
        await ctx.setProps({
          columns: [
            { key: 'id', title: '番号', width: 60 },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'name', title: '品名', width: 140 },
          ],
        });
        logWarnings(ctx, '見出しだけ替えた');
        // グループ化を外して戻すと、また出す(React 版と同じ)。
        await ctx.setProps({
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'region', title: '地域', width: 80 },
            { key: 'name', title: '品名', width: 140 },
          ],
        });
        logWarnings(ctx, 'グループ化を外した');
        await ctx.setProps({
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'region', title: '地域', width: 80, rowGroup: true },
            { key: 'name', title: '品名', width: 140 },
          ],
        });
        logWarnings(ctx, 'グループ化に戻した');
      },
    });
  }, 20000);

  it('auto-height の行数の上限は、しきい値を何度またいでも 1 回だけ', async () => {
    const many = makeRows(50_001);
    const few = makeRows(10);
    await expectParity({
      features: ['autoHeight'],
      props: () => {
        resetWarnings();
        return {
          rows: many,
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'note', title: 'メモ', width: 140, autoHeight: true },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          autoHeight: true,
          motion: 'off',
        };
      },
      steps: async (ctx) => {
        logWarnings(ctx, '5 万 1 行');
        await ctx.setProps({ rows: few });
        await ctx.setProps({ rows: many });
        await ctx.setProps({ rows: makeRows(50_002) });
        logWarnings(ctx, '行数を上下させた');
      },
    });
  }, 60000);

  it('展開行の高さの上限は、行数が上下しても 1 回だけ', async () => {
    const few = makeRows(10);
    // 行の高さ 1,000px × 2 万行 = 2,000 万 px(上限 1,500 万 px を超える)。
    const tall = makeRows(20_000);
    await expectParity({
      features: [],
      props: () => {
        resetWarnings();
        return {
          rows: tall,
          columns: [
            { key: 'id', title: 'ID', width: 60 },
            { key: 'note', title: 'メモ', width: 140 },
          ],
          rowKeyGetter: (row: Row) => row.id,
          height: 300,
          rowHeight: 1000,
          motion: 'off',
          // 上限を超えるので帯は描かれない(中身は使わない)。
          detailRow: { render: () => null },
        };
      },
      steps: async (ctx) => {
        await ctx.act(() => {
          call(ctx, 'setDetailRowExpanded', 1, true);
        });
        logWarnings(ctx, '開いた');
        await ctx.setProps({ rows: few });
        await ctx.setProps({ rows: tall });
        await ctx.act(() => {
          call(ctx, 'setDetailRowExpanded', 2, true);
        });
        logWarnings(ctx, '行数を上下させてもう 1 行開いた');
      },
    });
  }, 60000);
});