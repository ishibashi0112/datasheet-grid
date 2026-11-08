// 追加(英語対応): `localeText={localeTextEn}` を渡すと、グリッドが自分で出す文言(バー・メニュー・列フィルター・
//   ツールパネル・検索・読み上げの名前・ツールチップ・検証のメッセージ)に日本語が 1 文字も残らないこと。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { localeTextEn } from './locales/en';
import { installJsdomLayoutStubs } from './testing';
import type { DetailRowOptions, GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string; qty: number; price: number; due: Date; status: string; region: string };
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3, price: 1200, due: new Date(2026, 6, 1), status: 'open', region: 'east' },
  { id: 2, name: 'beta', qty: -1, price: 800, due: new Date(2026, 6, 2), status: 'closed', region: 'west' },
  { id: 3, name: 'gamma', qty: 2, price: 450, due: new Date(2026, 7, 15), status: 'open', region: 'east' },
  { id: 4, name: '', qty: 5, price: 990, due: new Date(2026, 8, 3), status: 'hold', region: 'west' },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'Name', width: 160, filterType: 'text' },
  { key: 'qty', title: 'Qty', width: 100, editor: { type: 'number', min: 0, integer: true }, filterType: 'number', aggFunc: 'sum' },
  { key: 'price', title: 'Price', width: 100, editor: { type: 'number' }, filterType: 'number', aggFunc: 'avg' },
  { key: 'due', title: 'Due', width: 140, editor: { type: 'date' }, filterType: 'date' },
  { key: 'status', title: 'Status', width: 120, filterType: 'set' },
  { key: 'region', title: 'Region', width: 120, filterType: 'select' },
];
const detailRow: DetailRowOptions<Row> = {
  height: 60,
  render: ({ row }) => <div>{`details of ${row.name}`}</div>,
};

const JAPANESE = /[぀-ヿ㐀-鿿！-｠]/;
const ATTRIBUTES = ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'data-ssg-tooltip'];

// 画面(ポータルを含む body 全体)の文字と、読み上げ / ツールチップの属性のうち、日本語を含むもの。
const japaneseInDocument = (): string[] => {
  const found: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (JAPANESE.test(text)) found.push(`text: ${text.trim()}`);
  }
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value && JAPANESE.test(value)) found.push(`${name}: ${value}`);
    }
  }
  return found;
};

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

const openColumnMenu = (container: HTMLElement, columnKey: string) => {
  const button = container.querySelector<HTMLButtonElement>(
    `.ssg-header-row [data-ssg-col-key="${columnKey}"] [data-ssg-tooltip="Column menu"]`,
  );
  expect(button).not.toBeNull();
  act(() => {
    fireEvent.pointerDown(button!, { button: 0 });
    fireEvent.click(button!);
  });
};

const clickMenuItem = (label: string) => {
  const item = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-menu-item')).find((element) =>
    element.textContent?.includes(label),
  );
  expect(item).toBeDefined();
  act(() => {
    fireEvent.click(item!);
  });
};

const pressEscape = () => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  });
};

describe('英語の文言(localeTextEn)', () => {
  it('バー・展開行・行ドラッグ・合計行・集計に日本語が残らない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={400}
        localeText={localeTextEn}
        enableGlobalFilter
        enableColumnFilter
        enableRowSelection
        enableRowDrag
        onRowsChange={() => {}}
        detailRow={detailRow}
        totalRow
        fillHandle
        showValidationMarks
      />,
    );
    expect(japaneseInDocument()).toEqual([]);
    act(() => {
      ref.current?.selectRange({ start: { row: 0, col: 1 }, end: { row: 2, col: 2 } });
    });
    expect(container.querySelector('.ssg-bar-aggregates')).not.toBeNull();
    expect(japaneseInDocument()).toEqual([]);
    // L-N1: 合成列(行ドラッグのハンドル列 / 展開トグル列)のセルの番地は列の名前と行番号。
    const cellChip = () =>
      Array.from(container.querySelectorAll('.ssg-bar--bottom .ssg-bar-chip'))
        .map((chip) => chip.textContent ?? '')
        .find((text) => text.startsWith('Cell '));
    const syntheticCells: (string | undefined)[] = [];
    for (const col of [0, 1, 2]) {
      act(() => {
        ref.current?.selectRange({ start: { row: 1, col }, end: { row: 1, col } });
      });
      syntheticCells.push(cellChip());
    }
    expect(syntheticCells).toEqual(['Cell Move 2', 'Cell Details 2', 'Cell A2']);
    // 組み込みの検査(数値の範囲 / 整数)のメッセージ。
    const messages = ref.current!.getInvalidCells().map((cell) => cell.message);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.filter((message) => JAPANESE.test(message))).toEqual([]);
  });

  it('列メニュー・列フィルター(文字 / 数値 / 日付 / 候補)に日本語が残らない', () => {
    const { container } = render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={400}
        localeText={localeTextEn}
        enableColumnFilter
      />,
    );
    for (const key of ['name', 'qty', 'due', 'status', 'region']) {
      openColumnMenu(container, key);
      expect(document.querySelector('.ssg-menu-item')).not.toBeNull();
      expect(japaneseInDocument()).toEqual([]);
      clickMenuItem('Filter…');
      expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
      expect(japaneseInDocument()).toEqual([]);
      pressEscape();
    }
  });

  it('ツールパネル(絞り込み / 並び替え / 列)と検索バーに日本語が残らない', () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <SpreadsheetGrid<Row>
        ref={ref}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={400}
        localeText={localeTextEn}
        enableColumnFilter
        find
        initialState={{
          sort: [{ columnKey: 'qty', direction: 'asc' }],
          filters: { globalText: '', columnFilters: { status: { kind: 'set', values: ['open'] } } },
        }}
      />,
    );
    const topChips = Array.from(document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')).map((chip) => chip.textContent);
    expect(topChips).toEqual(['Rows 2 of 4', 'Columns 6 of 6', 'Filter: 1 column', 'Sort: Qty (ascending)']);
    act(() => {
      ref.current?.openFilterManager();
    });
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.ssg-toolpanel-seg button'));
    expect(tabs.length).toBe(3);
    for (const tab of tabs) {
      act(() => {
        fireEvent.click(tab);
      });
      expect(japaneseInDocument()).toEqual([]);
    }
    act(() => {
      ref.current?.closeFilterManager();
      ref.current?.openFind('a');
    });
    expect(document.querySelector('.ssg-find-bar')).not.toBeNull();
    expect(japaneseInDocument()).toEqual([]);
  });

  it('行グループの行とグループの列に日本語が残らない', () => {
    render(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns.map((column) => (column.key === 'region' ? { ...column, rowGroup: true } : column))}
        rowKeyGetter={(row) => row.id}
        height={400}
        localeText={localeTextEn}
      />,
    );
    expect(document.querySelector('[data-ssg-group-row], .ssg-group-row')).not.toBeNull();
    expect(japaneseInDocument()).toEqual([]);
  });
});