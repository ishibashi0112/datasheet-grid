'use client';

// スモークデモ(Batch 1): ライブラリ(link:..)を Next.js クライアントコンポーネントとして
// 描画できることの検証用。Batch 2 以降でランディング用デモに発展させる。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; qty: number; price: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '商品名', width: 200, editable: true, filterType: 'text' },
  {
    key: 'qty',
    title: '数量',
    width: 120,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    filterType: 'number',
  },
  {
    key: 'price',
    title: '単価',
    width: 140,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0 },
    filterType: 'number',
  },
];

const initialRows: Row[] = [
  { id: 1, name: 'りんご', qty: 3, price: 120 },
  { id: 2, name: 'バナナ', qty: 5, price: 80 },
  { id: 3, name: 'みかん', qty: 8, price: 60 },
  { id: 4, name: 'ぶどう', qty: 2, price: 480 },
];

export function BasicGridDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      height={280}
      theme="auto"
    />
  );
}