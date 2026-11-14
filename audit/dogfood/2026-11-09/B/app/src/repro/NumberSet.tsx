// Minimal repro: order of the value list in a numberSet / set filter, and the label of blank values in English.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; v: number | null; s: string };
const values = [1.2, -0.1, 10, 0.2, -3, 1.01, 0.02, 2, null, 1.1, -2.5, 0, 1];
const columns: GridColumn<Row>[] = [
  { key: 'v', title: 'Value (numberSet)', width: 160, filterType: 'numberSet' },
  { key: 's', title: 'Text (set)', width: 160, filterType: 'set' },
];

function App() {
  const [rows, setRows] = useState<Row[]>(values.map((v, i) => ({ id: i, v, s: v === null ? '' : `item ${v}` })));
  return (
    <div style={{ height: 500, padding: 8 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} localeText={localeTextEn} height="100%" />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
