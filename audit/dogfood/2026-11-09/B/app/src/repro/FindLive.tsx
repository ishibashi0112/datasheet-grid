// Minimal repro: cell find (Ctrl+F) while `rows` is replaced every 250 ms.
// ?live=0 stops the updates. ?cols=N adds N numeric columns with numberFormatter (default 12). ?n=rows changed per tick (default 100).
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; v: number[] };
const q = new URLSearchParams(location.search);
const live = q.get('live') !== '0';
const COLS = Number(q.get('cols') ?? 12);
const N = Number(q.get('n') ?? 100);
const fmt = numberFormatter({ locale: 'en-US', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'name', width: 160 },
  ...Array.from({ length: COLS }, (_, c): GridColumn<Row> => ({ key: `n${c}`, title: `n${c}`, width: 90, getValue: (r) => r.v[c], valueFormatter: fmt })),
];

function App() {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 2000 }, (_, i) => ({ id: i, name: i % 50 === 7 ? `target ${i}` : `row ${i}`, v: Array.from({ length: COLS }, () => Math.random() * 1000) })),
  );
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      setRows((prev) => {
        const next = prev.slice();
        for (let k = 0; k < N; k++) {
          const i = Math.floor(Math.random() * next.length);
          next[i] = { ...next[i], v: next[i].v.map((x) => x * (1 + (Math.random() - 0.5) * 0.004)) };
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ height: 500, padding: 8 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} find height="100%" />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
