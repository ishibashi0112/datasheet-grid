// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-08): 値と表示名が別の列の結合テストです。グループ行の見出し(列の groupLabel)、
//   グローバルフィルターの照らし合わせ(globalFilterMatch)、select エディタの clipboard: 'label'(コピー / 貼り付け / エクスポート)。
//   どれも既定は 1.0 と同じ(値の文字)。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import type { Ref } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, GridSelectEditorOption, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; region: string; amount: number };

const REGIONS: GridSelectEditorOption[] = [
  { value: 'kanto', label: '関東' },
  { value: 'chubu', label: '中部' },
];
const regionLabel = new Map(REGIONS.map((option) => [option.value, option.label]));

const makeColumns = (extra: Partial<GridColumn<Row>> = {}, clipboard?: 'label'): GridColumn<Row>[] => [
  {
    key: 'region',
    title: '地域',
    width: 120,
    editable: true,
    editor: { type: 'select', options: REGIONS, clipboard },
    valueFormatter: ({ value }) => regionLabel.get(String(value)) ?? String(value ?? ''),
    ...extra,
  },
  {
    key: 'amount',
    title: '金額',
    width: 120,
    editable: true,
    editor: { type: 'number' },
    valueFormatter: ({ value }) => Number(value).toLocaleString('en-US'),
    aggFunc: 'sum',
  },
];

const INITIAL: Row[] = [
  { id: 1, region: 'kanto', amount: 796000 },
  { id: 2, region: 'chubu', amount: 1200 },
  { id: 3, region: 'kanto', amount: 5 },
];

let restore: () => void;
let writeText: ReturnType<typeof vi.fn>;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  writeText.mockClear();
});

let currentRows: Row[] = [];

function Harness({
  gridRef,
  columns,
  extra,
}: {
  gridRef: Ref<SpreadsheetGridHandle<Row>>;
  columns: GridColumn<Row>[];
  extra?: Partial<SpreadsheetGridProps<Row>>;
}) {
  const [rows, setRows] = useState<Row[]>(INITIAL);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return <SpreadsheetGrid ref={gridRef} rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} {...extra} />;
}

const setup = (columns: GridColumn<Row>[], extra?: Partial<SpreadsheetGridProps<Row>>) => {
  const ref = createRef<SpreadsheetGridHandle<Row>>();
  const view = render(<Harness gridRef={ref} columns={columns} extra={extra} />);
  const shell = view.container.querySelector<HTMLElement>('.ssg-shell')!;
  return { ...view, ref, shell };
};

const viewRegions = (ref: ReturnType<typeof setup>['ref']) =>
  ref.current?.getExportData({ scope: 'view' }).rows.map((cells) => cells[0]?.value);

describe('groupLabel(グループ行の見出し)', () => {
  const groupTexts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-pane="center"][data-ssg-group-row], [data-pane="left"][data-ssg-group-row]')).map(
      (row) => row.textContent ?? '',
    );

  it('既定は値の文字(1.0 と同じ)', () => {
    const { ref, container } = setup(makeColumns({ rowGroup: true }));
    expect(ref.current?.getGroupRows().map((group) => group.label)).toEqual(['kanto', 'chubu']);
    expect(groupTexts(container).some((text) => text.includes('kanto'))).toBe(true);
  });

  it("'formatted' は列の valueFormatter の表示名(画面と getGroupRows)", () => {
    const { ref, container } = setup(makeColumns({ rowGroup: true, groupLabel: 'formatted' }));
    expect(ref.current?.getGroupRows().map((group) => group.label)).toEqual(['関東', '中部']);
    const texts = groupTexts(container);
    expect(texts.some((text) => text.includes('関東'))).toBe(true);
    expect(texts.some((text) => text.includes('kanto'))).toBe(false);
  });

  it('関数はその返り値', () => {
    const { ref } = setup(makeColumns({ rowGroup: true, groupLabel: ({ value, row }) => `${String(value)}:${row?.id}` }));
    expect(ref.current?.getGroupRows().map((group) => group.label)).toEqual(['kanto:1', 'chubu:2']);
  });
});

describe('globalFilterMatch(グローバルフィルター)', () => {
  const filter = (ref: ReturnType<typeof setup>['ref'], text: string) => {
    act(() => {
      ref.current?.applyState({ filters: { globalText: text, columnFilters: {} } });
    });
    return viewRegions(ref);
  };

  it("既定('value')は値の文字だけ(1.0 と同じ)", () => {
    const { ref } = setup(makeColumns());
    expect(filter(ref, '関東')).toEqual([]);
    expect(filter(ref, 'kanto')).toEqual(['kanto', 'kanto']);
  });

  it("'display' は画面の文字だけ、'both' はどちらか(数値の書式も)", () => {
    const display = setup(makeColumns(), { globalFilterMatch: 'display' });
    expect(filter(display.ref, '関東')).toEqual(['kanto', 'kanto']);
    expect(filter(display.ref, 'kanto')).toEqual([]);
    expect(filter(display.ref, '796,000')).toEqual(['kanto']);
    cleanup();

    const both = setup(makeColumns(), { globalFilterMatch: 'both' });
    expect(filter(both.ref, '中部')).toEqual(['chubu']);
    expect(filter(both.ref, 'chubu')).toEqual(['chubu']);
    expect(filter(both.ref, '796000')).toEqual(['kanto']);
  });

  it('グルーピング中のグループ元の列も画面の文字で探せる', () => {
    const { ref } = setup(makeColumns({ rowGroup: true, groupLabel: 'formatted' }), { globalFilterMatch: 'both' });
    act(() => {
      ref.current?.applyState({ filters: { globalText: '中部', columnFilters: {} } });
    });
    expect(ref.current?.getGroupRows().map((group) => group.label)).toEqual(['中部']);
  });
});

describe("select エディタの clipboard: 'label'", () => {
  const copy = async (shell: HTMLElement) => {
    await act(async () => {
      fireEvent.keyDown(shell, { key: 'c', ctrlKey: true });
      await Promise.resolve();
    });
    return writeText.mock.calls[writeText.mock.calls.length - 1]?.[0] as string | undefined;
  };

  it("既定('value')はコピーも貼り付けも値の文字(1.0 と同じ)", async () => {
    const { ref, shell } = setup(makeColumns());
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    expect(await copy(shell)).toBe('kanto');
    act(() => {
      fireEvent.paste(shell, { clipboardData: { getData: () => '中部' } });
    });
    expect(currentRows[0]?.region).toBe('中部');
  });

  it("'label' はコピー・CSV が表示名、貼り付けた表示名は値へ(値はそのまま、どちらでもない文字は生のまま)", async () => {
    const { ref, shell } = setup(makeColumns({}, 'label'));
    act(() => {
      ref.current?.selectCell(0, 0);
    });
    expect(await copy(shell)).toBe('関東');
    expect(ref.current?.getExportData({ scope: 'view' }).rows.map((cells) => cells[0]?.text)).toEqual(['関東', '中部', '関東']);
    expect(ref.current?.getExportData({ scope: 'view' }).rows.map((cells) => cells[0]?.value)).toEqual(['kanto', 'chubu', 'kanto']);

    act(() => {
      fireEvent.paste(shell, { clipboardData: { getData: () => '中部\n関東 \nkanto\n九州' } });
    });
    // 3 行目までが書き込み先(4 行目は表の外)。
    expect(currentRows.map((row) => row.region)).toEqual(['chubu', 'kanto', 'kanto']);
    act(() => {
      ref.current?.selectCell(2, 0);
    });
    act(() => {
      fireEvent.paste(shell, { clipboardData: { getData: () => '九州' } });
    });
    expect(currentRows[2]?.region).toBe('九州');
  });
});