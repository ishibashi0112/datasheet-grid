// 追加(async-options): getFilterOptions 経由の候補取得コントローラのテストです(React 非依存で直接呼ぶ)。
//   開始 / 成功 / 失敗 / 中断(close・列切替)/ 古い応答の破棄 / 再試行 / 他列フィルターの除外を固定します。
import { describe, expect, it, vi } from 'vitest';
import {
  createAsyncSelectOptionsSource,
  omitOwnColumnFilter,
  selectAsyncOptionsResult,
  type AsyncSelectOptionsFetch,
  type AsyncSelectOptionsSourceArgs,
} from './asyncSelectOptionsSource';
import type { ColumnFilterValue, GridColumn } from '../model/gridTypes.unbound';

type Row = { name: string; category: string };
const nameColumn: GridColumn<Row> = { key: 'name', title: '名前', width: 120, filterType: 'set' };
const categoryColumn: GridColumn<Row> = { key: 'category', title: '区分', width: 120, filterType: 'set' };
const filters: Record<string, ColumnFilterValue> = {
  name: { kind: 'set', mode: 'include', values: ['a'] },
  category: { kind: 'text', value: 'x' },
};

type Deferred = {
  resolve: (value: { options: { label: string; value: string }[]; truncated?: boolean }) => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal;
  params: Parameters<AsyncSelectOptionsFetch<Row>>[0];
};

const makeFetch = () => {
  const calls: Deferred[] = [];
  const fetch = vi.fn<AsyncSelectOptionsFetch<Row>>(
    (params) =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject, signal: params.signal, params });
      }),
  );
  return { fetch, calls };
};

const args = (
  overrides: Partial<AsyncSelectOptionsSourceArgs<Row>>,
  fetch: AsyncSelectOptionsFetch<Row> | null,
): AsyncSelectOptionsSourceArgs<Row> => ({
  columnKey: 'name',
  column: nameColumn,
  columnFilters: filters,
  globalText: 'g',
  fetch,
  ...overrides,
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createAsyncSelectOptionsSource', () => {
  it('open で取得開始(他列フィルターだけを渡す)→ 成功で ready(options / allValues / truncated)', async () => {
    const { fetch, calls } = makeFetch();
    const source = createAsyncSelectOptionsSource<Row>();
    source.update(args({}, fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls[0].params.columnKey).toBe('name');
    expect(calls[0].params.column).toBe(nameColumn);
    expect(calls[0].params.columnFilters).toEqual({ category: { kind: 'text', value: 'x' } });
    expect(calls[0].params.globalText).toBe('g');
    expect(selectAsyncOptionsResult(source.getSnapshot(), 'name').status).toBe('loading');
    // 再レンダー(同じ列)では再取得しない。
    source.update(args({ globalText: 'changed' }, fetch));
    expect(fetch).toHaveBeenCalledTimes(1);

    calls[0].resolve({ options: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }], truncated: true });
    await tick();
    const result = selectAsyncOptionsResult(source.getSnapshot(), 'name');
    expect(result.status).toBe('ready');
    expect(result.options.map((o) => o.value)).toEqual(['a', 'b']);
    expect(Array.from(result.allValues)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
  });

  it('失敗で error(message)、retry で同じ列を取り直す。abort による reject は無視', async () => {
    const { fetch, calls } = makeFetch();
    const source = createAsyncSelectOptionsSource<Row>();
    source.update(args({}, fetch));
    calls[0].reject(new Error('ORA-12170'));
    await tick();
    const failed = selectAsyncOptionsResult(source.getSnapshot(), 'name');
    expect(failed.status).toBe('error');
    expect(failed.errorMessage).toBe('ORA-12170');

    source.retry();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(selectAsyncOptionsResult(source.getSnapshot(), 'name').status).toBe('loading');
    calls[1].resolve({ options: [] });
    await tick();
    expect(selectAsyncOptionsResult(source.getSnapshot(), 'name').status).toBe('ready');
  });

  it('close(columnKey null)で in-flight を abort し idle。遅れて来た応答は捨てる', async () => {
    const { fetch, calls } = makeFetch();
    const source = createAsyncSelectOptionsSource<Row>();
    source.update(args({}, fetch));
    source.update(args({ columnKey: null, column: null }, fetch));
    expect(calls[0].signal.aborted).toBe(true);
    expect(selectAsyncOptionsResult(source.getSnapshot(), null).status).toBe('idle');
    calls[0].resolve({ options: [{ label: 'late', value: 'late' }] });
    calls[0].reject(new DOMException('aborted', 'AbortError'));
    await tick();
    expect(source.getSnapshot().columnKey).toBeNull();
  });

  it('列切替で前の要求を abort し、新しい列の結果だけを表面化する(古い列の応答は捨てる)', async () => {
    const { fetch, calls } = makeFetch();
    const source = createAsyncSelectOptionsSource<Row>();
    source.update(args({}, fetch));
    source.update(args({ columnKey: 'category', column: categoryColumn }, fetch));
    expect(calls[0].signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls[1].params.columnFilters).toEqual({ name: { kind: 'set', mode: 'include', values: ['a'] } });
    // 前列の結果は不一致として loading 扱い。
    expect(selectAsyncOptionsResult(source.getSnapshot(), 'category').status).toBe('loading');
    calls[0].resolve({ options: [{ label: 'old', value: 'old' }] });
    calls[1].resolve({ options: [{ label: 'new', value: 'new' }] });
    await tick();
    const result = selectAsyncOptionsResult(source.getSnapshot(), 'category');
    expect(result.status).toBe('ready');
    expect(result.options.map((o) => o.value)).toEqual(['new']);
  });

  it('fetch が同期例外を投げても error になる。dispose で abort', async () => {
    const throwing: AsyncSelectOptionsFetch<Row> = () => {
      throw new Error('sync boom');
    };
    const source = createAsyncSelectOptionsSource<Row>();
    source.update(args({}, throwing));
    await tick();
    expect(selectAsyncOptionsResult(source.getSnapshot(), 'name').errorMessage).toBe('sync boom');

    const { fetch, calls } = makeFetch();
    const another = createAsyncSelectOptionsSource<Row>();
    another.update(args({}, fetch));
    another.dispose();
    expect(calls[0].signal.aborted).toBe(true);
  });

  it('omitOwnColumnFilter: 自列が無ければ同一参照、有れば自列を除いた新オブジェクト', () => {
    expect(omitOwnColumnFilter(filters, 'other')).toBe(filters);
    expect(omitOwnColumnFilter(filters, 'name')).toEqual({ category: { kind: 'text', value: 'x' } });
  });
});