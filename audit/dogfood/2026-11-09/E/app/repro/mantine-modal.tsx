// 最小再現: Mantine の Modal の中のグリッドで Esc(編集の取り消し・メニューを閉じる)を押すと Modal ごと閉じる
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import { Button, MantineProvider, Modal } from '@mantine/core';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/mantine.css';

type Row = { id: number; name: string; qty: number };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text' },
  { key: 'qty', title: '数量', width: 100, editor: { type: 'number' } },
];
function App() {
  const [opened, setOpened] = useState(false);
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item ${i}`, qty: i })));
  const closeOnEscape = new URLSearchParams(location.search).get('closeOnEscape') !== 'false';
  return (
    <MantineProvider>
      <Button onClick={() => setOpened(true)} id="open">開く</Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="編集" size="lg" closeOnEscape={closeOnEscape}>
        <SpreadsheetGrid rows={rows} onRowsChange={setRows} columns={columns} rowKeyGetter={(r) => r.id} height={300} />
      </Modal>
    </MantineProvider>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
