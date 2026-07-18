'use client';

// スクロール位置インジケーター(scrollHint)のデモ。100,000 行で「今どの行にいるか」を
// 行番号バブル + 行目盛りルーラー + ジャンプ先プレビューが答える。
// 表示内容(行番号のみ / hintColumn / renderHint)とトリガーをその場で切り替えられる。
import { useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type ScrollHintOptions,
  type ScrollHintTrigger,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: number;
  code: string;
  name: string;
  category: string;
  qty: number;
  price: number;
  status: string;
};

const ROW_COUNT = 100_000;
const CATEGORIES = ['電子部品', '機械部品', '化成品', '梱包材', '工具'];
const STATUSES = ['有効', '停止', '廃番'];

const columns: GridColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 90, align: 'right', pinned: 'left' },
  { key: 'code', title: '品目コード', width: 140, filterType: 'text' },
  { key: 'name', title: '品目名', width: 220, filterType: 'text' },
  { key: 'category', title: 'カテゴリ', width: 130, filterType: 'set' },
  {
    key: 'qty',
    title: '在庫数',
    width: 120,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
  },
  { key: 'status', title: '状態', width: 100, filterType: 'set' },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(): Row[] {
  const rand = mulberry32(11);
  const rows: Row[] = new Array(ROW_COUNT);
  for (let i = 0; i < ROW_COUNT; i++) {
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    rows[i] = {
      id: i + 1,
      code: `P-${String(100000 + i)}`,
      name: `${category} サンプル品目 ${i + 1}`,
      category,
      qty: Math.floor(rand() * 10_000),
      price: (1 + Math.floor(rand() * 500)) * 10,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
    };
  }
  return rows;
}

type HintMode = 'row' | 'column' | 'custom';

const selectClass =
  'rounded-md border border-fd-border bg-transparent px-2 py-1 text-sm';

export function ScrollHintDemo() {
  const initialRows = useMemo(buildRows, []);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [enabled, setEnabled] = useState(true);
  const [hintMode, setHintMode] = useState<HintMode>('column');
  const [trigger, setTrigger] = useState<ScrollHintTrigger>('scroll');

  const scrollHint: ScrollHintOptions<Row> | undefined = enabled
    ? {
        trigger,
        ...(hintMode === 'column' ? { hintColumn: 'code' } : {}),
        ...(hintMode === 'custom'
          ? {
              renderHint: ({ rowData }: { rowData: Row | undefined }) =>
                rowData ? `${rowData.code} — ${rowData.name}` : null,
            }
          : {}),
      }
    : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          scrollHint
        </label>
        <label className="flex items-center gap-2">
          表示内容
          <select
            className={selectClass}
            value={hintMode}
            onChange={(e) => setHintMode(e.target.value as HintMode)}
            disabled={!enabled}
          >
            <option value="row">行番号のみ</option>
            <option value="column">行番号 + 品目コード(hintColumn)</option>
            <option value="custom">カスタム: コード — 品目名(renderHint)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          trigger
          <select
            className={selectClass}
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as ScrollHintTrigger)}
            disabled={!enabled}
          >
            <option value="scroll">scroll(スクロール中のみ)</option>
            <option value="hover">hover</option>
            <option value="always">always</option>
          </select>
        </label>
        <span className="text-fd-muted-foreground">
          {ROW_COUNT.toLocaleString()} 行 — スクロールバーをドラッグ / 右端をホバーしてみてください
        </span>
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={380}
        theme="auto"
        scrollHint={scrollHint}
      />
    </div>
  );
}