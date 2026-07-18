'use client';

// CSV エクスポートのデモ: downloadCsv(scope 別)を命令的ハンドルから呼ぶ。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; category: string; qty: number; price: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '商品名', width: 170, filterType: 'text' },
  { key: 'category', title: 'カテゴリ', width: 120, filterType: 'set' },
  { key: 'qty', title: '数量', width: 100, align: 'right', filterType: 'number' },
  {
    key: 'price',
    title: '単価',
    width: 120,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
  },
];

const initialRows: Row[] = [
  { id: 1, name: 'りんご', category: '果物', qty: 30, price: 120 },
  { id: 2, name: 'バナナ', category: '果物', qty: 50, price: 80 },
  { id: 3, name: '緑茶', category: '飲料', qty: 24, price: 150 },
  { id: 4, name: 'コーヒー', category: '飲料', qty: 36, price: 300 },
  { id: 5, name: '洗剤', category: '日用品', qty: 12, price: 280 },
  { id: 6, name: 'タオル', category: '日用品', qty: 40, price: 500 },
];

export function ExportDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.downloadCsv('products.csv')}
        >
          CSV をダウンロード(ビュー全体)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() =>
            gridRef.current?.downloadCsv('selection.csv', { scope: 'selection' })
          }
        >
          選択範囲をダウンロード
        </button>
        <span className="text-fd-muted-foreground">
          フィルター / ソートを掛けてから試すと反映が分かります
        </span>
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={280}
        theme="auto"
        ref={gridRef}
      />
    </div>
  );
}