'use client';

// モーションのデモ: motion / animateRows / showCopyRange / hoverHighlight / highlightChanges をその場で切り替えて試す。
//   「外部更新」は数セルの値を書き換えた新配列で rows を差し替え、変更セルのフラッシュと数値のカウントアップを見せる。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type GridMotion,
  type GridSortState,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Stock = {
  id: string;
  name: string;
  region: string;
  qty: number;
  price: number;
};

const initialStocks: Stock[] = [
  { id: 'A-01', name: '六角ボルト M8', region: '関東', qty: 1200, price: 18 },
  { id: 'A-02', name: 'ナイロンナット M8', region: '関西', qty: 860, price: 12 },
  { id: 'A-03', name: 'ステンレス座金', region: '九州', qty: 2400, price: 6 },
  { id: 'A-04', name: '電源ユニット 24V', region: '関東', qty: 42, price: 8400 },
  { id: 'A-05', name: 'リレー 12V', region: '東北', qty: 310, price: 520 },
  { id: 'A-06', name: 'ケーブルグランド', region: '関西', qty: 95, price: 260 },
  { id: 'A-07', name: '端子台 10P', region: '中部', qty: 180, price: 1350 },
  { id: 'A-08', name: '結束バンド 200mm', region: '関東', qty: 5000, price: 3 },
  { id: 'A-09', name: 'アルミフレーム 20角', region: '中部', qty: 64, price: 2100 },
  { id: 'A-10', name: 'ゴム脚 φ30', region: '九州', qty: 720, price: 85 },
];

const columns: GridColumn<Stock>[] = [
  { key: 'id', title: '品番', width: 80, readOnly: true },
  { key: 'name', title: '品名', width: 190 },
  { key: 'region', title: '拠点', width: 90, filterType: 'set' },
  { key: 'qty', title: '在庫数', width: 100, align: 'right', valueFormatter: numberFormatter(), editor: { type: 'number', min: 0 } },
  { key: 'price', title: '単価', width: 100, align: 'right', valueFormatter: numberFormatter(), editor: { type: 'number', min: 0 } },
];

const selectClass = 'rounded-md border bg-transparent px-2 py-1';

// 在庫数 / 単価をランダムに 3 セルだけ書き換えた新配列を返す(外部からの更新の代わり)。
function randomUpdate(rows: Stock[]): Stock[] {
  const next = rows.slice();
  for (let i = 0; i < 3; i++) {
    const index = Math.floor(Math.random() * next.length);
    const row = next[index];
    next[index] =
      Math.random() < 0.5
        ? { ...row, qty: Math.max(0, Math.round(row.qty * (0.6 + Math.random() * 0.8))) }
        : { ...row, price: Math.max(1, Math.round(row.price * (0.8 + Math.random() * 0.4))) };
  }
  return next;
}

export function MotionDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Stock>>(null);
  const [stocks, setStocks] = useState<Stock[]>(initialStocks);
  const [motion, setMotion] = useState<GridMotion>('on');
  const [animateRows, setAnimateRows] = useState(true);
  const [showCopyRange, setShowCopyRange] = useState(true);
  const [hoverHighlight, setHoverHighlight] = useState<'row' | 'cross'>('cross');
  const [highlightChanges, setHighlightChanges] = useState(true);

  // ソートは列メニュー(⋮)からも操作できるが、行の移動を見やすいようボタンでも切り替える(現在の状態の sort だけ差し替え)。
  const applySort = (sort: GridSortState) => {
    const handle = gridRef.current;
    if (!handle) return;
    handle.applyState({ ...handle.getState(), sort });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          motion
          <select className={selectClass} value={motion} onChange={(e) => setMotion(e.target.value as GridMotion)}>
            <option value="auto">auto</option>
            <option value="on">on</option>
            <option value="off">off</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          hoverHighlight
          <select
            className={selectClass}
            value={hoverHighlight}
            onChange={(e) => setHoverHighlight(e.target.value as 'row' | 'cross')}
          >
            <option value="row">row</option>
            <option value="cross">cross</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={animateRows} onChange={(e) => setAnimateRows(e.target.checked)} />
          animateRows
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showCopyRange} onChange={(e) => setShowCopyRange(e.target.checked)} />
          showCopyRange
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={highlightChanges} onChange={(e) => setHighlightChanges(e.target.checked)} />
          highlightChanges
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => applySort([{ columnKey: 'qty', direction: 'desc' }])}
        >
          在庫数で降順ソート
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => applySort([])}
        >
          ソート解除
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => setStocks((current) => randomUpdate(current))}
        >
          外部更新(3 セルを書き換え)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => setStocks((current) => current.slice().sort(() => Math.random() - 0.5))}
        >
          rows をシャッフルして差し替え
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => setStocks(initialStocks)}
        >
          リセット
        </button>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={stocks}
        onRowsChange={setStocks}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={400}
        theme="auto"
        motion={motion}
        animateRows={animateRows}
        showCopyRange={showCopyRange}
        hoverHighlight={hoverHighlight}
        highlightChanges={highlightChanges}
      />
    </div>
  );
}
