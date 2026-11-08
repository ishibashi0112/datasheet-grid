// SpreadsheetGrid を実際に render し、展開行(Master/Detail、detail batch 1〜4)の配線を実行検証する
//   結合テストです。rowKey → view index 解決と選択帯の分割は logic/detailRow.test.ts、
//   reducer は model/gridReducer.detail.test.ts が正本で、ここでは実コンポーネント越しに
//   「トグル列 / 帯とカードの描画 / 開閉の各経路 / 通知 / イベント境界 / 未指定時の不変」を
//   確認します。行の DOM を検証するため grouping 結合テストと同じ寸法スタブを使います。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { createPortal } from 'react-dom';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { DETAIL_TOGGLE_COLUMN_KEY } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import type {
  DetailRowOptions,
  GridColumn,
  ServerSideDataSource,
  SpreadsheetGridHandle,
} from './model/gridTypes';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      ResizeObserverStub;
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
  // jsdom は要素寸法が常に 0 のため、行 / 列仮想化が 1 件も描画しません。行と帯の DOM を
  //   検証するので寸法を広い固定値でスタブします(grouping 結合テストと同じ流儀)。
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1600,
  });
  // @tanstack/virtual-core 3.19 から、列の仮想化は見える幅を clientWidth で読みます(3.17 までは offsetWidth)。
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 900,
  });
});

afterEach(() => {
  cleanup();
});

type Row = { id: string; name: string; qty: number };

const rows: Row[] = [
  { id: 'a', name: 'alpha', qty: 10 },
  { id: 'b', name: 'beta', qty: 0 },
  { id: 'c', name: 'gamma', qty: 30 },
];

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: '名称', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

const rowKeyGetter = (row: Row) => row.id;

const detailRow: DetailRowOptions<Row> = {
  height: 120,
  isExpandable: (row) => row.qty !== 0,
  render: ({ row, rowKey, rowIndex, collapse }) => (
    <div data-testid="detail-card-content">
      <span>{`detail:${rowKey}:${row.name}:${rowIndex}`}</span>
      <button type="button" onClick={collapse}>
        閉じる
      </button>
      <input aria-label="card-input" />
    </div>
  ),
};

const headerCell = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(
    `.ssg-header-row [data-ssg-col-key="${key}"]`,
  );
const headerKeys = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>('.ssg-header-row [data-ssg-col-key]'),
  ).map((cell) => cell.dataset.ssgColKey);
// center ペインの行 / 帯 / トグルです(left ペインの複製を数えないためペインを固定します)。
const centerRow = (container: HTMLElement, index: number) =>
  container.querySelector<HTMLElement>(
    `[data-pane="center"][data-row-index="${index}"]`,
  );
// トグルはトグル列のあるペイン(左固定列があれば left、なければ center)の行にあります。
const toggleAt = (container: HTMLElement, index: number) =>
  container.querySelector<HTMLButtonElement>(
    `[data-row-index="${index}"] .ssg-detail-toggle`,
  );
// 行は transform: translateY(px) で縦位置を持ちます(帯は top)。
const rowTop = (row: HTMLElement): number => {
  const match = /translateY\((-?[\d.]+)px\)/.exec(row.style.transform);
  return match ? parseFloat(match[1]) : Number.NaN;
};
const centerBands = (container: HTMLElement) =>
  container.querySelectorAll<HTMLElement>(
    '.ssg-center-pane .ssg-detail-band',
  );
const cards = (container: HTMLElement) =>
  container.querySelectorAll<HTMLElement>('.ssg-detail-card');
const getShell = (container: HTMLElement): HTMLElement => {
  const shell = container.querySelector<HTMLElement>('.ssg-shell');
  if (!shell) {
    throw new Error('ssg-shell が見つかりません');
  }
  return shell;
};

describe('展開行(結合)', () => {
  it('detailRow 指定時: 先頭に空タイトルのトグル列(28px)が挿入され、展開不可の行にはトグルが出ない', () => {
    const { container } = render(
      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
      />,
    );

    expect(headerKeys(container)).toEqual([
      DETAIL_TOGGLE_COLUMN_KEY,
      'id',
      'name',
      'qty',
    ]);
    const toggleHeader = headerCell(container, DETAIL_TOGGLE_COLUMN_KEY);
    expect(toggleHeader?.style.width).toBe('28px');
    expect(toggleHeader?.textContent).toBe('');
    // 列メニュー(⋮)は他列にだけ出ます。
    expect(toggleHeader?.querySelector('[data-ssg-tooltip="列メニュー"]')).toBeNull();
    expect(
      headerCell(container, 'id')?.querySelector('[data-ssg-tooltip="列メニュー"]'),
    ).not.toBeNull();

    // 行 1(b, qty=0)は isExpandable=false → トグル無し。他はあり(閉じた状態)。
    expect(toggleAt(container, 0)?.getAttribute('aria-expanded')).toBe('false');
    expect(toggleAt(container, 1)).toBeNull();
    expect(toggleAt(container, 2)?.getAttribute('aria-expanded')).toBe('false');
    expect(centerBands(container)).toHaveLength(0);
  });

  it('トグル click で帯とカードが描画され、render 出力 / 通知 / collapse / ref API が機能する', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onChange = vi.fn();
    // ID 列を左固定にして 3 ペイン構成(トグル列も左固定側へ入る)で検証します。
    const pinnedColumns: GridColumn<Row>[] = [
      { ...columns[0], pinned: 'left' },
      ...columns.slice(1),
    ];
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={pinnedColumns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
        onExpandedDetailRowKeysChange={onChange}
      />,
    );
    // mount 時は通知しません。
    expect(onChange).not.toHaveBeenCalled();

    // 行 0 を展開: 帯は行 0 の直下(top = 行高)・高さ 120、カードに render の出力が入ります。
    fireEvent.click(toggleAt(container, 0) as HTMLButtonElement);
    expect(toggleAt(container, 0)?.getAttribute('aria-expanded')).toBe('true');
    const bands = centerBands(container);
    expect(bands).toHaveLength(1);
    expect(bands[0].dataset.detailRowIndex).toBe('0');
    expect(bands[0].style.height).toBe('120px');
    const row0 = centerRow(container, 0) as HTMLElement;
    const row0Top = rowTop(row0);
    const row0Height = parseFloat(row0.style.height);
    expect(row0Height).toBeGreaterThan(0);
    expect(parseFloat(bands[0].style.top)).toBe(row0Top + row0Height);
    // 次の行は帯の分だけ下がります。
    expect(rowTop(centerRow(container, 1) as HTMLElement)).toBe(
      row0Top + row0Height + 120,
    );
    const card = cards(container)[0];
    expect(card.hasAttribute('data-ssg-detail')).toBe(true);
    expect(card.textContent).toContain('detail:a:alpha:0');
    expect(onChange).toHaveBeenLastCalledWith(['a']);

    // 帯は左固定ペイン側にも出ます(左 + 中央 = 2)が、カードは中央ペインだけです。
    const allBands = container.querySelectorAll<HTMLElement>('.ssg-detail-band');
    expect(allBands).toHaveLength(2);
    const leftBand = Array.from(allBands).find(
      (band) => band.closest('.ssg-center-pane') === null,
    ) as HTMLElement;
    expect(leftBand.querySelector('.ssg-detail-card')).toBeNull();
    expect(leftBand.style.top).toBe(bands[0].style.top);
    expect(cards(container)).toHaveLength(1);

    // ctx.collapse(カード内「閉じる」)で閉じます。
    fireEvent.click(card.querySelector('button') as HTMLButtonElement);
    expect(centerBands(container)).toHaveLength(0);
    expect(onChange).toHaveBeenLastCalledWith([]);

    // ref API: setDetailRowExpanded / getExpandedDetailRowKeys / collapseAllDetailRows。
    act(() => {
      ref.current?.setDetailRowExpanded('c', true);
      ref.current?.setDetailRowExpanded('a', true);
      // 展開不可の行は no-op です。
      ref.current?.setDetailRowExpanded('b', true);
    });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['c', 'a']);
    expect(
      Array.from(centerBands(container)).map((band) => band.dataset.detailRowIndex),
    ).toEqual(['0', '2']);
    act(() => {
      ref.current?.collapseAllDetailRows();
    });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([]);
    expect(centerBands(container)).toHaveLength(0);
  });

  it('カード内のキー操作はグリッドへ伝播しない(イベント境界)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
      />,
    );
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
      ref.current?.setDetailRowExpanded('a', true);
    });
    const input = container.querySelector<HTMLInputElement>(
      '.ssg-detail-card input',
    ) as HTMLInputElement;
    // カード内からの ArrowDown はシェルの keydown に届かず、アクティブセルは動きません。
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(ref.current?.getActiveCell()).toEqual({ row: 0, col: 1 });
    // 対照: シェルへ直接発火すれば動きます。
    fireEvent.keyDown(getShell(container), { key: 'ArrowDown' });
    expect(ref.current?.getActiveCell()).toEqual({ row: 1, col: 1 });
  });

  it('showToggleColumn=false: トグル列は挿入されず、renderCell の ctx.detail で開閉できる', () => {
    const detailFromCell = vi.fn();
    const customColumns: GridColumn<Row>[] = [
      {
        key: 'id',
        title: 'ID',
        width: 80,
        renderCell: (ctx) => {
          detailFromCell(ctx.detail);
          return (
            <button
              type="button"
              className="my-toggle"
              onClick={() => ctx.detail?.toggle()}
            >
              {ctx.detail?.expanded ? '-' : '+'}
            </button>
          );
        },
      },
      ...columns.slice(1),
    ];
    const { container } = render(
      <SpreadsheetGrid
        columns={customColumns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        detailRow={{ ...detailRow, showToggleColumn: false }}
      />,
    );
    expect(headerKeys(container)).toEqual(['id', 'name', 'qty']);
    expect(container.querySelector('.ssg-detail-toggle')).toBeNull();
    // ctx.detail は定義され、展開不可の行では expandable=false です。
    const ctxCalls = detailFromCell.mock.calls.map((call) => call[0]);
    expect(ctxCalls.every((ctx) => ctx != null)).toBe(true);
    expect(ctxCalls.some((ctx) => ctx.expandable === false)).toBe(true);

    const myToggle = centerRow(container, 2)?.querySelector<HTMLButtonElement>(
      '.my-toggle',
    ) as HTMLButtonElement;
    fireEvent.click(myToggle);
    expect(centerBands(container)).toHaveLength(1);
    expect(centerBands(container)[0].dataset.detailRowIndex).toBe('2');
    expect(cards(container)[0].textContent).toContain('detail:c:gamma:2');
    fireEvent.click(
      centerRow(container, 2)?.querySelector('.my-toggle') as HTMLButtonElement,
    );
    expect(centerBands(container)).toHaveLength(0);
  });

  it('detailRow 未指定: トグル列 / 帯は出ず、ctx.detail は undefined、ref API は no-op', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const seen: unknown[] = [];
    const plainColumns: GridColumn<Row>[] = [
      {
        key: 'id',
        title: 'ID',
        width: 80,
        renderCell: (ctx) => {
          seen.push(ctx.detail);
          return ctx.value as string;
        },
      },
      ...columns.slice(1),
    ];
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={plainColumns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
      />,
    );
    expect(headerKeys(container)).toEqual(['id', 'name', 'qty']);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value === undefined)).toBe(true);
    act(() => {
      ref.current?.setDetailRowExpanded('a', true);
    });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([]);
    expect(container.querySelector('.ssg-detail-band')).toBeNull();
    expect(container.querySelector('.ssg-detail-toggle')).toBeNull();
  });

  it('serverSide: トグルで展開でき、query(フィルター)が変わると全て閉じる', async () => {
    const serverRows = rows;
    const dataSource: ServerSideDataSource<Row> = {
      getRows: (params) =>
        Promise.resolve({
          rows: serverRows.slice(params.startIndex, params.endIndex),
          totalRowCount: serverRows.length,
        }),
    };
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={[]}
        dataSource={dataSource}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
      />,
    );
    // 初回ロード(getRows は即時解決)を待ちます。
    await act(async () => {
      await Promise.resolve();
    });
    expect(toggleAt(container, 2)).not.toBeNull();

    fireEvent.click(toggleAt(container, 2) as HTMLButtonElement);
    expect(centerBands(container)).toHaveLength(1);
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['c']);

    // ソート変更で query が変わる(debounce 300ms)→ 展開状態は全て破棄されます。
    act(() => {
      const state = ref.current?.getState();
      if (state) {
        ref.current?.applyState({
          ...state,
          sort: [{ columnKey: 'qty', direction: 'desc' }],
        });
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([]);
    expect(centerBands(container)).toHaveLength(0);
  });
});

// 追加(dogfood DF-16 / DU-04): 実際にアプリを作って見つかった展開行の操作の所見の回帰テストです。
describe('展開行の操作(dogfood)', () => {
  it('DF-16: ▸ を押してもアクティブセルは動かず onActiveCellChange も呼ばれない(開閉だけ)。フォーカスはグリッドへ', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onActiveCellChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
        onActiveCellChange={onActiveCellChange}
      />,
    );
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 2 });
    });
    onActiveCellChange.mockClear();
    const toggle = toggleAt(container, 0);
    expect(toggle).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(toggle!, { button: 0, pointerId: 1, pointerType: 'mouse' });
      fireEvent.pointerUp(window, { button: 0, pointerId: 1, pointerType: 'mouse' });
      fireEvent.click(toggle!);
    });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['a']);
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });
    expect(onActiveCellChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(getShell(container));
  });

  // 追加(別視点のレビュー): ▸ の pointerdown は window まで届く(開いている右クリックメニューやポップオーバーは、外側の
  //   pointerdown を window で見て閉じるため。伝播を止めると開いたまま残っていた)。アクティブセルは動かさないまま。
  it('DF-16: ▸ の pointerdown は window へ届く(開いているメニューが閉じる)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid ref={ref} columns={columns} rows={rows} rowKeyGetter={rowKeyGetter} detailRow={detailRow} />,
    );
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 2 });
    });
    const seen = vi.fn();
    window.addEventListener('pointerdown', seen);
    try {
      const toggle = toggleAt(container, 0);
      act(() => {
        fireEvent.pointerDown(toggle!, { button: 0, pointerId: 1, pointerType: 'mouse' });
        fireEvent.pointerUp(window, { button: 0, pointerId: 1, pointerType: 'mouse' });
        fireEvent.click(toggle!);
      });
      expect(seen).toHaveBeenCalledTimes(1);
      expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['a']);
      expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });
      // タッチで押しても、アクティブセルは動かない
      act(() => {
        fireEvent.pointerDown(toggle!, { button: 0, pointerId: 2, pointerType: 'touch', clientX: 5, clientY: 5 });
        fireEvent.pointerUp(window, { button: 0, pointerId: 2, pointerType: 'touch', clientX: 5, clientY: 5 });
      });
      expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });
    } finally {
      window.removeEventListener('pointerdown', seen);
    }
  });

  it('DU-04: 展開トグル列のセルで Enter / Space を押すと開閉する(開閉できない行では何もしない)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onRowsChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
        onRowsChange={onRowsChange}
      />,
    );
    const shell = getShell(container);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 0 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['a']);
    fireEvent.keyDown(shell, { key: ' ' });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([]);
    // 行 b は isExpandable が false。
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 0 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([]);
    // データ列の Enter はこれまでどおり編集の開始(開閉しない)。
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 2 });
    });
    fireEvent.keyDown(shell, { key: 'Enter' });
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([]);
    expect(container.querySelector('.ssg-cell-editor, [data-ssg-editor]')).not.toBeNull();
  });
});


// 追加(段階 2 DF-25): 展開中の行を rows から消したら、そのキーを外して onExpandedDetailRowKeysChange で知らせます。
//   これまでは getExpandedDetailRowKeys() にキーが残り、通知も来ませんでした(同じキーの行を足し直すと開いたまま出た)。
describe('展開中の行を rows から消す(DF-25)', () => {
  it('消した行のキーを外して通知する。残っている行と、まだ読み込んでいない行のキーは残す', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onChange = vi.fn();
    const view = (nextRows: Row[]) => (
      <SpreadsheetGrid
        ref={ref}
        columns={columns}
        rows={nextRows}
        rowKeyGetter={rowKeyGetter}
        detailRow={detailRow}
        onExpandedDetailRowKeysChange={onChange}
      />
    );
    const { rerender } = render(view(rows));
    act(() => {
      ref.current?.setDetailRowExpanded('a', true);
      ref.current?.setDetailRowExpanded('c', true);
      // まだ rows に無い行(後から読み込む行)のキー。
      ref.current?.setDetailRowExpanded('z', true);
    });
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c', 'z']);
    onChange.mockClear();

    // 編集(同じ位置の行の差し替え)では外さない。
    rerender(view([rows[0], rows[1], { ...rows[2], qty: 31 }]));
    expect(onChange).not.toHaveBeenCalled();

    // c を消す。
    rerender(view([rows[0], rows[1]]));
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['a', 'z']);
    expect(onChange).toHaveBeenLastCalledWith(['a', 'z']);

    // 同じキーの行を足し直しても、開いたままにはならない。
    rerender(view(rows));
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual(['a', 'z']);
  });
});

// 追加(段階 2 C-N2): 最終列の Tab は、その行のカードが開いていればカードの中へ、カードの最後でグリッドの外へ。Shift+Tab は逆順。
//   これまではブラウザの既定(DOM の順)で、画面の上の方にある別の行のカードへ入っていました。jsdom はフォーカスの既定の
//   移動をしないので、既定動作を止めたか(fireEvent の戻り値が false)と、既定動作の前にフォーカスをどこへ移したかを見ます
//   (実際の移動は監査ハーネスで Chromium / Firefox / WebKit を確認)。
describe('展開行のカードと Tab(C-N2)', () => {
  // 列の並び: 0 = 展開トグル列, 1 = ID, 2 = 名称, 3 = 数量(最終列)。カードの中は「閉じる」ボタン → 入力欄。
  const LAST_COL = 3;
  const cardOf = (container: HTMLElement, rowIndex: number) =>
    container.querySelector<HTMLElement>(`.ssg-detail-band[data-detail-row-index="${rowIndex}"] .ssg-detail-card`);
  const renderGrid = (expanded: string[]) => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = render(
      <div>
        <SpreadsheetGrid ref={ref} columns={columns} rows={rows} rowKeyGetter={rowKeyGetter} detailRow={detailRow} />
        <button type="button">表の後ろ</button>
      </div>,
    );
    act(() => {
      for (const key of expanded) ref.current?.setDetailRowExpanded(key, true);
    });
    return { ref, container: view.container, shell: getShell(view.container) };
  };

  it('最終列の Tab は、その行のカードが開いていればカードの最初の要素へ(既定動作を止める)', () => {
    const { ref, container, shell } = renderGrid(['a', 'c']);
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: LAST_COL });
    });
    shell.focus();
    expect(fireEvent.keyDown(shell, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(cardOf(container, 2)?.querySelector('button'));
  });

  it('その行のカードが無ければ、別の行のカードを飛ばして表の直後の目印へ移し、既定動作で外へ出す', () => {
    const { ref, container, shell } = renderGrid(['a']);
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: LAST_COL });
    });
    shell.focus();
    expect(fireEvent.keyDown(shell, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('.ssg-tab-exit'));
    // 最終列でなければこれまでどおり右のセルへ(既定動作を止める)。
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    shell.focus();
    expect(fireEvent.keyDown(shell, { key: 'Tab' })).toBe(false);
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });
    expect(document.activeElement).toBe(shell);
  });

  it('カードの最後の要素の Tab は表の外へ、最初の要素の Shift+Tab はその行の最終列のセルへ。途中の要素は既定のまま', () => {
    const { ref, container, shell } = renderGrid(['a', 'c']);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: 1 });
    });
    const card = cardOf(container, 2);
    const button = card?.querySelector<HTMLButtonElement>('button');
    const input = card?.querySelector<HTMLInputElement>('input');
    expect(button && input).toBeTruthy();
    // 途中(ボタンの次に入力欄がある)は既定動作のまま。
    button!.focus();
    expect(fireEvent.keyDown(button!, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(button);
    // 最後の要素: 表の直後の目印へ移して既定動作で外へ。
    input!.focus();
    expect(fireEvent.keyDown(input!, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('.ssg-tab-exit'));
    // 最初の要素の Shift+Tab: その行(2)の最終列のセルへ戻り、フォーカスはシェル。
    button!.focus();
    expect(fireEvent.keyDown(button!, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: LAST_COL });
    expect(document.activeElement).toBe(shell);
    // 最後の要素の Shift+Tab は既定のまま(ボタンへ)。
    input!.focus();
    expect(fireEvent.keyDown(input!, { key: 'Tab', shiftKey: true })).toBe(true);
  });

  it('表の後ろから Shift+Tab で目印に来たら、アクティブセルの行のカードの最後の要素へ。カードが無い行・表の中から来たときはシェルへ', () => {
    const { ref, container, shell } = renderGrid(['a', 'c']);
    const exit = container.querySelector<HTMLElement>('.ssg-tab-exit');
    const after = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '表の後ろ');
    expect(exit?.tabIndex).toBe(0);
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    after!.focus();
    act(() => {
      exit!.focus();
    });
    expect(document.activeElement).toBe(cardOf(container, 2)?.querySelector('input'));
    // カードが無い行(b)なら、シェルへ。
    act(() => {
      ref.current?.setActiveCell({ row: 1, col: 1 });
    });
    after!.focus();
    act(() => {
      exit!.focus();
    });
    expect(document.activeElement).toBe(shell);
    // 表の中(シェル)から来たときもシェルへ(見えない目印にフォーカスを残さない)。
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: 1 });
    });
    shell.focus();
    act(() => {
      exit!.focus();
    });
    expect(document.activeElement).toBe(shell);
  });

  // 修正(段階 2 の見直し): カードから portal で出した要素(ダイアログなど)のキーは数えない(DOM 上でカードの外)。
  it('カードから portal で出したダイアログの中の Tab は既定のまま(表の外へ出さない)', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const portalDetail: DetailRowOptions<Row> = {
      height: 120,
      render: ({ rowKey }) => (
        <div>
          <button type="button">{`card-${rowKey}`}</button>
          {createPortal(
            <div role="dialog">
              <input aria-label={`dialog-1-${rowKey}`} />
              <input aria-label={`dialog-2-${rowKey}`} />
            </div>,
            document.body,
          )}
        </div>
      ),
    };
    render(<SpreadsheetGrid ref={ref} columns={columns} rows={rows} rowKeyGetter={rowKeyGetter} detailRow={portalDetail} />);
    act(() => {
      ref.current?.setDetailRowExpanded('a', true);
    });
    const first = document.querySelector<HTMLInputElement>('input[aria-label="dialog-1-a"]');
    expect(first).not.toBeNull();
    first!.focus();
    expect(fireEvent.keyDown(first!, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(fireEvent.keyDown(first!, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  // 修正(段階 2 の見直し): セルの中の消費側の要素(renderCell のボタン)の Tab で、表の中にもう止まる要素が無ければ表の外へ
  //   (これまでは既定動作で目印に止まり、「表の中から来た」としてシェルへ戻していた = Tab で後ろへ戻ったように見えた)。
  it('セルの中のボタンの Tab で表の中にもう止まる要素が無ければ、目印へ移して既定動作で表の外へ', () => {
    const withButtons: GridColumn<Row>[] = [
      ...columns,
      {
        key: 'act',
        title: '操作',
        width: 80,
        pinned: 'right',
        renderCell: ({ row }) => <button type="button">{`操作-${row.id}`}</button>,
      },
    ];
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid ref={ref} columns={withButtons} rows={rows} rowKeyGetter={rowKeyGetter} detailRow={detailRow} />,
    );
    act(() => {
      ref.current?.setDetailRowExpanded('a', true);
    });
    const exit = container.querySelector<HTMLElement>('.ssg-tab-exit');
    const scroll = container.querySelector<HTMLElement>('.ssg-tab-exit')?.previousElementSibling as HTMLElement;
    // DOM の順で表の中の最後に止まる要素(右固定のペインのボタン)。
    const tabbables = Array.from(scroll.querySelectorAll<HTMLElement>('button, input'));
    const last = tabbables[tabbables.length - 1];
    expect(last?.textContent).toBe('操作-c');
    last!.focus();
    expect(fireEvent.keyDown(last!, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(exit);
    // 表の中にまだ止まる要素があるとき・Shift+Tab は既定のまま。
    const firstButton = tabbables.find((element) => element.textContent === '操作-a');
    firstButton!.focus();
    expect(fireEvent.keyDown(firstButton!, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(firstButton);
    last!.focus();
    expect(fireEvent.keyDown(last!, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('カードが 1 枚も無いときは目印を Tab の順番に入れず、最終列の Tab は従来どおり既定動作(フォーカスを動かさない)', () => {
    const { ref, container, shell } = renderGrid([]);
    expect(container.querySelector<HTMLElement>('.ssg-tab-exit')?.tabIndex).toBe(-1);
    act(() => {
      ref.current?.setActiveCell({ row: 2, col: LAST_COL });
    });
    shell.focus();
    expect(fireEvent.keyDown(shell, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(shell);
  });

  // 追加(段階 2 の確かめ直し): カードの中にフォーカスがあるまま閉じると(キーボードで「閉じる」を押す)、カードと一緒に
  //   フォーカスが消えて body へ落ち、その後の ↓ も Tab も表に届かなかった。その行のセルへ戻す。
  it('カードの中にフォーカスがあるまま閉じたら、その行のセル(アクティブセルの列)へ戻してフォーカスをシェルへ', () => {
    const { ref, container, shell } = renderGrid(['a', 'c']);
    act(() => {
      ref.current?.setActiveCell({ row: 0, col: LAST_COL });
    });
    const button = cardOf(container, 2)?.querySelector<HTMLButtonElement>('button');
    button!.focus();
    act(() => {
      button!.click();
    });
    expect(cardOf(container, 2)).toBeNull();
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: LAST_COL });
    expect(document.activeElement).toBe(shell);
    // フォーカスがカードの外(表の後ろのボタン)なら、閉じてもフォーカスとアクティブセルは動かさない。
    const outside = container.querySelector<HTMLButtonElement>('div > button:last-of-type');
    outside!.focus();
    act(() => {
      ref.current?.setDetailRowExpanded('a', false);
    });
    expect(document.activeElement).toBe(outside);
    expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: LAST_COL });
  });

  // 追加(段階 2 の 3 回目の確かめ直し C-N6 / C-N7): ハンドルの setDetailRowExpanded(key, false) / collapseAllDetailRows() で
  //   閉じたときは、今もフォーカスが body へ落ちていた。戻したセルが見える範囲の外(背の高いカードを読み進めて行が見出しの裏)
  //   でも表がスクロールせず、枠が見えなかった。どの閉じ方でも同じく戻し、次のフレームでそのセルを見える範囲へ。
  it('ハンドルで閉じてもカードの中のフォーカスをその行のセルへ戻し、次のフレームでそのセルを見える範囲へ', async () => {
    const manyRows: Row[] = [...rows, ...Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, name: `row${i}`, qty: 1 }))];
    for (const close of [
      (handle: SpreadsheetGridHandle<Row>) => handle.setDetailRowExpanded('c', false),
      (handle: SpreadsheetGridHandle<Row>) => handle.collapseAllDetailRows(),
    ]) {
      const ref = createRef<SpreadsheetGridHandle<Row>>();
      const { container } = render(
        <SpreadsheetGrid ref={ref} columns={columns} rows={manyRows} rowKeyGetter={rowKeyGetter} detailRow={detailRow} />,
      );
      act(() => {
        ref.current?.setDetailRowExpanded('c', true);
        ref.current?.setActiveCell({ row: 2, col: 2 });
      });
      // カードを読み進めて、行 2 が見える範囲の上(見出しの裏)へ出た状態(jsdom の scrollTop は書いても 0 のままなので読む値を
      //   固定する)。スクロールは scrollTo で見る。
      const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container')!;
      Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => 200, set: () => {} });
      const scrollTo = vi.fn();
      scroller.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
      cardOf(container, 2)?.querySelector<HTMLInputElement>('input')!.focus();
      act(() => {
        close(ref.current!);
      });
      expect(cardOf(container, 2)).toBeNull();
      expect(ref.current?.getActiveCell()).toEqual({ row: 2, col: 2 });
      expect(document.activeElement).toBe(getShell(container));
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      const tops = scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).top ?? 200);
      expect(tops.some((top) => top < 200)).toBe(true);
      cleanup();
    }
  });

  it('detailRow が無ければ目印を描かない', () => {
    const { container } = render(<SpreadsheetGrid columns={columns} rows={rows} rowKeyGetter={rowKeyGetter} />);
    expect(container.querySelector('.ssg-tab-exit')).toBeNull();
  });
});