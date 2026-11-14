// 最小再現 1: 列の数が減ったとき、アクティブセル / 選択範囲が範囲外の列を指したまま
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; a: string; b: string; c: string; d: string; e: string };
const all: GridColumn<Row>[] = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, title: k.toUpperCase(), width: 100 }));
const initial: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: i, a: `a${i}`, b: `b${i}`, c: `c${i}`, d: `d${i}`, e: `e${i}` }));

function App() {
  const [rows, setRows] = useState(initial);
  const [n, setN] = useState(5);
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  (window as unknown as { __g: unknown }).__g = ref;
  return (
    <div>
      <button id="cols3" onClick={() => setN(3)}>列を 3 つに</button>
      <button id="cols5" onClick={() => setN(5)}>列を 5 つに</button>
      <SpreadsheetGrid ref={ref} rows={rows} onRowsChange={setRows} columns={all.slice(0, n)} rowKeyGetter={(r) => r.id} height={240} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
