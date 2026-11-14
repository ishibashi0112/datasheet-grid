// Minimal repro: a column with both `width: 240` and `flex: 1` when the fixed columns already overflow the grid.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; memo: string } & Record<string, unknown>;
const columns: GridColumn<Row>[] = [
  ...Array.from({ length: 8 }, (_, c): GridColumn<Row> => ({ key: `c${c}`, title: `c${c}`, width: 120 })),
  { key: 'memo', title: 'Memo', width: 240, flex: 1 },
];
function App() {
  const [rows, setRows] = useState<Row[]>([{ id: 1, memo: 'a fairly long memo text here' }]);
  return (
    <div style={{ width: 800, height: 300 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
