// React 版(`/lite` に同じ機能を差し込んだもの)と Solid 版のサーバーサイドの行モデル(SSRM。dataSource)を同じ操作で動かして、
//   DOM と通知と命令的 API の結果、サーバーへの依頼(getRows / updateRows)が同じかを見る(段階 2-4c)。
//   サーバーは答えを手で返す擬似のもの(依頼を溜めておき、respond / fail で返す)なので、読み込み中の行も比べられる。
import { beforeAll, describe, it } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import type {
  ServerSideDataSource,
  ServerSideGetRowsParams,
  ServerSideGetRowsResult,
  ServerSideUpdateRowsParams,
} from '@ishibashi0112/spreadsheet-grid-core';
import { expectParity, type ParityContext } from './harness';

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

type Row = { id: number; kind?: 'label'; name: string; qty: number; done: boolean };

const ALL_ROWS: Row[] = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  name: `品目 ${i + 1}`,
  qty: (i * 7) % 50,
  done: i % 3 === 0,
}));

const columns = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 140, editor: { type: 'text' } },
  {
    key: 'qty',
    title: '数量',
    width: 90,
    align: 'right',
    editor: { type: 'number' },
    validationMode: 'reject',
    validate: ({ value }: { value: unknown }) => (typeof value === 'number' && value < 0 ? '0 以上' : true),
  },
  { key: 'done', title: '済', width: 60, editor: { type: 'checkbox' } },
];

const pointer = { button: 0, pointerId: 1, isPrimary: true };

const call = (ctx: ParityContext, name: string, ...args: unknown[]) =>
  (ctx.handle()[name] as unknown as (...a: unknown[]) => unknown)(...args);

// 擬似のサーバー。getRows / updateRows の依頼を溜め、テストが respond / fail で返す(返した依頼は ctx.log に控える)。
type PendingGet = {
  params: ServerSideGetRowsParams;
  resolve: (result: ServerSideGetRowsResult<Row>) => void;
  reject: (error: unknown) => void;
};
type PendingUpdate = {
  params: ServerSideUpdateRowsParams<Row>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const createFakeServer = (options: { withUpdateRows?: boolean; rows?: Row[] } = {}) => {
  let data = (options.rows ?? ALL_ROWS).map((row) => ({ ...row }));
  const gets: PendingGet[] = [];
  const updates: PendingUpdate[] = [];
  const answer = (params: ServerSideGetRowsParams): ServerSideGetRowsResult<Row> => {
    const text = params.query.globalText?.trim() ?? '';
    let rows = text ? data.filter((row) => row.name.includes(text)) : data.slice();
    const sort = params.query.sort?.[0];
    if (sort) {
      const sign = sort.direction === 'asc' ? 1 : -1;
      const key = sort.columnKey as keyof Row;
      rows = rows.slice().sort((a, b) => (Number(a[key]) - Number(b[key])) * sign || a.id - b.id);
    }
    return { rows: rows.slice(params.startIndex, params.endIndex), totalRowCount: rows.length };
  };
  const describeGet = (params: ServerSideGetRowsParams) =>
    `${params.startIndex}-${params.endIndex} ${JSON.stringify(params.query)}${params.signal.aborted ? ' 中止' : ''}`;
  const dataSource: ServerSideDataSource<Row> = {
    blockSize: 20,
    initialRowCount: (options.rows ?? ALL_ROWS).length,
    getRows: (params) =>
      new Promise((resolve, reject) => {
        gets.push({ params, resolve, reject });
      }),
    ...(options.withUpdateRows === false
      ? {}
      : {
          updateRows: (params: ServerSideUpdateRowsParams<Row>) =>
            new Promise<void>((resolve, reject) => {
              updates.push({ params, resolve, reject });
            }),
        }),
  };
  const take = <E,>(list: E[]) => list.splice(0, list.length);
  return {
    dataSource,
    // 溜まった getRows に答える(依頼の範囲と query を控える)。
    respond: (ctx: ParityContext) => {
      const pending = take(gets);
      ctx.log('getRows', pending.map((entry) => describeGet(entry.params)));
      for (const entry of pending) {
        entry.resolve(answer(entry.params));
      }
    },
    fail: (ctx: ParityContext) => {
      const pending = take(gets);
      ctx.log('getRows(失敗)', pending.map((entry) => describeGet(entry.params)));
      for (const entry of pending) {
        entry.reject(new Error('server down'));
      }
    },
    // 溜まった updateRows を受け入れる(サーバーの行も書き換える)/ 断る。
    accept: (ctx: ParityContext) => {
      const pending = take(updates);
      ctx.log(
        'updateRows',
        pending.map((entry) => entry.params.updates.map(({ rowKey, rowIndex, changes }) => ({ rowKey, rowIndex, changes }))),
      );
      for (const entry of pending) {
        for (const update of entry.params.updates) {
          data = data.map((row) => (row.id === update.rowKey ? { ...update.row } : row));
        }
        entry.resolve();
      }
    },
    reject: (ctx: ParityContext) => {
      const pending = take(updates);
      ctx.log(
        'updateRows(失敗)',
        pending.map((entry) => entry.params.updates.map(({ rowKey, changes }) => ({ rowKey, changes }))),
      );
      for (const entry of pending) {
        entry.reject(new Error('save failed'));
      }
    },
  };
};
type FakeServer = ReturnType<typeof createFakeServer>;

// getRows の依頼(行モデルの debounce = 120ms)が出るまで待つ。
const waitForRequests = async (ctx: ParityContext) => {
  await ctx.act(() => undefined, 200);
};

// 保存できた印(✓)は 1.3 秒で外れる。外れる時刻が両者の待ち方で前後しないよう、次の操作の前に外れるまで待つ。
const waitForSaveBadges = async (ctx: ParityContext) => {
  await ctx.act(() => undefined, 1400);
};

const scroller = (ctx: ParityContext) => {
  const element = ctx.container.querySelector<HTMLElement>('.ssg-scroll-container');
  if (!element) {
    throw new Error(`[${ctx.framework}] スクロールの器がありません`);
  }
  return element;
};

// スクロール中の印(ssg-scroll-container--scrolling)は止まってから 0.12 秒で外れるので、外れるまで待つ。
const scrollTo = async (ctx: ParityContext, top: number) => {
  await ctx.act(() => {
    const element = scroller(ctx);
    element.scrollTop = top;
    element.dispatchEvent(new Event('scroll'));
  }, 240);
};

const focusCell = async (ctx: ParityContext, row: number, col: number) => {
  await ctx.act(() => {
    call(ctx, 'selectCell', row, col);
    ctx.shell().focus();
  });
};

const keyOnShell = async (ctx: ParityContext, init: KeyboardEventInit & { key: string }) => {
  await ctx.act(() => {
    fireEvent.keyDown(ctx.shell(), init);
  });
};

const editorInput = (ctx: ParityContext): HTMLInputElement => {
  const element = ctx.container.querySelector<HTMLInputElement>('.ssg-cell-editor-input');
  if (!element) {
    throw new Error(`[${ctx.framework}] エディタがありません`);
  }
  return element;
};

describe('サーバーサイドの行モデル(serverSide)', () => {
  it.each([
    ['あり', ['serverSide']],
    ['なし(dataSource を外して clientSide)', []],
  ])('読み込み中の行・届いた行・スクロールで次のブロック・取り直し・件数(機能%s)', async (_label, features) => {
    let server: FakeServer = createFakeServer();
    await expectParity({
      features,
      allowMissingFeatures: ['serverSide'],
      watch: ['onActiveCellChange'],
      props: () => {
        server = createFakeServer();
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          enableRowSelection: true,
          serverSideRefreshToken: 0,
        };
      },
      steps: async (ctx) => {
        ctx.snapshot('最初(読み込み中の行)');
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('最初のブロックが届いた');
        ctx.track('1 行目(中央)', () => ctx.container.querySelector('.ssg-body-row[data-pane="center"][data-row-index="1"]'));
        // 読み込み中の行のセルを押してもアクティブセルになる。
        await scrollTo(ctx, 1500);
        ctx.snapshot('先の行へスクロール(読み込み中)');
        await ctx.act(() => {
          const target = ctx.container.querySelector('.ssg-body-row[data-pane="center"][data-row-index="52"] [data-ssg-col-key="name"]');
          if (target) {
            fireEvent.pointerDown(target, pointer);
            fireEvent.pointerUp(window, pointer);
          }
        });
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('先のブロックが届いた');
        ctx.log('状態', call(ctx, 'getState'));
        // 取り直し(キャッシュを捨てて見えている範囲を読み直す。位置はそのまま)。
        await ctx.act(() => {
          call(ctx, 'refreshServerSide');
        });
        ctx.snapshot('取り直し中');
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('取り直した');
        // props の serverSideRefreshToken を増やしても同じ(query は変えずに読み直す)。
        await ctx.setProps({ serverSideRefreshToken: 1 });
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('serverSideRefreshToken で取り直した');
        await scrollTo(ctx, 0);
        ctx.snapshot('先頭へ戻した(先頭のブロックは取り直しで捨てたので読み込み中)');
      },
    });
  }, 20000);

  // 行が少ないと、ビューポートを測った後も描く窓(overscan 込み)が変わらない。最初に知らせた窓が読み込まれること
  //   (最初の update の query の同期で取得の予約が消えない)。
  it('行が少なく描く窓が変わらない表でも最初のブロックを読む', async () => {
    let server: FakeServer = createFakeServer();
    await expectParity({
      features: ['serverSide'],
      props: () => {
        server = createFakeServer({ rows: ALL_ROWS.slice(0, 8) });
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          motion: 'off',
        };
      },
      steps: async (ctx) => {
        ctx.snapshot('最初(読み込み中の行)');
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('最初のブロックが届いた');
      },
    });
  }, 20000);

  it('取得の失敗・エラーバー(再試行 / 閉じる)・onServerSideLoadError・retryServerSideLoads', async () => {
    let server: FakeServer = createFakeServer();
    await expectParity({
      features: ['serverSide'],
      watch: ['onServerSideLoadError'],
      props: () => {
        server = createFakeServer();
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          // 届いた行のフェードインの印は時間(1.5 秒)で外れ、外れる時刻が両者の待ち方で前後するので止める(最初のテストで見る)。
          motion: 'off',
        };
      },
      steps: async (ctx) => {
        await waitForRequests(ctx);
        await ctx.act(() => server.fail(ctx));
        ctx.snapshot('取得に失敗');
        // 再試行のボタン。
        await ctx.act(() => {
          ctx.container.querySelector<HTMLButtonElement>('.ssg-ssrm-error-bar-retry')?.click();
        });
        ctx.snapshot('再試行中');
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('再試行で届いた');
        // 先へスクロールして失敗 → 閉じる。
        await scrollTo(ctx, 1500);
        await waitForRequests(ctx);
        await ctx.act(() => server.fail(ctx));
        ctx.snapshot('先のブロックで失敗');
        await ctx.act(() => {
          ctx.container.querySelector<HTMLButtonElement>('.ssg-ssrm-error-bar-close')?.click();
        });
        ctx.snapshot('閉じた');
        // 命令的 API で再試行。
        await ctx.act(() => {
          call(ctx, 'retryServerSideLoads');
        });
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('retryServerSideLoads で届いた');
      },
    });
  }, 20000);

  it('書き戻し(確定 / Delete / 貼り付け / チェックボックス)・保存の状態・失敗の巻き戻しとバー・onServerSideWriteError', async () => {
    let server: FakeServer = createFakeServer();
    await expectParity({
      features: ['serverSide'],
      watch: ['onServerSideWriteError'],
      props: () => {
        server = createFakeServer();
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          // 届いた行のフェードインの印は時間(1.5 秒)で外れ、外れる時刻が両者の待ち方で前後するので止める(最初のテストで見る)。
          motion: 'off',
        };
      },
      steps: async (ctx) => {
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        // エディタで確定。
        await focusCell(ctx, 1, 1);
        await keyOnShell(ctx, { key: 'Enter' });
        await ctx.act(() => {
          fireEvent.input(editorInput(ctx), { target: { value: '書き換えた' } });
        });
        await ctx.act(() => {
          fireEvent.keyDown(editorInput(ctx), { key: 'Enter' });
        });
        ctx.snapshot('確定(保存中)');
        await ctx.act(() => server.accept(ctx));
        ctx.snapshot('保存できた');
        await waitForSaveBadges(ctx);
        // reject の列の NG は書き戻さない。
        await focusCell(ctx, 2, 2);
        await keyOnShell(ctx, { key: 'Enter' });
        await ctx.act(() => {
          fireEvent.input(editorInput(ctx), { target: { value: '-5' } });
        });
        await ctx.act(() => {
          fireEvent.keyDown(editorInput(ctx), { key: 'Enter' });
        });
        ctx.snapshot('reject の NG');
        await ctx.act(() => {
          const input = ctx.container.querySelector('.ssg-cell-editor-input');
          if (input) {
            fireEvent.keyDown(input, { key: 'Escape' });
          }
        });
        // Delete で消す(範囲)。
        await ctx.act(() => {
          call(ctx, 'selectRange', { start: { row: 3, col: 1 }, end: { row: 4, col: 2 } });
          ctx.shell().focus();
        });
        await keyOnShell(ctx, { key: 'Delete' });
        ctx.snapshot('Delete(保存中)');
        await ctx.act(() => server.accept(ctx));
        await waitForSaveBadges(ctx);
        // 貼り付け(2 行 × 2 列)。
        await focusCell(ctx, 5, 1);
        await ctx.act(() => {
          fireEvent.paste(ctx.shell(), { clipboardData: { getData: () => 'A\t11\nB\t12' } });
        });
        ctx.snapshot('貼り付け(保存中)');
        await ctx.act(() => server.accept(ctx));
        await waitForSaveBadges(ctx);
        // チェックボックスを Space で。
        await focusCell(ctx, 7, 3);
        await keyOnShell(ctx, { key: ' ' });
        ctx.snapshot('チェックボックス(保存中)');
        // 失敗: 値を戻し、セルの印とバーを出す。
        await ctx.act(() => server.reject(ctx));
        ctx.snapshot('保存に失敗(戻した)');
        await ctx.act(() => {
          ctx.container.querySelector<HTMLButtonElement>('.ssg-ssrm-error-bar-close')?.click();
        });
        ctx.snapshot('保存の失敗のバーを閉じた');
        ctx.log('undo は無効', call(ctx, 'canUndo'));
      },
    });
  }, 20000);

  it('updateRows が無いときは編集しない(エディタ / Delete / 貼り付け / チェックボックス)', async () => {
    let server: FakeServer = createFakeServer({ withUpdateRows: false });
    await expectParity({
      features: ['serverSide'],
      props: () => {
        server = createFakeServer({ withUpdateRows: false });
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          motion: 'off',
          dimReadOnlyCells: true,
        };
      },
      steps: async (ctx) => {
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('届いた(編集できない見た目)');
        await focusCell(ctx, 1, 1);
        await keyOnShell(ctx, { key: 'Enter' });
        await keyOnShell(ctx, { key: 'a' });
        await keyOnShell(ctx, { key: 'Delete' });
        await ctx.act(() => {
          fireEvent.paste(ctx.shell(), { clipboardData: { getData: () => 'X' } });
        });
        await focusCell(ctx, 1, 3);
        await keyOnShell(ctx, { key: ' ' });
        ctx.snapshot('何も変わらない');
      },
    });
  }, 20000);

  it('並べ替え / 絞り込みで query が変わる(debounce・先頭へ戻す・展開行を閉じる・0 件の文言・件数)', async () => {
    let server: FakeServer = createFakeServer();
    await expectParity({
      features: ['serverSide', 'filtering'],
      watch: ['onExpandedDetailRowKeysChange', 'onScroll'],
      props: () => {
        server = createFakeServer();
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          motion: 'off',
          detailRow: { height: 60, render: (row: Row) => `詳細 ${row.id}` },
        };
      },
      steps: async (ctx) => {
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        // 展開行を開いてから、先へスクロール。
        await ctx.act(() => {
          call(ctx, 'setDetailRowExpanded', 2, true);
        });
        await scrollTo(ctx, 300);
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('展開して先へスクロール');
        // Shift + 見出しで並べ替え(query は debounce してから送る)。
        await ctx.act(() => {
          const header = ctx.header('qty');
          fireEvent.pointerDown(header, { ...pointer, shiftKey: true });
          fireEvent.pointerUp(window, { ...pointer, shiftKey: true });
        });
        ctx.snapshot('並べ替えた直後(まだ送らない)');
        await ctx.act(() => undefined, 400);
        ctx.snapshot('query が変わった(先頭へ・展開行を閉じる)');
        ctx.log('scrollTop', scroller(ctx).scrollTop);
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('並べ替えた結果が届いた');
        // もう一度開いて先へスクロールしてから、上のバーの検索欄で絞り込む(打ち終わってから送る)。
        await ctx.act(() => {
          call(ctx, 'setDetailRowExpanded', 5, true);
        });
        await scrollTo(ctx, 300);
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');
          if (!input) {
            throw new Error(`[${ctx.framework}] 検索欄がありません`);
          }
          fireEvent.input(input, { target: { value: '品目 1' } });
        });
        await ctx.act(() => undefined, 400);
        ctx.log('scrollTop', scroller(ctx).scrollTop);
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('絞り込んだ結果(件数)');
        await ctx.act(() => {
          const input = ctx.container.querySelector<HTMLInputElement>('.ssg-bar-input');
          if (input) {
            fireEvent.input(input, { target: { value: '該当なし' } });
          }
        });
        await ctx.act(() => undefined, 400);
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('0 件');
        ctx.log('状態', call(ctx, 'getState'));
      },
    });
  }, 20000);

  it('ラベル行と一緒に使う(届いた行だけを述語で見る)', async () => {
    const rowsWithLabels: Row[] = ALL_ROWS.slice(0, 60).map((row, i) =>
      i % 10 === 0 ? { ...row, kind: 'label', name: `セクション ${i / 10 + 1}` } : row,
    );
    let server: FakeServer = createFakeServer({ rows: rowsWithLabels });
    await expectParity({
      features: ['serverSide', 'labelRow'],
      props: () => {
        server = createFakeServer({ rows: rowsWithLabels });
        return {
          dataSource: server.dataSource,
          columns,
          rowKeyGetter: (row: Row) => row.id,
          rowHeight: 30,
          height: 360,
          motion: 'off',
          labelRow: { isLabelRow: (row: Row) => row.kind === 'label', getLabel: (row: Row) => row.name },
        };
      },
      steps: async (ctx) => {
        ctx.snapshot('読み込み中');
        await waitForRequests(ctx);
        await ctx.act(() => server.respond(ctx));
        ctx.snapshot('届いた(ラベル行)');
        await focusCell(ctx, 1, 1);
        await keyOnShell(ctx, { key: 'ArrowDown' });
        ctx.log('アクティブセル', call(ctx, 'getActiveCell'));
      },
    });
  }, 20000);
});