// SpreadsheetGrid を実際に render し、展開行(Master/Detail、detail batch 1〜4)の配線を実行検証する
//   結合テストです。rowKey → view index 解決と選択帯の分割は logic/detailRow.test.ts、
//   reducer は model/gridReducer.detail.test.ts が正本で、ここでは実コンポーネント越しに
//   「トグル列 / 帯とカードの描画 / 開閉の各経路 / 通知 / イベント境界 / 未指定時の不変」を
//   確認します。行の DOM を検証するため grouping 結合テストと同じ寸法スタブを使います。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { DETAIL_TOGGLE_COLUMN_KEY } from './logic/detailRow';
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