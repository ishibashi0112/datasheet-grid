// 追加(段 3-1 Solid 版の /ai): GridAskBar を本物のグリッドと組み合わせ、偽の ask で確かめます。React 版の
//   packages/react/src/ai/GridAskBar.integration.test.tsx と同じ場面です(React だけの <Activity> / StrictMode の場面は、
//   Solid ではバーを <Show> で外したときと、ハンドルをそのまま渡す書き方に置き換えた)。
//   送る(Enter / 例)・変換中の Enter・止める(ボタン / Esc)・反映とチップ・元に戻す・表を手で変えたあと・失敗の表示・
//   列の表示・行のデータを送らないこと。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Show, createSignal, flush } from 'solid-js';
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type GridState, type SpreadsheetGridHandle } from '../index';
import { GridAskBar, type GridAsk, type GridAskBarProps } from '../ai';

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
  grid: () => SpreadsheetGridHandle<Row>;
  input: HTMLInputElement;
  columnsLog: GridColumn<Row>[][];
};

const setup = (
  ask: GridAsk,
  props: Partial<GridAskBarProps<Row>> = {},
  initialColumns: GridColumn<Row>[] = baseColumns,
): Harness => {
  // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
  let grid!: SpreadsheetGridHandle<Row>;
  const columnsLog: GridColumn<Row>[][] = [];
  const [columns, setColumns] = createSignal(initialColumns);
  render(() => (
    <>
      <GridAskBar grid={() => grid} columns={columns()} ask={ask} {...props} />
      <SpreadsheetGrid<Row>
        ref={grid}
        columns={columns()}
        rows={rows}
        rowKeyGetter={(row) => row.id}
        onColumnsChange={(next) => {
          columnsLog.push(next);
          setColumns(next);
        }}
      />
    </>
  ));
  flush();
  return {
    grid: () => grid,
    input: screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement,
    columnsLog,
  };
};

const viewIds = (grid: Harness['grid']): unknown[] =>
  grid()
    .getExportData({ scope: 'view' })
    .rows.map((cells) => cells[0]?.value);

const typeText = (input: HTMLInputElement, text: string) => {
  fireEvent.input(input, { target: { value: text } });
  flush();
};

const typeAndEnter = (input: HTMLInputElement, text: string) => {
  typeText(input, text);
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.submit(input.form!);
  flush();
};

const errorText = (): string | null | undefined => document.querySelector('.ssg-ask-note--error')?.textContent;

const click = (element: Element, init?: MouseEventInit) => {
  const result = fireEvent.click(element, init);
  flush();
  return result;
};

// 偽の ask の答えが反映されるまで待ちます(ask の Promise と、その後の書き込みの反映)。
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  flush();
};

describe('GridAskBar(Solid 版・結合)', () => {
  it('文を送ると頼みを ask に渡し、答えを検査して反映し、チップを出す', async () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const onApply = vi.fn();
    const { grid, input, columnsLog } = setup(ask, { onApply });
    typeAndEnter(input, '東京の在庫が 10 個以下を多い順に');
    await settle();

    expect(ask).toHaveBeenCalledTimes(1);
    const [request, context] = ask.mock.calls[0]!;
    expect(request.text).toBe('東京の在庫が 10 個以下を多い順に');
    expect(request.prompt).toContain('- stock "在庫数": number.');
    expect(request.prompt).toContain('values: "東京", "大阪"');
    expect(request.schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(context.signal).toBeInstanceOf(AbortSignal);
    // 行のデータは送らない(列定義の候補にない値は出てこない)
    expect(request.prompt).not.toContain('ボールペン');
    expect(request.prompt).not.toContain('240');

    expect(viewIds(grid)).toEqual([3]);
    expect(grid().getState().sort).toEqual([{ columnKey: 'stock', direction: 'desc' }]);
    const result = screen.getByText('反映した条件').closest('.ssg-ask-result') as HTMLElement;
    const chips = within(result)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(chips).toEqual(['倉庫"東京"×', '在庫数10 以下×', '並び在庫数 降順×']);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ text: '東京の在庫が 10 個以下を多い順に', dropped: [], unsupported: null }),
    );
    // 列の表示が変わらないときは onColumnsChange を呼ばない
    expect(columnsLog).toHaveLength(0);
  });

  it('grid にハンドルそのものを渡しても使える(ref={setGrid} で受けて、入ってからバーを出す)', async () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const [handle, setHandle] = createSignal<SpreadsheetGridHandle<Row>>();
    render(() => (
      <>
        <Show when={handle()}>{(target) => <GridAskBar grid={target()} columns={baseColumns} ask={ask} />}</Show>
        <SpreadsheetGrid<Row> ref={setHandle} columns={baseColumns} rows={rows} rowKeyGetter={(row) => row.id} />
      </>
    ));
    flush();
    typeAndEnter(screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, '東京だけ');
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(handle()!.getState().sort).toEqual([{ columnKey: 'stock', direction: 'desc' }]);
  });

  it('変換を確定する Enter では送らない(isComposing / keyCode 229)', () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const { input } = setup(ask);
    typeText(input, 'とうきょう');
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
    const { grid, input } = setup(ask);
    typeAndEnter(input, '東京だけ');
    expect(screen.getByText(/考えています/)).toBeTruthy();
    // 「聞く」のダブルクリックの 2 回目(detail 2)では止めない
    const stop = screen.getByRole('button', { name: '止める' });
    expect(click(stop, { detail: 2 })).toBe(false);
    expect(signals[0]!.aborted).toBe(false);
    expect(click(stop, { detail: 1 })).toBe(false);
    expect(signals[0]!.aborted).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/考えています/)).toBeNull();
    // 「止める」のダブルクリックの 2 回目が「聞く」に当たっても送り直さない
    expect(click(screen.getByRole('button', { name: '聞く' }), { detail: 2 })).toBe(false);
    resolveAnswer(tokyoLowStock);
    await settle();
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
    expect(screen.queryByText('反映した条件')).toBeNull();

    typeAndEnter(input, '東京だけ');
    // 変換中の Esc(変換の取り消し)では止めない
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 });
    expect(signals[1]!.aborted).toBe(false);
    fireEvent.keyDown(input, { key: 'Escape' });
    flush();
    expect(signals[1]!.aborted).toBe(true);
    expect(errorText()).toBeUndefined();
  });

  it('Esc はフォーカスがバーの中か、どこにも無いときに止める(表やほかの部品の Esc は取らない)', () => {
    const signals: AbortSignal[] = [];
    const ask = vi.fn<GridAsk>((_request, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { input } = setup(ask, { examples: ['東京だけ'] });
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      typeAndEnter(input, '東京だけ');
      outside.focus();
      fireEvent.keyDown(outside, { key: 'Escape' });
      expect(signals[0]!.aborted).toBe(false);
      outside.blur();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      flush();
      expect(signals[0]!.aborted).toBe(true);

      // 例のボタンは聞いている間 aria-disabled(押したボタンにフォーカスが残り、Esc が届く)
      const example = screen.getByRole('button', { name: '東京だけ' });
      example.focus();
      click(example);
      expect(ask).toHaveBeenCalledTimes(2);
      expect(example.getAttribute('aria-disabled')).toBe('true');
      expect(example.hasAttribute('disabled')).toBe(false);
      click(example);
      expect(ask).toHaveBeenCalledTimes(2);
      expect(document.activeElement).toBe(example);
      fireEvent.keyDown(example, { key: 'Escape' });
      flush();
      expect(signals[1]!.aborted).toBe(true);
      expect(example.hasAttribute('aria-disabled')).toBe(false);
    } finally {
      outside.remove();
    }
  });

  it('shadow root の中に置いたバーでも、入力欄の Esc で止める', () => {
    const signals: AbortSignal[] = [];
    const ask = vi.fn<GridAsk>((_request, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const host = document.createElement('div');
    document.body.append(host);
    const container = document.createElement('div');
    host.attachShadow({ mode: 'open' }).append(container);
    // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
    let grid!: SpreadsheetGridHandle<Row>;
    try {
      render(
        () => (
          <>
            <GridAskBar grid={() => grid} columns={baseColumns} ask={ask} />
            <SpreadsheetGrid<Row> ref={grid} columns={baseColumns} rows={rows} rowKeyGetter={(row) => row.id} />
          </>
        ),
        { container },
      );
      flush();
      const input = container.querySelector('input') as HTMLInputElement;
      typeAndEnter(input, '東京だけ');
      expect(ask).toHaveBeenCalledTimes(1);
      input.focus();
      // フォーカスが shadow root の中にあると document.activeElement は host になる
      expect(document.activeElement).toBe(host);
      fireEvent.keyDown(input, { key: 'Escape', composed: true });
      flush();
      expect(signals[0]!.aborted).toBe(true);
    } finally {
      cleanup();
      host.remove();
    }
  });

  it('聞いている間の Enter は無視し、止めるを押せばすぐ止まる', () => {
    const signals: AbortSignal[] = [];
    const ask = vi.fn<GridAsk>((_request, { signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { input } = setup(ask);
    typeAndEnter(input, '東京だけ');
    typeAndEnter(input, '大阪だけ');
    expect(ask).toHaveBeenCalledTimes(1);
    click(screen.getByRole('button', { name: '止める' }), { detail: 1 });
    expect(signals[0]!.aborted).toBe(true);
  });

  it('同じ操作の中で 2 回送っても(反映の前)、頼むのは 1 回', () => {
    const ask = vi.fn<GridAsk>(() => new Promise(() => {}));
    const { input } = setup(ask);
    typeText(input, '東京だけ');
    fireEvent.submit(input.form!);
    fireEvent.submit(input.form!);
    flush();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('聞いている間に変わった設定(allowSort・列・onApply)で答えを読む', async () => {
    let resolveAnswer: (value: unknown) => void = () => {};
    const ask = vi.fn<GridAsk>(() => new Promise((resolve) => (resolveAnswer = resolve)));
    // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
    let grid!: SpreadsheetGridHandle<Row>;
    const first = vi.fn();
    const second = vi.fn();
    const [allowSort, setAllowSort] = createSignal(true);
    // 関数を値に持つ signal(createSignal に関数を渡すと計算になるので、関数を返す関数で渡す)。
    const [onApply, setOnApply] = createSignal<() => void>(() => first);
    render(() => (
      <>
        <GridAskBar grid={() => grid} columns={baseColumns} ask={ask} allowSort={allowSort()} onApply={onApply()} />
        <SpreadsheetGrid<Row> ref={grid} columns={baseColumns} rows={rows} rowKeyGetter={(row) => row.id} />
      </>
    ));
    flush();
    typeAndEnter(screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, '東京の在庫が少ないもの');
    setAllowSort(false);
    setOnApply(() => second);
    flush();
    resolveAnswer(tokyoLowStock);
    await settle();
    expect(grid.getState().sort).toEqual([]);
    expect(screen.getByText('並びは変えない設定です')).toBeTruthy();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('表がまだ無いときは知らせる', () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    render(() => <GridAskBar grid={() => undefined} columns={baseColumns} ask={ask} />);
    flush();
    typeAndEnter(screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, '東京だけ');
    expect(ask).not.toHaveBeenCalled();
    expect(errorText()).toContain('表が見つかりませんでした。');
  });

  it('聞いている間にバーを外すと頼みを止め、もう一度出したバーは考えているまま固まらない', () => {
    const signals: AbortSignal[] = [];
    const ask = vi.fn<GridAsk>(
      (_request, { signal }) =>
        new Promise(() => {
          signals.push(signal);
        }),
    );
    // eslint-disable-next-line no-unassigned-vars -- Solid のコンパイラが ref={grid} を代入に書き換える
    let grid!: SpreadsheetGridHandle<Row>;
    const [shown, setShown] = createSignal(true);
    render(() => (
      <>
        <Show when={shown()}>
          <GridAskBar grid={() => grid} columns={baseColumns} ask={ask} />
        </Show>
        <SpreadsheetGrid<Row> ref={grid} columns={baseColumns} rows={rows} rowKeyGetter={(row) => row.id} />
      </>
    ));
    flush();
    typeAndEnter(screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, '東京だけ');
    expect(screen.getByText(/考えています/)).toBeTruthy();
    setShown(false);
    flush();
    expect(signals[0]!.aborted).toBe(true);
    setShown(true);
    flush();
    expect(screen.queryByText(/考えています/)).toBeNull();
    typeAndEnter(screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, '東京だけ');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('元に戻すと頼む前の見え方へ戻す', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    grid().applyState({ ...grid().getState(), filters: { globalText: 'ノ', columnFilters: {} } });
    flush();
    typeAndEnter(input, '東京の在庫が少ないもの');
    await settle();
    expect(viewIds(grid)).toEqual([3]);
    click(screen.getByRole('button', { name: '元に戻す' }));
    expect(grid().getState().filters).toEqual({ globalText: 'ノ', columnFilters: {} });
    expect(grid().getState().sort).toEqual([]);
    expect(viewIds(grid)).toEqual([2]);
    expect(screen.getByText('元に戻しました。')).toBeTruthy();
  });

  it('反映したあと表を手で変えたら、元に戻さず知らせる', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await settle();
    grid().applyState({ ...grid().getState(), sort: [{ columnKey: 'id', direction: 'asc' }] });
    flush();
    click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByText(/表の条件が変わったので/)).toBeTruthy();
    expect(grid().getState().sort).toEqual([{ columnKey: 'id', direction: 'asc' }]);
    expect(viewIds(grid)).toEqual([3]);
  });

  it('押したボタンが消えたら、フォーカスを次のチップか入力欄へ移す', async () => {
    const { input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await settle();
    const first = screen.getByRole('button', { name: '倉庫 "東京" を外す' });
    first.focus();
    click(first);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '在庫数 10 以下 を外す' }));
    // 最後のチップを外したら前のチップへ
    const last = screen.getByRole('button', { name: '並び 在庫数 降順 を外す' });
    last.focus();
    click(last);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '在庫数 10 以下 を外す' }));
    const undo = screen.getByRole('button', { name: '元に戻す' });
    undo.focus();
    click(undo);
    expect(document.activeElement).toBe(input);
    const close = screen.getByRole('button', { name: '閉じる' });
    close.focus();
    click(close);
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
    await settle();
    const state = grid().getState();
    grid().applyState({
      ...state,
      columns: (state.columns ?? []).map((entry) => (entry.key === 'name' ? { ...entry, visible: false } : entry)),
    });
    flush();
    click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.queryByText(/表の条件が変わったので/)).toBeNull();
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
    const hidden = (grid().getState().columns ?? []).filter((entry) => entry.visible === false);
    expect(hidden.map((entry) => entry.key)).toEqual(['name']);
  });

  it('サーバーのエラー({ error })は表を変えずに知らせる', async () => {
    const { grid, input } = setup(async () => ({ error: 'Too many requests' }));
    grid().applyState({ ...grid().getState(), filters: { globalText: 'ノ', columnFilters: {} } });
    flush();
    typeAndEnter(input, '東京だけ');
    await settle();
    expect(errorText()).toContain('AI の答えが表への指示になっていませんでした。');
    expect(grid().getState().filters.globalText).toBe('ノ');
    expect(screen.queryByText('反映した条件')).toBeNull();
  });

  it('チップの × でその条件だけ外し、外したあとも元に戻せる', async () => {
    const { grid, input } = setup(async () => tokyoLowStock);
    typeAndEnter(input, '東京の在庫が少ないもの');
    await settle();
    click(screen.getByRole('button', { name: '倉庫 "東京" を外す' }));
    expect(viewIds(grid)).toEqual([2, 3]);
    expect(grid().getState().filters.columnFilters).not.toHaveProperty('warehouse');
    click(screen.getByRole('button', { name: '元に戻す' }));
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
    await settle();
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
    await settle();
    expect(errorText()).toContain('AI に聞けませんでした。');
    expect(onError).toHaveBeenCalledWith(failure);

    // 「もう一度」は失敗した文を送り直す(入力欄を書き換えていても)
    typeText(input, '大阪');
    click(screen.getByRole('button', { name: 'もう一度' }));
    await settle();
    expect(ask.mock.calls[1]![0].text).toBe('東京だけ');
    expect(errorText()).toContain('AI の答えを読めませんでした。');
    expect(viewIds(grid)).toEqual([1, 2, 3, 4]);
  });

  it('例の文を押すとその文で聞く(同じ例が 2 つあっても両方出る)', async () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const { input } = setup(ask, { examples: ['東京の在庫が 10 個以下', '東京の在庫が 10 個以下'] });
    const examples = screen.getAllByRole('button', { name: '東京の在庫が 10 個以下' });
    expect(examples).toHaveLength(2);
    const example = examples[0]!;
    expect(example.getAttribute('title')).toBe('東京の在庫が 10 個以下');
    click(example);
    await settle();
    expect(ask.mock.calls[0]![0].text).toBe('東京の在庫が 10 個以下');
    // 答えを読めたら入力欄は空になる
    expect(input.value).toBe('');
    // チップは全文を title に持つ(狭い幅で省略されても読める)
    expect(screen.getAllByRole('listitem')[0]!.getAttribute('title')).toBe('倉庫: "東京"');
  });

  it('allowFilter: false は列の条件を変えない', async () => {
    const ask = vi.fn<GridAsk>(async () => tokyoLowStock);
    const { grid, input } = setup(ask, { allowFilter: false });
    typeAndEnter(input, '東京の在庫が少ないもの');
    await settle();
    expect(ask.mock.calls[0]![0].prompt).toContain('Filters: not allowed.');
    expect(grid().getState().filters.columnFilters).toEqual({});
    expect(grid().getState().sort).toEqual([{ columnKey: 'stock', direction: 'desc' }]);
    expect(screen.getByText('列の条件は変えない設定です')).toBeTruthy();
  });

  it('allowColumnVisibility で列を隠し、元に戻すで見せる', async () => {
    const { grid, input, columnsLog } = setup(async () => answerOf({ hide: ['stock'] }), {
      allowColumnVisibility: true,
    });
    typeAndEnter(input, '在庫数の列を隠して');
    await settle();
    const hidden = (state: GridState) =>
      (state.columns ?? []).filter((entry) => entry.visible === false).map((entry) => entry.key);
    expect(hidden(grid().getState())).toEqual(['stock']);
    expect(columnsLog).toHaveLength(1);
    expect(screen.getByRole('button', { name: '隠した列 在庫数 を外す' })).toBeTruthy();
    click(screen.getByRole('button', { name: '元に戻す' }));
    expect(hidden(grid().getState())).toEqual([]);
    expect(columnsLog).toHaveLength(2);
  });

  it('途中の列を固定した表で列を隠すと、columns の配列は固定列ごとの順になる(applyState の規則)', async () => {
    const pinnedMiddle = baseColumns.map((column) =>
      column.key === 'warehouse' ? { ...column, pinned: 'left' as const } : column,
    );
    const { columnsLog } = setup(async () => answerOf({ hide: ['stock'] }), { allowColumnVisibility: true }, pinnedMiddle);
    typeAndEnter(screen.getByRole('textbox', { name: 'ことばで絞り込み' }) as HTMLInputElement, '在庫数の列を隠して');
    await settle();
    click(screen.getByRole('button', { name: '元に戻す' }));
    expect(columnsLog).toHaveLength(2);
    for (const next of columnsLog) {
      expect(next.map((column) => column.key)).toEqual(['warehouse', 'id', 'name', 'stock']);
    }
    expect(columnsLog[0]!.find((column) => column.key === 'stock')?.visible).toBe(false);
    expect(columnsLog[1]!.find((column) => column.key === 'stock')?.visible).toBeUndefined();
  });

  it('列の表示を許していなければ隠さない', async () => {
    const { grid, input, columnsLog } = setup(async () => answerOf({ hide: ['stock'] }));
    typeAndEnter(input, '在庫数の列を隠して');
    await settle();
    expect(columnsLog).toHaveLength(0);
    expect((grid().getState().columns ?? []).some((entry) => entry.visible === false)).toBe(false);
    expect(screen.getByText('列の表示は変えない設定です')).toBeTruthy();
  });

  it('theme で配色の修飾子を付ける', () => {
    setup(async () => tokyoLowStock, { theme: 'dark', className: 'my-bar' });
    const root = document.querySelector('[data-ssg-ask]') as HTMLElement;
    expect(root.className).toBe('ssg-ask ssg-theme-dark my-bar');
  });

  describe('送った後の入力欄・表が手で変わったとき・columnHints の打ち間違い', () => {
    it('答えを読めたら入力欄を空にし、失敗したら残す。聞いている間に書き換えた文は残す', async () => {
      let mode: 'ok' | 'fail' | 'wait' = 'ok';
      const waiting: Array<() => void> = [];
      const ask = vi.fn<GridAsk>(async () => {
        if (mode === 'fail') {
          throw new Error('ng');
        }
        if (mode === 'wait') {
          await new Promise<void>((resolve) => waiting.push(resolve));
        }
        return tokyoLowStock;
      });
      const { input } = setup(ask);
      typeAndEnter(input, '東京の在庫が少ないもの');
      await settle();
      expect(input.value).toBe('');
      mode = 'fail';
      typeAndEnter(input, '大阪の在庫');
      await settle();
      expect(input.value).toBe('大阪の在庫');
      // 聞いている間に書き換えた文は残す
      mode = 'wait';
      typeAndEnter(input, '東京');
      typeText(input, '続きの文');
      waiting[0]?.();
      await settle();
      await settle();
      expect(ask).toHaveBeenCalledTimes(3);
      expect(input.value).toBe('続きの文');
    });

    it('反映したあと表が手で変わったら、チップと元に戻すを下げて知らせる(押す前に)', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
      try {
        const { grid, input } = setup(async () => tokyoLowStock);
        typeAndEnter(input, '東京の在庫が少ないもの');
        await settle();
        expect(screen.getByRole('button', { name: '元に戻す' })).toBeTruthy();
        // 手で変えても、確かめるまではそのまま(押せば readUnchanged が知らせる)
        grid().applyState({ sort: [{ columnKey: 'id', direction: 'asc' }] });
        flush();
        vi.advanceTimersByTime(1000);
        flush();
        expect(screen.queryByRole('button', { name: '元に戻す' })).toBeNull();
        expect(screen.queryByRole('button', { name: /を外す$/ })).toBeNull();
        expect(screen.getByText(/表の条件が変わったので/)).toBeTruthy();
        // 閉じると消える
        click(screen.getByRole('button', { name: '閉じる' }));
        expect(screen.queryByText(/表の条件が変わったので/)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('聞いている間に表が変わっても、次の答えを反映したら「変わった」の知らせを残さない', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
      try {
        const waiting: (() => void)[] = [];
        let wait = false;
        const ask = vi.fn(async () => {
          if (wait) {
            await new Promise<void>((resolve) => waiting.push(resolve));
          }
          return tokyoLowStock;
        });
        const { grid, input } = setup(ask);
        typeAndEnter(input, '東京の在庫が少ないもの');
        await settle();
        wait = true;
        typeAndEnter(input, 'もう一度');
        await settle();
        grid().applyState({ sort: [{ columnKey: 'id', direction: 'asc' }] });
        flush();
        vi.advanceTimersByTime(1000);
        flush();
        waiting[0]?.();
        await settle();
        await settle();
        expect(ask).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', { name: '元に戻す' })).toBeTruthy();
        expect(screen.queryByText(/表の条件が変わったので/)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('クリックの後にも確かめる。変わっていなければそのまま', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
      try {
        const { grid, input } = setup(async () => tokyoLowStock);
        typeAndEnter(input, '東京の在庫が少ないもの');
        await settle();
        click(document.body);
        vi.advanceTimersByTime(400);
        flush();
        expect(screen.getByRole('button', { name: '元に戻す' })).toBeTruthy();
        grid().applyState({ filters: { globalText: 'ペン' } });
        flush();
        click(document.body);
        vi.advanceTimersByTime(400);
        flush();
        expect(screen.queryByRole('button', { name: '元に戻す' })).toBeNull();
        expect(screen.getByText(/表の条件が変わったので/)).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('columnHints に列に無いキーがあれば開発時に 1 回だけ警告する', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const [hints, setHints] = createSignal<Record<string, string | false>>({ stok: false, stock: '個' });
      render(() => (
        <GridAskBar<Row> grid={() => undefined} columns={baseColumns} ask={async () => tokyoLowStock} columnHints={hints()} />
      ));
      flush();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('stok');
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[spreadsheet-grid\] GridAskBar \/ createGridAsk の columnHints/);
      // 同じ打ち間違いの新しいオブジェクトでは出さない
      setHints({ stok: false, stock: '個' });
      flush();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockClear();
      setHints({ stock: '個' });
      flush();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});