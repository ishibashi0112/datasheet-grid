// 最小再現: date エディタの列へ年の無い日付(「11/1」)を貼り付けると 2001 年として入る
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; input: string; date: unknown };
const INPUTS = new URLSearchParams(location.search).get('set') === '2' ? ['2026/2/30', '2026/13/1', '2026-02-30', '2026/02/29', '2028/2/29', '2026-2-3', '2026/1/2 10:00', ' 2026/1/2 ', '２０２６/１/２', 'R8/11/1'] : ['11/1', '1/2', '12/31', '2026/1/2', '2026/11/1', '2026-11-01', '2026年11月1日', '11月1日', 'Nov 1', 'Nov 1, 2026', '2026.11.1', '20261101', '45678', '5', '2/30', '13/1', '0/5', '99/1'];
const columns: GridColumn<Row>[] = [
  { key: 'input', title: '貼る文字', width: 160, editable: false },
  { key: 'date', title: '日付', width: 160, editor: { type: 'date' } },
];
function App() {
  const [rows, setRows] = useState<Row[]>(INPUTS.map((input, id) => ({ id, input, date: null })));
  (window as unknown as { __rows: Row[] }).__rows = rows;
  return <SpreadsheetGrid rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} height={700} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
