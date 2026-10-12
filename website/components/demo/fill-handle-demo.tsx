'use client';

// フィルハンドルのデモ: 生産計画の表で、選択範囲の右下の四角を引いて埋める(Excel のオートフィル)。
//   ロット番号(末尾の数)/ 日付 / 曜日 / 数量(2 つ選ぶと等差)を連続データで、工程はセルのコピーで埋める。
//   右端の「担当」列は編集不可(埋めても飛ばす)。上の表示で最後に書き込んだ件数と undo を確認できる。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
  type UndoRedoState,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  lot: string;
  date: string;
  weekday: string;
  process: string;
  qty: number | null;
  owner: string;
};

const owners = ['佐藤', '鈴木', '高橋', '田中'];

const initialRows: Row[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  lot: i < 2 ? `LOT-${String(i + 1).padStart(3, '0')}` : '',
  date: i < 1 ? '2026-11-02' : '',
  weekday: i < 1 ? '月' : '',
  process: i < 3 ? ['切削', '研磨', '検査'][i] : '',
  qty: i < 2 ? (i + 1) * 50 : null,
  owner: owners[i % owners.length],
}));

const columns: GridColumn<Row>[] = [
  { key: 'lot', title: 'ロット', width: 110 },
  { key: 'date', title: '日付', width: 120 },
  { key: 'weekday', title: '曜日', width: 70, align: 'center' },
  { key: 'process', title: '工程', width: 100 },
  {
    key: 'qty',
    title: '数量',
    width: 90,
    align: 'right',
    editor: { type: 'number', min: 0 },
    validate: ({ value }) => value === null || value === '' || Number(value) <= 1000 || '1000 以下',
    validationMode: 'reject',
  },
  { key: 'owner', title: '担当(編集不可)', width: 130, editable: false },
];

export function FillHandleDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [undoState, setUndoState] = useState<UndoRedoState>({ canUndo: false, canRedo: false });

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-40"
          disabled={!undoState.canUndo}
          onClick={() => gridRef.current?.undo()}
        >
          元に戻す
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => {
            setRows(initialRows);
          }}
        >
          最初の状態へ
        </button>
        <span className="text-xs text-fd-muted-foreground">
          ロット 2 行を選んで右下の四角を下へ引く / 曜日を引く / 工程 3 行を引く(コピー)/ Ctrl(⌘)を押しながら引く
        </span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        onUndoRedoStateChange={setUndoState}
        rowKeyGetter={(row) => row.id}
        height={360}
        fillHandle
      />
    </div>
  );
}