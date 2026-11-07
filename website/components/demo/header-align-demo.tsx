'use client';

// 見出しの寄せ(headerAlign)のデモ: 右寄せの数値列は見出しも右、中央の列は見出しも中央(既定 = align に合わせる)。
//   右寄せの見出しは並びが鏡写しになり、並べ替えの矢印とフィルターの印がラベルの左、ホバーで出る grip と ⋮ も左に出る。
//   「見出しは左」に切り替えると、全列へ headerAlign: 'left' を書いたときの見た目(0.61.0 までの見た目)になる。
import { useEffect, useMemo, useRef, useState } from 'react';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Sale = {
  id: number;
  name: string;
  qty: number;
  amount: number;
  diff: number;
  status: '確定' | '見込み' | '保留';
};

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

const rows: Sale[] = [
  { id: 1, name: 'ワイヤレスマウス', qty: 120, amount: 477600, diff: 32400, status: '確定' },
  { id: 2, name: 'メカニカルキーボード', qty: 35, amount: 518000, diff: -12800, status: '確定' },
  { id: 3, name: '27 インチモニター', qty: 18, amount: 590400, diff: 98400, status: '見込み' },
  { id: 4, name: 'USB-C ハブ', qty: 240, amount: 1195200, diff: 205000, status: '確定' },
  { id: 5, name: 'ノート PC スタンド', qty: 76, amount: 226480, diff: -4980, status: '保留' },
  { id: 6, name: 'Web カメラ', qty: 52, amount: 362960, diff: 13960, status: '見込み' },
  { id: 7, name: 'ヘッドセット', qty: 64, amount: 574720, diff: 71840, status: '確定' },
];

const baseColumns: GridColumn<Sale>[] = [
  { key: 'name', title: '品名', width: 180 },
  { key: 'qty', title: '数量', width: 90, align: 'right', filterType: 'number' },
  { key: 'amount', title: '金額', width: 130, align: 'right', valueFormatter: ({ value }) => yen.format(Number(value)) },
  // 長い見出しは「…」で切れる(はみ出すときは左寄せと同じく末尾が「…」)
  { key: 'diff', title: '前年同月比の差額', width: 120, align: 'right', valueFormatter: ({ value }) => yen.format(Number(value)) },
  { key: 'status', title: '状態', width: 90, align: 'center' },
];

export function HeaderAlignDemo() {
  const [mode, setMode] = useState<'follow' | 'left'>('follow');
  const [columns, setColumns] = useState(baseColumns);
  const gridRef = useRef<SpreadsheetGridHandle<Sale>>(null);
  // 「見出しは左」は全列に headerAlign: 'left' を書いたときと同じ。
  const gridColumns = useMemo(
    () => (mode === 'left' ? columns.map((column) => ({ ...column, headerAlign: 'left' as const })) : columns),
    [columns, mode],
  );

  // 並べ替えの矢印が見えるよう、最初に金額の降順を入れておく。
  useEffect(() => {
    const handle = gridRef.current;
    if (handle) {
      handle.applyState({ ...handle.getState(), sort: [{ columnKey: 'amount', direction: 'desc' }] });
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          見出しの寄せ
          <select
            className="rounded-md border bg-transparent px-2 py-1"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'follow' | 'left')}
          >
            <option value="follow">align に合わせる(既定)</option>
            <option value="left">見出しは左(headerAlign: 'left')</option>
          </select>
        </label>
        <span className="text-xs text-fd-muted-foreground">見出しにマウスを載せると grip と ⋮ が出ます</span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={gridColumns}
        // 列の並べ替え / 幅などはそのまま保ち、デモの切り替えで足した headerAlign だけを外して持つ
        onColumnsChange={(next) => setColumns(next.map((column) => ({ ...column, headerAlign: undefined })))}
        rowKeyGetter={(row) => row.id}
        height={300}
        theme="auto"
        density="compact"
      />
    </div>
  );
}