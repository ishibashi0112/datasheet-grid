// 追加(1.5.0 / 速さの案 B): 行の要素の使い回し(primitives/rowSlots)の確かめ。
//   行の並びが同じままで描く範囲だけが変わったとき(スクロール)は、範囲から出たデータ行の要素とセルの部品を入ってきた行に
//   使い回し、中身の値だけを書き換える。renderCell の中身は行ごとに作り直す(中の状態を別の行へ持ち越さない)。行の並びが
//   変わったとき(並べ替え・rows の差し替え)は使い回さない(React 版と同じく、別の行の要素が別の行に替わらない)。
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn } from './index';
import { REUSED_ROW_ATTRIBUTE } from './primitives/reusedRow';

type Row = { id: number; name: string; qty: number };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `品目 ${i + 1}`, qty: i * 10 }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const centerRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.ssg-body-row[data-pane="center"][data-row-key]'));

const rowByKey = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`.ssg-body-row[data-pane="center"][data-row-key="${key}"]`);

const scrollTo = (container: HTMLElement, top: number) => {
  const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container') as HTMLElement;
  scroller.scrollTop = top;
  fireEvent.scroll(scroller);
  flush();
};

// 行の要素の行のキーの書き換え(= 使い回し)を数える。
const watchRekeys = (container: HTMLElement) => {
  let count = 0;
  const observer = new MutationObserver((records) => {
    count += records.filter((record) => record.oldValue !== null).length;
  });
  observer.observe(container, { subtree: true, attributes: true, attributeFilter: ['data-row-key'], attributeOldValue: true });
  return {
    take: async () => {
      await Promise.resolve();
      const value = count;
      count = 0;
      return value;
    },
    stop: () => observer.disconnect(),
  };
};

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('行の要素の使い回し', () => {
  it('遠くへスクロールすると、同じ行の要素と既定のセルの文字の要素を使い回し、中身だけが新しい行になる', async () => {
    const result = render(() => (
      <SpreadsheetGrid<Row>
        rows={makeRows(10_000)}
        columns={[
          { key: 'name', title: '品名', width: 160 },
          { key: 'qty', title: '数量', width: 100, valueFormatter: ({ value }) => `${String(value)} 個` },
        ]}
        rowKeyGetter={(row) => row.id}
        height={300}
      />
    ));
    cleanup = result.unmount;
    flush();
    const { container } = result;
    const before = centerRows(container);
    expect(before.length).toBeGreaterThan(5);
    const firstSpan = before[0]!.querySelector('[data-ssg-col-key="name"] .ssg-cell-value');
    const rekeys = watchRekeys(container);
    scrollTo(container, 150_000);
    const after = centerRows(container);
    expect(await rekeys.take()).toBeGreaterThan(0);
    // 前の要素はすべて残り(作り直していない。スクロール中は先読みの行が増えるので、その分だけ新しい要素)、描いているのは遠くの行。
    for (const row of before) {
      expect(after).toContain(row);
    }
    const keys = after.map((row) => Number(row.getAttribute('data-row-key')));
    expect(Math.min(...keys)).toBeGreaterThan(1000);
    for (const row of after) {
      const key = Number(row.getAttribute('data-row-key'));
      expect(row.querySelector('[data-ssg-col-key="name"]')?.textContent).toBe(`品目 ${key}`);
      expect(row.querySelector('[data-ssg-col-key="qty"]')?.textContent).toBe(`${(key - 1) * 10} 個`);
      expect(row.getAttribute('data-row-index')).toBe(String(key - 1));
    }
    // 既定のセルは文字だけを書き換える(span はそのまま)。
    expect(after.some((row) => row.querySelector('[data-ssg-col-key="name"] .ssg-cell-value') === firstSpan)).toBe(true);
    // 使い回した行には、次の次のフレームまで transition を止める属性が付く。
    expect(after.some((row) => row.hasAttribute(REUSED_ROW_ATTRIBUTE))).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(container.querySelectorAll(`[${REUSED_ROW_ATTRIBUTE}]`)).toHaveLength(0);
    rekeys.stop();
  });

  it('renderCell の中身は行ごとに作り直す(中の状態を別の行へ持ち越さず、ctx.rowKey は新しい行)', async () => {
    const columns: GridColumn<Row>[] = [
      { key: 'name', title: '品名', width: 160 },
      {
        key: 'qty',
        title: '数量',
        width: 160,
        renderCell: (ctx) => {
          const [clicks, setClicks] = createSignal(0);
          return (
            <button type="button" data-key={String(ctx.rowKey)} onClick={() => setClicks((count) => count + 1)}>
              {clicks()}
            </button>
          );
        },
      },
    ];
    const result = render(() => (
      <SpreadsheetGrid<Row> rows={makeRows(10_000)} columns={columns} rowKeyGetter={(row) => row.id} height={300} />
    ));
    cleanup = result.unmount;
    flush();
    const { container } = result;
    const button = rowByKey(container, '2')?.querySelector<HTMLButtonElement>('button');
    expect(button?.textContent).toBe('0');
    fireEvent.click(button as HTMLButtonElement);
    flush();
    expect(button?.textContent).toBe('1');
    const element = rowByKey(container, '2') as HTMLElement;
    scrollTo(container, 150_000);
    // 行 2 の要素は別の行に使い回され、ボタンは新しい行のもの(数は 0、data-key は新しい行のキー)。
    const key = element.getAttribute('data-row-key');
    expect(key).not.toBe('2');
    const reused = element.querySelector<HTMLButtonElement>('button');
    expect(reused).not.toBe(button);
    expect(reused?.textContent).toBe('0');
    expect(reused?.getAttribute('data-key')).toBe(key);
    for (const row of centerRows(container)) {
      expect(row.querySelector('button')?.getAttribute('data-key')).toBe(row.getAttribute('data-row-key'));
      expect(row.querySelector('button')?.textContent).toBe('0');
    }
    // 戻ってきた行 2 も新しく作る(React 版と同じく、描く範囲から出た行の状態は残らない)。
    scrollTo(container, 0);
    expect(rowByKey(container, '2')?.querySelector('button')?.textContent).toBe('0');
  });

  it('行の並びが変わったとき(並べ替え・rows の差し替え)は使い回さず、残った行は同じ要素のまま', async () => {
    const [rows, setRows] = createSignal(makeRows(200));
    const result = render(() => (
      <SpreadsheetGrid<Row>
        rows={rows()}
        columns={[{ key: 'name', title: '品名', width: 160 }]}
        rowKeyGetter={(row) => row.id}
        height={300}
      />
    ));
    cleanup = result.unmount;
    flush();
    const { container } = result;
    const row3 = rowByKey(container, '3');
    const rekeys = watchRekeys(container);
    // 先頭の 2 行を消して後ろの行を前へ: 行 3 は同じ要素のまま位置だけが変わり、入ってきた行は新しい要素。
    setRows(rows().slice(2));
    flush();
    expect(await rekeys.take()).toBe(0);
    expect(rowByKey(container, '3')).toBe(row3);
    expect(rowByKey(container, '3')?.getAttribute('data-row-index')).toBe('0');
    // 逆順に並べ替えても使い回さない(見えている行が全部入れ替わる)。
    setRows([...rows()].reverse());
    flush();
    expect(await rekeys.take()).toBe(0);
    expect(centerRows(container)[0]?.getAttribute('data-row-key')).toBe('200');
    expect(rowByKey(container, '3')).toBeNull();
    rekeys.stop();
  });
});