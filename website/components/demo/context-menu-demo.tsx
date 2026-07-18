'use client';

// コンテキストメニュー(enableContextMenu / getContextMenuItems)のデモ:
// セル/行NO の右クリックに、行複製・行削除などの独自メニューを出す。
// ライブラリは既定項目を持たない完全カスタム設計。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; qty: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '品目', width: 200, editable: true },
  {
    key: 'qty',
    title: '数量',
    width: 110,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0 },
  },
];

const initialRows: Row[] = [
  { id: 1, name: 'ボルト M6', qty: 120 },
  { id: 2, name: 'ナット M6', qty: 80 },
  { id: 3, name: 'ワッシャー', qty: 300 },
  { id: 4, name: 'アングル材', qty: 12 },
];

export function ContextMenuDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [nextId, setNextId] = useState(initialRows.length + 1);

  return (
    <div className="flex flex-col gap-1.5">
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={230}
        theme="auto"
        enableContextMenu
        getContextMenuItems={({ target }) => {
          if (target.type !== 'cell' && target.type !== 'rowHeader') return [];
          const row = target.row;
          return [
            { kind: 'label', label: `「${row.name}」の操作` },
            {
              label: '行を複製',
              icon: <span aria-hidden>⧉</span>,
              onSelect: () => {
                const index = rows.findIndex((r) => r.id === row.id);
                const copy = { ...row, id: nextId, name: `${row.name} (コピー)` };
                setNextId((n) => n + 1);
                setRows([
                  ...rows.slice(0, index + 1),
                  copy,
                  ...rows.slice(index + 1),
                ]);
              },
            },
            {
              label: '数量を 0 にする',
              icon: <span aria-hidden>0</span>,
              onSelect: () =>
                setRows(rows.map((r) => (r.id === row.id ? { ...r, qty: 0 } : r))),
            },
            { kind: 'separator' },
            {
              label: '行を削除',
              icon: <span aria-hidden>🗑</span>,
              danger: true,
              onSelect: () => setRows(rows.filter((r) => r.id !== row.id)),
            },
          ];
        }}
      />
      <p className="text-xs text-fd-muted-foreground">
        セルまたは行番号を右クリックしてください
      </p>
    </div>
  );
}