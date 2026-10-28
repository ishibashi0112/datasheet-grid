// ことばで絞り込み(/ai)のデモの表・例の文・見本の答え。
//   見本の答えは、この表と同じ列・同じ GridAskBar の設定で Claude に実際に聞いて記録したもの(記録した答えの JSON を
//   そのまま置く。デモでも本物と同じく検査してから反映する)。
import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid';

export type Item = {
  code: string;
  name: string;
  category: string;
  warehouse: string;
  stock: number;
  price: number;
  arrived: string;
};

const option = (value: string) => ({ value, label: value });

export const initialColumns: GridColumn<Item>[] = [
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

/** GridAskBar に渡す列の補足(記録したときと同じにする)。 */
export const columnHints = { stock: '個', price: '円・税抜' };

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
  ['A-1005', 'ボールペン 赤 0.5', '文具', '大阪', 60, 120, 12],
];

const pad = (value: number) => String(value).padStart(2, '0');
const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const createRows = (): Item[] =>
  SOURCE.map(([code, name, category, warehouse, stock, price, days]) => ({
    code,
    name,
    category,
    warehouse,
    stock,
    price,
    arrived: daysAgo(days),
  }));

// 例の文。上から順に押すと続けての頼み(「さらに …」)になる。言い換え(文房具 → 文具、西日本 → 大阪・福岡、
//   値段 → 単価、売り切れ → 在庫 0)と、列に無いこと(色)をどう扱ったかの知らせを見せる。文を変えたら記録し直す。
export const EXAMPLE_TEXTS = [
  '東京の在庫が 10 個以下を、単価の高い順に',
  '文房具で 1,000 円しないもの',
  '西日本の倉庫にある家電',
  'ここ 1 か月で入ってきた分',
  'さらに 1 万円以上だけ',
  '売り切れの品。値段と入荷日の列は隠して',
  '赤い文具を安い順に',
];

// 見本の答え: 例の文を上から順に Claude の速いモデル(Haiku 相当)へ聞き、返ってきた JSON をそのまま置いたもの
//   (2026-10-28 に記録。行のデータは送っていない)。
export const RECORDED_ON = '2026-10-28';

export const RECORDED_ANSWERS: Record<string, unknown> = {
  // 「東京の在庫が 10 個以下を、単価の高い順に」
  [EXAMPLE_TEXTS[0] ?? '']: {
    mode: 'replace',
    filters: [
      { column: 'warehouse', op: 'in', value: null, values: ['東京'], to: null },
      { column: 'stock', op: '<=', value: '10', values: null, to: null },
    ],
    sort: [{ column: 'price', direction: 'desc' }],
    search: null,
    hide: [],
    show: [],
    unsupported: null,
  },
  // 「文房具で 1,000 円しないもの」
  [EXAMPLE_TEXTS[1] ?? '']: {
    mode: 'replace',
    filters: [
      { column: 'category', op: 'in', value: null, values: ['文具'], to: null },
      { column: 'price', op: '<', value: '1000', values: null, to: null },
    ],
    sort: null,
    search: null,
    hide: [],
    show: [],
    unsupported: null,
  },
  // 「西日本の倉庫にある家電」
  [EXAMPLE_TEXTS[2] ?? '']: {
    mode: 'replace',
    filters: [
      { column: 'category', op: 'in', value: null, values: ['家電'], to: null },
      { column: 'warehouse', op: 'in', value: null, values: ['大阪', '福岡'], to: null },
    ],
    sort: null,
    search: null,
    hide: [],
    show: [],
    unsupported: null,
  },
  // 「ここ 1 か月で入ってきた分」
  [EXAMPLE_TEXTS[3] ?? '']: {
    mode: 'replace',
    filters: [{ column: 'arrived', op: 'preset', value: 'last30days', values: null, to: null }],
    sort: [],
    search: null,
    hide: [],
    show: [],
    unsupported: null,
  },
  // 「さらに 1 万円以上だけ」
  [EXAMPLE_TEXTS[4] ?? '']: {
    mode: 'refine',
    filters: [{ column: 'price', op: '>=', value: '10000', values: null, to: null }],
    sort: null,
    search: null,
    hide: [],
    show: [],
    unsupported: null,
  },
  // 「売り切れの品。値段と入荷日の列は隠して」
  [EXAMPLE_TEXTS[5] ?? '']: {
    mode: 'replace',
    filters: [{ column: 'stock', op: '=', value: '0', values: null, to: null }],
    sort: [],
    search: null,
    hide: ['price', 'arrived'],
    show: [],
    unsupported: null,
  },
  // 「赤い文具を安い順に」
  [EXAMPLE_TEXTS[6] ?? '']: {
    mode: 'replace',
    filters: [{ column: 'category', op: 'in', value: null, values: ['文具'], to: null }],
    sort: [{ column: 'price', direction: 'asc' }],
    search: '赤',
    hide: [],
    show: [],
    unsupported: '色の列がないため「赤」の文字で検索しています。',
  },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 24 * 60 * 60 * 1000;
const toUtc = (text: string) => Date.UTC(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, Number(text.slice(8, 10)));

/**
 * 見本の答えを今日の頼みとして返す。答えの中の日付(YYYY-MM-DD)は、記録した日から今日までの日数だけずらす
 * (表の入荷日も「今日から何日前」で作っているので、いつ開いても記録したときと同じ行が出る)。
 */
export const replayAnswer = (text: string, today: Date): unknown => {
  const recorded = RECORDED_ANSWERS[text];
  if (recorded === undefined) {
    return undefined;
  }
  const todayText = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const offset = Math.round((toUtc(todayText) - toUtc(RECORDED_ON)) / DAY);
  if (offset === 0) {
    return recorded;
  }
  return JSON.parse(JSON.stringify(recorded), (_key, value: unknown) => {
    if (typeof value !== 'string' || !DATE.test(value)) {
      return value;
    }
    const date = new Date(toUtc(value) + offset * DAY);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  });
};