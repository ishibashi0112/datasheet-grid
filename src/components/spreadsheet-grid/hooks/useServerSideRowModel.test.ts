// useServerSideRowModel(SSRM フック)の挙動テストです(DS-4 ②)。
//   性質ベースで検証します: 件数ブートストラップ(block 0 先行 fetch)/ debounce 合体 /
//   in-flight 重複排除 / stale キャンセル(abort)/ getRow・isRowLoaded / queryKey 無効化 /
//   unmount abort。renderHook が DOM を要するため本ファイルのみ jsdom にします。
//   getRows はモックで、解決を自動/保留で切り替えられます(in-flight 検証は保留モードで行います)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServerSideRowModel } from './useServerSideRowModel';
import type {
  ServerSideDataSource,
  ServerSideGetRowsParams,
  ServerSideGetRowsResult,
} from '../model/gridTypes';

type Row = { v: number };

const rowKeyGetter = (row: Row): number => row.v;
const EMPTY_QUERY = {} as const;

type Recording = {
  dataSource: ServerSideDataSource<Row>;
  getRows: ReturnType<typeof vi.fn>;
  calls: ServerSideGetRowsParams[];
};

// 記録つき getRows を持つ dataSource を作ります。autoResolve=false なら解決しない Promise を返し、
//   in-flight 状態(重複排除 / abort)を検査できます。startIndex/endIndex は必ず尊重します。
const createRecording = (opts: {
  totalRowCount: number;
  initialRowCount?: number;
  blockSize?: number;
  maxCachedBlocks?: number;
  autoResolve?: boolean;
}): Recording => {
  const calls: ServerSideGetRowsParams[] = [];
  const blockSize = opts.blockSize ?? 100;
  const autoResolve = opts.autoResolve ?? true;
  const getRows = vi.fn(
    (params: ServerSideGetRowsParams): Promise<ServerSideGetRowsResult<Row>> => {
      calls.push(params);
      if (!autoResolve) {
        return new Promise<ServerSideGetRowsResult<Row>>(() => {});
      }
      const rows: Row[] = [];
      for (let i = params.startIndex; i < params.endIndex; i += 1) {
        rows.push({ v: i });
      }
      return Promise.resolve({ rows, totalRowCount: opts.totalRowCount });
    },
  );
  const dataSource: ServerSideDataSource<Row> = {
    getRows,
    initialRowCount: opts.initialRowCount,
    blockSize,
    maxCachedBlocks: opts.maxCachedBlocks,
  };
  return { dataSource, getRows, calls };
};

// マイクロタスクを数回流します(getRows().then(...) チェーンの解決用)。
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

// debounce タイマーを進めて runFetch を発火し、続く fetch の解決まで流します。
const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

// calls から startIndex の昇順ユニーク配列を作ります(どのブロックを取得したかの指標)。
const startedBlocks = (calls: ServerSideGetRowsParams[], blockSize: number): number[] => {
  const set = new Set<number>();
  for (const c of calls) {
    set.add(c.startIndex / blockSize);
  }
  return Array.from(set).sort((a, b) => a - b);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const DEBOUNCE = 120;

describe('useServerSideRowModel', () => {
  it('initialRowCount 未指定なら block 0 を先行 fetch して件数を確定する(ブートストラップ)', async () => {
    const rec = createRecording({ totalRowCount: 1000 });
    const { result } = renderHook(() =>
      useServerSideRowModel<Row>({
        dataSource: rec.dataSource,
        rowKeyGetter,
        query: EMPTY_QUERY,
        queryKey: 'a',
      }),
    );
    await flush();
    // block 0 だけが取得され、totalRowCount が反映される。
    expect(startedBlocks(rec.calls, 100)).toEqual([0]);
    expect(rec.calls[0]).toMatchObject({ startIndex: 0, endIndex: 100 });
    expect(result.current.rowCount).toBe(1000);
    expect(result.current.rowModel.getRowCount()).toBe(1000);
    expect(result.current.rowModel.getRow(0)).toEqual({ v: 0 });
    expect(result.current.isRowLoaded(0)).toBe(true);
    expect(result.current.isRowLoaded(500)).toBe(false);
  });

  it('getSourceIndex は恒等 / 未ロード getRowKey は viewIndex', async () => {
    const rec = createRecording({ totalRowCount: 1000 });
    const { result } = renderHook(() =>
      useServerSideRowModel<Row>({
        dataSource: rec.dataSource,
        rowKeyGetter,
        query: EMPTY_QUERY,
        queryKey: 'a',
      }),
    );
    await flush();
    expect(result.current.rowModel.getSourceIndex(42)).toBe(42);
    // block 0 はロード済み → rowKeyGetter(row.v)。未ロード行は viewIndex。
    expect(result.current.rowModel.getRowKey(3)).toBe(3);
    expect(result.current.rowModel.getRowKey(900)).toBe(900);
  });

  it('requestRange は debounce で合体し、最新レンジのブロックだけ取得する', async () => {
    const rec = createRecording({ totalRowCount: 1000, initialRowCount: 1000 });
    const { result } = renderHook(() =>
      useServerSideRowModel<Row>({
        dataSource: rec.dataSource,
        rowKeyGetter,
        query: EMPTY_QUERY,
        queryKey: 'a',
      }),
    );
    // initialRowCount 既知 → ブートストラップ fetch なし。
    await flush();
    expect(rec.calls.length).toBe(0);
    act(() => {
      result.current.requestRange(0, 200);
      result.current.requestRange(0, 300);
    });
    // debounce 未発火では未取得。
    expect(rec.calls.length).toBe(0);
    await advance(DEBOUNCE);
    // 最新 [0,300) のブロック 0,1,2 のみ、各 1 回。
    expect(startedBlocks(rec.calls, 100)).toEqual([0, 1, 2]);
    expect(rec.calls.length).toBe(3);
  });

  it('in-flight 中の同一ブロックは二重 fetch しない(重複排除)', async () => {
    const rec = createRecording({
      totalRowCount: 1000,
      initialRowCount: 1000,
      autoResolve: false,
    });
    const { result } = renderHook(() =>
      useServerSideRowModel<Row>({
        dataSource: rec.dataSource,
        rowKeyGetter,
        query: EMPTY_QUERY,
        queryKey: 'a',
      }),
    );
    await flush();
    act(() => {
      result.current.requestRange(0, 200);
    });
    await advance(DEBOUNCE);
    // block 0,1 が in-flight(未解決)。
    expect(startedBlocks(rec.calls, 100)).toEqual([0, 1]);
    act(() => {
      result.current.requestRange(0, 300);
    });
    await advance(DEBOUNCE);
    // 0,1 は in-flight のため skip、新規 2 のみ追加。各ブロック 1 回。
    expect(startedBlocks(rec.calls, 100)).toEqual([0, 1, 2]);
    expect(rec.calls.length).toBe(3);
  });

  it('範囲外になった in-flight は abort される(stale キャンセル)', async () => {
    const rec = createRecording({
      totalRowCount: 1000,
      initialRowCount: 1000,
      autoResolve: false,
    });
    const { result } = renderHook(() =>
      useServerSideRowModel<Row>({
        dataSource: rec.dataSource,
        rowKeyGetter,
        query: EMPTY_QUERY,
        queryKey: 'a',
      }),
    );
    await flush();
    act(() => {
      result.current.requestRange(0, 200);
    });
    await advance(DEBOUNCE);
    const block0Signal = rec.calls[0].signal;
    const block1Signal = rec.calls[1].signal;
    expect(block0Signal.aborted).toBe(false);
    // 遠くへスクロール → 0,1 は不要に。
    act(() => {
      result.current.requestRange(500, 700);
    });
    await advance(DEBOUNCE);
    // 旧ブロックの signal が abort され、新ブロック 5,6 が取得される。
    expect(block0Signal.aborted).toBe(true);
    expect(block1Signal.aborted).toBe(true);
    expect(startedBlocks(rec.calls, 100)).toEqual([0, 1, 5, 6]);
  });

  it('queryKey 変化で旧キャッシュを破棄し再取得する', async () => {
    const rec = createRecording({ totalRowCount: 1000 });
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        useServerSideRowModel<Row>({
          dataSource: rec.dataSource,
          rowKeyGetter,
          query: EMPTY_QUERY,
          queryKey,
        }),
      { initialProps: { queryKey: 'a' } },
    );
    await flush();
    expect(result.current.rowModel.getRow(0)).toEqual({ v: 0 });
    const callsAfterFirst = rec.calls.length;
    // queryKey を変える → キャッシュ破棄 + 再ブートストラップ。
    rerender({ queryKey: 'b' });
    await flush();
    // block 0 が再取得され、ロードし直される。
    expect(rec.calls.length).toBeGreaterThan(callsAfterFirst);
    expect(result.current.rowModel.getRow(0)).toEqual({ v: 0 });
  });

  it('unmount で in-flight を abort する', async () => {
    const rec = createRecording({
      totalRowCount: 1000,
      initialRowCount: 1000,
      autoResolve: false,
    });
    const { result, unmount } = renderHook(() =>
      useServerSideRowModel<Row>({
        dataSource: rec.dataSource,
        rowKeyGetter,
        query: EMPTY_QUERY,
        queryKey: 'a',
      }),
    );
    await flush();
    act(() => {
      result.current.requestRange(0, 200);
    });
    await advance(DEBOUNCE);
    const signals = rec.calls.map((c) => c.signal);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.aborted)).toBe(false);
    unmount();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('initialRowCount 既知でも queryKey 変化で block 0 を再取得し、totalRowCount で件数を更新する', async () => {
    // 再クエリ時のサーバ件数(フィルターで 1000 → 30 に減る想定)。
    let total = 1000;
    const calls: ServerSideGetRowsParams[] = [];
    const dataSource: ServerSideDataSource<Row> = {
      initialRowCount: 1000,
      getRows: (params) => {
        calls.push(params);
        const rows: Row[] = [];
        for (let i = params.startIndex; i < params.endIndex && i < total; i += 1) {
          rows.push({ v: i });
        }
        return Promise.resolve({ rows, totalRowCount: total });
      },
    };
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        useServerSideRowModel<Row>({
          dataSource,
          rowKeyGetter,
          query: EMPTY_QUERY,
          queryKey,
        }),
      { initialProps: { queryKey: 'a' } },
    );
    await flush();
    // initialRowCount 既知 → mount ではブートストラップしない(requestRange 駆動)。
    expect(calls.length).toBe(0);
    expect(result.current.rowCount).toBe(1000);

    // フィルター適用相当: queryKey 変化 + サーバ件数が 30 に変わる。
    total = 30;
    rerender({ queryKey: 'b' });
    await flush();
    // 再クエリでは initialRowCount 既知でも block 0 を取り直す。
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].startIndex).toBe(0);
    // endIndex は全幅要求(クランプ撤去のため 30 でなく 100)。
    expect(calls[0].endIndex).toBe(100);
    // totalRowCount で件数追従(initialRowCount=1000 へ戻らない)。
    expect(result.current.rowCount).toBe(30);
    expect(result.current.rowModel.getRowCount()).toBe(30);
  });

  it('再クエリ直後は件数を保持し(リセットしない)、block 0 解決後に更新する', async () => {
    let resolveFn: ((r: ServerSideGetRowsResult<Row>) => void) | null = null;
    const dataSource: ServerSideDataSource<Row> = {
      initialRowCount: 1000,
      getRows: () =>
        new Promise<ServerSideGetRowsResult<Row>>((resolve) => {
          resolveFn = resolve;
        }),
    };
    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: string }) =>
        useServerSideRowModel<Row>({
          dataSource,
          rowKeyGetter,
          query: EMPTY_QUERY,
          queryKey,
        }),
      { initialProps: { queryKey: 'a' } },
    );
    await flush();
    expect(result.current.rowCount).toBe(1000);

    rerender({ queryKey: 'b' });
    await flush();
    // block 0 は in-flight(未解決)。件数は前回値 1000 を保持し、リセットされない。
    expect(result.current.rowCount).toBe(1000);

    // block 0 が解決 → 件数追従(7 件)で一度だけ更新。
    await act(async () => {
      resolveFn?.({ rows: [{ v: 0 }], totalRowCount: 7 });
      await Promise.resolve();
    });
    expect(result.current.rowCount).toBe(7);
  });
});