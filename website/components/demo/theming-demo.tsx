'use client';

// テーマ / 密度のデモ: theme(light / dark / auto)と density(standard / compact / comfortable)を
// その場で切り替えられる。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
  type GridDensity,
  type GridTheme,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; qty: number; status: string };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品目', width: 180, filterType: 'text' },
  { key: 'qty', title: '数量', width: 110, align: 'right', editable: true, editor: { type: 'number' } },
  { key: 'status', title: '状態', width: 120, filterType: 'set' },
];

const initialRows: Row[] = [
  { id: 1, name: 'ボルト M6', qty: 120, status: '有効' },
  { id: 2, name: 'ナット M6', qty: 80, status: '有効' },
  { id: 3, name: 'ワッシャー', qty: 300, status: '停止' },
  { id: 4, name: 'アングル材', qty: 12, status: '有効' },
  { id: 5, name: 'リベット', qty: 500, status: '廃番' },
];

const selectClass =
  'rounded-md border bg-transparent px-2 py-1 text-sm';

export function ThemingDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [theme, setTheme] = useState<GridTheme>('auto');
  const [density, setDensity] = useState<GridDensity>('standard');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          theme:
          <select
            className={selectClass}
            value={theme}
            onChange={(e) => setTheme(e.target.value as GridTheme)}
          >
            <option value="auto">auto</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          density:
          <select
            className={selectClass}
            value={density}
            onChange={(e) => setDensity(e.target.value as GridDensity)}
          >
            <option value="standard">standard</option>
            <option value="compact">compact</option>
            <option value="comfortable">comfortable</option>
          </select>
        </label>
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={300}
        theme={theme}
        density={density}
      />
    </div>
  );
}