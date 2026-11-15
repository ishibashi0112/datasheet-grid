'use client';

// 並べ替えたまま値が変わる表のデモ(1.2.0 の activeCellFollows): 前日比の大きい順の株価ボード。1 秒ごとに値が変わり、
//   銘柄の並びが入れ替わる。既定の 'position' はアクティブセルが表示位置(何行目か)に残り、'row' は押した銘柄に付いていく。
//   更新は applyRows(fn, { undoable: false }) で渡す(メモの編集の元に戻すを壊さない)。
import { useEffect, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridCellRef,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Quote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  memo: string;
};

const initialQuotes: Quote[] = [
  ['7203', 'トヨタ自動車', 2_850],
  ['6758', 'ソニーグループ', 3_420],
  ['9984', 'ソフトバンクグループ', 9_100],
  ['8306', '三菱UFJ', 1_760],
  ['6861', 'キーエンス', 64_200],
  ['9432', 'NTT', 156],
  ['4063', '信越化学工業', 5_980],
  ['6501', '日立製作所', 3_870],
  ['7974', '任天堂', 8_950],
  ['8035', '東京エレクトロン', 24_300],
  ['4502', '武田薬品工業', 4_210],
  ['6098', 'リクルート', 9_480],
].map(([symbol, name, price], index) => ({
  symbol: String(symbol),
  name: String(name),
  price: Number(price),
  change: Math.round(((index * 37) % 21) - 10) / 10,
  memo: '',
}));

const yen = numberFormatter<Quote>({ maximumFractionDigits: 0 });

const columns: GridColumn<Quote>[] = [
  { key: 'symbol', title: 'コード', width: 80, readOnly: true },
  { key: 'name', title: '銘柄', width: 170, readOnly: true },
  { key: 'price', title: '株価', width: 100, align: 'right', readOnly: true, valueFormatter: yen },
  {
    key: 'change',
    title: '前日比(%)',
    width: 110,
    align: 'right',
    readOnly: true,
    valueFormatter: ({ value }) => (typeof value === 'number' ? `${value > 0 ? '+' : ''}${value.toFixed(1)}` : ''),
    cellClassName: ({ value }) =>
      typeof value === 'number' && value !== 0
        ? { style: { color: value > 0 ? 'var(--ssg-cf-good)' : 'var(--ssg-cf-critical)' } }
        : undefined,
  },
  { key: 'memo', title: 'メモ(編集できる)', width: 200 },
];

// 3 銘柄の前日比と株価を少し動かす(並びが入れ替わる)。
const tick = (prev: Quote[]): Quote[] => {
  const next = prev.slice();
  for (let n = 0; n < 3; n++) {
    const index = Math.floor(Math.random() * next.length);
    const quote = next[index];
    if (!quote) continue;
    const delta = Math.round((Math.random() - 0.5) * 16) / 10;
    const change = Math.max(-9.9, Math.min(9.9, Math.round((quote.change + delta) * 10) / 10));
    next[index] = { ...quote, change, price: Math.max(1, Math.round(quote.price * (1 + delta / 100))) };
  }
  return next;
};

export function LiveSortDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Quote>>(null);
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [follows, setFollows] = useState<'position' | 'row'>('row');
  const [running, setRunning] = useState(true);
  const [active, setActive] = useState<GridCellRef<Quote> | null>(null);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => gridRef.current?.applyRows(tick, { undoable: false }), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <code className="text-xs">activeCellFollows</code>
          <select
            className="rounded-md border bg-transparent px-2 py-1"
            value={follows}
            onChange={(event) => setFollows(event.target.value as 'position' | 'row')}
          >
            <option value="row">row(押した銘柄に付いていく)</option>
            <option value="position">position(既定。表示位置に残る)</option>
          </select>
        </label>
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-fd-accent" onClick={() => setRunning((value) => !value)}>
          {running ? '更新を止める' : '更新を再開'}
        </button>
        <span className="text-fd-muted-foreground">
          アクティブセル: {active ? `${active.row.name}(${active.column.title})` : '(銘柄のセルを押してください)'}
        </span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={quotes}
        onRowsChange={setQuotes}
        columns={columns}
        rowKeyGetter={(row) => row.symbol}
        initialState={{ sort: [{ columnKey: 'change', direction: 'desc' }] }}
        activeCellFollows={follows}
        onActiveCellChange={setActive}
        highlightChanges
        height={360}
        theme="class"
      />
      <p className="m-0 text-sm text-fd-muted-foreground">
        前日比の大きい順に並べた株価ボードです。1 秒ごとに 3 銘柄の値が変わり、並びが入れ替わります。銘柄のセルを押して、「position」と「row」でアクティブセルの動きを比べてください(上の「アクティブセル」は onActiveCellChange で受け取った値です。row では銘柄が動いただけでは呼ばれません)。
      </p>
    </div>
  );
}