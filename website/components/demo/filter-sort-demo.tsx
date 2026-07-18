'use client';

// ソート / フィルターのデモ: 列ごとのフィルター種別(text / number / date / select / set)と
// グローバルフィルター、フィルター管理パネルを体験できる。
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
  status: string;
  qty: number;
  price: number;
  registered: string;
};

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '商品名', width: 180, filterType: 'text' },
  {
    key: 'category',
    title: 'カテゴリ',
    width: 130,
    filterType: 'select',
  },
  {
    key: 'status',
    title: 'ステータス',
    width: 130,
    filterType: 'set',
  },
  {
    key: 'qty',
    title: '数量',
    width: 110,
    align: 'right',
    filterType: 'number',
  },
  {
    key: 'price',
    title: '単価',
    width: 130,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
  },
  { key: 'registered', title: '登録日', width: 140, filterType: 'date' },
];

const CATEGORIES = ['食品', '飲料', '日用品', '文具'];
const STATUSES = ['在庫あり', '残りわずか', '欠品', '取り寄せ'];
const NAMES = [
  'りんご', 'バナナ', 'みかん', '緑茶', 'コーヒー', '炭酸水',
  '洗剤', 'スポンジ', 'タオル', 'ノート', 'ボールペン', '付箋',
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
  const rand = mulberry32(42);
  return Array.from({ length: 40 }, (_, i) => {
    const name = NAMES[i % NAMES.length];
    const day = 1 + Math.floor(rand() * 28);
    return {
      id: i + 1,
      name: `${name} ${Math.floor(i / NAMES.length) + 1}`,
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      qty: Math.floor(rand() * 500),
      price: (1 + Math.floor(rand() * 50)) * 10,
      registered: `2026-0${1 + Math.floor(rand() * 6)}-${String(day).padStart(2, '0')}`,
    };
  });
}

export function FilterSortDemo() {
  const initialRows = useMemo(buildRows, []);
  const [rows, setRows] = useState<Row[]>(initialRows);

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      height={320}
      theme="auto"
      showFilterChipBar
    />
  );
}