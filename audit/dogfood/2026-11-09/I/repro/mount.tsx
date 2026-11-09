// グリッドが無いとき / 聞いている間にグリッドやバーを外したとき
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar, type GridAsk } from '@ishibashi0112/spreadsheet-grid/ai';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; amount: number };
const columns: GridColumn<Row>[] = [{ key: 'amount', title: '金額', width: 120, filterType: 'number' }];
const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: i, amount: i * 10 }));
declare global { interface Window { __aborts: number; __answers: number } }
window.__aborts = 0; window.__answers = 0;
const ask: GridAsk = (_req, { signal }) => new Promise((resolve, reject) => {
  const id = setTimeout(() => { window.__answers += 1; resolve({ mode: 'replace', filters: [{ column: 'amount', op: '>=', value: '100', values: null, to: null }], sort: null, search: null, hide: [], show: [], unsupported: null }); }, 1500);
  signal.addEventListener('abort', () => { clearTimeout(id); window.__aborts += 1; reject(new DOMException('aborted', 'AbortError')); });
});
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showBar, setShowBar] = useState(true);
  return (
    <>
      <button id="grid" onClick={() => setShowGrid((v) => !v)}>grid {String(showGrid)}</button>
      <button id="bar" onClick={() => setShowBar((v) => !v)}>bar {String(showBar)}</button>
      {showBar && <GridAskBar grid={ref} columns={columns} ask={ask} />}
      {showGrid && <SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
