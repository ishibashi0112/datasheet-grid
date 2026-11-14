import { StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle, type GridTheme } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar } from '@ishibashi0112/spreadsheet-grid/ai';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; amount: number };
const columns: GridColumn<Row>[] = [{ key: 'amount', title: '金額', width: 120, filterType: 'number' }];
const rows: Row[] = [{ id: 1, amount: 100 }];
const theme = (new URLSearchParams(location.search).get('theme') ?? 'light') as GridTheme;
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  return (
    <div style={{ padding: 12 }}>
      <GridAskBar grid={ref} columns={columns} ask={() => ({ mode: 'replace', filters: [{ column: 'amount', op: '>=', value: '50', values: null, to: null }], sort: null, search: null, hide: [], show: [], unsupported: null })} theme={theme} examples={['50 以上']} />
      <SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} theme={theme} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
