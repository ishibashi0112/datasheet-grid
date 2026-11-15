'use client';

// 選択とコピー・貼り付けのデモ: セルの範囲選択 + Ctrl/Cmd+C / V(TSV)、末尾より下への貼り付けは createRow で行を足す。
//   行の先頭のチェックボックスで行を選び(enableRowSelection)、「選んだ行を削除」はハンドルの applyRows で渡す
//   (元に戻すの履歴に積まれ、Ctrl/Cmd+Z で戻せる)。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Line = {
  id: string;
  code: string;
  name: string;
  qty: number | null;
  price: number | null;
};

const columns: GridColumn<Line>[] = [
  { key: 'code', title: '品番', width: 110 },
  { key: 'name', title: '品名', width: 200 },
  { key: 'qty', title: '数量', width: 90, align: 'right', editor: { type: 'number', min: 0, integer: true } },
  {
    key: 'price',
    title: '単価',
    width: 110,
    align: 'right',
    editor: { type: 'number', min: 0 },
    valueFormatter: numberFormatter(),
  },
];

let nextId = 100;
const newId = () => `L-${(nextId += 1)}`;

const initialLines: Line[] = [
  { id: 'L-1', code: 'A-1001', name: 'ボールペン(黒)', qty: 120, price: 80 },
  { id: 'L-2', code: 'A-1002', name: 'ボールペン(赤)', qty: 60, price: 80 },
  { id: 'L-3', code: 'B-2001', name: 'A4 コピー用紙', qty: 30, price: 450 },
  { id: 'L-4', code: 'B-2002', name: 'クリアファイル', qty: 200, price: 25 },
  { id: 'L-5', code: 'C-3001', name: 'ホチキス針', qty: 40, price: 120 },
];

const pasteSample = ['D-4001\t付箋(黄)\t50\t160', 'D-4002\t付箋(青)\t50\t160', 'D-4003\t修正テープ\t24\t280'].join('\n');

export function SelectionClipboardDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Line>>(null);
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [selectedCount, setSelectedCount] = useState(0);

  const deleteSelected = () => {
    const grid = gridRef.current;
    if (!grid) return;
    const keys = new Set(grid.getSelectedRowKeys());
    grid.applyRows(lines.filter((line) => !keys.has(line.id)));
    grid.clearRowSelection();
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fd-muted-foreground">貼り付け用の例(選んでコピーし、グリッドのセルへ貼り付け)</span>
        <textarea
          readOnly
          rows={3}
          className="rounded-md border bg-fd-background px-2 py-1 font-mono text-xs"
          value={pasteSample}
        />
      </label>
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-3 py-1 disabled:opacity-50"
          disabled={selectedCount === 0}
          onClick={deleteSelected}
        >
          選んだ行を削除({selectedCount} 行)
        </button>
        <span className="text-fd-muted-foreground">削除は Ctrl/Cmd+Z で戻せます</span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={lines}
        onRowsChange={setLines}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        createRow={() => ({ id: newId(), code: '', name: '', qty: null, price: null })}
        enableRowSelection
        onRowSelectionChange={() => setSelectedCount(gridRef.current?.getSelectedRowCount() ?? 0)}
        height={300}
        theme="class"
      />
    </div>
  );
}