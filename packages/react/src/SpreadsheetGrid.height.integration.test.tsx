// 追加(fill-height)の回帰テスト: height / maxHeight の inline style と修飾子クラスの配線です。
//   jsdom はレイアウトを計算しないため、ここでは「どの要素にどの style / class が付くか」だけを検証します
//   (実寸 = 親に収まる / スクロールできる / 描画行数は実ブラウザで確認済み)。
//   ① '%' を含む height: ルートに height + .ssg-root--fill-height、スクロールコンテナは max-height:none のみ
//   ② '%' + maxHeight: ルートは max-height、スクロールコンテナは maxHeight の height + max-height
//   ③ number / '%' を含まない文字列 / maxHeight のみ / 未指定: 従来どおり(ルートは触らない)
//   ④ 利用側の style / classNames.root.style がルートの高さより後勝ち
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string };

const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `row ${i + 1}` }));

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 80 },
  { key: 'name', title: 'Name', width: 200 },
];

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
});

const must = <E extends Element>(el: E | null, label: string): E => {
  if (!el) {
    throw new Error(`${label} が見つかりません`);
  }
  return el;
};

const getParts = (container: HTMLElement) => ({
  root: must(container.querySelector<HTMLElement>('.ssg-root'), '.ssg-root'),
  scroll: must(
    container.querySelector<HTMLElement>('.ssg-scroll-container'),
    '.ssg-scroll-container',
  ),
});

describe("height に '%' を含む値(親基準モード)", () => {
  it("'100%': ルートに height と修飾子、スクロールコンテナは max-height:none だけ", () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} height="100%" />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(true);
    expect(root.style.height).toBe('100%');
    expect(root.style.maxHeight).toBe('');
    expect(scroll.style.height).toBe('');
    expect(scroll.style.maxHeight).toBe('none');
  });

  it("'50%' でも同じ親基準モード", () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} height="50%" />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(true);
    expect(root.style.height).toBe('50%');
    expect(scroll.style.height).toBe('');
  });

  it("'100%' + maxHeight: ルートは max-height、スクロールコンテナは maxHeight で置く", () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} height="100%" maxHeight={300} />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(true);
    expect(root.style.height).toBe('');
    expect(root.style.maxHeight).toBe('100%');
    expect(scroll.style.height).toBe('300px');
    expect(scroll.style.maxHeight).toBe('300px');
  });

  it('利用側の style / classNames.root.style がルートの高さより後勝ち', () => {
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        height="100%"
        classNames={{ root: { style: { minHeight: 200 } } }}
        style={{ height: 320 }}
      />,
    );
    const { root } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(true);
    expect(root.style.height).toBe('320px');
    expect(root.style.minHeight).toBe('200px');
  });
});

describe('従来どおりの指定(スクロール領域の高さ。ルートは触らない)', () => {
  it('number: スクロールコンテナに height + max-height:none', () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} height={400} />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(false);
    expect(root.style.height).toBe('');
    expect(scroll.style.height).toBe('400px');
    expect(scroll.style.maxHeight).toBe('none');
  });

  it("'%' を含まない文字列('50vh')はスクロールコンテナの高さ", () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} height="50vh" />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(false);
    expect(root.style.height).toBe('');
    expect(scroll.style.height).toBe('50vh');
    expect(scroll.style.maxHeight).toBe('none');
  });

  it('number + maxHeight: 両方をスクロールコンテナへ', () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} height={400} maxHeight={300} />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(false);
    expect(scroll.style.height).toBe('400px');
    expect(scroll.style.maxHeight).toBe('300px');
  });

  it('maxHeight のみ: スクロールコンテナの上限だけ', () => {
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} maxHeight={300} />,
    );
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(false);
    expect(scroll.style.height).toBe('');
    expect(scroll.style.maxHeight).toBe('300px');
  });

  it('未指定: inline を付けない(CSS 既定 max-height: 480px に委ねる)', () => {
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} />);
    const { root, scroll } = getParts(container);
    expect(root.classList.contains('ssg-root--fill-height')).toBe(false);
    expect(root.getAttribute('style')).toBeNull();
    expect(scroll.getAttribute('style')).toBeNull();
  });
});