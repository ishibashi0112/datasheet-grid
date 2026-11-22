// Solid らしい使い方の確かめ(段階 4 の測り直し 1-5)。React 版には無い書き方(非同期の行と <Loading> / <Errored>、
//   取り直しの間の古い表示、<Show> での出し入れ、1 ページに複数のグリッド)で、グリッドが壊れず、警告も出さないこと。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Errored, Loading, Show, action, createMemo, createOptimistic, createSignal, flush, isPending } from 'solid-js';
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