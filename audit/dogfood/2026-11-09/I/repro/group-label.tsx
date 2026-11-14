// 最小再現: select の値をコードで持ち、表示名は select エディタの options / filterOptions / valueFormatter。
// rowGroup にするとグループ行の見出しがコード("paid")のまま。
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; status: string; amount: number };
const options = [
  { value: 'paid', label: '入金済' },
  { value: 'unpaid', label: '未入金' },
];
const label = ({ value }: { value: unknown }) => options.find((o) => o.value === value)?.label ?? String(value ?? '');
const columns: GridColumn<Row>[] = [
  { key: 'status', title: '状態', width: 140, rowGroup: true, filterType: 'set', filterOptions: options, editor: { type: 'select', options }, valueFormatter: label },
  { key: 'amount', title: '金額', width: 120, aggFunc: 'sum' },
];
const initial: Row[] = [
  { id: 1, status: 'paid', amount: 100 },
  { id: 2, status: 'unpaid', amount: 200 },
  { id: 3, status: 'paid', amount: 300 },
];
function App() {
  const [rows, setRows] = useState(initial);
  return <SpreadsheetGrid rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} enableGlobalFilter />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
