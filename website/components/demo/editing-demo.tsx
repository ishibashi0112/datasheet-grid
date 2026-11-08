'use client';

// セル編集とバリデーションのデモ: エディタ種別(text / number / select / date / checkbox)と
// validate(mark / reject)の組み合わせを 1 グリッドで体験できる。メモは複数行の text エディタ(Alt+Enter で改行)と
// autoHeight(改行どおりに表示して行が伸びる)。
// 「行を追加して編集」ボタンは命令的 API の startEditing / getViewRowIndex / getColIndex(足した行をすぐ編集)。
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  name: string;
  qty: number | null;
  category: string;
  dueDate: string | null;
  active: boolean;
  note: string;
};

const columns: GridColumn<Row>[] = [
  {
    key: 'name',
    title: '品名(必須 / reject)',
    width: 190,
    editable: true,
    validate: ({ value }) =>
      String(value ?? '').trim() !== '' || '品名は必須です',
    validationMode: 'reject',
  },
  {
    key: 'qty',
    title: '数量(0 以上の整数 / mark)',
    width: 210,
    align: 'right',
    editable: true,
    // min / integer はそのまま値の検査になる(validate なしで、負数や小数に印とメッセージ)。
    editor: { type: 'number', min: 0, integer: true },
  },
  {
    key: 'category',
    title: '区分(select)',
    width: 140,
    editable: true,
    editor: {
      type: 'select',
      options: [
        { label: '通常', value: '通常' },
        { label: '特注', value: '特注' },
        { label: '保留', value: '保留' },
      ],
    },
  },
  {
    key: 'dueDate',
    title: '納期(date)',
    width: 150,
    editable: true,
    editor: { type: 'date' },
  },
  {
    key: 'active',
    title: '有効(checkbox)',
    width: 130,
    align: 'center',
    editable: true,
    editor: { type: 'checkbox' },
  },
  {
    key: 'note',
    title: 'メモ(複数行。Alt+Enter で改行)',
    width: 240,
    editable: true,
    autoHeight: true,
    editor: { type: 'text', multiline: true },
  },
];

const initialRows: Row[] = [
  { id: 1, name: 'ボルト M6', qty: 120, category: '通常', dueDate: '2026-08-01', active: true, note: '' },
  { id: 2, name: 'ナット M6', qty: 80, category: '通常', dueDate: '2026-08-01', active: true, note: 'ボルトとセット' },
  { id: 3, name: 'ワッシャー', qty: null, category: '保留', dueDate: null, active: false, note: '数量未定' },
  { id: 4, name: 'アングル材', qty: 12, category: '特注', dueDate: '2026-09-15', active: true, note: '図面 A-102\n寸法は 2 枚目を参照' },
  { id: 5, name: '', qty: 5, category: '通常', dueDate: null, active: false, note: '品名未入力(mark 対象外・reject 列)' },
];

export function EditingDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const nextId = useRef(initialRows.length + 1);

  // 足した行の「品名」をすぐ編集する。位置は表示の位置なので、行キーと列キーから引く。
  const addRow = () => {
    const row: Row = { id: nextId.current++, name: '', qty: null, category: '通常', dueDate: null, active: true, note: '' };
    flushSync(() => setRows((prev) => [...prev, row]));
    const grid = gridRef.current;
    const viewRowIndex = grid?.getViewRowIndex(row.id) ?? -1;
    const colIndex = grid?.getColIndex('name') ?? -1;
    if (viewRowIndex >= 0 && colIndex >= 0) {
      grid?.startEditing(viewRowIndex, colIndex);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-fd-accent" onClick={addRow}>
          行を追加して編集
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.focus()}
        >
          グリッドへフォーカス
        </button>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={280}
        theme="class"
        autoHeight
      />
    </div>
  );
}