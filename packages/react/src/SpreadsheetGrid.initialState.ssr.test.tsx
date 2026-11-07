// 追加(段階 2 DU-12): initialState はサーバーの描画(renderToString)にも載ります(Next.js で URL から戻した並べ替え /
//   絞り込みが、最初の HTML から見える)。node 環境(window 無し)で実行します。
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3 },
  { id: 2, name: 'beta', qty: 1 },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text' },
  { key: 'qty', title: '数量', width: 100, filterType: 'number' },
];

// 列の見出しはサーバーでは描かない(列の仮想化に幅が要る)ので、上部バーの件数と並べ替えの表示で確かめます。
const topBarText = (html: string) => html.match(/<div class="ssg-bar--top">([\s\S]*?)<div class="ssg-shell"/)?.[1].replace(/<[^>]+>/g, ' ') ?? '';

describe('initialState(SSR)', () => {
  it('サーバーの描画から絞り込みと並べ替えが効く', () => {
    const html = renderToString(
      <SpreadsheetGrid<Row>
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={300}
        initialState={{
          filters: { columnFilters: { name: { kind: 'text', value: 'l' } } },
          sort: [{ columnKey: 'qty', direction: 'desc' }],
        }}
      />,
    );
    const text = topBarText(html);
    expect(text).toContain('1 / 2');
    expect(text).toContain('降順');
    const plain = topBarText(renderToString(<SpreadsheetGrid<Row> rows={rows} columns={columns} rowKeyGetter={(row) => row.id} height={300} />));
    expect(plain).toContain('2 / 2');
    expect(plain).not.toContain('降順');
  });
});