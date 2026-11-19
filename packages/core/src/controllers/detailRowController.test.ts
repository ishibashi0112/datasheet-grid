// 追加(Solid 版 段階 1-3): 展開行の開閉とカードの Tab の順のコントローラ(React 版の GridShell.tsx から移したもの)。
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gridActions, type GridUiAction } from '../model/gridActions';
import { createInitialGridUiState } from '../model/gridReducer';
import type { GridUiState, RowModel } from '../model/gridTypes.unbound';
import { createDetailIndexCacheHolder } from '../logic/detailRow';
import { createDetailRowController, notifyDetailCardFocusLost, type DetailRowControllerArgs } from './detailRowController';

type Row = { id: string };

afterEach(() => {
  document.body.innerHTML = '';
});

const ROWS: Row[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const rowModel: RowModel<Row> = {
  getRowCount: () => ROWS.length,
  getRow: (index) => ROWS[index],
  getRowKey: (index) => ROWS[index]?.id,
  getSourceIndex: (index) => (index >= 0 && index < ROWS.length ? index : undefined),
} as RowModel<Row>;

// シェル(フォーカスを受ける要素)> スクロールコンテナ(帯とカード)+ 表の直後の目印 + 表の外のボタン。
const buildDom = (expandedRows: number[]) => {
  const shell = document.createElement('div');
  shell.tabIndex = 0;
  const scroll = document.createElement('div');
  for (const row of expandedRows) {
    const band = document.createElement('div');
    band.dataset.detailRowIndex = String(row);
    const card = document.createElement('div');
    card.setAttribute('data-ssg-detail', '');
    card.innerHTML = `<button id="first-${row}">1</button><button id="last-${row}">2</button>`;
    band.appendChild(card);
    scroll.appendChild(band);
  }
  const exit = document.createElement('span');
  exit.tabIndex = 0;
  shell.append(scroll, exit);
  const after = document.createElement('button');
  after.id = 'after';
  document.body.append(shell, after);
  return { shell, scroll, exit, after };
};

const setup = (expandedRows: number[], overrides: Partial<DetailRowControllerArgs<Row>> = {}) => {
  const dom = buildDom(expandedRows);
  let state: GridUiState = {
    ...createInitialGridUiState(),
    expandedDetailRowKeys: new Set(expandedRows.map((row) => ROWS[row]!.id)),
  };
  const actions: GridUiAction[] = [];
  const scrollCellIntoView = vi.fn();
  const controller = createDetailRowController<Row>();
  const args: DetailRowControllerArgs<Row> = {
    rowModel,
    orderedColumns: [{ key: '__ssg_detail_toggle__' }, { key: 'name' }, { key: 'qty' }],
    hasCards: expandedRows.length > 0,
    drawable: true,
    isExpandable: undefined,
    detailIndexCache: createDetailIndexCacheHolder(),
    getUiState: () => state,
    dispatch: (action) => actions.push(action),
    scrollContainerRef: { current: dom.scroll },
    gridRootRef: { current: dom.shell },
    tableExitRef: { current: dom.exit },
    scrollCellIntoView,
    ...overrides,
  };
  controller.update(args);
  return {
    ...dom,
    controller,
    args,
    actions,
    scrollCellIntoView,
    setState: (next: Partial<GridUiState>) => {
      state = { ...state, ...next };
    },
  };
};

const keydown = (target: Element, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

describe('開閉', () => {
  it('toggleAt はキャッシュを seed してから開閉する。閉じる前にカードの中のフォーカスを表へ戻し、その行のセルを選ぶ', () => {
    const { controller, args, actions, shell, scrollCellIntoView } = setup([1]);
    (document.getElementById('first-1') as HTMLElement).focus();
    controller.toggleAt('b', 1);
    expect(args.detailIndexCache.current.indexByKey.get('b')).toBe(1);
    // アクティブセルが無いので最初のデータの列(展開トグル列を飛ばす)。
    expect(actions).toEqual([
      gridActions.startSelection({ row: 1, col: 1 }),
      gridActions.endSelection(),
      gridActions.toggleDetailRow('b'),
    ]);
    expect(document.activeElement).toBe(shell);
    expect(scrollCellIntoView).toHaveBeenCalledWith({ row: 1, col: 1 });
  });

  it('閉じるときでもフォーカスがカードの外なら動かさない。開くときは戻さない', () => {
    const { controller, actions, after } = setup([1]);
    after.focus();
    controller.setExpandedAt('b', 1, false);
    controller.setExpandedAt('a', 0, true);
    expect(actions).toEqual([gridActions.setDetailRowExpanded('b', false), gridActions.setDetailRowExpanded('a', true)]);
    expect(document.activeElement).toBe(after);
  });

  it('アクティブセルがあればその列へ戻す(returnFocusFromCards = ハンドルで閉じる前)', () => {
    const { controller, actions, setState } = setup([2]);
    setState({ activeCell: { row: 0, col: 2 } });
    (document.getElementById('last-2') as HTMLElement).focus();
    controller.returnFocusFromCards([0, 2]);
    expect(actions).toEqual([gridActions.startSelection({ row: 2, col: 2 }), gridActions.endSelection()]);
  });

  it('toggleFromKeyboard は読み込み済みで開閉できる行だけ(描けない行数 / isExpandable が false の行は false)', () => {
    const isExpandable = vi.fn((row: Row) => row.id !== 'c');
    const { controller, actions } = setup([], { isExpandable });
    expect(controller.toggleFromKeyboard({ row: 0, col: 0 })).toBe(true);
    expect(isExpandable).toHaveBeenCalledWith(ROWS[0], { rowKey: 'a', sourceRowIndex: 0 });
    expect(controller.toggleFromKeyboard({ row: 2, col: 0 })).toBe(false);
    expect(controller.toggleFromKeyboard({ row: 9, col: 0 })).toBe(false);
    expect(actions).toEqual([gridActions.toggleDetailRow('a')]);

    const notDrawable = setup([], { drawable: false });
    expect(notDrawable.controller.toggleFromKeyboard({ row: 0, col: 0 })).toBe(false);
  });
});

describe('Tab の順', () => {
  it('最終列の Tab はその行のカードの最初の要素へ。カードが無い行は表の直後の目印へ移して既定の Tab に任せる', () => {
    const { controller, exit, shell } = setup([1]);
    expect(controller.handleTabPastLastColumn(1)).toBe(true);
    expect(document.activeElement?.id).toBe('first-1');
    // 目印へ移したことを「後ろから戻ってきた」と扱わない(シェルへ戻さない)。
    exit.addEventListener('focus', () => controller.handleTableExitFocus(shell));
    expect(controller.handleTabPastLastColumn(0)).toBe(false);
    expect(document.activeElement).toBe(exit);
  });

  it('カードの最後の要素の Tab は表の外へ、最初の要素の Shift+Tab はその行の最終列のセルへ戻る', () => {
    const { controller, actions, exit, shell, scroll, scrollCellIntoView } = setup([1]);
    const card = scroll.querySelector<HTMLElement>('[data-ssg-detail]')!;
    const last = document.getElementById('last-1')!;
    last.focus();
    const forward = keydown(last, {});
    controller.handleCardKeyDown(forward, card, 1);
    expect(document.activeElement).toBe(exit);
    expect(forward.defaultPrevented).toBe(false);

    const first = document.getElementById('first-1')!;
    first.focus();
    const backward = keydown(first, { shiftKey: true });
    controller.handleCardKeyDown(backward, card, 1);
    expect(backward.defaultPrevented).toBe(true);
    expect(actions).toEqual([
      gridActions.startSelection({ row: 1, col: 2 }),
      gridActions.endSelection(),
      gridActions.activateCell({ row: 1, col: 2 }),
    ]);
    expect(document.activeElement).toBe(shell);
    expect(scrollCellIntoView).toHaveBeenCalledWith({ row: 1, col: 2 });
  });

  it('カードの端でない要素 / 修飾キー / カードの外(portal)の要素の Tab は既定のまま', () => {
    const { controller, actions, scroll, after } = setup([1]);
    const card = scroll.querySelector<HTMLElement>('[data-ssg-detail]')!;
    const first = document.getElementById('first-1')!;
    first.focus();
    controller.handleCardKeyDown(keydown(first, {}), card, 1);
    controller.handleCardKeyDown(keydown(document.getElementById('last-1')!, { ctrlKey: true }), card, 1);
    controller.handleCardKeyDown(keydown(after, { shiftKey: true }), card, 1);
    expect(actions).toEqual([]);
    expect(document.activeElement).toBe(first);
  });

  it('表の後ろから Shift+Tab で目印に来たらアクティブセルの行のカードの最後の要素へ。前から来たらシェルへ', () => {
    const { controller, setState, shell, after } = setup([1]);
    setState({ activeCell: { row: 1, col: 1 } });
    controller.handleTableExitFocus(after);
    expect(document.activeElement?.id).toBe('last-1');
    controller.handleTableExitFocus(shell);
    expect(document.activeElement).toBe(shell);
    // 来る前の要素が分からない(ウィンドウの外から)ときは後ろからとみなす。
    controller.handleTableExitFocus(null);
    expect(document.activeElement?.id).toBe('last-1');
  });

  it('handleRootKeyDownAfter: カードがあるとき、セルの中の要素で Tab を押して表の中にもう止まる要素が無ければ表の外へ', () => {
    const { controller, scroll, exit } = setup([0]);
    const button = document.createElement('button');
    scroll.appendChild(button);
    button.focus();
    controller.handleRootKeyDownAfter(keydown(button, {}));
    expect(document.activeElement).toBe(exit);

    // 既に処理された Tab(グリッドのキー操作が preventDefault)・Shift+Tab・カードの中は扱わない。
    button.focus();
    const handled = keydown(button, {});
    handled.preventDefault();
    controller.handleRootKeyDownAfter(handled);
    controller.handleRootKeyDownAfter(keydown(button, { shiftKey: true }));
    controller.handleRootKeyDownAfter(keydown(document.getElementById('last-0')!, {}));
    expect(document.activeElement).toBe(button);

    const noCards = setup([], {});
    const other = document.createElement('button');
    noCards.scroll.appendChild(other);
    other.focus();
    noCards.controller.handleRootKeyDownAfter(keydown(other, {}));
    expect(document.activeElement).toBe(other);
  });
});

describe('notifyDetailCardFocusLost', () => {
  it('中にフォーカスがあったカードが消えて body に落ちたときだけ呼ぶ', async () => {
    const card = document.createElement('div');
    card.innerHTML = '<button>x</button>';
    document.body.appendChild(card);
    card.querySelector('button')!.focus();
    const onLost = vi.fn();
    notifyDetailCardFocusLost(card, onLost);
    card.remove();
    await Promise.resolve();
    expect(onLost).toHaveBeenCalledTimes(1);

    // 消える前にフォーカスを別の場所へ移した操作は邪魔しない。
    const card2 = document.createElement('div');
    card2.innerHTML = '<button>y</button>';
    const outside = document.createElement('button');
    document.body.append(card2, outside);
    card2.querySelector('button')!.focus();
    const onLost2 = vi.fn();
    notifyDetailCardFocusLost(card2, onLost2);
    card2.remove();
    outside.focus();
    await Promise.resolve();
    expect(onLost2).not.toHaveBeenCalled();
  });
});