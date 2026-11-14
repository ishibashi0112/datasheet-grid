'use client';

import { useState } from 'react';
import { SpreadsheetGrid, type GridColumn, type GridStatePatch } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; qty: number };
const columns: GridColumn<Row>[] = [{ key: 'qty', title: 'Qty', width: 120 }];

export function OrdersGrid({ initialState }: { initialState?: Omit<GridStatePatch, 'columns'> }) {
  const [rows, setRows] = useState<Row[]>([{ id: 1, qty: 3 }, { id: 2, qty: 9 }]);
  return <SpreadsheetGrid rows={rows} columns={columns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} initialState={initialState} />;
}
