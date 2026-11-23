// 追加(1.5.0 / serverSideRefetch="keep"): 取り直しの間も前の行を見せる形(refetch: 'keep')のテストです。
//   前の行(キャッシュ・件数・保存中の楽観行)を見せたまま新しいキャッシュへ取り、見えている範囲がそろったら(失敗したら)
//   一度に差し替えること、前の行を見せている間は書かないこと、既定('skeleton')は従来どおりであることを固定します。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerSideRowModel, type ServerSideRowModelArgs } from './serverSideRowModel';
import type { ServerSideDataSource, ServerSideUpdateRowsParams } from '../model/gridTypes.unbound';

type Row = { id: number; v: string };

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const colV = { key: 'v', title: 'v', width: 80 } as const;

type Request = {
  startIndex: number;
  endIndex: number;
  sort: string;
  resolve: (total?: number) => void;
  reject: (error: unknown) => void;
};

// 届けるのを手で決める擬似サーバー。行の値は「並び:位置」(sort ごとに違う値)、行のキーは並びに関係なく位置 + 並びの番号。
const setup = (refetch: ServerSideRowModelArgs<Row>['refetch'], { total = 250 } = {}) => {
  const requests: Request[] = [];
  const writes: { params: ServerSideUpdateRowsParams<Row>; resolve: () => void }[] = [];
  const dataSource: ServerSideDataSource<Row> = {
    blockSize: 100,
    getRows: ({ startIndex, endIndex, query }) =>
      new Promise((resolve, reject) => {
        const sort = String((query as unknown as { sort?: string }).sort ?? 'a');
        requests.push({
          startIndex,
          endIndex,
          sort,
          resolve: (count = total) => {
            const rows: Row[] = [];
            for (let i = startIndex; i < Math.min(endIndex, count); i += 1) rows.push({ id: i, v: `${sort}:${i}` });
            resolve({ rows, totalRowCount: count });
          },
          reject,
        });
      }),
    updateRows: (params) =>
      new Promise<void>((resolve) => {
        writes.push({ params, resolve });
      }),
  };
  let args: ServerSideRowModelArgs<Row> = {
    dataSource,
    rowKeyGetter: (row) => row.id,
    query: { sort: 'a' } as never,
    queryKey: 'a',
    refetch,
  };
  const controller = createServerSideRowModel<Row>(args);
  const update = (patch: Partial<ServerSideRowModelArgs<Row>>) => {
    args = { ...args, ...patch };
    controller.update(args);
  };
  const take = (predicate: (request: Request) => boolean) => {
    const index = requests.findIndex(predicate);
    if (index < 0) throw new Error('要求がありません');
    return requests.splice(index, 1)[0]!;
  };
  const row = (index: number) => controller.getSnapshot().rowModel.getRow(index) as Row | undefined;
  return { controller, update, requests, writes, take, row, snapshot: () => controller.getSnapshot() };
};

// 初めの読み込み(block 0)と見えている範囲 [0, 30)。
const loadFirst = async (grid: ReturnType<typeof setup>) => {
  grid.update({});
  grid.take((r) => r.startIndex === 0).resolve();
  await flush();
  grid.controller.requestRange(0, 30);
  vi.advanceTimersByTime(200);
  await flush();
};

describe('serverSideRowModel(refetch: keep)', () => {
  it('並びを変えると前の行を見せたまま取り、見えている範囲が届いたら一度に差し替える', async () => {
    const grid = setup('keep');
    await loadFirst(grid);
    expect(grid.row(3)?.v).toBe('a:3');
    expect(grid.snapshot().refetching).toBe(false);
    grid.update({ query: { sort: 'b' } as never, queryKey: 'b' });
    // 前の行・件数のまま、取り直している印。
    expect(grid.snapshot().refetching).toBe(true);
    expect(grid.row(3)?.v).toBe('a:3');
    expect(grid.controller.isRowLoaded(3)).toBe(true);
    // 新しい並びの block 0 が届いた(件数が 120 に減った)。
    grid.take((r) => r.sort === 'b' && r.startIndex === 0).resolve(120);
    await flush();
    expect(grid.snapshot().refetching).toBe(false);
    expect(grid.row(3)?.v).toBe('b:3');
    expect(grid.snapshot().rowCount).toBe(120);
  });

  it('新しい条件で 0 件になったら、届いた時点で 0 件に差し替える', async () => {
    const grid = setup('keep');
    await loadFirst(grid);
    grid.update({ query: { sort: 'z' } as never, queryKey: 'z' });
    grid.controller.requestRange(0, 30);
    expect(grid.snapshot().rowCount).toBe(250);
    grid.take((r) => r.sort === 'z' && r.startIndex === 0).resolve(0);
    await flush();
    expect(grid.snapshot().refetching).toBe(false);
    expect(grid.snapshot().rowCount).toBe(0);
  });

  it('refresh() は今の範囲のブロックがすべてそろうまで前の行を見せ、範囲の外のブロックは待たない', async () => {
    const grid = setup('keep');
    await loadFirst(grid);
    // 範囲 [90, 130) = block 0 と 1。
    grid.controller.requestRange(90, 130);
    vi.advanceTimersByTime(200);
    await flush();
    grid.take((r) => r.startIndex === 100).resolve();
    await flush();
    expect(grid.row(120)?.v).toBe('a:120');
    grid.update({ query: { sort: 'c' } as never });
    grid.controller.refresh();
    expect(grid.snapshot().refetching).toBe(true);
    vi.advanceTimersByTime(200);
    await flush();
    grid.take((r) => r.sort === 'c' && r.startIndex === 100).resolve();
    await flush();
    // block 0 がまだなので差し替えない(一部だけ新しい行が混ざらない)。
    expect(grid.snapshot().refetching).toBe(true);
    expect(grid.row(95)?.v).toBe('a:95');
    expect(grid.row(120)?.v).toBe('a:120');
    grid.take((r) => r.sort === 'c' && r.startIndex === 0).resolve();
    await flush();
    expect(grid.snapshot().refetching).toBe(false);
    expect(grid.row(95)?.v).toBe('c:95');
    expect(grid.row(120)?.v).toBe('c:120');
    // block 2 は範囲の外なので取りに行っていない(待ってもいない)。
    expect(grid.requests.some((r) => r.startIndex === 200)).toBe(false);
  });

  it('見えている範囲のブロックが失敗したら、前の行をやめて失敗の印(読み込み中の行)と再試行のバーを見せる', async () => {
    const grid = setup('keep');
    await loadFirst(grid);
    grid.update({ query: { sort: 'b' } as never, queryKey: 'b' });
    grid.take((r) => r.sort === 'b' && r.startIndex === 0).reject(new Error('boom'));
    await flush();
    const snapshot = grid.snapshot();
    expect(snapshot.refetching).toBe(false);
    expect(snapshot.loadError).toEqual({ failedBlockCount: 1 });
    expect(grid.row(3)).toBeUndefined();
  });

  it('取り直している間にまた並びを変えたら、最初の前の行を見せたまま、途中まで届いた新しい行は捨てる', async () => {
    const grid = setup('keep');
    await loadFirst(grid);
    grid.controller.requestRange(90, 130);
    vi.advanceTimersByTime(200);
    await flush();
    grid.take((r) => r.startIndex === 100).resolve();
    await flush();
    // シェルは queryKey が変わると描く窓を知らせ直す(ここでは同じ窓のまま)。
    grid.update({ query: { sort: 'b' } as never, queryKey: 'b' });
    grid.controller.requestRange(90, 130);
    vi.advanceTimersByTime(200);
    await flush();
    grid.take((r) => r.sort === 'b' && r.startIndex === 100).resolve();
    await flush();
    expect(grid.snapshot().refetching).toBe(true);
    grid.update({ query: { sort: 'c' } as never, queryKey: 'c' });
    grid.controller.requestRange(90, 130);
    expect(grid.snapshot().refetching).toBe(true);
    expect(grid.row(120)?.v).toBe('a:120');
    // 先に出した並び b の block 0 は止めている(遅れて届いても使わない)。
    grid.take((r) => r.sort === 'b' && r.startIndex === 0).resolve();
    await flush();
    expect(grid.snapshot().refetching).toBe(true);
    expect(grid.row(95)?.v).toBe('a:95');
    vi.advanceTimersByTime(200);
    await flush();
    grid.take((r) => r.sort === 'c' && r.startIndex === 0).resolve();
    grid.take((r) => r.sort === 'c' && r.startIndex === 100).resolve();
    await flush();
    expect(grid.snapshot().refetching).toBe(false);
    expect(grid.row(120)?.v).toBe('c:120');
  });

  it('前の行を見せている間は書かず、取り直す前の保存中の値は前の行に出したまま、保存できたら前の行へ確定する', async () => {
    const grid = setup('keep');
    await loadFirst(grid);
    expect(grid.controller.applyCellEdits([{ viewIndex: 2, column: colV as never, value: 'edited' }])).toBe(1);
    expect(grid.row(2)?.v).toBe('edited');
    // 保存中に並びを変えた: 前の行(保存中の楽観値つき)を見せたまま、保存の決着を待つ。
    grid.update({ query: { sort: 'b' } as never, queryKey: 'b' });
    expect(grid.snapshot().refetching).toBe(true);
    expect(grid.row(2)?.v).toBe('edited');
    // 前の行を見せている間の書き込みは受け付けない。
    expect(grid.controller.applyCellEdits([{ viewIndex: 3, column: colV as never, value: 'x' }])).toBe(0);
    expect(grid.writes).toHaveLength(1);
    expect(grid.requests.some((r) => r.sort === 'b')).toBe(false);
    grid.writes[0]!.resolve();
    await flush();
    // 保存できた値は前の行のまま(保存前の値へ戻らない)。決着を待った後に新しい並びを取る。
    expect(grid.row(2)?.v).toBe('edited');
    expect(grid.snapshot().refetching).toBe(true);
    grid.take((r) => r.sort === 'b' && r.startIndex === 0).resolve();
    await flush();
    expect(grid.snapshot().refetching).toBe(false);
    expect(grid.row(2)?.v).toBe('b:2');
  });

  it('前の行が無いとき(初めての取得)と、既定(skeleton)では、取り直しは読み込み中の行になる', async () => {
    const keep = setup('keep');
    keep.update({});
    expect(keep.snapshot().refetching).toBe(false);
    keep.update({ query: { sort: 'b' } as never, queryKey: 'b' });
    expect(keep.snapshot().refetching).toBe(false);

    const skeleton = setup(undefined);
    await loadFirst(skeleton);
    expect(skeleton.row(3)?.v).toBe('a:3');
    skeleton.update({ query: { sort: 'b' } as never, queryKey: 'b' });
    expect(skeleton.snapshot().refetching).toBe(false);
    expect(skeleton.row(3)).toBeUndefined();
  });
});