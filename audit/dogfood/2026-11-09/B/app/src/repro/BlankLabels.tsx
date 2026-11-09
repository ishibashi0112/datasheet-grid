// Minimal repro: labels of blank values with localeText={localeTextEn} (set / numberSet / dateSet lists, group rows).
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; sector: string; price: number | null; listed: string | null };
const group = new URLSearchParams(location.search).get('group') === '1';
const columns: GridColumn<Row>[] = [
  { key: 'sector', title: 'Sector', width: 160, filterType: 'set', rowGroup: group },
  { key: 'price', title: 'Price', width: 120, filterType: 'numberSet', aggFunc: 'sum' },
  { key: 'listed', title: 'Listed', width: 140, filterType: 'dateSet' },
];

function App() {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, sector: 'Energy', price: 10, listed: '2026-01-05' },
    { id: 2, sector: '', price: null, listed: null },
    { id: 3, sector: 'Utilities', price: 12.5, listed: '2025-12-31' },
    { id: 4, sector: '', price: 7, listed: '' },
  ]);
  return (
    <div style={{ height: 400, padding: 8 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} localeText={localeTextEn} height="100%" />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
