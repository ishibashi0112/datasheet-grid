'use client';

// セル操作の通知のデモ: 行をクリックすると上のフォームへ写し(onCellClick)、ダブルクリック(onCellDoubleClick)と
//   アクティブセルの変化(onActiveCellChange)をログに出す。preventDefault() で編集開始を止める切り替え付き。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridCellDoubleClickParams,
  type GridCellEventParams,
  type GridCellRef,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Device = {
  code: string;
  name: string;
  category: string;
  maker: string;
};

const initialDevices: Device[] = [
  { code: 'EQ-001', name: '搬送コンベア A', category: '搬送', maker: '東和機工' },
  { code: 'EQ-002', name: '画像検査ユニット', category: '検査', maker: 'ミナト光学' },
  { code: 'EQ-003', name: '自動ねじ締め機', category: '組立', maker: '北辰精機' },
  { code: 'EQ-004', name: '梱包ロボット', category: '梱包', maker: '東和機工' },
  { code: 'EQ-005', name: 'レーザーマーカー', category: '加工', maker: 'ミナト光学' },
  { code: 'EQ-006', name: '搬送コンベア B', category: '搬送', maker: '東和機工' },
];

const columns: GridColumn<Device>[] = [
  { key: 'code', title: '装置コード', width: 110, readOnly: true },
  { key: 'name', title: '装置名', width: 200 },
  { key: 'category', title: '区分', width: 90 },
  { key: 'maker', title: 'メーカー', width: 140 },
];

const modifiers = (event: MouseEvent) =>
  [event.ctrlKey && 'Ctrl', event.shiftKey && 'Shift', event.altKey && 'Alt', event.metaKey && 'Meta']
    .filter(Boolean)
    .join('+');

const describeCell = (cell: GridCellRef<Device>) => `${String(cell.rowKey)} / ${cell.column.title}`;

export function CellEventsDemo() {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [form, setForm] = useState<Device | null>(null);
  const [preventEdit, setPreventEdit] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (line: string) => setLog((current) => [line, ...current].slice(0, 6));

  const handleCellClick = ({ row, event, ...cell }: GridCellEventParams<Device>) => {
    setForm(row);
    const keys = modifiers(event);
    pushLog(`onCellClick: ${describeCell({ row, ...cell })}${keys ? `(${keys})` : ''}`);
  };

  const handleCellDoubleClick = (params: GridCellDoubleClickParams<Device>) => {
    if (preventEdit) {
      params.preventDefault();
    }
    pushLog(`onCellDoubleClick: ${describeCell(params)}${preventEdit ? ' → 編集を止めた' : ''}`);
  };

  const handleActiveCellChange = (cell: GridCellRef<Device> | null) => {
    pushLog(`onActiveCellChange: ${cell ? describeCell(cell) : 'null'}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm sm:grid-cols-4">
        {columns.map((column) => (
          <label key={column.key} className="flex flex-col gap-1">
            <span className="text-fd-muted-foreground">{column.title}</span>
            <input
              readOnly
              className="rounded-md border bg-fd-background px-2 py-1"
              value={form ? String(form[column.key as keyof Device]) : ''}
              placeholder="行をクリック"
            />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={preventEdit} onChange={(event) => setPreventEdit(event.target.checked)} />
        ダブルクリックで編集を始めない(<code>params.preventDefault()</code>)
      </label>
      <SpreadsheetGrid
        rows={devices}
        onRowsChange={setDevices}
        columns={columns}
        rowKeyGetter={(row) => row.code}
        height={260}
        theme="auto"
        showTopBar={false}
        onCellClick={handleCellClick}
        onCellDoubleClick={handleCellDoubleClick}
        onActiveCellChange={handleActiveCellChange}
      />
      <div className="min-h-[9rem] rounded-md border p-3 font-mono text-xs text-fd-muted-foreground">
        {log.length === 0 ? <p className="m-0">(セルをクリック / ダブルクリック / 矢印キーで移動してください)</p> : null}
        {log.map((line, index) => (
          <p key={`${index}-${line}`} className="m-0">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}