// 商品マスタのデータ(生成)

export type CategoryRow = {
  kind: 'category';
  id: string;
  code: string;
  name: string;
};

export type ProductStatus = 'active' | 'paused' | 'draft';

export type ProductRow = {
  kind: 'product';
  id: string; // 商品コード
  jan: string;
  name: string;
  image: string;
  maker: string; // メーカーコード
  supplier: string | null; // 仕入先コード(Mantine Select の custom エディタ)
  price: number | null;
  cost: number | null;
  stock: number | null;
  status: ProductStatus;
  releaseDate: string | null;
  taxRate: number;
  discontinued: boolean;
  note: string;
};

export type Row = CategoryRow | ProductRow;

export const CATEGORIES = [
  { code: 'C01', name: '飲料' },
  { code: 'C02', name: '菓子' },
  { code: 'C03', name: '調味料' },
  { code: 'C04', name: '冷凍食品' },
  { code: 'C05', name: '日用品' },
  { code: 'C06', name: '文房具' },
  { code: 'C07', name: 'ペット用品' },
  { code: 'C08', name: '化粧品' },
  { code: 'C09', name: '医薬部外品' },
  { code: 'C10', name: '酒類' },
  { code: 'C11', name: '家電小物' },
  { code: 'C12', name: 'インテリア' },
];

// 乱数(再現できるように固定シード)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261109);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

const MAKER_PREFIX = ['山田', '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '中村', '小林', '加藤', '吉田', '山本', '松本', '井上', '木村'];
const MAKER_SUFFIX = ['食品', '製菓', '工業', '化学', '産業', '商事', 'ホールディングス', '製作所', '乳業', '酒造', 'ケミカル', 'フーズ', '物産', '薬品', '電機', 'ライフ', '紙業', '文具', 'ペットケア', 'コスメ'];

// 選択肢の多い select 用: 300 社
export const MAKERS: { value: string; label: string }[] = [];
for (let i = 0; i < 300; i++) {
  const label = `${MAKER_PREFIX[i % MAKER_PREFIX.length]}${MAKER_SUFFIX[Math.floor(i / MAKER_PREFIX.length) % MAKER_SUFFIX.length]}`;
  MAKERS.push({ value: `M${String(i + 1).padStart(3, '0')}`, label: i >= 300 - 0 ? label : `${label}${i >= 150 ? '(西日本)' : ''}` });
}
export const makerLabel = new Map(MAKERS.map((m) => [m.value, m.label]));

export const SUPPLIERS: { value: string; label: string }[] = Array.from({ length: 60 }, (_, i) => ({
  value: `S${String(i + 1).padStart(2, '0')}`,
  label: `${pick(['東京', '大阪', '名古屋', '福岡', '札幌', '仙台', '広島'])}${pick(['中央', '北', '南', '第一', '第二'])}卸 ${i + 1}`,
}));
export const supplierLabel = new Map(SUPPLIERS.map((s) => [s.value, s.label]));

const NAME_A = ['プレミアム', 'やさしい', '徳用', 'ミニ', 'ファミリー', '国産', '濃厚', 'さらさら', 'しっとり', '無添加', '季節限定', '業務用'];
const NAME_B: Record<string, string[]> = {
  C01: ['緑茶', '麦茶', 'コーヒー', '炭酸水', 'オレンジジュース', 'スポーツドリンク'],
  C02: ['チョコレート', 'ポテトチップス', 'クッキー', 'せんべい', 'グミ', 'キャンディ'],
  C03: ['醤油', '味噌', 'ソース', 'マヨネーズ', 'ドレッシング', 'だし'],
  C04: ['餃子', 'から揚げ', '冷凍うどん', 'ピザ', 'アイスクリーム', '枝豆'],
  C05: ['洗剤', 'ティッシュ', 'ラップ', 'ゴミ袋', '歯ブラシ', '柔軟剤'],
  C06: ['ボールペン', 'ノート', '付箋', 'クリアファイル', '消しゴム', 'ホチキス'],
  C07: ['ドッグフード', 'キャットフード', 'ペットシーツ', '猫砂', 'おやつ', 'ブラシ'],
  C08: ['化粧水', '乳液', '日焼け止め', 'リップ', 'ハンドクリーム', 'シャンプー'],
  C09: ['うがい薬', '目薬', '湿布', '絆創膏', 'マスク', '消毒液'],
  C10: ['ビール', '日本酒', 'ワイン', '焼酎', 'ハイボール', '梅酒'],
  C11: ['USB ケーブル', '乾電池', 'イヤホン', 'LED 電球', '延長コード', 'モバイルバッテリー'],
  C12: ['クッション', 'ラグ', '時計', '花瓶', 'ブランケット', 'ランプ'],
};
const SIZE = ['500ml', '1L', '2L', '100g', '200g', '1kg', '6個入', '12個入', 'S', 'M', 'L', '徳用'];

function makeJan(n: number): string {
  // 先頭 12 桁 + チェックデジット
  const base = `49${String(n).padStart(10, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const cd = (10 - (sum % 10)) % 10;
  return base + String(cd);
}

export function isValidJan(jan: string): boolean {
  if (!/^\d{13}$/.test(jan)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(jan[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(jan[12]);
}

export function generateRows(total = 5000): Row[] {
  const rows: Row[] = [];
  const perCat = Math.floor(total / CATEGORIES.length);
  let n = 0;
  CATEGORIES.forEach((cat, ci) => {
    rows.push({ kind: 'category', id: `cat-${cat.code}`, code: cat.code, name: `${cat.code} ${cat.name}` });
    const count = ci === CATEGORIES.length - 1 ? total - perCat * (CATEGORIES.length - 1) : perCat;
    for (let i = 0; i < count; i++) {
      n++;
      const price = Math.round((100 + rand() * 4900) / 10) * 10;
      const cost = Math.round(price * (0.4 + rand() * 0.4));
      const y = 2020 + Math.floor(rand() * 7);
      const m = 1 + Math.floor(rand() * 12);
      const d = 1 + Math.floor(rand() * 28);
      rows.push({
        kind: 'product',
        id: `P-${String(n).padStart(5, '0')}`,
        jan: makeJan(n),
        name: `${pick(NAME_A)}${pick(NAME_B[cat.code]!)} ${pick(SIZE)}`,
        image: `/thumbs/${(ci * 2 + (n % 2)) % 24}.svg`,
        maker: MAKERS[Math.floor(rand() * MAKERS.length)]!.value,
        supplier: rand() < 0.1 ? null : SUPPLIERS[Math.floor(rand() * SUPPLIERS.length)]!.value,
        price,
        cost,
        stock: Math.floor(rand() * 500),
        status: rand() < 0.8 ? 'active' : rand() < 0.5 ? 'paused' : 'draft',
        releaseDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        taxRate: cat.code === 'C10' || cat.code === 'C05' || cat.code === 'C06' || cat.code === 'C11' || cat.code === 'C12' || cat.code === 'C08' || cat.code === 'C09' || cat.code === 'C07' ? 10 : 8,
        discontinued: rand() < 0.05,
        note: rand() < 0.2 ? pick(['棚替え予定', '発注点見直し', '季節品', 'PB 候補', '']) : '',
      });
    }
  });
  return rows;
}
