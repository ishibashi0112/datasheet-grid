'use client';

// セル内検索のデモ: グリッドをクリックしてから Ctrl/Cmd+F、またはボタン(openFind)で右上の検索バーを開く。
//   onFindChange の通知(件数 / 現在位置)を下に出す。
import { useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type FindChangeParams,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Part = {
  id: number;
  name: string;
  maker: string;
  location: string;
  qty: number;
};

const NAMES = ['六角ボルト', 'ナイロンナット', '平座金', 'ばね座金', '止め輪', 'ピン', 'ブッシュ', 'ベアリング'];
const SIZES = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10'];
const MAKERS = ['東邦精工', '北辰工業', '南海金属', '西部製作所'];
const LOCATIONS = ['A棚', 'B棚', 'C棚', '倉庫2F'];

const columns: GridColumn<Part>[] = [
  { key: 'id', title: 'No.', width: 70, align: 'right', readOnly: true },
  { key: 'name', title: '品名', width: 200 },
  { key: 'maker', title: 'メーカー', width: 130 },
  { key: 'location', title: '保管場所', width: 100 },
  { key: 'qty', title: '在庫数', width: 100, align: 'right', valueFormatter: numberFormatter() },
];

function buildParts(count: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      id: i + 1,
      name: `${NAMES[i % NAMES.length]} ${SIZES[(i * 7) % SIZES.length]}`,
      maker: MAKERS[(i * 3) % MAKERS.length],
      location: LOCATIONS[(i * 5) % LOCATIONS.length],
      qty: (i * 37) % 900,
    });
  }
  return parts;
}

export function FindDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Part>>(null);
  const initialParts = useMemo(() => buildParts(2_000), []);
  const [parts, setParts] = useState<Part[]>(initialParts);
  const [status, setStatus] = useState<FindChangeParams | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.openFind('M8')}
        >
          「M8」で検索を開く(openFind)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.findPrev()}
        >
          前へ(findPrev)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.findNext()}
        >
          次へ(findNext)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.closeFind()}
        >
          閉じる(closeFind)
        </button>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={parts}
        onRowsChange={setParts}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={380}
        theme="auto"
        find
        onFindChange={setStatus}
      />
      <p className="text-sm text-fd-muted-foreground min-h-5">
        {status && status.open
          ? `onFindChange: 「${status.query}」 ${status.matchCount} 件${
              status.currentIndex === null ? '' : `(${status.currentIndex + 1} 件目)`
            }`
          : 'グリッドのセルをクリックしてから Ctrl/Cmd+F でも開けます(2,000 行)'}
      </p>
    </div>
  );
}
