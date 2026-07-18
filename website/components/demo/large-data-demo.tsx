'use client';

// 大量データ(100,000 行)+ 3 ペイン固定列のデモ。仮想化により可視域ぶんだけ DOM 化される。
import { useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  code: string;
  name: string;
  category: string;
  qty: number;
  price: number;
  status: string;
};

const ROW_COUNT = 100_000;
const CATEGORIES = ['電子部品', '機械部品', '化成品', '梱包材', '工具'];
const STATUSES = ['有効', '停止', '廃番'];

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 90, align: 'right', pinned: 'left' },
  { key: 'code', title: '品目コード', width: 140, filterType: 'text' },
  { key: 'name', title: '品目名', width: 220, filterType: 'text' },
  { key: 'category', title: 'カテゴリ', width: 130, filterType: 'set' },
  {
    key: 'qty',
    title: '在庫数',
    width: 120,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
  },
  {
    key: 'price',
    title: '単価',
    width: 120,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
  },
  {
    key: 'amount',
    title: '在庫金額',
    width: 150,
    align: 'right',
    getValue: (row) => row.qty * row.price,
    valueFormatter: numberFormatter(),
  },
  { key: 'status', title: '状態', width: 100, filterType: 'set', pinned: 'right' },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(): Row[] {
  const rand = mulberry32(7);
  const rows: Row[] = new Array(ROW_COUNT);
  for (let i = 0; i < ROW_COUNT; i++) {
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    rows[i] = {
      id: i + 1,
      code: `P-${String(100000 + i)}`,
      name: `${category} サンプル品目 ${i + 1}`,
      category,
      qty: Math.floor(rand() * 10_000),
      price: (1 + Math.floor(rand() * 500)) * 10,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
    };
  }
  return rows;
}

export function LargeDataDemo() {
  const initialRows = useMemo(buildRows, []);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fd-muted-foreground">
          {ROW_COUNT.toLocaleString()} 行(クライアント生成)
        </span>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.scrollToTop()}
        >
          先頭へ
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.scrollToRow(49_999, { align: 'center' })}
        >
          50,000 行目へ
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.scrollToBottom()}
        >
          末尾へ
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