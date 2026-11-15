'use client';

// 入力の検査のデモ: 入力中は印を出さず(showValidationMarks={false})、「送信」で getInvalidCells() を呼んで
//   通らないセルがあれば印を出し、最初のセルへ移ってメッセージを並べる。行番号は getRowNumber(rowKey) で
//   画面の行番号の列と同じ番号にする。数量は number エディタの min / integer(validate なしの検査)。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
  type GridInvalidCell,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Order = {
  id: string;
  code: string;
  name: string;
  qty: number | null;
  due: string | null;
};

const toDateText = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateText(date);
};

const columns: GridColumn<Order>[] = [
  {
    key: 'code',
    title: '品番(必須)',
    width: 120,
    validate: ({ value }) => String(value ?? '').trim() !== '' || '品番は必須です',
  },
  { key: 'name', title: '品名', width: 180 },
  {
    key: 'qty',
    title: '数量(1 以上の整数)',
    width: 150,
    align: 'right',
    editor: { type: 'number', min: 1, integer: true },
  },
  {
    key: 'due',
    title: '納期(今日より後)',
    width: 150,
    editor: { type: 'date' },
    validate: ({ value }) =>
      (typeof value === 'string' && value > toDateText(new Date())) || '納期は今日より後の日付にしてください',
  },
];

const createInitialOrders = (): Order[] => [
  { id: 'O-1', code: 'A-1001', name: 'ボールペン(黒)', qty: 120, due: addDays(7) },
  { id: 'O-2', code: '', name: 'A4 コピー用紙', qty: 30, due: addDays(3) },
  { id: 'O-3', code: 'B-2002', name: 'クリアファイル', qty: 0, due: addDays(10) },
  { id: 'O-4', code: 'C-3001', name: 'ホチキス針', qty: 2.5, due: addDays(-1) },
  { id: 'O-5', code: 'C-3002', name: '付箋', qty: 50, due: addDays(14) },
];

export function ValidationDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Order>>(null);
  const [orders, setOrders] = useState<Order[]>(createInitialOrders);
  const [showErrors, setShowErrors] = useState(false);
  const [liveMarks, setLiveMarks] = useState(false);
  const [result, setResult] = useState<string[]>([]);

  const describe = (cell: GridInvalidCell) => {
    const number = gridRef.current?.getRowNumber(cell.rowKey);
    const title = columns.find((column) => column.key === cell.columnKey)?.title ?? cell.columnKey;
    return `${number ?? '-'} 行目の「${title}」: ${cell.message}`;
  };

  const submit = () => {
    const grid = gridRef.current;
    if (!grid) return;
    const invalid = grid.getInvalidCells();
    if (invalid.length === 0) {
      setShowErrors(false);
      setResult(['送信しました(デモなので保存はしません)']);
      return;
    }
    setShowErrors(true);
    setResult(invalid.map(describe));
    const first = invalid.find((cell) => grid.getViewRowIndex(cell.rowKey) >= 0);
    if (first) {
      const row = grid.getViewRowIndex(first.rowKey);
      const col = grid.getColIndex(first.columnKey);
      if (col >= 0) {
        grid.selectCell(row, col, { scrollIntoView: true });
        grid.focus();
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="rounded-md border px-3 py-1" onClick={submit}>
          送信
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1"
          onClick={() => {
            setOrders(createInitialOrders());
            setShowErrors(false);
            setResult([]);
          }}
        >
          最初の値に戻す
        </button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={liveMarks} onChange={(event) => setLiveMarks(event.target.checked)} />
          入力中も印を出す
        </label>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={orders}
        onRowsChange={setOrders}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        showValidationMarks={liveMarks || showErrors}
        height={240}
        theme="class"
        showTopBar={false}
      />
      <div className="min-h-[5rem] rounded-md border p-3 text-sm">
        {result.length === 0 ? (
          <p className="m-0 text-fd-muted-foreground">(「送信」を押すと、通らないセルがここに並びます)</p>
        ) : (
          result.map((line) => (
            <p key={line} className="m-0">
              {line}
            </p>
          ))
        )}
      </div>
    </div>
  );
}