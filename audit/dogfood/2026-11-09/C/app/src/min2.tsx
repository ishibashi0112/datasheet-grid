// 最小再現 2: 列見出しで列を選んで貼り付けると、列の先頭ではなく前のアクティブセルの行から貼られる
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; a: string; b: string; c: string };
const columns: GridColumn<Row>[] = ['a', 'b', 'c'].map((k) => ({ key: k, title: k.toUpperCase(), width: 100 }));
const initial: Row[] = Array.from({ length: 8 }, (_, i) => ({ id: i, a: `a${i}`, b: `b${i}`, c: `c${i}` }));

function App() {
  const [rows, setRows] = useState(initial);
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  (window as unknown as { __g: unknown; __rows: unknown }).__g = ref;
  (window as unknown as { __rows: unknown }).__rows = rows;
  return <SpreadsheetGrid ref={ref} rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} height={360} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
