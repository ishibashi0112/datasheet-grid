'use client';

// 条件付き書式のデモ: 在庫数 = データバー、前月比 = カラースケール(diverging)、単価 = カラースケール(sequential)、
//   状態 = 状態チップ。値を編集すると帯の長さ / 色 / min・max が追従する。
import { useState } from 'react';
import { SpreadsheetGrid, numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Item = {
  id: string;
  name: string;
  qty: number;
  delta: number;
  price: number;
  status: '有効' | '停止' | '廃番';
};

const initialItems: Item[] = [
  { id: 'P-01', name: '六角ボルト M8', qty: 1200, delta: 12, price: 18, status: '有効' },
  { id: 'P-02', name: 'ナイロンナット M8', qty: 860, delta: -4, price: 12, status: '有効' },
  { id: 'P-03', name: 'ステンレス座金', qty: 2400, delta: 25, price: 6, status: '有効' },
  { id: 'P-04', name: '電源ユニット 24V', qty: 42, delta: -18, price: 8400, status: '停止' },
  { id: 'P-05', name: 'リレー 12V', qty: 310, delta: 3, price: 520, status: '有効' },
  { id: 'P-06', name: 'ケーブルグランド', qty: 95, delta: -27, price: 260, status: '停止' },
  { id: 'P-07', name: '端子台 10P', qty: 0, delta: -30, price: 1350, status: '廃番' },
  { id: 'P-08', name: '結束バンド 200mm', qty: 1800, delta: 8, price: 3, status: '有効' },
  { id: 'P-09', name: 'アルミフレーム 20角', qty: 64, delta: 15, price: 2100, status: '有効' },
  { id: 'P-10', name: 'ゴム脚 φ30', qty: 720, delta: 0, price: 85, status: '有効' },
];

const columns: GridColumn<Item>[] = [
  { key: 'id', title: '品番', width: 80, readOnly: true },
  { key: 'name', title: '品名', width: 180 },
  {
    key: 'qty',
    title: '在庫数',
    width: 120,
    align: 'right',
    valueFormatter: numberFormatter(),
    editor: { type: 'number', min: 0 },
    conditionalFormat: { dataBar: {} },
  },
  {
    key: 'delta',
    title: '前月比 %',
    width: 100,
    align: 'right',
    editor: { type: 'number' },
    conditionalFormat: { colorScale: { type: 'diverging', min: -30, mid: 0, max: 30 } },
  },
  {
    key: 'price',
    title: '単価',
    width: 100,
    align: 'right',
    valueFormatter: numberFormatter(),
    editor: { type: 'number', min: 0 },
    conditionalFormat: { colorScale: {} },
  },
  {
    key: 'status',
    title: '状態',
    width: 120,
    filterType: 'set',
    editor: { type: 'select', options: ['有効', '停止', '廃番'].map((v) => ({ label: v, value: v })) },
    conditionalFormat: { chips: { 有効: 'good', 停止: { tone: 'warning', label: '一時停止' }, 廃番: 'critical' } },
  },
];

export function ConditionalFormatDemo() {
  const [items, setItems] = useState<Item[]>(initialItems);

  return (
    <div className="flex flex-col gap-2">
      <SpreadsheetGrid
        rows={items}
        onRowsChange={setItems}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={400}
        theme="auto"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => setItems(initialItems)}
        >
          リセット
        </button>
        <span className="text-fd-muted-foreground">
          在庫数・前月比・単価を書き換えると、帯の長さと色がその場で変わります(状態列はフィルターで絞っても min / max を取り直します)。
        </span>
      </div>
    </div>
  );
}
