// columnHints の打ち間違いの警告: インラインで渡して再描画したとき何回出るか(StrictMode あり / なしを ?strict=0 で)
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar } from '@ishibashi0112/spreadsheet-grid/ai';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; amount: number };
const columns: GridColumn<Row>[] = [{ key: 'amount', title: '金額', width: 120, filterType: 'number' }];
const rows: Row[] = [{ id: 1, amount: 100 }];
function App() {
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  const [n, setN] = useState(0);
  return (
    <>
      <button id="rerender" onClick={() => setN((x) => x + 1)}>rerender {n}</button>
      <GridAskBar grid={ref} columns={columns} ask={() => null} columnHints={{ amout: '円' }} />
      <SpreadsheetGrid ref={ref} rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />
    </>
  );
}
const strict = new URLSearchParams(location.search).get('strict') !== '0';
createRoot(document.getElementById('root')!).render(strict ? <StrictMode><App /></StrictMode> : <App />);
