// 追加(motion-6 / M-2): changeHighlightController の DOM テストです(jsdom)。差分の規則(参照 / rowKey / 上限)と、
//   描画中のセルへのフラッシュ、数値トゥイーン(文字ノードの補間)、無効時 / dispose を固定します。
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHANGED_CLASS_NAME,
  createChangeHighlightController,
  diffChangedCells,
  MAX_CHANGED_ROWS,
  MAX_TWEEN_CELLS,
  parseCssDuration,
} from './changeHighlightController';
import type { GridColumn } from '../model/gridTypes.unbound';

type Row = { id: number; name: string; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 100 },
  { key: 'qty', title: 'Qty', width: 80, valueFormatter: ({ value }) => `${value}個` },
];
const keyOf = (row: Row) => row.id;

describe('diffChangedCells', () => {
  it('同じ参照の行は飛ばし、参照の違う行だけ列ごとに値を比べる', () => {
    const a = { id: 1, name: 'a', qty: 1 };
    const b = { id: 2, name: 'b', qty: 2 };
    const prev = [a, b];
    const next = [a, { ...b, qty: 5 }];
    const changed = diffChangedCells(prev, keyOf, next, keyOf, columns);
    expect(changed?.map((c) => [c.rowKey, c.column.key, c.prevValue, c.nextValue])).toEqual([[2, 'qty', 2, 5]]);
  });

  it('行数の違い / rowKey の不一致(挿入・削除・並べ替え)/ 行数上限超えは null(何もしない)', () => {
    const a = { id: 1, name: 'a', qty: 1 };
    const b = { id: 2, name: 'b', qty: 2 };
    expect(diffChangedCells([a, b], keyOf, [a], keyOf, columns)).toBeNull();
    expect(diffChangedCells([a, b], keyOf, [{ ...b }, { ...a }], keyOf, columns)).toBeNull();
    const many = Array.from({ length: MAX_CHANGED_ROWS + 1 }, (_, i) => ({ id: i, name: 'x', qty: i }));
    expect(diffChangedCells(many, keyOf, many.map((r) => ({ ...r })), keyOf, columns)).toBeNull();
  });
});

describe('parseCssDuration', () => {
  it('ms / s を解釈し、読めなければ既定', () => {
    expect(parseCssDuration('260ms', 1)).toBe(260);
    expect(parseCssDuration('0.26s', 1)).toBe(260);
    expect(parseCssDuration('0ms', 1)).toBe(0);
    expect(parseCssDuration('', 7)).toBe(7);
    expect(parseCssDuration('abc', 7)).toBe(7);
  });
});

describe('createChangeHighlightController', () => {
  let container: HTMLDivElement;
  let rafQueue: FrameRequestCallback[];
  const makeCell = (rowKey: number, colKey: string, text: string) => {
    let row = container.querySelector<HTMLElement>(`.ssg-body-row[data-row-key="${rowKey}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'ssg-body-row';
      row.setAttribute('data-row-key', String(rowKey));
      container.appendChild(row);
    }
    const cell = document.createElement('div');
    cell.className = 'ssg-body-cell';
    cell.setAttribute('data-ssg-col-key', colKey);
    const span = document.createElement('span');
    span.textContent = text;
    cell.appendChild(span);
    row.appendChild(cell);
    return cell;
  };

  beforeEach(() => {
    container = document.createElement('div');
    container.style.setProperty('--ssg-motion-base', '100ms');
    document.body.appendChild(container);
    rafQueue = [];
    // フェイクタイマーは requestAnimationFrame も差し替えるため、その後に自前のキューへ差し替える。
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    container.remove();
  });

  it('rows の参照が変わったとき、値が変わった描画中のセルだけにフラッシュが付き、animationend / フォールバックで外れる', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const a = { id: 1, name: 'a', qty: 1 };
    const b = { id: 2, name: 'b', qty: 2 };
    const nameA = makeCell(1, 'name', 'a');
    const qtyB = makeCell(2, 'qty', '2個');
    const nameB = makeCell(2, 'name', 'b');
    controller.update({ enabled: true, rows: [a, b], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    // 同じ参照なら何も起きない。
    controller.update({ enabled: true, rows: [a, b], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    expect(container.querySelectorAll(`.${CHANGED_CLASS_NAME}`)).toHaveLength(0);
    // 新しい配列 + 行 b の qty だけ変更(DOM は React が先に更新済みの想定)。
    qtyB.firstElementChild!.textContent = '9個';
    controller.update({ enabled: true, rows: [a, { ...b, qty: 9 }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    expect(qtyB.classList.contains(CHANGED_CLASS_NAME)).toBe(true);
    expect(nameA.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
    expect(nameB.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
    qtyB.dispatchEvent(new Event('animationend'));
    expect(qtyB.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
    // フォールバック。
    qtyB.firstElementChild!.textContent = '3個';
    controller.update({ enabled: true, rows: [a, { ...b, qty: 3 }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    expect(qtyB.classList.contains(CHANGED_CLASS_NAME)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(qtyB.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
    controller.dispose();
  });

  it('数値の既定セルは文字ノードを旧値から新値へ補間し、最後は React が描いた文字列に戻る', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const a = { id: 1, name: 'a', qty: 10 };
    const qtyA = makeCell(1, 'qty', '10個');
    const node = qtyA.firstElementChild!.firstChild as Text;
    controller.update({ enabled: true, rows: [a], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    node.nodeValue = '20個';
    const t0 = performance.now();
    controller.update({ enabled: true, rows: [{ ...a, qty: 20 }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    // 最初のフレーム前は旧値(整形済み)。
    expect(node.nodeValue).toBe('10個');
    expect(rafQueue).toHaveLength(1);
    rafQueue.shift()!(t0 + 50);
    const mid = Number(node.nodeValue!.replace('個', ''));
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(20);
    rafQueue.shift()!(t0 + 1000);
    expect(node.nodeValue).toBe('20個');
    // 同じ文字ノード(React の参照)が保たれている。
    expect(qtyA.firstElementChild!.firstChild).toBe(node);
    controller.dispose();
  });

  // 追加(1.0 前の最終チェック FC-14): トゥイーン中に同じセルが描き直されたら、古い値を書き戻さない。
  it('トゥイーン中に同じセルが数値以外へ変わったら、最後のフレームで古い数値を書き戻さない', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const a = { id: 1, name: 'a', qty: 10 };
    const qtyA = makeCell(1, 'qty', '10個');
    const node = qtyA.firstElementChild!.firstChild as Text;
    controller.update({ enabled: true, rows: [a], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    node.nodeValue = '20個';
    const t0 = performance.now();
    controller.update({ enabled: true, rows: [{ ...a, qty: 20 }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    rafQueue.shift()!(t0 + 50);
    // 次の変更(値が null)を React が書いた。
    node.nodeValue = '';
    controller.update({
      enabled: true,
      rows: [{ ...a, qty: null as unknown as number }],
      rowKeyGetter: keyOf,
      columns,
      scrollContainerRef: ref,
    });
    while (rafQueue.length > 0) rafQueue.shift()!(t0 + 1000);
    expect(node.nodeValue).toBe('');
    controller.dispose();
  });

  it('トゥイーン中に同じセルがまた数値で変わったら、新しいトゥイーンだけが書く', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const a = { id: 1, name: 'a', qty: 10 };
    const qtyA = makeCell(1, 'qty', '10個');
    const node = qtyA.firstElementChild!.firstChild as Text;
    controller.update({ enabled: true, rows: [a], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    node.nodeValue = '20個';
    const t0 = performance.now();
    controller.update({ enabled: true, rows: [{ ...a, qty: 20 }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    rafQueue.shift()!(t0 + 50);
    node.nodeValue = '30個';
    controller.update({ enabled: true, rows: [{ ...a, qty: 30 }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    while (rafQueue.length > 0) rafQueue.shift()!(t0 + 5000);
    expect(node.nodeValue).toBe('30個');
    controller.dispose();
  });

  // 追加(FC-14 の見直し): 途中の文字と同じ文字を React が書いても(補間しない大きな更新)、古い補間は止まる。
  it('トゥイーン中に同じセルが途中の値と同じ表示へ変わったら(補間しない大きな更新)、古い値で終わらない', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const a = { id: 1, name: 'a', qty: 10 };
    const others = Array.from({ length: MAX_TWEEN_CELLS }, (_, index) => ({ id: index + 2, name: 'x', qty: 0 }));
    const qtyA = makeCell(1, 'qty', '10個');
    const node = qtyA.firstElementChild!.firstChild as Text;
    controller.update({ enabled: true, rows: [a, ...others], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    node.nodeValue = '20個';
    const t0 = performance.now();
    const rows1 = [{ ...a, qty: 20 }, ...others];
    controller.update({ enabled: true, rows: rows1, rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    rafQueue.shift()!(t0 + 50);
    const midText = node.nodeValue!;
    const mid = Number(midText.replace('個', ''));
    // 201 セルが変わる更新で、行 a は途中の値と同じ値になった(React は同じ文字を書く)。
    controller.update({
      enabled: true,
      rows: [{ ...a, qty: mid }, ...others.map((row) => ({ ...row, qty: 1 }))],
      rowKeyGetter: keyOf,
      columns,
      scrollContainerRef: ref,
    });
    node.nodeValue = midText;
    while (rafQueue.length > 0) rafQueue.shift()!(t0 + 1000);
    expect(node.nodeValue).toBe(midText);
    controller.dispose();
  });

  it('展開行のカードの中(入れ子のグリッド)の同じ行キー / 列キーのセルには付けない', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const a = { id: 1, name: 'a', qty: 1 };
    const own = makeCell(1, 'name', 'a');
    const card = document.createElement('div');
    card.className = 'ssg-detail-card';
    card.setAttribute('data-ssg-detail', '');
    container.appendChild(card);
    const nestedRow = document.createElement('div');
    nestedRow.className = 'ssg-body-row';
    nestedRow.setAttribute('data-row-key', '1');
    const nestedCell = document.createElement('div');
    nestedCell.className = 'ssg-body-cell';
    nestedCell.setAttribute('data-ssg-col-key', 'name');
    nestedCell.appendChild(document.createElement('span'));
    nestedRow.appendChild(nestedCell);
    card.appendChild(nestedRow);
    controller.update({ enabled: true, rows: [a], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    controller.update({ enabled: true, rows: [{ ...a, name: 'b' }], rowKeyGetter: keyOf, columns, scrollContainerRef: ref });
    expect(own.classList.contains(CHANGED_CLASS_NAME)).toBe(true);
    expect(nestedCell.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
    controller.dispose();
  });

  it('enabled=false では何も付かず、renderCell 列はフラッシュのみ(トゥイーンなし)', () => {
    const controller = createChangeHighlightController<Row>();
    const ref = { current: container };
    const custom: GridColumn<Row>[] = [{ key: 'qty', title: 'Qty', width: 80, renderCell: () => null }];
    const a = { id: 1, name: 'a', qty: 1 };
    const qtyA = makeCell(1, 'qty', '1');
    controller.update({ enabled: false, rows: [a], rowKeyGetter: keyOf, columns: custom, scrollContainerRef: ref });
    controller.update({ enabled: false, rows: [{ ...a, qty: 2 }], rowKeyGetter: keyOf, columns: custom, scrollContainerRef: ref });
    expect(qtyA.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
    controller.update({ enabled: true, rows: [{ ...a, qty: 2 }], rowKeyGetter: keyOf, columns: custom, scrollContainerRef: ref });
    controller.update({ enabled: true, rows: [{ ...a, qty: 3 }], rowKeyGetter: keyOf, columns: custom, scrollContainerRef: ref });
    expect(qtyA.classList.contains(CHANGED_CLASS_NAME)).toBe(true);
    expect(rafQueue).toHaveLength(0);
    controller.dispose();
    expect(qtyA.classList.contains(CHANGED_CLASS_NAME)).toBe(false);
  });
});
