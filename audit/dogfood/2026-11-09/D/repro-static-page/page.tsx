'use client';

import { useState } from 'react';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string };
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200 }];

export default function Page() {
  const [rows, setRows] = useState<Row[]>([{ id: 1, name: 'alpha' }]);
  return <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />;
}
