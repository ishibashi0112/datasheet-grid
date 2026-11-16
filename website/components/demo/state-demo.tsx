'use client';

// 状態の保存と復元のデモ: onStateChange で GridState を受け取って保存し(ここでは React の state。実際のアプリでは
//   localStorage やサーバー)、「表を開き直す」で key を変えて作り直したグリッドへ initialState と
//   restoreColumnsFromState で戻す。列の並び / 表示 / 固定は onColumnsChange で受け取った columns を描く。
//   追加(1.2.0): 「区分」の列メニューからグループ化でき、includeGroupingInState を付けるとグループ化と開閉も保存される。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  restoreColumnsFromState,
  type GridColumn,
  type GridState,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Item = {
  id: number;
  name: string;
  category: string;
  stock: number;
  price: number;
};

const defaultColumns: GridColumn<Item>[] = [
  { key: 'name', title: '品名', width: 180, filterType: 'textSet' },
  // rowGroup: false で列メニューに「この列でグループ化」を出す(最初はグループ化しない)。
  { key: 'category', title: '区分', width: 120, filterType: 'set', rowGroup: false },
  { key: 'stock', title: '在庫', width: 110, align: 'right', filterType: 'numberSet', aggFunc: 'sum' },
  {
    key: 'price',
    title: '単価',
    width: 120,
    align: 'right',
    filterType: 'numberSet',
    valueFormatter: numberFormatter(),
  },
];

const NAMES = ['ボールペン', 'ノート', '付箋', 'クリアファイル', 'ホチキス', 'マーカー', '電卓', 'はさみ'];
const CATEGORIES = ['筆記具', '紙製品', '事務用品'];

const items: Item[] = Array.from({ length: 40 }, (_, index) => ({
  id: index + 1,
  name: `${NAMES[index % NAMES.length]} ${Math.floor(index / NAMES.length) + 1}`,
  category: CATEGORIES[index % CATEGORIES.length] ?? '',
  stock: (index * 37) % 120,
  price: 100 + ((index * 53) % 20) * 50,
}));

function InventoryGrid({
  saved,
  onSave,
  includeGrouping,
}: {
  saved: GridState | null;
  onSave: (state: GridState) => void;
  includeGrouping: boolean;
}) {
  // 開くたびに 1 回だけ使う(マウントの後に saved が変わっても描き直さない)
  const [initialState] = useState(() => saved ?? undefined);
  const [columns, setColumns] = useState(() => restoreColumnsFromState(defaultColumns, saved ?? undefined));
  return (
    <SpreadsheetGrid
      rows={items}
      columns={columns}
      onColumnsChange={setColumns}
      rowKeyGetter={(row) => row.id}
      readOnly
      initialState={initialState}
      onStateChange={onSave}
      includeGroupingInState={includeGrouping}
      height={260}
      theme="class"
    />
  );
}

export function StateDemo() {
  const [saved, setSaved] = useState<GridState | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [includeGrouping, setIncludeGrouping] = useState(true);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="rounded-md border px-3 py-1" onClick={() => setOpenCount((count) => count + 1)}>
          表を開き直す
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1"
          onClick={() => {
            setSaved(null);
            setOpenCount((count) => count + 1);
          }}
        >
          保存を消して開き直す
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={includeGrouping} onChange={(e) => setIncludeGrouping(e.target.checked)} />
          <code className="text-xs">includeGroupingInState</code>(グループ化と開閉も保存)
        </label>
        <span className="text-fd-muted-foreground">開いた回数: {openCount + 1}</span>
      </div>
      <InventoryGrid key={openCount} saved={saved} onSave={setSaved} includeGrouping={includeGrouping} />
      <details className="rounded-md border p-2 text-xs">
        <summary className="cursor-pointer text-sm">保存した値(onStateChange で受け取った GridState)</summary>
        <pre className="m-0 mt-2 max-h-60 overflow-auto whitespace-pre-wrap">
          {saved ? JSON.stringify(saved, null, 2) : '(まだありません。並べ替え・絞り込み・列幅・列の並び・「区分」の列メニューのグループ化を変えると入ります)'}
        </pre>
      </details>
    </div>
  );
}