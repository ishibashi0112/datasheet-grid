// 売上データ(20,000 行)を決まった乱数で作る。
export type Sale = {
  id: number;
  date: string; // YYYY-MM-DD
  region: string; // 地域コード
  rep: string; // 担当
  product: string; // 商品コード
  qty: number;
  amount: number; // 円
  status: string; // paid / unpaid / cancelled / ''
  customer: string; // 顧客コード(C-10001)
  memo: string;
};

export type Lang = 'ja' | 'en';

export const REGIONS: { value: string; ja: string; en: string }[] = [
  { value: 'hokkaido', ja: '北海道', en: 'Hokkaido' },
  { value: 'tohoku', ja: '東北', en: 'Tohoku' },
  { value: 'kanto', ja: '関東', en: 'Kanto' },
  { value: 'chubu', ja: '中部', en: 'Chubu' },
  { value: 'kinki', ja: '近畿', en: 'Kinki' },
  { value: 'chugoku', ja: '中国', en: 'Chugoku' },
  { value: 'shikoku', ja: '四国', en: 'Shikoku' },
  { value: 'kyushu', ja: '九州', en: 'Kyushu' },
];

export const PRODUCTS: { value: string; ja: string; en: string; price: number }[] = [
  { value: 'pen', ja: 'ボールペン', en: 'Ballpoint pen', price: 120 },
  { value: 'note', ja: 'ノート', en: 'Notebook', price: 180 },
  { value: 'file', ja: 'クリアファイル', en: 'Clear folder', price: 90 },
  { value: 'stapler', ja: 'ホッチキス', en: 'Stapler', price: 980 },
  { value: 'chair', ja: 'オフィスチェア', en: 'Office chair', price: 24800 },
  { value: 'desk', ja: 'デスク', en: 'Desk', price: 39800 },
  { value: 'monitor', ja: 'モニター', en: 'Monitor', price: 29800 },
  { value: 'keyboard', ja: 'キーボード', en: 'Keyboard', price: 6980 },
  { value: 'mouse', ja: 'マウス', en: 'Mouse', price: 2980 },
  { value: 'printer', ja: 'プリンター', en: 'Printer', price: 54800 },
  { value: 'paper', ja: 'コピー用紙', en: 'Copy paper', price: 2480 },
  { value: 'toner', ja: 'トナー', en: 'Toner', price: 12800 },
];

export const STATUSES: { value: string; ja: string; en: string }[] = [
  { value: 'paid', ja: '入金済', en: 'Paid' },
  { value: 'unpaid', ja: '未入金', en: 'Unpaid' },
  { value: 'cancelled', ja: 'キャンセル', en: 'Cancelled' },
];

const REPS = [
  '田中 太郎', '鈴木 花子', '佐藤 健', '高橋 美咲', '伊藤 誠', '渡辺 由美', '山本 翔', '中村 愛',
  '小林 大輔', '加藤 さくら', '吉田 直樹', '山田 優子', '佐々木 亮', '山口 彩', '松本 拓也', '井上 千尋',
  '木村 悠', '林 真央', '清水 蓮', '山崎 葵',
];

const MEMOS = ['', '', '', '', '至急', '分納', '請求書再発行', '担当変更あり', '要確認', '見積から変更'];

// 決まった乱数(mulberry32)
const rand = (() => {
  let a = 20261109;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const pad = (n: number) => String(n).padStart(2, '0');
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const createSales = (count = 20000, today = new Date()): Sale[] => {
  const rows: Sale[] = [];
  const start = new Date(today.getFullYear() - 1, today.getMonth() - 1, 1);
  const span = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
  for (let i = 0; i < count; i += 1) {
    const product = pick(PRODUCTS);
    const qty = 1 + Math.floor(rand() * 40);
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(rand() * span));
    const r = rand();
    rows.push({
      id: i + 1,
      date: toYmd(d),
      region: pick(REGIONS).value,
      rep: pick(REPS),
      product: product.value,
      qty,
      amount: product.price * qty,
      status: r < 0.6 ? 'paid' : r < 0.9 ? 'unpaid' : r < 0.98 ? 'cancelled' : '',
      customer: `C-${10001 + Math.floor(rand() * 900)}`,
      memo: pick(MEMOS),
    });
  }
  return rows;
};
