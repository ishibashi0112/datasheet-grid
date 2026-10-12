'use client';

// 合計行のデモ: 受注明細の下端に合計行を固定する。
//   列ごとの集計は GridColumn.aggFunc(数量 = 合計 / 単価 = 平均 / 金額 = 合計 / 品名 = 個数)で決め、
//   「区分」でフィルターすると見えている行だけで計算し直す。左右の固定列・横スクロールにも付いていく。
//   CSV ボタンで includeTotalRow(末尾に合計行)を確認できる。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: string;
  orderNo: string;
  customer: string;
  product: string;
  category: '部品' | '消耗品' | '工具';
  qty: number;
  unitPrice: number;
  dueDate: string;
};

const customers = ['東邦機工', '北斗精機', '三和製作所', '富士テクノ', '中央産業'];
const products: Array<[string, Row['category'], number]> = [
  ['ベアリング 6204ZZ', '部品', 570],
  ['ステッピングモータ', '部品', 1_710],
  ['スプロケット RS40-20T', '部品', 8_400],
  ['キャップボルト M6×16', '消耗品', 200],
  ['ナット K-115-1 M8', '消耗品', 400],
  ['切削油 4L', '消耗品', 3_200],
  ['トルクレンチ', '工具', 18_500],
  ['六角レンチセット', '工具', 2_400],
];

const rows: Row[] = Array.from({ length: 120 }, (_, i) => {
  const [product, category, unitPrice] = products[(i * 5) % products.length];
  return {
    id: `r${i + 1}`,
    orderNo: `SO-${String(24_001 + i)}`,
    customer: customers[(i * 3) % customers.length],
    product,
    category,
    qty: ((i * 7) % 12) + 1,
    unitPrice,
    dueDate: `2026-${String((i % 9) + 3).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
  };
});

const yen = numberFormatter<Row>({ maximumFractionDigits: 0 });

const columns: GridColumn<Row>[] = [
  { key: 'orderNo', title: '受注番号', width: 110, pinned: 'left' },
  { key: 'customer', title: '得意先', width: 120 },
  { key: 'product', title: '品名', width: 200, aggFunc: 'count' },
  { key: 'category', title: '区分', width: 90, filterType: 'set' },
  { key: 'qty', title: '数量', width: 80, align: 'right', aggFunc: 'sum', editor: { type: 'number', min: 0 } },
  { key: 'unitPrice', title: '単価', width: 110, align: 'right', aggFunc: 'avg', valueFormatter: yen },
  {
    key: 'amount',
    title: '金額',
    width: 130,
    align: 'right',
    pinned: 'right',
    getValue: (row) => row.qty * row.unitPrice,
    aggFunc: 'sum',
    valueFormatter: yen,
  },
  { key: 'dueDate', title: '納期', width: 110 },
];

export function TotalRowDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const [data, setData] = useState<Row[]>(rows);
  const [enabled, setEnabled] = useState(true);
  const [csv, setCsv] = useState<string>('');

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          合計行を出す(totalRow)
        </label>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => setCsv(gridRef.current?.exportCsv({ includeTotalRow: true }) ?? '')}
        >
          CSV(合計行込み)を見る
        </button>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={data}
        columns={columns}
        onRowsChange={setData}
        rowKeyGetter={(row) => row.id}
        height={360}
        totalRow={enabled ? { label: '合計' } : undefined}
      />
      {csv !== '' && (
        <pre className="max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-xs dark:bg-gray-900">
          {csv.split('\r\n').slice(-4).join('\n')}
        </pre>
      )}
    </div>
  );
}