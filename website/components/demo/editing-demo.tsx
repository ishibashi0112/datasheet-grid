'use client';

// セル編集とバリデーションのデモ: エディタ種別(text / number / select / date / checkbox)と
// validate(mark / reject)の組み合わせを 1 グリッドで体験できる。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
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
    title: '数量(number / mark)',
    width: 170,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    validate: ({ value }) =>
      value === null ||
      (typeof value === 'number' && Number.isInteger(value) && value >= 0) ||
      '0 以上の整数を入力してください',
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
  { key: 'note', title: 'メモ(text)', width: 200, editable: true },
];

const initialRows: Row[] = [
  { id: 1, name: 'ボルト M6', qty: 120, category: '通常', dueDate: '2026-08-01', active: true, note: '' },
  { id: 2, name: 'ナット M6', qty: 80, category: '通常', dueDate: '2026-08-01', active: true, note: 'ボルトとセット' },
  { id: 3, name: 'ワッシャー', qty: null, category: '保留', dueDate: null, active: false, note: '数量未定' },
  { id: 4, name: 'アングル材', qty: 12, category: '特注', dueDate: '2026-09-15', active: true, note: '図面 A-102' },
  { id: 5, name: '', qty: 5, category: '通常', dueDate: null, active: false, note: '品名未入力(mark 対象外・reject 列)' },
];

export function EditingDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      height={260}
      theme="auto"
    />
  );
}