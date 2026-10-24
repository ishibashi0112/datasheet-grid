// 追加(差し込み式 段階 2): 機能セットを外した / 1 つだけ入れた構成のシェルの結合テストです。全部入り(SpreadsheetGrid)の
//   テストだけだと、機能を外したときにだけ出る不具合(代役の取り違え / 静的 import の残り)を見逃すため、
//   useGridShell に機能セットを直接渡して確かめます。機能を移すたびにここへ足します。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { useGridShell } from './GridShell';
import { findFeature } from './features/find';
import type { ReactGridFeatures } from './features/types';
import { installJsdomLayoutStubs } from './testing';
import { resetUnregisteredFeatureWarnings } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import type { GridColumn, SpreadsheetGridHandle, SpreadsheetGridProps } from './model/gridTypes';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }];

const NO_FEATURES: ReactGridFeatures = {};
const FIND_ONLY: ReactGridFeatures = { find: findFeature };
function MinimalGrid(props: SpreadsheetGridProps<Row>) {
  return useGridShell(props, NO_FEATURES);
}
function FindOnlyGrid(props: SpreadsheetGridProps<Row>) {
  return useGridShell(props, FIND_ONLY);
}

let restore: () => void;
beforeAll(() => {
  restore = installJsdomLayoutStubs();
});
afterAll(() => {
  restore();
});
afterEach(() => {
  cleanup();
  resetUnregisteredFeatureWarnings();
  vi.restoreAllMocks();
});

const flushScan = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  });
};

describe('差し込み式: find', () => {
  it('機能セットに無ければ find を渡しても検索バーは出ず、Ctrl+F も横取りせず、開発時に 1 回だけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const onFindChange = vi.fn();
    const { container, rerender } = render(
      <MinimalGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} find onFindChange={onFindChange} />,
    );
    act(() => {
      ref.current?.openFind('alpha');
    });
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
    const shell = container.querySelector('.ssg-shell') as HTMLElement;
    const notPrevented = fireEvent.keyDown(shell, { key: 'f', ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(container.querySelector('.ssg-find-bar')).toBeNull();
    expect(onFindChange).not.toHaveBeenCalled();
    // 警告は find の 1 回だけ(再描画しても繰り返さない)。
    rerender(<MinimalGrid ref={ref} rows={[...rows]} columns={columns} rowKeyGetter={(r) => r.id} find onFindChange={onFindChange} />);
    const findWarnings = warn.mock.calls.filter(([message]) => String(message).includes('`find`'));
    expect(findWarnings).toHaveLength(1);
  });

  it('find を使わなければ警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MinimalGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('find だけを入れた構成でも検索バーとヒットの強調が動く', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const { container } = render(<FindOnlyGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} find />);
    act(() => {
      ref.current?.openFind('alp');
    });
    expect(container.querySelector('.ssg-find-bar')).not.toBeNull();
    await flushScan();
    expect(Array.from(container.querySelectorAll('.ssg-find-mark')).map((el) => el.textContent)).toEqual(['alp']);
  });
});