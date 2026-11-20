// シェルの振る舞いのうち、React 版と並べて比べるテストでは見えにくいもの(要素を作り直さないこと・イベントの伝わり方)。
//   段階 1-1 の別視点のレビューの指摘の回帰テスト。
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { fireEvent, render } from '@solidjs/testing-library';
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-core/testing';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from './index';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 120 },
  { key: 'qty', title: '数量', width: 80 },
];

const makeRows = (count: number, from = 1): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: from + i, name: `品目 ${from + i}`, qty: i }));

beforeAll(() => {
  installJsdomLayoutStubs({ width: 800, height: 400 });
});

const cellOf = (container: HTMLElement, row: number, key: string) => {
  const cell = container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${row}"] [data-ssg-col-key="${key}"]`);
  if (!cell) {
    throw new Error(`セルがありません: ${row} ${key}`);
  }
  return cell;
};

const press = (target: Element) => {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1 });
  flush();
  fireEvent.pointerUp(window, { button: 0, pointerId: 1 });
  flush();
};

describe('シェルの振る舞い', () => {
  it('編集中に上へ行が足されても、エディタは同じ要素のまま打ちかけの文字を残す(行のキーで追う)', () => {
    let setRows: (rows: Row[]) => void = () => {};
    const { container } = render(() => {
      const [rows, set] = createSignal(makeRows(10, 10));
      setRows = (next) => set(() => next);
      return <SpreadsheetGrid<Row> rows={rows()} columns={columns} rowKeyGetter={(row) => row.id} onRowsChange={setRows} />;
    });
    flush();
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(container, 2, 'name'));
    fireEvent.keyDown(shell, { key: 'F2' });
    flush();
    const input = container.querySelector<HTMLInputElement>('.ssg-cell-editor input');
    expect(input).not.toBeNull();
    (input as HTMLInputElement).value = '打ちかけ';
    fireEvent.input(input as HTMLInputElement);
    setRows([{ id: 1, name: '新しい行', qty: 0 }, ...makeRows(10, 10)]);
    flush();
    const after = container.querySelector<HTMLInputElement>('.ssg-cell-editor input');
    expect(after).toBe(input);
    expect(after?.value).toBe('打ちかけ');
    // エディタの枠は編集中のセルの aria-owns の先(React 版と同じ id と名前)。
    const editingCell = cellOf(container, 3, 'name');
    const owns = editingCell.getAttribute('aria-owns');
    expect(owns).toBeTruthy();
    expect(document.getElementById(owns as string)?.classList.contains('ssg-cell-editor')).toBe(true);
    expect(document.getElementById(owns as string)?.getAttribute('aria-label')).toBe('品名 を編集');
    expect(after?.getAttribute('aria-label')).toBe('品名 を編集');
  });

  it('別のセルの編集が閉じずに始まったら、新しいエディタにする', () => {
    const { container } = render(() => <SpreadsheetGrid<Row> rows={makeRows(10)} columns={columns} rowKeyGetter={(row) => row.id} onRowsChange={() => {}} />);
    flush();
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(container, 1, 'name'));
    fireEvent.keyDown(shell, { key: 'F2' });
    flush();
    const first = container.querySelector('.ssg-cell-editor input');
    fireEvent.dblClick(cellOf(container, 4, 'qty'));
    flush();
    const second = container.querySelector<HTMLInputElement>('.ssg-cell-editor input');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(second?.value).toBe('4');
  });

  it('既定のバーは props が広げ直されても作り直さない', () => {
    let setProps: (patch: Record<string, unknown>) => void = () => {};
    const { container } = render(() => {
      const [props, set] = createSignal<Record<string, unknown>>({ rows: makeRows(5), columns });
      setProps = (patch) => set((previous) => ({ ...previous, ...patch }));
      const Grid = SpreadsheetGrid as unknown as (p: Record<string, unknown>) => ReturnType<typeof SpreadsheetGrid>;
      return <Grid {...props()} />;
    });
    flush();
    const top = container.querySelector('.ssg-bar--top');
    const bottom = container.querySelector('.ssg-bar--bottom');
    setProps({ ariaLabel: '在庫' });
    flush();
    expect(container.querySelector('.ssg-bar--top')).toBe(top);
    expect(container.querySelector('.ssg-bar--bottom')).toBe(bottom);
  });

  it('グリッドが使う Escape(範囲の選択を外す)は外側の Solid のハンドラへ伝えない。使わない Escape は伝える', () => {
    const outer = vi.fn();
    const { container } = render(() => (
      <div onKeyDown={(event) => outer(event.key)}>
        <SpreadsheetGrid<Row> rows={makeRows(10)} columns={columns} rowKeyGetter={(row) => row.id} />
      </div>
    ));
    flush();
    const shell = container.querySelector<HTMLElement>('.ssg-shell') as HTMLElement;
    press(cellOf(container, 1, 'name'));
    fireEvent.keyDown(shell, { key: 'ArrowDown', shiftKey: true });
    flush();
    fireEvent.keyDown(shell, { key: 'Escape' });
    flush();
    expect(outer).not.toHaveBeenCalledWith('Escape');
    // 1 セルだけの選択の Escape はグリッドが使わない(ダイアログを閉じられる)。
    fireEvent.keyDown(shell, { key: 'Escape' });
    flush();
    expect(outer).toHaveBeenCalledWith('Escape');
  });

  it('onCellClick の event.currentTarget は押したセル(React と同じ)', () => {
    const targets: (EventTarget | null)[] = [];
    const { container } = render(() => (
      <SpreadsheetGrid<Row>
        rows={makeRows(10)}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onCellClick={(params) => {
          targets.push(params.event.currentTarget);
        }}
      />
    ));
    flush();
    const cell = cellOf(container, 2, 'qty');
    fireEvent.click(cell);
    flush();
    expect(targets).toEqual([cell]);
  });

  // 段階 2-3 の別視点のレビュー: 見出しが描かれるのを待つ rAF が、表を外した後に動いてポップアップのコントローラを開いていた。
  it('チップから列フィルターへ移った直後に表を外しても、外した表はフォーカスを奪わずリスナーも付けない', async () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    const { container, unmount } = render(() => (
      <SpreadsheetGrid<Row>
        rows={makeRows(5)}
        columns={columns.map((column) => (column.key === 'name' ? { ...column, filterType: 'text' as const } : column))}
        rowKeyGetter={(row) => row.id}
        enableColumnFilter
        showFilterChipBar
        initialState={{ filters: { globalText: '', columnFilters: { name: { kind: 'text', value: '品目' } } } }}
      />
    ));
    flush();
    const chip = container.querySelector<HTMLElement>('.ssg-filter-chip-label');
    expect(chip).not.toBeNull();
    fireEvent.click(chip as HTMLElement);
    flush();
    unmount();
    const added = vi.spyOn(window, 'addEventListener');
    outside.focus();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const popupListeners = added.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown');
    added.mockRestore();
    expect(document.activeElement).toBe(outside);
    expect(popupListeners).toEqual([]);
    outside.remove();
  });

  // 段階 2-3 の別視点のレビュー: ポップアップの部品の本体で描く場所を決めるときに props を追跡の外で読み、開くたびに Solid 2.0 の
  //   開発時の警告 STRICT_READ_UNTRACKED が出ていた。
  it('列メニュー・列フィルター・ツールパネルを開いても、Solid の開発時の警告を出さない', async () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
    const warn = vi.spyOn(console, 'warn');
    let handle: SpreadsheetGridHandle<Row> | undefined;
    // 利用側が props を signal の広げで渡す形(props の読み取りが反応する値になる。比べるテストの形と同じ)。
    const { container, unmount } = render(() => {
      const [gridProps] = createSignal({
        rows: makeRows(5),
        columns: columns.map((column) => (column.key === 'name' ? { ...column, filterType: 'text' as const } : column)),
        rowKeyGetter: (row: Row) => row.id,
        enableColumnFilter: true,
        enableColumnMenu: true,
      });
      return (
        <SpreadsheetGrid<Row>
          {...gridProps()}
          ref={(h) => {
            handle = h;
          }}
        />
      );
    });
    flush();
    await settle();
    const menuButton = container.querySelector<HTMLElement>('.ssg-header-cell[data-ssg-col-key="name"] .ssg-icon-btn');
    expect(menuButton).not.toBeNull();
    fireEvent.pointerDown(menuButton as HTMLElement, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(menuButton as HTMLElement, { button: 0, pointerId: 1, pointerType: 'mouse' });
    fireEvent.click(menuButton as HTMLElement, { detail: 1 });
    flush();
    await settle();
    const filterItem = Array.from(document.querySelectorAll<HTMLElement>('.ssg-menu-item')).find((item) =>
      item.textContent?.includes('フィルター…'),
    );
    expect(filterItem).toBeDefined();
    fireEvent.click(filterItem as HTMLElement, { detail: 1 });
    flush();
    await settle();
    expect(document.querySelector('.ssg-filter-popover')).not.toBeNull();
    handle?.openFilterManager();
    flush();
    await settle();
    expect(document.querySelector('.ssg-toolpanel')).not.toBeNull();
    const strictWarnings = warn.mock.calls.filter((call) => String(call[0]).includes('STRICT_READ_UNTRACKED'));
    warn.mockRestore();
    unmount();
    expect(strictWarnings).toEqual([]);
  });
});