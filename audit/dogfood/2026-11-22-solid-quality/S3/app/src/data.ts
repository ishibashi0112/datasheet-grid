// 商品マスタのデータ(5,000 件 + カテゴリの見出し行)。乱数の種は固定。
export type Product = {
  kind: 'product'
  id: string
  sku: string
  name: string
  category: string
  brand: string
  supplier: string
  price: number | null
  stock: number | null
  releasedAt: string
  published: boolean
  jan: string
  hue: number
}

export type CategoryLabel = {
  kind: 'label'
  id: string
  category: string
}

export type Row = Product | CategoryLabel

export const CATEGORIES = [
  '文具', '日用品', '食品', '飲料', '家電', '衣料',
  '化粧品', '玩具', '書籍', 'スポーツ', '園芸', 'ペット',
] as const

const NAMES: Record<string, string[]> = {
  文具: ['ボールペン', 'ノート', '付箋', 'ホッチキス', 'クリアファイル', '蛍光ペン'],
  日用品: ['洗剤', '歯ブラシ', 'タオル', 'ハンドソープ', 'ゴミ袋', 'スポンジ'],
  食品: ['味噌', '醤油', 'パスタ', 'カレールウ', 'ふりかけ', '乾麺'],
  飲料: ['緑茶', 'コーヒー豆', '炭酸水', '麦茶', 'ジュース', '紅茶'],
  家電: ['電気ケトル', 'ドライヤー', '扇風機', '炊飯器', '電卓', 'モバイルバッテリー'],
  衣料: ['靴下', 'Tシャツ', '手袋', '帽子', 'エプロン', 'パーカー'],
  化粧品: ['化粧水', '乳液', '日焼け止め', 'リップ', 'ハンドクリーム', 'シャンプー'],
  玩具: ['積み木', 'パズル', 'ミニカー', 'ぬいぐるみ', 'カードゲーム', '知育ブロック'],
  書籍: ['文庫本', '図鑑', 'レシピ本', '問題集', '絵本', '雑誌'],
  スポーツ: ['ヨガマット', 'ダンベル', 'ボール', 'ラケット', '水筒', 'タオル'],
  園芸: ['培養土', 'じょうろ', '植木鉢', '肥料', '種', '剪定ばさみ'],
  ペット: ['ドッグフード', 'キャットフード', '猫砂', 'リード', 'おもちゃ', 'ペットシーツ'],
}

const VARIANTS = ['S', 'M', 'L', '徳用', '限定', '詰替', '2個組', 'ミニ']

// 選択肢の多い select(ブランド 240 件)
const BRAND_HEADS = ['アオバ', 'ミナト', 'サクラ', 'ヒカリ', 'ツバサ', 'ハルカ', 'ソラ', 'カエデ', 'ナギ', 'ユメ', 'コハク', 'ミドリ']
const BRAND_TAILS = ['工房', '商会', '製作所', 'ラボ', 'ストア', 'プロダクツ', 'ワークス', '堂', 'デザイン', 'マート', 'ファクトリー', 'ブランズ', 'クラフト', 'ホーム', 'ライフ', 'フーズ', 'テック', 'スタイル', 'アンドコー', 'ネイチャー']
export const BRANDS: string[] = BRAND_HEADS.flatMap((h) => BRAND_TAILS.map((t) => `${h}${t}`))

// custom エディタで選ぶ仕入先(600 件)
const PREFS = ['北海道', '青森', '宮城', '東京', '神奈川', '埼玉', '千葉', '愛知', '大阪', '京都', '兵庫', '広島', '福岡', '沖縄', '新潟', '静岡', '長野', '岐阜', '岡山', '熊本']
const KINDS = ['物産', '卸', '商事', '流通', '問屋', 'トレーディング', '産業', '販売', '貿易', '倉庫']
export type Supplier = { code: string; name: string }
export const SUPPLIERS: Supplier[] = PREFS.flatMap((p, i) =>
  KINDS.flatMap((k, j) => [1, 2, 3].map((n) => ({ code: `S${String(i * 30 + j * 3 + n).padStart(4, '0')}`, name: `${p}${k}${n === 1 ? '' : n === 2 ? '第二' : '第三'}` }))),
)
export const SUPPLIER_BY_CODE = new Map(SUPPLIERS.map((s) => [s.code, s]))

function createRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, v: readonly T[]): T => v[Math.floor(r() * v.length)]!

function janCheck(d12: string) {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3)
  return String((10 - (sum % 10)) % 10)
}

export function createProduct(n: number, category: string, r = createRandom(n * 7919)): Product {
  const base = pick(r, NAMES[category] ?? ['商品'])
  const d12 = '49' + String(Math.floor(r() * 1e10)).padStart(10, '0')
  const month = 1 + Math.floor(r() * 12)
  const day = 1 + Math.floor(r() * 28)
  const year = 2020 + Math.floor(r() * 7)
  return {
    kind: 'product',
    id: `P${String(n).padStart(5, '0')}`,
    sku: `SKU-${String(n).padStart(5, '0')}`,
    name: `${base} ${pick(r, VARIANTS)}`,
    category,
    brand: pick(r, BRANDS),
    supplier: pick(r, SUPPLIERS).code,
    price: Math.round((100 + r() * 9900) / 10) * 10,
    stock: Math.floor(r() * 500),
    releasedAt: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    published: r() > 0.2,
    jan: d12 + janCheck(d12),
    hue: Math.floor(r() * 360),
  }
}

export function createRows(total = 5000): Row[] {
  const rows: Row[] = []
  const per = Math.ceil(total / CATEGORIES.length)
  let n = 1
  for (const category of CATEGORIES) {
    rows.push({ kind: 'label', id: `L-${category}`, category })
    for (let i = 0; i < per && n <= total; i++) rows.push(createProduct(n++, category))
  }
  return rows
}

export const isLabel = (row: Row): row is CategoryLabel => row.kind === 'label'

// サムネイル(SVG のデータ URL。色相ごとにキャッシュ)
const thumbCache = new Map<number, string>()
export function thumbnailUrl(hue: number) {
  const h = Math.round(hue / 15) * 15
  let url = thumbCache.get(h)
  if (!url) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="8" fill="hsl(${h} 70% 55%)"/><circle cx="24" cy="20" r="9" fill="hsl(${h} 70% 85%)"/><rect x="10" y="32" width="28" height="6" rx="3" fill="hsl(${h} 70% 85%)"/></svg>`
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`
    thumbCache.set(h, url)
  }
  return url
}
