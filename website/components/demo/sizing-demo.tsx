'use client';

// サイズ(高さ)ガイドのデモ。height="100%" で、バー込みのグリッド全体が親(点線枠)に収まり、
// バーを除いた残りがスクロール領域になることを示す。親の高さとバー表示をその場で切り替えられる。
import { useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; qty: number };

const ROW_COUNT = 1_000;

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 90, align: 'right' },
  { key: 'name', title: '品目名', width: 220 },
  {
    key: 'qty',
    title: '在庫数',
    width: 120,
    align: 'right',
    valueFormatter: numberFormatter(),
  },
];

function buildRows(): Row[] {
  return Array.from({ length: ROW_COUNT }, (_, i) => ({
    id: i + 1,
    name: `サンプル品目 ${i + 1}`,
    qty: (i * 37) % 1000,
  }));
}

export function SizingDemo() {
  const rows = useMemo(buildRows, []);
  const [parentHeight, setParentHeight] = useState(360);
  const [showBars, setShowBars] = useState(true);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          親の高さ
          <input
            type="range"
            min={200}
            max={560}
            step={20}
            value={parentHeight}
            onChange={(e) => setParentHeight(Number(e.target.value))}
          />
          <span className="tabular-nums">{parentHeight}px</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showBars}
            onChange={(e) => setShowBars(e.target.checked)}
          />
          トップバー / ボトムバー
        </label>
        <span className="text-fd-muted-foreground">
          {ROW_COUNT.toLocaleString()} 行 — 点線枠が親要素です
        </span>
      </div>
      <div
        className="border border-dashed border-fd-border"
        style={{ height: parentHeight }}
      >
        <SpreadsheetGrid
          rows={rows}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          height="100%"
          showTopBar={showBars}
          showBottomBar={showBars}
          theme="auto"
        />
      </div>
    </div>
  );
}