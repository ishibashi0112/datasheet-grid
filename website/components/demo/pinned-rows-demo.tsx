'use client';

// 固定行のデモ: 支店ごとの月の売上(本体の行)と、上に「目標」、下に「前年」「支店の平均」を固定する。
//   固定行は本体とは別の配列(pinnedTopRows / pinnedBottomRows)で、縦にスクロールしても列見出しの下 / 合計行の上に留まる。
//   本体の数字を編集すると「支店の平均」(下の固定行)と合計行が追従する(固定行は表示だけなので、作り直して渡す)。
//   条件付き書式(目標との差の色)は固定行にも効き、renderCell の ctx.pinned で固定行だけ見た目を変えている。
import { useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type CellStyleContext,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: string;
  branch: string;
  region: string;
  apr: number;
  may: number;
  jun: number;
  jul: number;
};

const MONTHS = ['apr', 'may', 'jun', 'jul'] as const;
const branches: Array<[string, string]> = [
  ['札幌', '東日本'], ['仙台', '東日本'], ['さいたま', '東日本'], ['千葉', '東日本'], ['東京', '東日本'], ['横浜', '東日本'],
  ['新潟', '東日本'], ['静岡', '東日本'], ['名古屋', '西日本'], ['京都', '西日本'], ['大阪', '西日本'], ['神戸', '西日本'],
  ['岡山', '西日本'], ['広島', '西日本'], ['高松', '西日本'], ['松山', '西日本'], ['福岡', '西日本'], ['熊本', '西日本'],
  ['鹿児島', '西日本'], ['那覇', '西日本'],
];

const initialRows: Row[] = branches.map(([branch, region], i) => ({
  id: `b${i + 1}`,
  branch,
  region,
  apr: 900 + ((i * 137) % 600),
  may: 950 + ((i * 89) % 650),
  jun: 1_000 + ((i * 211) % 550),
  jul: 1_050 + ((i * 53) % 700),
}));

const target: Row = { id: 'target', branch: '目標', region: '', apr: 1_200, may: 1_250, jun: 1_300, jul: 1_350 };
const lastYear: Row = { id: 'last-year', branch: '前年', region: '', apr: 1_020, may: 1_080, jun: 1_150, jul: 1_190 };

const thousand = numberFormatter<Row>({ maximumFractionDigits: 0 });

export function PinnedRowsDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [showTop, setShowTop] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [csv, setCsv] = useState('');

  // 本体の行から作り直す固定行(支店の平均)。固定行は表示だけなので、値が変わったら配列を作り直して渡す。
  const average = useMemo<Row>(() => {
    const avg = (key: (typeof MONTHS)[number]) => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
    return { id: 'average', branch: '支店の平均', region: '', apr: avg('apr'), may: avg('may'), jun: avg('jun'), jul: avg('jul') };
  }, [rows]);

  const columns = useMemo<GridColumn<Row>[]>(
    () => [
      {
        key: 'branch',
        title: '支店',
        width: 130,
        pinned: 'left',
        // 固定行だけ太字にする(ctx.pinned は固定行のときだけ 'top' / 'bottom')。
        renderCell: (ctx) => (ctx.pinned ? <strong>{String(ctx.value)}</strong> : String(ctx.value)),
      },
      { key: 'region', title: '地域', width: 90, filterType: 'set' },
      ...MONTHS.map((key, index) => ({
        key,
        title: `${index + 4}月`,
        width: 100,
        align: 'right' as const,
        aggFunc: 'sum' as const,
        editor: { type: 'number' as const, min: 0 },
        valueFormatter: thousand,
        // 目標に届いていないセルを薄く染める(固定行の「前年」「支店の平均」にも効く)。目標の行そのものは染めない。
        cellClassName: (ctx: CellStyleContext<Row>) =>
          ctx.row.id !== 'target' && typeof ctx.value === 'number' && ctx.value < target[key]
            ? { style: { color: 'var(--ssg-cf-critical)' } }
            : undefined,
      })),
    ],
    [],
  );

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showTop} onChange={(event) => setShowTop(event.target.checked)} />
          上に固定(目標)
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showBottom} onChange={(event) => setShowBottom(event.target.checked)} />
          下に固定(前年 / 支店の平均)
        </label>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => setCsv(gridRef.current?.exportCsv({ includePinnedRows: true, includeTotalRow: true }) ?? '')}
        >
          CSV(固定行込み)を見る
        </button>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={360}
        pinnedTopRows={showTop ? [target] : undefined}
        pinnedBottomRows={showBottom ? [lastYear, average] : undefined}
        totalRow
      />
      {csv !== '' && (
        <pre className="max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-xs dark:bg-gray-900">
          {[...csv.split('\r\n').slice(0, 3), '…', ...csv.split('\r\n').slice(-4)].join('\n')}
        </pre>
      )}
    </div>
  );
}