export type InspectionResult = '良' | '要注意' | '不良' | '対象外'

export type Inspection = {
  id: string
  area: string
  item: string
  result: InspectionResult | null
  value: number | null
  unit: string
  memo: string
  photo: boolean
  inspectedAt: string | null
  inspector: string
}

const floors = ['B1', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '屋上']
const rooms = ['機械室', '電気室', '廊下', '階段', 'トイレ', '給湯室', '事務室', 'ポンプ室']
const items: { item: string; unit: string; min: number; max: number }[] = [
  { item: '消火器の圧力', unit: 'MPa', min: 0.7, max: 0.98 },
  { item: '非常灯の点灯', unit: '', min: 0, max: 0 },
  { item: '照度', unit: 'lx', min: 150, max: 800 },
  { item: '室温', unit: '℃', min: 18, max: 32 },
  { item: '配管の漏れ', unit: '', min: 0, max: 0 },
  { item: '手すりのぐらつき', unit: '', min: 0, max: 0 },
  { item: '騒音', unit: 'dB', min: 35, max: 80 },
  { item: '分電盤の温度', unit: '℃', min: 20, max: 55 },
]
const inspectors = ['佐藤', '鈴木', '高橋', '田中', '伊藤']
const results: InspectionResult[] = ['良', '良', '良', '良', '要注意', '不良', '対象外']

// 決まった乱数(毎回同じデータ)
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createInspections(): Inspection[] {
  const rand = mulberry32(42)
  const rows: Inspection[] = []
  let n = 1
  for (const floor of floors) {
    for (const room of rooms) {
      for (const it of items) {
        const done = rand() < 0.6
        const result = done ? results[Math.floor(rand() * results.length)] : null
        const hasValue = it.unit !== '' && done
        const value = hasValue ? Math.round((it.min + rand() * (it.max - it.min)) * 100) / 100 : null
        const day = 1 + Math.floor(rand() * 8)
        rows.push({
          id: `INS-${String(n).padStart(4, '0')}`,
          area: `${floor} ${room}`,
          item: it.item,
          result,
          value,
          unit: it.unit,
          memo: result === '不良' ? '交換が必要\n業者へ連絡済み' : result === '要注意' ? '次回も確認' : '',
          photo: result === '不良' ? rand() < 0.7 : false,
          inspectedAt: done ? `2026-11-${String(day).padStart(2, '0')}` : null,
          inspector: done ? inspectors[Math.floor(rand() * inspectors.length)] : '',
        })
        n++
      }
    }
  }
  return rows
}
