'use client';

import { useState } from 'react';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; status: string; note: string };

const columns: GridColumn<Row>[] = [
  { key: 'status', title: 'Status', width: 60, conditionalFormat: { chips: { active: 'good', suspended: 'critical', invited: 'info' } } },
  { key: 'note', title: 'Note', width: 60 },
];

export default function Page() {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, status: 'active', note: 'active' },
    { id: 2, status: 'suspended', note: 'suspended' },
    { id: 3, status: 'invited', note: 'invited' },
  ]);
  return (
    <div style={{ padding: 16 }}>
      <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} autoSizeColumns="onMount" />
    </div>
  );
}
