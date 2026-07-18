'use client';

// ランディングのヒーローデモ: 100,000 行 + 固定列 + 編集 + フィルターの「全部入り」を
// ファーストビューに置く(案 B: デモ主役 2 カラム型)。
import { useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
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
  { key: 'id', title: 'ID', width: 80, align: 'right', pinned: 'left' },
  { key: 'name', title: '品目名', width: 200, filterType: 'text', editable: true },
  { key: 'category', title: 'カテゴリ', width: 110, filterType: 'set' },
  {
    key: 'qty',
    title: '在庫数',
    width: 110,
    align: 'right',
    filterType: 'number',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    valueFormatter: numberFormatter(),
    validate: ({ value }) =>
      value === null ||
      (typeof value === 'number' && value >= 0) ||
      '0 以上で入力してください',
  },
  {
    key: 'price',
    title: '単価',
    width: 110,
    align: 'right',
    filterType: 'number',
    editable: true,
    editor: { type: 'number', min: 0 },
    valueFormatter: numberFormatter(),
  },
  { key: 'status', title: '状態', width: 90, filterType: 'set', pinned: 'right' },
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
  const rand = mulberry32(11);
  const rows: Row[] = new Array(ROW_COUNT);
  for (let i = 0; i < ROW_COUNT; i++) {
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    rows[i] = {
      id: i + 1,
      name: `${category} サンプル品目 ${i + 1}`,
      category,
      qty: Math.floor(rand() * 10_000),
      price: (1 + Math.floor(rand() * 500)) * 10,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
    };
  }
  return rows;
}

export function HeroGridDemo() {
  const initialRows = useMemo(buildRows, []);
  const [rows, setRows] = useState<Row[]>(initialRows);

  return (
    <div className="flex flex-col gap-1.5">
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={420}
        theme="auto"
      />
      <p className="text-xs text-fd-muted-foreground text-right">
        100,000 行 · ダブルクリックで編集 · ヘッダーメニューからフィルター / ソート
      </p>
    </div>
  );
}