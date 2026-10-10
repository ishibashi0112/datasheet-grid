'use client';

// 列の並べ替えデモ: 列ヘッダーの grip(⠿)を掴んで左右へドラッグし、列の順番を入れ替える。
//   表示方式(columnDragMotion)は 'live'(掴んだ列が追従し周りの列が退避)と 'ghost'(ゴースト + 縦線)を切り替えられる。
//   「ID」は左固定。固定ペインへ運ぶと固定の変更(ピン留め / 解除)になる。live でペインをまたぐと列の複製(浮かぶ列)が
//   付いてきて、見出しにピン / 移動の矢印のアイコンが出る。
import { useState } from 'react';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  supplier: string;
};

const rows: Product[] = [
  { id: 'P-001', name: 'ワイヤレスマウス', category: '周辺機器', price: 3980, stock: 120, supplier: '東都商事' },
  { id: 'P-002', name: 'メカニカルキーボード', category: '周辺機器', price: 14800, stock: 35, supplier: '関西電子' },
  { id: 'P-003', name: '27 インチモニター', category: 'ディスプレイ', price: 32800, stock: 18, supplier: '東都商事' },
  { id: 'P-004', name: 'USB-C ハブ', category: 'アクセサリ', price: 4980, stock: 240, supplier: '北辰工業' },
  { id: 'P-005', name: 'ノート PC スタンド', category: 'アクセサリ', price: 2980, stock: 76, supplier: '北辰工業' },
  { id: 'P-006', name: 'Web カメラ', category: '周辺機器', price: 6980, stock: 52, supplier: '関西電子' },
  { id: 'P-007', name: 'ヘッドセット', category: 'オーディオ', price: 8980, stock: 64, supplier: '南海音響' },
  { id: 'P-008', name: 'ポータブル SSD 1TB', category: 'ストレージ', price: 12800, stock: 41, supplier: '東都商事' },
];

const initialColumns: GridColumn<Product>[] = [
  { key: 'id', title: 'ID', width: 90, pinned: 'left', readOnly: true },
  { key: 'name', title: '商品名', width: 200 },
  { key: 'category', title: 'カテゴリ', width: 120 },
  { key: 'price', title: '単価', width: 100, align: 'right', valueFormatter: ({ value }) => `¥${Number(value).toLocaleString()}` },
  { key: 'stock', title: '在庫', width: 90, align: 'right' },
  { key: 'supplier', title: '仕入先', width: 120 },
];

export function ColumnDragDemo() {
  const [columns, setColumns] = useState<GridColumn<Product>[]>(initialColumns);
  const [dragMotion, setDragMotion] = useState<'ghost' | 'live'>('live');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          表示方式
          <select
            className="rounded-md border bg-transparent px-2 py-1"
            value={dragMotion}
            onChange={(e) => setDragMotion(e.target.value as 'ghost' | 'live')}
          >
            <option value="live">live(列が追従・周りが退避)</option>
            <option value="ghost">ghost(ゴースト + 縦線)</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => setColumns(initialColumns)}
        >
          列の順番をリセット
        </button>
        {dragMotion === 'live' && (
          <span className="text-xs text-fd-muted-foreground">ID の左固定ペインへ運ぶと、浮かぶ列にピンのアイコンが出ます</span>
        )}
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        // onColumnsChange を渡すと列ヘッダーに grip が出て、ドラッグで並べ替えられる
        onColumnsChange={setColumns}
        rowKeyGetter={(row) => row.id}
        height={340}
        theme="auto"
        columnDragMotion={dragMotion}
      />
      <p className="text-sm text-fd-muted-foreground">
        現在の列順:{' '}
        {columns
          .map((column) => (column.pinned ? `${column.title}(${column.pinned === 'left' ? '左固定' : '右固定'})` : column.title))
          .join(' → ')}
      </p>
    </div>
  );
}