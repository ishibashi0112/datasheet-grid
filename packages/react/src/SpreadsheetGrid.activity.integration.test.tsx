// 追加(1.0.2 / 2026-11-09 実アプリの総点検の確かめ直し RV-D3): <Activity>(Next.js 16 の cacheComponents の画面遷移)で
//   隠して見せたとき、serverSide の表が先頭へ戻らず、開いていた展開行も閉じない。これまでは effect の付け直しで
//   「query が変わった」ときの処理(先頭へ戻す・展開行を閉じる)が走り、`onScroll` に `top: 0` が `'user'` で届いていた。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Activity, createRef } from 'react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn, ServerSideDataSource, SpreadsheetGridHandle } from './model/gridTypes';

type Row = { id: number; name: string };
const serverRows: Row[] = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `row ${i + 1}` }));
const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 160 }];
const dataSource: ServerSideDataSource<Row> = {
  getRows: (params) =>
    Promise.resolve({ rows: serverRows.slice(params.startIndex, params.endIndex), totalRowCount: serverRows.length }),
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

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('<Activity> で隠して見せたとき(serverSide)', () => {
  it('スクロール位置を先頭へ戻さず、開いていた展開行も閉じない', async () => {
    const ref = createRef<SpreadsheetGridHandle<Row>>();
    const view = (visible: boolean) => (
      <Activity mode={visible ? 'visible' : 'hidden'}>
        <SpreadsheetGrid<Row>
          ref={ref}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          dataSource={dataSource}
          height={300}
          detailRow={{ render: ({ row }) => <div>詳細 {row.name}</div> }}
        />
      </Activity>
    );
    const { container, rerender } = render(view(true));
    await flush();
    act(() => {
      ref.current?.setDetailRowExpanded(1, true);
    });
    const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container');
    expect(scroller).not.toBeNull();
    if (scroller) {
      scroller.scrollTop = 500;
    }
    rerender(view(false));
    await flush();
    rerender(view(true));
    await flush();
    expect(scroller?.scrollTop).toBe(500);
    expect(ref.current?.getExpandedDetailRowKeys()).toEqual([1]);
  });
});