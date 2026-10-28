// 追加(React 18 対応 2026-10-28): withRefProp の 2 つの経路のテストです。
//   - React 19(このリポジトリの React)ではコンポーネントをそのまま返す。
//   - React 18 の経路は react の version だけを '18.3.1' に差し替えて公開コンポーネントを読み直し、forwardRef で包まれ、
//     ref に命令的ハンドルが入ることを確かめます(描画は React 19 のまま。React 18 そのものでの確認は
//     docs/audits/2026-10-28/README.md の §7)。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import { withRefProp } from './withRefProp';
import type { GridColumn, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'alpha' },
  { id: 2, name: 'beta' },
];
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 200 }];
const FORWARD_REF = Symbol.for('react.forward_ref');
const typeOf = (component: unknown) => (component as { $$typeof?: symbol }).$$typeof;

beforeAll(() => {
  installJsdomLayoutStubs();
});

afterEach(() => {
  cleanup();
  vi.doUnmock('react');
  vi.resetModules();
});

describe('withRefProp', () => {
  it('React 19 ではコンポーネントをそのまま返す', () => {
    const component = () => null;
    expect(withRefProp(component)).toBe(component);
    expect(typeOf(SpreadsheetGrid)).toBeUndefined();
  });

  it('React 18 では forwardRef で包み、ref に命令的ハンドルが入る(SpreadsheetGrid / createSpreadsheetGrid)', async () => {
    vi.resetModules();
    vi.doMock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), version: '18.3.1' }));
    const { SpreadsheetGrid: Grid18 } = await import('./SpreadsheetGrid');
    const { createSpreadsheetGrid } = await import('./createSpreadsheetGrid');
    const LiteGrid18 = createSpreadsheetGrid({ features: {} });
    expect(typeOf(Grid18)).toBe(FORWARD_REF);
    expect(typeOf(LiteGrid18)).toBe(FORWARD_REF);
    // 開発ツールと警告に出る名前は包む前のもの(createSpreadsheetGrid は displayName、全部入りは関数名)。
    expect((LiteGrid18 as { displayName?: string }).displayName).toBe('SpreadsheetGrid');
    expect((Grid18 as { displayName?: string }).displayName).toBeTruthy();

    const fullRef = createRef<SpreadsheetGridHandle<Row>>();
    const liteRef = createRef<SpreadsheetGridHandle<Row>>();
    render(
      <>
        <Grid18 ref={fullRef} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={200} />
        <LiteGrid18 ref={liteRef} rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={200} />
      </>,
    );
    expect(fullRef.current?.getState()).toHaveProperty('sort');
    expect(liteRef.current?.getState()).toHaveProperty('sort');
  });
});