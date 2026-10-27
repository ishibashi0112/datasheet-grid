'use client';

// ことばで絞り込み(/ai)のデモ: GridAskBar を在庫表の上に置く。AI は呼ばず、例の文ごとに用意した見本の答えを ask が返す
//   (答えの検査・反映・チップ・元に戻すは本物の部品)。自由な文には「例の文だけに答える」と AI からのひとことで返す。
//   下の「AI に渡した頼み」で、ask に渡る中身(行のデータは入らない)と答えを見られる。
import { useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import {
  GridAskBar,
  type GridAsk,
  type GridAskAnswer,
  type GridAskFilter,
  type GridAskRequest,
} from '@ishibashi0112/spreadsheet-grid/ai';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Item = {
  code: string;
  name: string;
  category: string;
  warehouse: string;
  stock: number;
  price: number;
  arrived: string;
};

const option = (value: string) => ({ value, label: value });

const initialColumns: GridColumn<Item>[] = [
  { key: 'code', title: '品番', width: 90, filterType: 'text' },
  { key: 'name', title: '品名', width: 170, filterType: 'textSet' },
  { key: 'category', title: '分類', width: 90, filterType: 'set', filterOptions: ['文具', '家具', '家電', '消耗品'].map(option) },
  { key: 'warehouse', title: '倉庫', width: 80, filterType: 'set', filterOptions: ['東京', '大阪', '福岡'].map(option) },
  { key: 'stock', title: '在庫数', width: 90, align: 'right', filterType: 'numberSet', editor: { type: 'number' } },
  {
    key: 'price',
    title: '単価',
    width: 100,
    align: 'right',
    filterType: 'number',
    editor: { type: 'number' },
    valueFormatter: numberFormatter(),
  },
  { key: 'arrived', title: '入荷日', width: 120, filterType: 'dateSet', editor: { type: 'date' } },
];

// 入荷日は「今日から何日前」で作る(今月・過去 30 日の例がいつ開いても意味を持つように)。
const SOURCE: [string, string, string, string, number, number, number][] = [
  ['A-1001', 'ボールペン 黒 0.5', '文具', '東京', 240, 120, 25],
  ['A-1002', 'ノート A5', '文具', '大阪', 8, 180, 38],
  ['A-1003', '付箋 75mm', '文具', '東京', 5, 210, 6],
  ['B-2001', 'オフィスチェア', '家具', '東京', 12, 28000, 57],
  ['B-2002', '昇降デスク', '家具', '福岡', 3, 64800, 15],
  ['B-2003', '書類キャビネット', '家具', '大阪', 0, 19800, 93],
  ['C-3001', 'モニター 27型', '家電', '東京', 9, 32800, 1],
  ['C-3002', 'USB-C ハブ', '家電', '福岡', 46, 4980, 26],
  ['C-3003', 'ワイヤレスマウス', '家電', '東京', 2, 3280, 0],
  ['C-3004', 'Web カメラ', '家電', '大阪', 15, 7480, 51],
  ['D-4001', 'コピー用紙 A4', '消耗品', '東京', 120, 2450, 8],
  ['D-4002', 'トナー 黒', '消耗品', '福岡', 4, 12600, 28],
  ['D-4003', '電池 単3', '消耗品', '大阪', 300, 98, 17],
  ['A-1004', 'ホッチキス', '文具', '福岡', 18, 650, 73],
  ['B-2004', 'パーティション', '家具', '東京', 6, 15400, 2],
  ['D-4004', 'ゴミ袋 45L', '消耗品', '東京', 0, 380, 23],
];

const pad = (value: number) => String(value).padStart(2, '0');
const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const f = (column: string, op: GridAskFilter['op'], extra: Partial<GridAskFilter> = {}): GridAskFilter => ({
  column,
  op,
  value: null,
  values: null,
  to: null,
  ...extra,
});

const answer = (extra: Partial<GridAskAnswer>): GridAskAnswer => ({
  mode: 'replace',
  filters: [],
  sort: null,
  search: null,
  hide: [],
  show: [],
  unsupported: null,
  ...extra,
});

// 例の文と見本の答え(本物の AI が返す形と同じ)。
const EXAMPLES: { text: string; answer: GridAskAnswer }[] = [
  {
    text: '東京の在庫が 10 個以下を、単価の高い順に',
    answer: answer({
      filters: [f('warehouse', 'in', { values: ['東京'] }), f('stock', '<=', { value: '10' })],
      sort: [{ column: 'price', direction: 'desc' }],
    }),
  },
  {
    text: '今月入荷した家電',
    answer: answer({
      filters: [f('category', 'in', { values: ['家電'] }), f('arrived', 'preset', { value: 'thisMonth' })],
    }),
  },
  {
    text: 'さらに 1 万円以上だけ',
    answer: answer({ mode: 'refine', filters: [f('price', '>=', { value: '10000' })] }),
  },
  {
    text: '在庫切れの品。単価と入荷日の列は隠して',
    answer: answer({ filters: [f('stock', '=', { value: '0' })], hide: ['price', 'arrived'] }),
  },
  {
    text: '赤い色の文具を安い順に',
    answer: answer({
      filters: [f('category', 'in', { values: ['文具'] })],
      sort: [{ column: 'price', direction: 'asc' }],
      unsupported: '色の列が無いので、色では絞り込めませんでした。',
    }),
  },
];

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export function AiFilterDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Item>>(null);
  const rows = useMemo<Item[]>(
    () =>
      SOURCE.map(([code, name, category, warehouse, stock, price, days]) => ({
        code,
        name,
        category,
        warehouse,
        stock,
        price,
        arrived: daysAgo(days),
      })),
    [],
  );
  const [columns, setColumns] = useState(initialColumns);
  const [lastRequest, setLastRequest] = useState<GridAskRequest | null>(null);
  const [lastAnswer, setLastAnswer] = useState<GridAskAnswer | null>(null);

  // 本物では自分のサーバーへ送る(API_REFERENCE の「ことばで絞り込み」参照)。デモは見本の答えを返す。
  const ask: GridAsk = async (request, { signal }) => {
    setLastRequest(request);
    await wait(450, signal);
    const example = EXAMPLES.find((entry) => entry.text === request.text);
    const result =
      example?.answer ??
      answer({
        mode: 'refine',
        unsupported: 'このデモは例の文だけに答えます(見本の答え)。自分のサーバーで AI を呼ぶと、好きな文で絞り込めます。',
      });
    setLastAnswer(result);
    return result;
  };

  return (
    <div className="not-prose flex flex-col gap-3">
      <GridAskBar
        grid={gridRef}
        columns={columns}
        ask={ask}
        examples={EXAMPLES.map((entry) => entry.text)}
        columnHints={{ stock: '個', price: '円・税抜' }}
        allowColumnVisibility
        theme="auto"
      />
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={columns}
        onColumnsChange={setColumns}
        rowKeyGetter={(row) => row.code}
        height={360}
        theme="auto"
      />
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">AI に渡した頼みと答え</summary>
        {lastRequest ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-fd-muted-foreground">
              ask(request) に渡る中身です。system はいつも同じ文、prompt は列の説明と今の条件と利用者の文、schema は答えの形(JSON
              Schema)。行のデータは入りません。
            </p>
            <pre className="max-h-72 overflow-auto rounded bg-fd-muted p-2 text-xs whitespace-pre-wrap">
              {`// prompt\n${lastRequest.prompt}\n\n// 答え\n${JSON.stringify(lastAnswer, null, 2)}`}
            </pre>
          </div>
        ) : (
          <p className="mt-2 text-fd-muted-foreground">例の文を押すと、ここに AI へ渡す中身と答えが出ます。</p>
        )}
      </details>
    </div>
  );
}