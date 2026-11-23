// Solid らしい使い方の確かめ(段階 4 の測り直し 1-5)。React 版には無い書き方(非同期の行と <Loading> / <Errored>、
//   取り直しの間の古い表示、<Show> での出し入れ、1 ページに複数のグリッド)で、グリッドが壊れず、警告も出さないこと。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Errored, Loading, Show, action, createEffect, createMemo, createOptimistic, createSignal, flush, isPending, onFlush } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60, editable: false },
  { key: 'name', title: '品名', width: 120, filterType: 'text' },
  { key: 'qty', title: '数量', width: 80 },
];

const makeRows = (count: number, from = 1): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: from + i, name: `品目 ${from + i}`, qty: i }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const logs: string[] = [];
const watchConsole = () => {
  logs.length = 0;
  const record = (...args: unknown[]) => {
    logs.push(args.map(String).join(' ').slice(0, 300));
  };
  vi.spyOn(console, 'error').mockImplementation(record);
  vi.spyOn(console, 'warn').mockImplementation(record);
};

afterEach(() => {
  vi.restoreAllMocks();
});

const settle = async (ms = 30) => {
  flush();
  await new Promise((resolve) => setTimeout(resolve, ms));
  flush();
};

function deferred<V>() {
  let resolve!: (value: V) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<V>((ok, ng) => {
    resolve = ok;
    reject = ng;
  });
  return { promise, resolve, reject };
}

const cellOf = (root: ParentNode, row: number, key: string) =>
  root.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`);

const press = (target: Element) => {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1 });
  flush();
  fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
  flush();
};

describe('非同期の行', () => {
  it('<Loading> の中で非同期の行を渡すと、読み込むまでは fallback、読み込んだら行を出す', async () => {
    watchConsole();
    const load = deferred<Row[]>();
    const { container, unmount } = render(() => {
      const rows = createMemo(async () => load.promise);
      return (
        <Loading fallback={<p class="fallback">読み込み中</p>}>
          <SpreadsheetGrid<Row> rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} />
        </Loading>
      );
    });
    await settle();
    expect(container.querySelector('.fallback')).not.toBeNull();
    expect(container.querySelector('.ssg-root')).toBeNull();
    load.resolve(makeRows(5));
    await settle();
    expect(container.querySelector('.fallback')).toBeNull();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
    expect(container.querySelectorAll('.ssg-root')).toHaveLength(1);
    unmount();
    expect(logs).toEqual([]);
  });

  it('取り直しの間は前の行を出したまま(isPending が真)で、届いたら新しい行に替わり、選択も操作も続けられる', async () => {
    watchConsole();
    const loads = [deferred<Row[]>(), deferred<Row[]>()];
    let setPage: (page: number) => void = () => {};
    let pending: () => boolean = () => false;
    const { container, unmount } = render(() => {
      const [page, set] = createSignal(0);
      setPage = set;
      const rows = createMemo(async () => (loads[page()] as { promise: Promise<Row[]> }).promise);
      pending = () => isPending(rows);
      return (
        <Loading fallback={<p class="fallback">読み込み中</p>}>
          <SpreadsheetGrid<Row> rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} />
        </Loading>
      );
    });
    loads[0]?.resolve(makeRows(5));
    await settle();
    const first = cellOf(container, 0, 'name');
    expect(first?.textContent).toBe('品目 1');
    press(first as HTMLElement);
    setPage(1);
    await settle();
    // 前の行のまま(fallback に替えない = グリッドを作り直さない)。
    expect(container.querySelector('.fallback')).toBeNull();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
    expect(pending()).toBe(true);
    loads[1]?.resolve(makeRows(5, 100));
    await settle();
    expect(pending()).toBe(false);
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 100');
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(container, 1, 'name') as HTMLElement);
    fireEvent.keyDown(shell, { key: 'ArrowDown' });
    flush();
    expect(cellOf(container, 2, 'name')?.getAttribute('aria-selected')).toBe('true');
    unmount();
    expect(logs).toEqual([]);
  });

  it('<Errored> の中で行の読み込みに失敗すると fallback を出し、やり直すと行を出す', async () => {
    watchConsole();
    const attempts = [deferred<Row[]>(), deferred<Row[]>()];
    let attempt = 0;
    const { container, unmount } = render(() => {
      const [tries, setTries] = createSignal(0);
      const rows = createMemo(async () => {
        tries();
        return (attempts[attempt] as { promise: Promise<Row[]> }).promise;
      });
      return (
        <Errored
          fallback={(error, reset) => (
            <button
              type="button"
              class="retry"
              onClick={() => {
                attempt += 1;
                setTries((value) => value + 1);
                reset();
              }}
            >
              {String(error())}
            </button>
          )}
        >
          <Loading fallback={<p class="fallback">読み込み中</p>}>
            <SpreadsheetGrid<Row> rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} />
          </Loading>
        </Errored>
      );
    });
    await settle();
    attempts[0]?.reject(new Error('取れませんでした'));
    await settle();
    const retry = container.querySelector<HTMLButtonElement>('.retry');
    expect(retry?.textContent).toContain('取れませんでした');
    expect(container.querySelector('.ssg-root')).toBeNull();
    fireEvent.click(retry as HTMLButtonElement);
    attempts[1]?.resolve(makeRows(3));
    await settle();
    expect(container.querySelector('.retry')).toBeNull();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
    unmount();
    // 失敗そのものは利用側の <Errored> が受けたので、グリッドからの警告やエラーは無い。
    expect(logs).toEqual([]);
  });

  // 段階 4 の測り直し S7-02: 行を出した後の取り直しが失敗したときも、<Errored> が受け、同じエラーを console へ出さない
  //   (以前は effect の数だけ 12〜13 回出ていた。行を写すようにした後は <Errored> へ届かず、表が前の行のまま残っていた)。
  it('取り直しの失敗は <Errored> が受け、console へ出さない(S7-02)', async () => {
    watchConsole();
    const loads = [deferred<Row[]>(), deferred<Row[]>()];
    let setPage: (page: number) => void = () => {};
    const { container, unmount } = render(() => {
      const [page, set] = createSignal(0);
      setPage = set;
      const rows = createMemo(async () => (loads[page()] as { promise: Promise<Row[]> }).promise);
      return (
        <Errored fallback={(error) => <p class="error">{String(error())}</p>}>
          <Loading fallback={<p class="fallback">読み込み中</p>}>
            <SpreadsheetGrid<Row> rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} />
          </Loading>
        </Errored>
      );
    });
    loads[0]?.resolve(makeRows(3));
    await settle();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
    setPage(1);
    await settle();
    loads[1]?.reject(new Error('取り直せませんでした'));
    await settle();
    expect(container.querySelector('.error')?.textContent).toContain('取り直せませんでした');
    expect(container.querySelector('.ssg-root')).toBeNull();
    unmount();
    expect(logs).toEqual([]);
  });

  // 段階 4 の測り直し S4-23: <Loading> の中で最初の行を待っている間のグリッドへ、親の最初の effect からハンドルで状態を
  //   入れても効かない(描く前はグリッドの最初の処理の前)。開発時に 1 回知らせ、行を読む effect から呼べば効く。
  it('行を待っている間にハンドルで状態を変えると開発時に知らせ、行を読む effect から呼ぶと効く(S4-23)', async () => {
    watchConsole();
    const load = deferred<Row[]>();
    let grid: SpreadsheetGridHandle<Row> | undefined;
    const { container, unmount } = render(() => {
      const rows = createMemo(async () => load.promise);
      createEffect(
        () => true,
        () => {
          grid?.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
          grid?.selectCell(0, 1);
        },
      );
      createEffect(
        () => rows().length,
        (count) => {
          if (count > 0) grid?.applyState({ sort: [{ columnKey: 'id', direction: 'desc' }] });
        },
      );
      return (
        <Loading fallback={<p class="fallback">読み込み中</p>}>
          <SpreadsheetGrid<Row> ref={(handle) => (grid = handle)} rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} />
        </Loading>
      );
    });
    await settle();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('applyState()');
    expect(logs[0]).toContain('initialState');
    load.resolve(makeRows(3));
    await settle();
    expect(grid?.getState().sort).toEqual([{ columnKey: 'id', direction: 'desc' }]);
    expect(cellOf(container, 0, 'id')?.textContent).toBe('3');
    unmount();
    expect(logs).toHaveLength(1);
  });
});

describe('action と createOptimistic で保存する(Solid 2.0 の遷移)', () => {
  function setup() {
    const saves: Array<ReturnType<typeof deferred<void>>> = [];
    let saved: Row[] = makeRows(3);
    const view = render(() => {
      const [serverRows, setServerRows] = createSignal(saved);
      const [rows, setRows] = createOptimistic(() => serverRows());
      const save = action(function* (next: Row[]) {
        setRows(() => next);
        const request = deferred<void>();
        saves.push(request);
        yield request.promise;
        saved = next;
        setServerRows(() => next);
      });
      return (
        <SpreadsheetGrid<Row>
          rows={rows()}
          onRowsChange={(next) => {
            save(next).catch(() => {});
          }}
          columns={columns}
          rowKeyGetter={(row) => row.id}
        />
      );
    });
    flush();
    const shell = view.container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(view.container, 1, 'name') as HTMLElement);
    fireEvent.keyDown(shell, { key: 'F2' });
    flush();
    const input = view.container.querySelector<HTMLInputElement>('.ssg-cell-editor input') as HTMLInputElement;
    input.value = '保存中';
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    flush();
    return { view, saves, saved: () => saved };
  }

  it('確定した値はすぐに出し、保存が済んだらそのまま', async () => {
    watchConsole();
    const { view, saves, saved } = setup();
    await settle();
    expect(cellOf(view.container, 1, 'name')?.textContent).toBe('保存中');
    expect(saves).toHaveLength(1);
    saves[0]?.resolve();
    await settle();
    expect(cellOf(view.container, 1, 'name')?.textContent).toBe('保存中');
    expect(saved()[1]?.name).toBe('保存中');
    // 続けて操作できる(下へ動いて編集を始められる)。
    const shell = view.container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    expect(cellOf(view.container, 2, 'name')?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(shell, { key: 'F2' });
    flush();
    expect(view.container.querySelector('.ssg-cell-editor input')).not.toBeNull();
    view.unmount();
    expect(logs).toEqual([]);
  });

  it('保存に失敗すると元の値へ戻る', async () => {
    watchConsole();
    const { view, saves } = setup();
    await settle();
    expect(cellOf(view.container, 1, 'name')?.textContent).toBe('保存中');
    saves[0]?.reject(new Error('保存できませんでした'));
    await settle();
    expect(cellOf(view.container, 1, 'name')?.textContent).toBe('品目 2');
    view.unmount();
    expect(logs).toEqual([]);
  });
});

// 段階 4 の測り直し S4-21: 通知の中で action を始めても、グリッドの書き込みはその取引に入らない(React 版の startTransition と
//   同じく、保存の間もエディタは閉じ、続けた操作はその場で効く)。ふつうの signal に rows を書いてから action を始める形も同じ。
const editTo = (container: HTMLElement, row: number, text: string) => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
  press(cellOf(container, row, 'name') as HTMLElement);
  fireEvent.keyDown(shell, { key: 'F2' });
  flush();
  const input = container.querySelector<HTMLInputElement>('.ssg-cell-editor input') as HTMLInputElement;
  input.value = text;
  fireEvent.input(input);
  fireEvent.keyDown(input, { key: 'Enter' });
  flush();
};

describe.each(['createOptimistic', 'signal'] as const)('保存の間もグリッドは止まらない(%s + action。S4-21)', (mode) => {
  it('エディタはすぐ閉じ、保存中の 2 回目の編集はその行へ入り、両方が保存される', async () => {
    watchConsole();
    const saves: Array<ReturnType<typeof deferred<void>>> = [];
    const saved: string[] = [];
    const view = render(() => {
      const [serverRows, setServerRows] = createSignal(makeRows(3));
      const [optimistic, setOptimistic] = createOptimistic(() => serverRows());
      const [plain, setPlain] = createSignal(makeRows(3));
      const save = action(function* (next: Row[]) {
        if (mode === 'createOptimistic') setOptimistic(() => next);
        const request = deferred<void>();
        saves.push(request);
        yield request.promise;
        saved.push(next.map((row) => row.name).join(','));
        if (mode === 'createOptimistic') setServerRows(() => next);
      });
      return (
        <SpreadsheetGrid<Row>
          rows={mode === 'createOptimistic' ? optimistic() : plain()}
          onRowsChange={(next) => {
            if (mode === 'signal') setPlain(() => next);
            save(next).catch(() => {});
          }}
          columns={columns}
          rowKeyGetter={(row) => row.id}
        />
      );
    });
    flush();
    const { container } = view;
    editTo(container, 0, '一回目');
    await settle();
    expect(container.querySelector('.ssg-cell-editor')).toBeNull();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('一回目');
    expect(cellOf(container, 1, 'name')?.getAttribute('aria-selected')).toBe('true');
    editTo(container, 2, '二回目');
    await settle();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('一回目');
    expect(cellOf(container, 2, 'name')?.textContent).toBe('二回目');
    for (const request of saves) request.resolve();
    await settle(50);
    expect(saved).toEqual(['一回目,品目 2,品目 3', '一回目,品目 2,二回目']);
    expect(cellOf(container, 0, 'name')?.textContent).toBe('一回目');
    expect(cellOf(container, 2, 'name')?.textContent).toBe('二回目');
    view.unmount();
    expect(logs).toEqual([]);
  });
});

// 段階 4 の測り直し S7-01: 通知の外(setTimeout / onFlush)で始めた保存の間に、フィルハンドルのある表で次のセルを打ち始めると、
//   右下の四角の <Show> で「stale value」の例外が出て表(境界が無ければアプリ全体)が止まっていた(S4-21 と同じ原因。Solid 2.0.3
//   で起きる)。打ち始め → Enter → 保存の間に次のセルを打ち始める、の順は実ブラウザの再現と同じ。
describe.each(['setTimeout', 'onFlush'] as const)('保存の間もフィルハンドルのある表を編集できる(%s で始める。S7-01)', (start) => {
  it('保存中に次のセルを打ち始めても例外が出ず、両方が保存される', async () => {
    watchConsole();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
    };
    window.addEventListener('error', onError);
    const saves: Array<ReturnType<typeof deferred<void>>> = [];
    const view = render(() => {
      const [serverRows, setServerRows] = createSignal(makeRows(5));
      const [rows, setRows] = createOptimistic(() => serverRows());
      const save = action(function* (next: Row[]) {
        setRows(() => next);
        const request = deferred<void>();
        saves.push(request);
        yield request.promise;
        setServerRows(() => next);
      });
      return (
        <SpreadsheetGrid<Row>
          rows={rows()}
          onRowsChange={(next) => {
            const run = () => {
              save(next).catch(() => {});
            };
            if (start === 'setTimeout') setTimeout(run);
            else onFlush(run);
          }}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          fillHandle
        />
      );
    });
    flush();
    const { container } = view;
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    const typeAndEnter = (key: string) => {
      fireEvent.keyDown(shell, { key });
      flush();
      const input = container.querySelector<HTMLInputElement>('.ssg-cell-editor input') as HTMLInputElement;
      expect(input.value).toBe(key);
      fireEvent.keyDown(input, { key: 'Enter' });
      flush();
    };
    press(cellOf(container, 1, 'name') as HTMLElement);
    typeAndEnter('A');
    await settle();
    expect(saves).toHaveLength(1);
    expect(container.querySelector('.ssg-fill-handle')).not.toBeNull();
    typeAndEnter('B');
    await settle();
    expect(container.querySelector('.ssg-cell-editor')).toBeNull();
    expect(cellOf(container, 1, 'name')?.textContent).toBe('A');
    expect(cellOf(container, 2, 'name')?.textContent).toBe('B');
    for (const request of saves) request.resolve();
    await settle(50);
    expect(cellOf(container, 2, 'name')?.textContent).toBe('B');
    window.removeEventListener('error', onError);
    view.unmount();
    expect(errors).toEqual([]);
    expect(logs).toEqual([]);
  });
});

type NotifyCase = {
  prop: 'onActiveCellChange' | 'onCellClick' | 'onRowSelectionChange';
  extra?: { enableRowSelection: boolean };
  act: (container: HTMLElement) => void;
  check: (container: HTMLElement) => void;
};
const notifyCases: NotifyCase[] = [
  {
    prop: 'onActiveCellChange',
    act: (container) => {
      press(cellOf(container, 0, 'name') as HTMLElement);
      fireEvent.keyDown(container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement, { key: 'ArrowDown' });
      flush();
    },
    check: (container) => {
      expect([0, 1, 2].map((row) => cellOf(container, row, 'name')?.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    },
  },
  {
    prop: 'onCellClick',
    act: (container) => {
      const cell = cellOf(container, 1, 'name') as HTMLElement;
      press(cell);
      fireEvent.click(cell);
      flush();
    },
    check: (container) => {
      expect([0, 1, 2].map((row) => cellOf(container, row, 'name')?.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    },
  },
  {
    prop: 'onRowSelectionChange',
    extra: { enableRowSelection: true },
    act: (container) => {
      const header = container.querySelector<HTMLElement>('.ssg-body-row[data-row-index="1"] .ssg-row-header-cell') as HTMLElement;
      fireEvent.pointerDown(header, { button: 0, pointerId: 1 });
      fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
      fireEvent.click(header);
      flush();
    },
    check: (container) => {
      expect(container.querySelectorAll('.ssg-row-checkbox[data-state="checked"]')).toHaveLength(1);
    },
  },
];

describe.each(notifyCases)('通知の中で action を始めても表は動く($prop。S4-21)', (tc) => {
  it('action が終わる前に、操作の結果が画面に出る', async () => {
    watchConsole();
    const holds: Array<ReturnType<typeof deferred<void>>> = [];
    const view = render(() => {
      const wait = action(function* () {
        const request = deferred<void>();
        holds.push(request);
        yield request.promise;
      });
      const handler = () => {
        wait().catch(() => {});
      };
      return (
        <SpreadsheetGrid<Row>
          rows={makeRows(3)}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          {...{ [tc.prop]: handler }}
          {...(tc.extra ?? {})}
        />
      );
    });
    flush();
    tc.act(view.container);
    await settle();
    expect(holds.length).toBeGreaterThan(0);
    tc.check(view.container);
    for (const request of holds) request.resolve();
    await settle(50);
    tc.check(view.container);
    view.unmount();
    expect(logs).toEqual([]);
  });
});

describe('保存の間のほかの操作(S4-21)', () => {
  // 楽観的な値でグリッドの表示だけを先に出す形では、保存の間に新しく描いた行(スクロールして戻った行)の中が保存の終わりまで
  //   読めず、押しても効かなかった(Solid の NotReadyError)。グリッドの書き込みを利用者のフレームに入れない今の形では起きない。
  it('メニュー・検索・スクロールが効き、スクロールして描き直した行を押して編集できる', async () => {
    watchConsole();
    const saves: Array<ReturnType<typeof deferred<void>>> = [];
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
    };
    window.addEventListener('error', onError);
    const view = render(() => {
      const [serverRows, setServerRows] = createSignal(makeRows(200));
      const [rows, setRows] = createOptimistic(() => serverRows());
      const save = action(function* (next: Row[]) {
        setRows(() => next);
        const request = deferred<void>();
        saves.push(request);
        yield request.promise;
        setServerRows(() => next);
      });
      return (
        <SpreadsheetGrid<Row>
          rows={rows()}
          onRowsChange={(next) => {
            save(next).catch(() => {});
          }}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          enableColumnMenu
          enableContextMenu
          find
          getContextMenuItems={() => [{ kind: 'action', key: 'x', label: '項目', onSelect: () => {} }]}
        />
      );
    });
    flush();
    const { container } = view;
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    const menuItems = () => document.querySelectorAll('.ssg-menu-item').length;
    editTo(container, 0, '一回目');
    await settle();
    expect(saves).toHaveLength(1);
    expect(container.querySelector('.ssg-cell-editor')).toBeNull();
    // 右クリックメニュー
    fireEvent.contextMenu(cellOf(container, 2, 'name') as HTMLElement, { clientX: 10, clientY: 10 });
    await settle();
    expect(menuItems()).toBe(1);
    fireEvent.keyDown(document.activeElement ?? shell, { key: 'Escape' });
    await settle();
    expect(menuItems()).toBe(0);
    // 列メニュー
    const button = container.querySelector<HTMLElement>('[role="columnheader"][data-ssg-col-key="qty"] .ssg-icon-btn') as HTMLElement;
    fireEvent.pointerDown(button, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(button, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.click(button, { detail: 1 });
    await settle(120);
    expect(menuItems()).toBeGreaterThan(0);
    fireEvent.keyDown(document.activeElement ?? shell, { key: 'Escape' });
    await settle();
    expect(menuItems()).toBe(0);
    // 検索
    press(cellOf(container, 1, 'name') as HTMLElement);
    fireEvent.keyDown(shell, { key: 'f', ctrlKey: true });
    await settle();
    const findInput = document.querySelector<HTMLInputElement>('.ssg-find-bar-input') as HTMLInputElement;
    expect(findInput).not.toBeNull();
    findInput.value = '品目 5';
    fireEvent.input(findInput);
    await settle(200);
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
    fireEvent.keyDown(findInput, { key: 'Escape' });
    await settle();
    // スクロールして戻り、描き直した行を押して編集する
    const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container') as HTMLElement;
    scroller.scrollTop = 3000;
    fireEvent.scroll(scroller);
    await settle();
    expect(cellOf(container, 90, 'name')).not.toBeNull();
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    await settle();
    editTo(container, 2, '二回目');
    await settle();
    expect(cellOf(container, 0, 'name')?.textContent).toBe('一回目');
    expect(cellOf(container, 2, 'name')?.textContent).toBe('二回目');
    expect(saves).toHaveLength(2);
    for (const request of saves) request.resolve();
    await settle(50);
    expect(cellOf(container, 0, 'name')?.textContent).toBe('一回目');
    expect(cellOf(container, 2, 'name')?.textContent).toBe('二回目');
    window.removeEventListener('error', onError);
    view.unmount();
    expect(errors).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('右クリックメニューの項目の onSelect で action を始めても、メニューはすぐ閉じる', async () => {
    watchConsole();
    const holds: Array<ReturnType<typeof deferred<void>>> = [];
    const view = render(() => {
      const wait = action(function* () {
        const request = deferred<void>();
        holds.push(request);
        yield request.promise;
      });
      return (
        <SpreadsheetGrid<Row>
          rows={makeRows(3)}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          enableContextMenu
          getContextMenuItems={() => [
            {
              kind: 'action',
              key: 'go',
              label: '移動',
              onSelect: () => {
                wait().catch(() => {});
              },
            },
          ]}
        />
      );
    });
    flush();
    fireEvent.contextMenu(cellOf(view.container, 1, 'name') as HTMLElement, { clientX: 10, clientY: 10 });
    await settle();
    const item = document.querySelector<HTMLElement>('.ssg-menu-item') as HTMLElement;
    fireEvent.click(item);
    await settle();
    expect(holds).toHaveLength(1);
    expect(document.querySelectorAll('.ssg-menu-item')).toHaveLength(0);
    for (const request of holds) request.resolve();
    await settle(50);
    view.unmount();
    expect(logs).toEqual([]);
  });
});

describe('取り直しの間も操作できる(S5-21)', () => {
  it('行を非同期の createMemo で持ち、取り直しを待つ間も、前の行のままアクティブセルを動かせる', async () => {
    watchConsole();
    const loads = [deferred<Row[]>(), deferred<Row[]>()];
    let setPage: (page: number) => void = () => {};
    let pending: () => boolean = () => false;
    const { container, unmount } = render(() => {
      const [page, set] = createSignal(0);
      setPage = set;
      const rows = createMemo(async () => (loads[page()] as { promise: Promise<Row[]> }).promise);
      pending = () => isPending(rows);
      return (
        <Loading fallback={<p class="fallback">読み込み中</p>}>
          <SpreadsheetGrid<Row> rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} />
        </Loading>
      );
    });
    loads[0]?.resolve(makeRows(5));
    await settle();
    setPage(1);
    await settle();
    expect(pending()).toBe(true);
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(container, 1, 'name') as HTMLElement);
    fireEvent.keyDown(shell, { key: 'ArrowDown' });
    flush();
    await settle();
    // 届く前でも、前の行のまま動く(React 版の use + transition と同じ)。
    expect(pending()).toBe(true);
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 1');
    expect(cellOf(container, 2, 'name')?.getAttribute('aria-selected')).toBe('true');
    loads[1]?.resolve(makeRows(5, 100));
    await settle();
    expect(pending()).toBe(false);
    expect(cellOf(container, 0, 'name')?.textContent).toBe('品目 100');
    unmount();
    expect(logs).toEqual([]);
  });
});

describe('描いた後に知らせる通知(S4-21)', () => {
  it('グリッドを外した後には呼ばない', async () => {
    watchConsole();
    const onActiveCellChange = vi.fn();
    const { container, unmount } = render(() => (
      <SpreadsheetGrid<Row> rows={makeRows(3)} columns={columns} rowKeyGetter={(row) => row.id} onActiveCellChange={onActiveCellChange} />
    ));
    await settle();
    const before = onActiveCellChange.mock.calls.length;
    // 押した直後(通知はこの反映が終わった直後に呼ぶ)に外す。
    press(cellOf(container, 1, 'name') as HTMLElement);
    unmount();
    await settle();
    expect(onActiveCellChange.mock.calls.length).toBe(before);
    expect(logs).toEqual([]);
  });

  it('反映が終わった直後に呼び、その中で始めた action に表は巻き込まれない', async () => {
    watchConsole();
    const seen: Array<number | null> = [];
    const { container, unmount } = render(() => (
      <SpreadsheetGrid<Row>
        rows={makeRows(3)}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onActiveCellChange={(cell) => {
          seen.push(cell ? cell.rowIndex : null);
        }}
      />
    ));
    await settle();
    seen.length = 0;
    press(cellOf(container, 2, 'name') as HTMLElement);
    expect(seen).toEqual([]);
    await settle();
    expect(seen).toEqual([2]);
    unmount();
    expect(logs).toEqual([]);
  });
});

describe('props を作り直すオブジェクトの spread で渡す(S3-22)', () => {
  it('開発時に Solid の知らせを出さない', async () => {
    watchConsole();
    let handle: SpreadsheetGridHandle<Row> | undefined;
    let setDense: (dense: boolean) => void = () => {};
    const { container, unmount } = render(() => {
      const [dense, set] = createSignal(false);
      setDense = set;
      const gridProps = createMemo(() => ({
        rows: makeRows(3),
        columns,
        rowKeyGetter: (row: Row) => row.id,
        density: dense() ? ('compact' as const) : ('standard' as const),
        ref: (h: SpreadsheetGridHandle<Row>) => {
          handle = h;
        },
      }));
      return <SpreadsheetGrid<Row> {...gridProps()} />;
    });
    await settle();
    expect(handle).toBeDefined();
    setDense(true);
    await settle();
    expect(container.querySelector('.ssg-root')).not.toBeNull();
    unmount();
    expect(logs).toEqual([]);
  });
});

describe('<Show> での出し入れ', () => {
  it('何度出し入れしても、window と document のリスナーを残さず、ref は新しいグリッドのハンドルになる', async () => {
    watchConsole();
    const counts = new Map<string, number>();
    const track = (target: EventTarget, label: string) => {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
        counts.set(`${label}:${type}`, (counts.get(`${label}:${type}`) ?? 0) + 1);
        add(type, listener, options);
      });
      vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
        counts.set(`${label}:${type}`, (counts.get(`${label}:${type}`) ?? 0) - 1);
        remove(type, listener, options);
      });
    };
    track(window, 'window');
    track(document, 'document');
    let setShown: (shown: boolean) => void = () => {};
    const handles: SpreadsheetGridHandle<Row>[] = [];
    const { container, unmount } = render(() => {
      const [shown, set] = createSignal(true);
      setShown = set;
      return (
        <Show when={shown()}>
          <SpreadsheetGrid<Row>
            rows={makeRows(5)}
            columns={columns}
            rowKeyGetter={(row) => row.id}
            enableColumnFilter
            enableColumnMenu
            find
            ref={(handle) => {
              handles.push(handle);
            }}
          />
        </Show>
      );
    });
    await settle();
    for (let i = 0; i < 5; i += 1) {
      setShown(false);
      await settle();
      expect(container.querySelector('.ssg-root')).toBeNull();
      setShown(true);
      await settle();
      expect(container.querySelectorAll('.ssg-root')).toHaveLength(1);
    }
    expect(handles).toHaveLength(6);
    // 最後のハンドルは今のグリッドを動かす。
    handles.at(-1)?.selectCell(2, 1);
    flush();
    expect(handles.at(-1)?.getActiveCell()).toEqual({ row: 2, col: 1 });
    setShown(false);
    await settle(150);
    const leaked = [...counts].filter(([, count]) => count > 0);
    unmount();
    expect(leaked).toEqual([]);
    expect(logs).toEqual([]);
  });
});

describe('編集中のアンマウント(React 版の AP-12 / RA-1 と同じ)', () => {
  function setup() {
    let currentRows: Row[] = makeRows(3);
    let hide: (options?: { blurFirst?: boolean; nextRows?: Row[] }) => void = () => {};
    const view = render(() => {
      const [rows, setRows] = createSignal(currentRows);
      const [shown, setShown] = createSignal(true);
      hide = ({ blurFirst = false, nextRows } = {}) => {
        if (blurFirst && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
          flush();
        }
        if (nextRows) {
          currentRows = nextRows;
          setRows(() => nextRows);
        }
        setShown(false);
      };
      return (
        <Show when={shown()}>
          <SpreadsheetGrid<Row>
            rows={rows()}
            onRowsChange={(next) => {
              currentRows = next;
              setRows(() => next);
            }}
            columns={columns}
            rowKeyGetter={(row) => row.id}
          />
        </Show>
      );
    });
    flush();
    const shell = view.container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(view.container, 1, 'name') as HTMLElement);
    fireEvent.keyDown(shell, { key: 'F2' });
    flush();
    const input = view.container.querySelector<HTMLInputElement>('.ssg-cell-editor input') as HTMLInputElement;
    input.value = 'draft';
    fireEvent.input(input);
    flush();
    return { view, rows: () => currentRows, hide: (options?: Parameters<typeof hide>[0]) => hide(options) };
  }

  it('外すのと同じ更新で親が rows を変えても、外れたグリッドの古い rows で上書きしない', async () => {
    const { view, rows, hide } = setup();
    const replaced: Row[] = [{ id: 9, name: 'other', qty: 0 }];
    hide({ nextRows: replaced });
    await settle();
    expect(view.container.querySelector('.ssg-shell')).toBeNull();
    expect(rows()).toEqual(replaced);
    view.unmount();
  });

  it('外す前に入力欄を blur すると、打っていた値を確定してから外れる', async () => {
    const { view, rows, hide } = setup();
    hide({ blurFirst: true });
    await settle();
    expect(view.container.querySelector('.ssg-shell')).toBeNull();
    expect(rows()[1]?.name).toBe('draft');
    view.unmount();
  });
});

describe('1 ページに複数のグリッド', () => {
  it('キー操作・列メニュー・テーマは押したグリッドだけに効く', async () => {
    watchConsole();
    const { container, unmount } = render(() => (
      <>
        <div class="a">
          <SpreadsheetGrid<Row> rows={makeRows(5)} columns={columns} rowKeyGetter={(row) => row.id} enableColumnMenu theme="dark" />
        </div>
        <div class="b">
          <SpreadsheetGrid<Row> rows={makeRows(5, 50)} columns={columns} rowKeyGetter={(row) => row.id} enableColumnMenu />
        </div>
      </>
    ));
    await settle();
    const a = container.querySelector('.a') as HTMLElement;
    const b = container.querySelector('.b') as HTMLElement;
    press(cellOf(a, 0, 'name') as HTMLElement);
    fireEvent.keyDown(a.querySelector('.ssg-shell') as HTMLElement, { key: 'ArrowDown' });
    flush();
    press(cellOf(b, 3, 'qty') as HTMLElement);
    flush();
    const activeIn = (root: HTMLElement) =>
      [...root.querySelectorAll<HTMLElement>('[role="gridcell"][aria-selected="true"]')].map(
        (cell) => `${cell.closest('.ssg-body-row')?.getAttribute('data-row-index')}:${cell.getAttribute('data-ssg-col-key')}`,
      );
    expect(activeIn(a)).toEqual(['1:name']);
    expect(activeIn(b)).toEqual(['3:qty']);
    // A の列メニューを開くとダークのテーマで出て、B を押すと閉じる。
    const menuButton = a.querySelector<HTMLElement>('.ssg-header-cell[data-ssg-col-key="name"] .ssg-icon-btn') as HTMLElement;
    fireEvent.pointerDown(menuButton, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(menuButton, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.click(menuButton, { detail: 1 });
    await settle(60);
    const menus = document.querySelectorAll<HTMLElement>('.ssg-menu-panel');
    expect(menus).toHaveLength(1);
    expect(menus[0]?.classList.contains('ssg-theme-dark')).toBe(true);
    fireEvent.pointerDown(cellOf(b, 1, 'name') as HTMLElement, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
    await settle(60);
    expect(document.querySelectorAll('.ssg-menu-panel')).toHaveLength(0);
    expect(activeIn(a)).toEqual(['1:name']);
    unmount();
    expect(logs).toEqual([]);
  });
});

// 追加(段 3-1): `ref={setGrid}`(signal の setter)でハンドルを受ける書き方。部品の本体の中で signal へ書くことになり、Solid の
//   開発ビルドが REACTIVE_WRITE_IN_OWNED_SCOPE で止めていた(DOM の要素の `<div ref={setEl}>` は通る)。
describe('ref に signal の setter を渡す', () => {
  it('ハンドルが signal に入り、利用者の最初の effect から読める(知らせも出さない)', () => {
    watchConsole();
    const [grid, setGrid] = createSignal<SpreadsheetGridHandle<Row>>();
    const seen: string[] = [];
    const { unmount } = render(() => {
      createEffect(
        () => grid(),
        (handle) => {
          seen.push(handle ? `handle:${handle.getState().filters.globalText}` : 'none');
        },
      );
      return <SpreadsheetGrid<Row> ref={setGrid} rows={makeRows(3)} columns={columns} rowKeyGetter={(row) => row.id} />;
    });
    flush();
    expect(seen).toEqual(['handle:']);
    grid()!.applyState({ filters: { globalText: '品目 2' } });
    flush();
    expect(grid()!.getState().filters.globalText).toBe('品目 2');
    unmount();
    expect(logs).toEqual([]);
  });
});