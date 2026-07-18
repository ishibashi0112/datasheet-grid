'use client';

// カスタムセル(renderCell)/ カスタムヘッダー(renderHeader)のデモ:
// バッジ・プログレスバー・setValue を使うインタラクティブセルを React で自由に描画する。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  name: string;
  status: '進行中' | '完了' | '保留';
  progress: number;
  stock: number;
};

const STATUS_STYLES: Record<Row['status'], string> = {
  進行中: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  完了: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  保留: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

const columns: GridColumn<Row>[] = [
  {
    key: 'name',
    title: 'タスク',
    width: 180,
    editable: true,
    // カスタムヘッダー: アイコン + ラベル
    renderHeader: ({ column }) => (
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <span aria-hidden>📋</span>
        {column.title}
      </span>
    ),
  },
  {
    key: 'status',
    title: 'ステータス',
    width: 120,
    editable: true,
    editor: {
      type: 'select',
      options: (['進行中', '完了', '保留'] as const).map((v) => ({
        label: v,
        value: v,
      })),
    },
    // バッジ表示(編集は select エディタのまま)
    renderCell: ({ value }) => {
      const status = value as Row['status'];
      return (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ''}`}
        >
          {status}
        </span>
      );
    },
  },
  {
    key: 'progress',
    title: '達成率',
    width: 170,
    // プログレスバー
    renderCell: ({ value }) => {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      return (
        <span className="flex w-full items-center gap-2">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-9 text-right text-xs tabular-nums">{pct}%</span>
        </span>
      );
    },
  },
  {
    key: 'stock',
    title: '在庫(setValue)',
    width: 160,
    align: 'right',
    // setValue を使うインタラクティブセル(- / + ボタンで直接書き込み)
    renderCell: ({ value, setValue }) => {
      const n = Number(value) || 0;
      return (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            className="h-5 w-5 rounded border leading-none hover:bg-fd-accent"
            onClick={() => setValue(Math.max(0, n - 1))}
          >
            −
          </button>
          <span className="w-10 text-right tabular-nums">{n}</span>
          <button
            type="button"
            className="h-5 w-5 rounded border leading-none hover:bg-fd-accent"
            onClick={() => setValue(n + 1)}
          >
            +
          </button>
        </span>
      );
    },
  },
];

const initialRows: Row[] = [
  { id: 1, name: '要件定義', status: '完了', progress: 100, stock: 3 },
  { id: 2, name: '基本設計', status: '完了', progress: 100, stock: 12 },
  { id: 3, name: '実装(グリッド)', status: '進行中', progress: 65, stock: 8 },
  { id: 4, name: '実装(API)', status: '進行中', progress: 40, stock: 0 },
  { id: 5, name: '結合テスト', status: '保留', progress: 0, stock: 5 },
];

export function CustomCellsDemo() {
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