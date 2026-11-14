// 見積書のデータ型と初期データ、品目マスタ(候補検索用)

export type Section = { kind: 'section'; id: string; label: string }
export type Item = {
  kind: 'item'
  id: string
  name: string
  qty: number | null
  unit: string
  price: number | null
  note: string
}
export type Row = Section | Item

export type CatalogItem = { code: string; name: string; unit: string; price: number; category: string }

export const UNITS = ['式', '個', '本', '枚', 'm', 'm2', 'm3', '人工', '台', '日', '箱', 'kg', '箇所'] as const

let seq = 0
export const newId = (prefix = 'r') => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const KOUJI = [
  ['足場組立・解体', 'm2', 1200],
  ['養生シート張り', 'm2', 350],
  ['既存床材撤去', 'm2', 1800],
  ['下地調整(パテ処理)', 'm2', 900],
  ['クロス張替え', 'm2', 1350],
  ['フローリング施工', 'm2', 6800],
  ['電気配線工事', '式', 85000],
  ['照明器具取付', '台', 4500],
  ['給排水配管工事', '式', 120000],
  ['塗装工事(外壁)', 'm2', 2800],
  ['塗装工事(屋根)', 'm2', 3200],
  ['左官工事', 'm2', 4200],
  ['大工工事', '人工', 28000],
  ['内装工事', '人工', 26000],
  ['解体工事', '式', 150000],
  ['防水工事(ウレタン)', 'm2', 5200],
  ['シーリング打替え', 'm', 950],
  ['ガラス交換', '枚', 18000],
  ['建具調整', '箇所', 6500],
  ['美装工事', '式', 45000],
] as const

const ZAIRYO = [
  ['石膏ボード 9.5mm', '枚', 680],
  ['石膏ボード 12.5mm', '枚', 820],
  ['合板 12mm', '枚', 2400],
  ['フローリング材(オーク)', '箱', 14800],
  ['ビニールクロス(量産品)', 'm', 280],
  ['ビニールクロス(1000番台)', 'm', 520],
  ['ボンド(クロス用)', 'kg', 950],
  ['ビス 3.5×32', '箱', 780],
  ['釘 N50', '箱', 650],
  ['断熱材(グラスウール)', '枚', 1450],
  ['塩ビ管 VP40', '本', 1680],
  ['塩ビ管 VU75', '本', 2350],
  ['VVFケーブル 2.0-2C', 'm', 120],
  ['コンセント(埋込)', '個', 380],
  ['スイッチ(片切)', '個', 420],
  ['LED ダウンライト', '台', 6800],
  ['シーリング材(変成シリコン)', '本', 890],
  ['ウレタン防水材', 'kg', 1250],
  ['外壁塗料(シリコン)', 'kg', 1980],
  ['屋根塗料(フッ素)', 'kg', 3600],
  ['マスキングテープ', '個', 180],
  ['養生テープ', '個', 260],
  ['コンクリート(生コン)', 'm3', 18500],
  ['砕石', 'm3', 6200],
  ['角材 30×40', '本', 420],
] as const

const SHOKEIHI = [
  ['現場管理費', '式', 50000],
  ['運搬費', '式', 25000],
  ['産業廃棄物処理費', '式', 38000],
  ['駐車場代', '日', 1500],
  ['交通費', '式', 12000],
  ['仮設トイレ', '日', 800],
  ['諸経費', '式', 30000],
  ['設計費', '式', 80000],
  ['確認申請手数料', '式', 35000],
] as const

export const CATALOG: CatalogItem[] = [
  ...KOUJI.map(([name, unit, price], i) => ({ code: `K-${String(i + 1).padStart(3, '0')}`, name, unit, price, category: '工事' })),
  ...ZAIRYO.map(([name, unit, price], i) => ({ code: `Z-${String(i + 1).padStart(3, '0')}`, name, unit, price, category: '材料' })),
  ...SHOKEIHI.map(([name, unit, price], i) => ({ code: `S-${String(i + 1).padStart(3, '0')}`, name, unit, price, category: '諸経費' })),
]

const item = (name: string, qty: number | null, unit: string, price: number | null, note = ''): Item => ({
  kind: 'item',
  id: newId('i'),
  name,
  qty,
  unit,
  price,
  note,
})

export function createInitialRows(extra = 0): Row[] {
  const rows: Row[] = [
    { kind: 'section', id: 'sec-kouji', label: '工事' },
    item('足場組立・解体', 120, 'm2', 1200, '2 階建て外周'),
    item('既存床材撤去', 32.5, 'm2', 1800),
    item('クロス張替え', 85, 'm2', 1350, 'LDK・洋室 2 室\n天井を含む'),
    item('フローリング施工', 32.5, 'm2', 6800),
    item('電気配線工事', 1, '式', 85000, 'コンセント増設 4 箇所'),
    item('大工工事', 6, '人工', 28000),
    { kind: 'section', id: 'sec-zairyo', label: '材料' },
    item('石膏ボード 12.5mm', 40, '枚', 820),
    item('フローリング材(オーク)', 12, '箱', 14800, '色: ナチュラル'),
    item('ビニールクロス(1000番台)', 95, 'm', 520),
    item('LED ダウンライト', 6, '台', 6800),
    item('VVFケーブル 2.0-2C', 150, 'm', 120),
    { kind: 'section', id: 'sec-shokeihi', label: '諸経費' },
    item('現場管理費', 1, '式', 50000),
    item('運搬費', 1, '式', 25000),
    item('産業廃棄物処理費', 1, '式', 38000, 'マニフェスト発行'),
  ]
  // ?extra=N のとき、材料の区分に N 行足す(スクロールや sticky の確認用)
  if (extra > 0) {
    const at = rows.findIndex((r) => r.kind === 'section' && r.id === 'sec-shokeihi')
    const more: Item[] = []
    for (let i = 0; i < extra; i++) {
      const c = CATALOG[(i * 7) % CATALOG.length]
      const note = i % 3 === 0 ? `指示 ${i}\n詳細は図面 A-${i} を参照\n${i % 2 ? '現場で確認' : ''}`.trim() : ''
      more.push(item(c.name, (i % 9) + 1, c.unit, c.price, note))
    }
    rows.splice(at, 0, ...more)
  }
  return rows
}

// 非同期の候補検索(サーバーの API の代わり)。150〜450ms の遅延、abort 可。
export function searchCatalog(query: string, signal: AbortSignal): Promise<CatalogItem[]> {
  return new Promise((resolve, reject) => {
    const delay = 150 + Math.floor(Math.random() * 300)
    const timer = setTimeout(() => {
      const q = query.trim().toLowerCase()
      const hits = q === '' ? CATALOG.slice(0, 8) : CATALOG.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      resolve(hits.slice(0, 12))
    }, delay)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })
}
