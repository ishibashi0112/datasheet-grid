'use client';

// 行グルーピング + 集計のデモ: 地域 > 担当 の 2 階層グルーピングと sum 集計、開閉の命令的 API。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  region: string;
  rep: string;
  product: string;
  qty: number;
  amount: number;
};

const columns: GridColumn<Row>[] = [
  { key: 'region', title: '地域', width: 100, rowGroup: true },
  { key: 'rep', title: '担当', width: 100, rowGroup: true },
  { key: 'product', title: '商品', width: 170 },
  { key: 'qty', title: '数量', width: 100, align: 'right', aggFunc: 'sum' },
  {
    key: 'amount',
    title: '金額',
    width: 140,
    align: 'right',
    aggFunc: 'sum',
    valueFormatter: numberFormatter(),
  },
];

const initialRows: Row[] = [
  { id: 1, region: '東京', rep: '佐藤', product: 'ノート PC', qty: 12, amount: 1_560_000 },
  { id: 2, region: '東京', rep: '佐藤', product: 'モニター', qty: 20, amount: 640_000 },
  { id: 3, region: '東京', rep: '鈴木', product: 'キーボード', qty: 50, amount: 400_000 },
  { id: 4, region: '東京', rep: '鈴木', product: 'マウス', qty: 60, amount: 240_000 },
  { id: 5, region: '大阪', rep: '高橋', product: 'ノート PC', qty: 8, amount: 1_040_000 },
  { id: 6, region: '大阪', rep: '高橋', product: 'ドッキングステーション', qty: 15, amount: 450_000 },
  { id: 7, region: '大阪', rep: '田中', product: 'モニター', qty: 10, amount: 320_000 },
  { id: 8, region: '福岡', rep: '伊藤', product: 'ノート PC', qty: 5, amount: 650_000 },
  { id: 9, region: '福岡', rep: '伊藤', product: 'マウス', qty: 25, amount: 100_000 },
];

export function GroupingDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.expandAllGroups()}
        >
          すべて展開
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.collapseAllGroups()}
        >
          すべて折りたたむ
        </button>
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={380}
        theme="auto"
        ref={gridRef}
      />
    </div>
  );
}