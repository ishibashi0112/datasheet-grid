// 追加(ことばで絞り込み): 入口 /ai の GridAskBar を本物のグリッドと組み合わせ、偽の ask で確かめます。
//   送る(Enter / 例)・変換中の Enter・止める(ボタン / Esc)・反映とチップ・元に戻す・表を手で変えたあと・失敗の表示・
//   列の表示・行のデータを送らないこと。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, screen, within } from '@testing-library/react';
import { Activity, createRef, useState, type RefObject } from 'react';

import { SpreadsheetGrid } from '../SpreadsheetGrid';
import { GridAskBar, type GridAsk, type GridAskBarProps } from '../ai';
import type { GridColumn, GridState, SpreadsheetGridHandle } from '../model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
});

type Row = { id: number; name: string; warehouse: string; stock: number };

const baseColumns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60 },
  { key: 'name', title: '品名', width: 160, filterType: 'textSet' },
  {
    key: 'warehouse',
    title: '倉庫',
    width: 80,
    filterType: 'set',
    filterOptions: [
      { value: '東京', label: '東京' },
      { value: '大阪', label: '大阪' },
    ],
  },
  { key: 'stock', title: '在庫数', width: 80, filterType: 'numberSet' },
];

const rows: Row[] = [
  { id: 1, name: 'ボールペン', warehouse: '東京', stock: 240 },
  { id: 2, name: 'ノート', warehouse: '大阪', stock: 8 },
  { id: 3, name: '付箋', warehouse: '東京', stock: 5 },
  { id: 4, name: 'チェア', warehouse: '東京', stock: 12 },
];

const filter = (column: string, op: string, extra: Record<string, unknown> = {}) => ({
  column,
  op,
  value: null,
  values: null,
  to: null,
  ...extra,
});

const answerOf = (extra: Record<string, unknown>) => ({
  mode: 'replace',
  filters: [],
  sort: null,
  search: null,
  hide: [],
  show: [],
  unsupported: null,
  ...extra,
});

// 東京の在庫が 10 個以下を、在庫の多い順に
const tokyoLowStock = answerOf({
  filters: [filter('warehouse', 'in', { values: ['東京'] }), filter('stock', '<=', { value: '10' })],
  sort: [{ column: 'stock', direction: 'desc' }],
});

type Harness = {
  grid: RefObject<SpreadsheetGridHandle<Row> | null>;
  input: HTMLInputElement;
  columnsLog: GridColumn<Row>[][];
};

const setup = (ask: GridAsk, props: Partial<GridAskBarProps<Row>> = {}): Harness => {
  const grid = createRef<SpreadsheetGridHandle<Row>>();
  const columnsLog: GridColumn<Row>[][] = [];
  function App() {
    const [columns, setColumns] = useState(baseColumns);
    return (
      <>
        <GridAskBar grid={grid} columns={columns} ask={ask} {...props} />
        <SpreadsheetGrid
          ref={grid}
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          onColumnsChange={(next) => {
            columnsLog.push(next);
            setColumns(next);
          }}
        />
      </>
    );
  }
  render(<App />);
  return { grid, input: screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, columnsLog };
};

const viewIds = (grid: Harness['grid']): unknown[] =>
  grid.current!.getExportData({ scope: 'view' }).rows.map((cells) => cells[0].value);

const typeAndEnter = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.submit(input.form!);
};

// 偽の ask の答えが反映されるまで待ちます(ask の Promise と、その後の setState)。
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('GridAskBar(結合)', () => {
  it('文を送ると頼みを ask に渡し、答えを検査して反映し、チップを出す', async () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const onApply = vi.fn();
    const { grid, input, columnsLog } = setup(ask, { onApply });
    typeAndEnter(input, '東京の在庫が 10 個以下を多い順に');
    await flush();

    expect(ask).toHaveBeenCalledTimes(1);
    const [request, context] = ask.mock.calls[0];
    expect(request.text).toBe('東京の在庫が 10 個以下を多い順に');
    expect(request.prompt).toContain('- stock "在庫数": number.');
    expect(request.prompt).toContain('values: "東京", "大阪"');
    expect(request.schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(context.signal).toBeInstanceOf(AbortSignal);
    // 行のデータは送らない(列定義の候補にない値は出てこない)
    expect(request.prompt).not.toContain('ボールペン');
    expect(request.prompt).not.toContain('240');

    expect(viewIds(grid)).toEqual([3]);
    expect(grid.current!.getState().sort).toEqual([{ columnKey: 'stock', direction: 'desc' }]);
    const result = screen.getByText('反映した条件').closest('.ssg-ask-result') as HTMLElement;
    const chips = within(result).getAllByRole('listitem').map((item) => item.textContent);
    expect(chips).toEqual(['倉庫"東京"×', '在庫数10 以下×', '並び在庫数 降順×']);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ text: '東京の在庫が 10 個以下を多い順に', dropped: [], unsupported: null }),
    );
    // 列の表示が変わらないときは onColumnsChange を呼ばない
    expect(columnsLog).toHaveLength(0);
  });

  it('変換を確定する Enter では送らない(isComposing / keyCode 229)', () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const { input } = setup(ask);
    fireEvent.change(input, { target: { value: 'とうきょう' } });
    const composing = fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    const safari = fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(composing).toBe(false);
    expect(safari).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('止めるボタンと Esc で取り消し、届いた答えは捨てる', async () => {
    let resolveAnswer: (value: unknown) => void = () => {};
    const signals: AbortSignal[] = [];
    const ask = vi.fn<GridAsk>(
      (_request, { signal }) =>
        new Promise((resolve) => {
          signals.push(signal);
          resolveAnswer = resolve;
        }),
    );
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { grid, input } = setup(ask);
    typeAndEnter(input, '東京だけ');
    expect(screen.getByText(/考えています/)).toBeTruthy();
    // 送った直後のクリック(「聞く」のダブルクリックの 2 回目)では止めない
    fireEvent.click(screen.getByRole('button', { name: '止める' }));
    expect(signals[0].aborted).toBe(false);
    now += 600;
    fireEvent.click(screen.getByRole('button', { name: '止める' }));
    clock.mockRestore();
    expect(signals[0].aborted).toBe(true);
    expect(screen.queryByText(/考えています/)).toBeNull();
    await act(async () => {
      resolveAnswer(tokyoLowStock);
      await Promise.resolve();
    });
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
    expect(screen.queryByText('反映した条件')).toBeNull();

    typeAndEnter(input, '東京だけ');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(signals[1].aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('聞いている間に Activity で隠して戻しても、考えているまま固まらない', async () => {
    const signals: AbortSignal[] = [];
    const ask = vi.fn<GridAsk>(
      (_request, { signal }) =>
        new Promise(() => {
          signals.push(signal);
        }),
    );
    const grid = createRef<SpreadsheetGridHandle<Row>>();
    function App({ mode }: { mode: 'visible' | 'hidden' }) {
      return (
        <>
          <Activity mode={mode}>
            <GridAskBar grid={grid} columns={baseColumns} ask={ask} />
          </Activity>
          <SpreadsheetGrid ref={grid} columns={baseColumns} rows={rows} rowKeyGetter={(row) => row.id} />
        </>
      );
    }
    const { rerender } = render(<App mode="visible" />);
    const input = screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement;
    typeAndEnter(input, '東京だけ');
    expect(screen.getByText(/考えています/)).toBeTruthy();
    rerender(<App mode="hidden" />);
    expect(signals[0].aborted).toBe(true);
    rerender(<App mode="visible" />);
    expect(screen.queryByText(/考えています/)).toBeNull();
    typeAndEnter(input, '東京だけ');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('元に戻すと頼む前の見え方へ戻す', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    act(() => {
      grid.current!.applyState({ ...grid.current!.getState(), filters: { globalText: 'ノ', columnFilters: {} } });
    });
    typeAndEnter(input, '東京の在庫が少ないもの');
    await flush();
    expect(viewIds(grid)).toEqual([3]);
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(grid.current!.getState().filters).toEqual({ globalText: 'ノ', columnFilters: {} });
    expect(grid.current!.getState().sort).toEqual([]);
    expect(viewIds(grid)).toEqual([2]);
    expect(screen.getByText('元に戻しました。')).toBeTruthy();
  });

  it('反映したあと表を手で変えたら、元に戻さず知らせる', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await flush();
    act(() => {
      grid.current!.applyState({ ...grid.current!.getState(), sort: [{ columnKey: 'id', direction: 'asc' }] });
    });
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByText(/表の条件が変わったので/)).toBeTruthy();
    expect(grid.current!.getState().sort).toEqual([{ columnKey: 'id', direction: 'asc' }]);
    expect(viewIds(grid)).toEqual([3]);
  });

  it('押したボタンが消えたら、フォーカスを次のチップか入力欄へ移す', async () => {
    const { input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await flush();
    const first = screen.getByRole('button', { name: '倉庫 "東京" を外す' });
    first.focus();
    fireEvent.click(first);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '在庫数 10 以下 を外す' }));
    // 最後のチップを外したら前のチップへ
    const last = screen.getByRole('button', { name: '並び 在庫数 降順 を外す' });
    last.focus();
    fireEvent.click(last);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '在庫数 10 以下 を外す' }));
    const undo = screen.getByRole('button', { name: '元に戻す' });
    undo.focus();
    fireEvent.click(undo);
    expect(document.activeElement).toBe(input);
    const close = screen.getByRole('button', { name: '閉じる' });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(input);
  });

  it('読み上げの領域(aria-live)は空の間も置いておく', () => {
    setup(async () => tokyoLowStock);
    const live = document.querySelector('.ssg-ask-output');
    expect(live?.getAttribute('aria-live')).toBe('polite');
  });

  it('列の表示を任せていないとき、手で隠した列があっても元に戻せて、その列は隠したまま', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await flush();
    act(() => {
      const state = grid.current!.getState();
      grid.current!.applyState({
        ...state,
        columns: (state.columns ?? []).map((entry) => (entry.key === 'name' ? { ...entry, visible: false } : entry)),
      });
    });
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.queryByText(/表の条件が変わったので/)).toBeNull();
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
    const hidden = (grid.current!.getState().columns ?? []).filter((entry) => entry.visible === false);
    expect(hidden.map((entry) => entry.key)).toEqual(['name']);
  });

  it('サーバーのエラー({ error })は表を変えずに知らせる', async () => {
    const { grid, input } = setup(async () => ({ error: 'Too many requests' }));
    act(() => {
      grid.current!.applyState({ ...grid.current!.getState(), filters: { globalText: 'ノ', columnFilters: {} } });
    });
    typeAndEnter(input, '東京だけ');
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('AI の答えが表への指示になっていませんでした。');
    expect(grid.current!.getState().filters.globalText).toBe('ノ');
    expect(screen.queryByText('反映した条件')).toBeNull();
  });

  it('チップの × でその条件だけ外し、外したあとも元に戻せる', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await flush();
    fireEvent.click(screen.getByRole('button', { name: '倉庫 "東京" を外す' }));
    expect(viewIds(grid)).toEqual([2, 3]);
    expect(grid.current!.getState().filters.columnFilters).not.toHaveProperty('warehouse');
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
  });

  it('使えなかった部分と AI からのひとことを出す', async () => {
    const { input } = setup(async () =>
      answerOf({
        filters: [filter('color', 'in', { values: ['赤'] }), filter('warehouse', 'in', { values: ['福岡'] })],
        unsupported: '色の列が無いので、色では絞り込めませんでした。',
      }),
    );
    typeAndEnter(input, '赤いもの');
    await flush();
    expect(screen.getByText('変える条件はありませんでした。')).toBeTruthy();
    expect(screen.getByText('「color」という列はありません')).toBeTruthy();
    expect(screen.getByText('倉庫: 「福岡」は候補にありません')).toBeTruthy();
    expect(screen.getByText('AI から: 色の列が無いので、色では絞り込めませんでした。')).toBeTruthy();
  });

  it('ask の失敗と読めない答えは、表を変えずに知らせる', async () => {
    const onError = vi.fn();
    const failure = new Error('network');
    const ask = vi.fn<GridAsk>().mockRejectedValueOnce(failure).mockResolvedValueOnce('すみません、わかりません');
    const { grid, input } = setup(ask, { onError });
    typeAndEnter(input, '東京だけ');
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('AI に聞けませんでした。');
    expect(onError).toHaveBeenCalledWith(failure);

    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('AI の答えを読めませんでした。');
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
  });

  it('例の文を押すとその文で聞く', async () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const { input } = setup(ask, { examples: ['東京の在庫が 10 個以下'] });
    fireEvent.click(screen.getByRole('button', { name: '東京の在庫が 10 個以下' }));
    await flush();
    expect(ask.mock.calls[0][0].text).toBe('東京の在庫が 10 個以下');
    expect(input.value).toBe('東京の在庫が 10 個以下');
  });

  it('allowColumnVisibility で列を隠し、元に戻すで見せる', async () => {
    const { grid, input, columnsLog } = setup(async () => answerOf({ hide: ['stock'] }), {
      allowColumnVisibility: true,
    });
    typeAndEnter(input, '在庫数の列を隠して');
    await flush();
    const hidden = (state: GridState) => (state.columns ?? []).filter((entry) => entry.visible === false).map((entry) => entry.key);
    expect(hidden(grid.current!.getState())).toEqual(['stock']);
    expect(columnsLog).toHaveLength(1);
    expect(screen.getByRole('button', { name: '隠した列 在庫数 を外す' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(hidden(grid.current!.getState())).toEqual([]);
    expect(columnsLog).toHaveLength(2);
  });

  it('列の表示を許していなければ隠さない', async () => {
    const { grid, input, columnsLog } = setup(async () => answerOf({ hide: ['stock'] }));
    typeAndEnter(input, '在庫数の列を隠して');
    await flush();
    expect(columnsLog).toHaveLength(0);
    expect((grid.current!.getState().columns ?? []).some((entry) => entry.visible === false)).toBe(false);
    expect(screen.getByText('列の表示は変えない設定です')).toBeTruthy();
  });

  it('theme で配色の修飾子を付ける', () => {
    setup(async () => tokyoLowStock, { theme: 'dark', className: 'my-bar' });
    const root = document.querySelector('[data-ssg-ask]') as HTMLElement;
    expect(root.className).toBe('ssg-ask ssg-theme-dark my-bar');
  });
});