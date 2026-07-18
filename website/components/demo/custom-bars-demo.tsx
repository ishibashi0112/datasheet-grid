'use client';

// カスタムバー(renderTopBar / renderBottomBar)のデモ:
// slotContext(グローバルフィルター操作・派生 summary・選択統計)を使って
// トップ/ボトムバーを React で丸ごと差し替える。
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
  { key: 'name', title: '商品名', width: 170, filterType: 'text', editable: true },
  { key: 'category', title: 'カテゴリ', width: 120, filterType: 'set' },
  {
    key: 'qty',
    title: '数量',
    width: 100,
    align: 'right',
    filterType: 'number',
    editable: true,
    editor: { type: 'number', min: 0 },
  },
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

export function CustomBarsDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      height={300}
      theme="auto"
      ref={gridRef}
      renderTopBar={(ctx) => (
        <div className="flex flex-wrap items-center gap-3 border-b border-fd-border px-3 py-2 text-sm">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            🍀 マイ在庫一覧
          </span>
          <input
            className="w-52 rounded-md border border-fd-border bg-transparent px-2 py-1 text-sm"
            placeholder="検索(グローバルフィルター)"
            value={ctx.globalFilterText}
            onChange={(e) => ctx.setGlobalFilterText(e.target.value)}
          />
          <span className="text-fd-muted-foreground">
            {ctx.filteredRows.length} / {ctx.rows.length} 件
          </span>
          <button
            type="button"
            className="ml-auto rounded-md border px-2 py-1 hover:bg-fd-accent"
            onClick={() => gridRef.current?.downloadCsv('inventory.csv')}
          >
            CSV
          </button>
        </div>
      )}
      renderBottomBar={(ctx) => (
        <div className="flex flex-wrap items-center gap-4 border-t border-fd-border px-3 py-1.5 text-xs text-fd-muted-foreground">
          <span>{ctx.derivedSummary.rowSummaryText}</span>
          <span>{ctx.derivedSummary.filterSummaryText}</span>
          <span className="ml-auto">
            {ctx.derivedSummary.selectionStatsText ||
              'セル範囲を選択すると合計/平均が出ます'}
          </span>
        </div>
      )}
    />
  );
}