// 最小再現: custom エディタを開いたまま別のセルを押すと、エディタが残りキー操作が効かなくなる
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; color: string };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  {
    key: 'color',
    title: '色',
    width: 160,
    editor: {
      type: 'custom',
      // ドキュメントの例と同じく、確定 / 取消だけを書いた custom エディタ
      render: (ctx) => (
        <input
          autoFocus
          defaultValue={String(ctx.value ?? '')}
          style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: 'var(--ssg-cell-bg)' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ctx.commit(e.currentTarget.value, 'down');
            if (e.key === 'Escape') ctx.cancel();
          }}
        />
      ),
    },
  },
];
function App() {
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item ${i}`, color: 'red' })));
  return <SpreadsheetGrid rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} height={400} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
