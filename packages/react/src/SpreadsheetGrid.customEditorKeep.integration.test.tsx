// 追加(1.3.0 / Solid 版の品質の段 2 S3-21 / S3-03): custom エディタを作り直さない・フォーカスを奪わないことの結合テストです。
//   S3-21: グループの先頭の行を編集している間に上のグループへ行が足されると、編集中の位置が一瞬グループ行を指し、custom エディタが
//   外れて作り直されていた(打ちかけが消え、開いたときの値に戻る)。同じ編集が続いている間は作り直さない。
//   S3-03: custom エディタを開いたまま、別のセルを(自動化の)ダブルクリックで開くと、前の編集の後処理(次のフレーム)がフォーカスを
//   ルートへ戻し、新しいエディタにキーが入らなかった(RV5-3 と同じ原因)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { CellEditorContext, GridColumn } from './model/gridTypes';

type Row = { id: number; team: string; city: string };

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

let mounts = 0;
function CityEditor({ ctx }: { ctx: CellEditorContext<Row> }) {
  const [draft, setDraft] = useState(String(ctx.value ?? ''));
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <input
      data-testid="city-editor"
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      // フォーカスが外れたら取り消す(S3-03 の再現のアプリと同じ)。
      onBlur={() => ctx.cancel()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          ctx.commit(draft);
        }
      }}
    />
  );
}

const columns: GridColumn<Row>[] = [
  { key: 'team', title: 'チーム', width: 100, rowGroup: true },
  { key: 'city', title: '都市', width: 160, editor: { type: 'custom', render: (ctx) => <CityEditor ctx={ctx} /> } },
];

let currentRows: Row[] = [];
let replaceRows: (rows: Row[]) => void = () => {};

function Harness({ initialRows, grouped }: { initialRows: Row[]; grouped: boolean }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  useEffect(() => {
    replaceRows = setRows;
  }, []);
  useEffect(() => {
    currentRows = rows;
  }, [rows]);
  return (
    <SpreadsheetGrid<Row>
      columns={grouped ? columns : columns.map((column) => ({ ...column, rowGroup: undefined }))}
      rows={rows}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
    />
  );
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const pointer = { button: 0, pointerType: 'mouse', pointerId: 1 };
const cityCell = (container: HTMLElement, rowIndex: number) =>
  container.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${rowIndex}"] [data-ssg-col-key="city"]`)!;
const doubleClick = (target: HTMLElement) => {
  fireEvent.pointerDown(target, pointer);
  fireEvent.pointerUp(window, pointer);
  fireEvent.click(target, { detail: 1 });
  fireEvent.pointerDown(target, pointer);
  fireEvent.pointerUp(window, pointer);
  fireEvent.click(target, { detail: 2 });
  fireEvent.doubleClick(target);
};

describe('S3-21: 編集中に上へ行が足されても custom エディタを作り直さない', () => {
  it('グループの先頭の行の打ちかけが残り、確定でその行へ書く', async () => {
    mounts = 0;
    const { container, getByTestId } = render(
      <Harness
        grouped
        initialRows={[
          { id: 1, team: 'A', city: 'city-A1' },
          { id: 2, team: 'B', city: 'city-B1' },
          { id: 3, team: 'B', city: 'city-B2' },
        ]}
      />,
    );
    // 並び: グループ A(0)/ A1(1)/ グループ B(2)/ B1(3)/ B2(4)。
    act(() => {
      doubleClick(cityCell(container, 3));
    });
    expect(mounts).toBe(1);
    fireEvent.change(getByTestId('city-editor'), { target: { value: 'abc' } });
    // A グループに 1 行足す(B1 は 4 行目へ。編集中の位置 3 は一瞬グループ B の行を指す)。
    act(() => {
      replaceRows([{ id: 9, team: 'A', city: 'city-A0' }, ...currentRows]);
    });
    await act(async () => {
      await nextFrame();
    });
    expect(mounts).toBe(1);
    expect(getByTestId('city-editor')).toHaveProperty('value', 'abc');
    fireEvent.change(getByTestId('city-editor'), { target: { value: 'abcd' } });
    act(() => {
      fireEvent.keyDown(getByTestId('city-editor'), { key: 'Enter' });
    });
    expect(currentRows.find((row) => row.id === 2)?.city).toBe('abcd');
  });
});

describe('S3-03: custom エディタを開いたまま別のセルをダブルクリックで開く', () => {
  it('新しいエディタのフォーカスを、前の編集の後処理が奪わない', async () => {
    mounts = 0;
    const { container, getByTestId } = render(
      <Harness
        grouped={false}
        initialRows={[
          { id: 1, team: 'A', city: 'c1' },
          { id: 2, team: 'B', city: 'c2' },
          { id: 3, team: 'B', city: 'c3' },
        ]}
      />,
    );
    act(() => {
      doubleClick(cityCell(container, 0));
    });
    expect(document.activeElement).toBe(getByTestId('city-editor'));
    // 前の編集の後処理(次のフレーム)が来る前に、別のセルのダブルクリックまで一気に送る(Playwright の dblclick と同じ)。
    act(() => {
      // 押したところでフォーカスはシェルへ移り(ブラウザはフォーカスできる祖先へ移す)、エディタの blur で取り消す。
      container.querySelector<HTMLElement>('.ssg-shell')!.focus();
      doubleClick(cityCell(container, 2));
    });
    const editor = getByTestId('city-editor');
    expect(editor).toHaveProperty('value', 'c3');
    await act(async () => {
      await nextFrame();
      await nextFrame();
    });
    expect(document.activeElement).toBe(getByTestId('city-editor'));
  });
});
