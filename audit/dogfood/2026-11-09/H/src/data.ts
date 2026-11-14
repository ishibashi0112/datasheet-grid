export type Status = '未着手' | '進行中' | 'レビュー中' | '完了' | '保留'
export type Priority = '高' | '中' | '低'

export type Subtask = {
  id: string
  title: string
  owner: string
  hours: number | null
  done: boolean
}

export type Task = {
  id: string
  wbs: string
  title: string
  phase: string
  assignee: string
  status: Status
  priority: Priority
  start: string
  due: string
  estimate: number | null
  progress: number | null
  note: string
  subtasks: Subtask[]
}

export const STATUSES: Status[] = ['未着手', '進行中', 'レビュー中', '完了', '保留']
export const PRIORITIES: Priority[] = ['高', '中', '低']
export const PHASES = ['要件定義', '基本設計', '詳細設計', '実装', '結合テスト', '受入テスト', 'リリース']
export const ASSIGNEES = [
  '佐藤 健',
  '鈴木 花子',
  '高橋 誠',
  '田中 美咲',
  '伊藤 翔',
  '渡辺 結衣',
  '山本 大輔',
  '中村 さくら',
  '小林 拓海',
  '加藤 陽菜',
  '吉田 蓮',
  '山田 葵',
]

const VERBS = ['画面', 'API', 'バッチ', '帳票', 'DB', '認証', '通知', '検索', 'CSV 取込', '権限', '監査ログ', '請求']
const ACTIONS = ['の設計', 'の実装', 'のレビュー', 'の単体テスト', 'の結合テスト', 'の仕様確認', 'の改修', 'の性能改善', 'の不具合修正']

// 決まった乱数(再読み込みしても同じデータ)。
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`

export function generateTasks(count = 3000): Task[] {
  const rand = mulberry32(20261109)
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)] as T
  const base = new Date(2026, 9, 1)
  const tasks: Task[] = []
  for (let i = 0; i < count; i++) {
    const phaseIndex = Math.floor((i / count) * PHASES.length)
    const status = pick(STATUSES)
    const startOffset = Math.floor(rand() * 90)
    const length = 1 + Math.floor(rand() * 20)
    const start = new Date(base)
    start.setDate(start.getDate() + startOffset)
    const due = new Date(start)
    due.setDate(due.getDate() + length)
    const progress = status === '完了' ? 100 : status === '未着手' ? 0 : Math.floor(rand() * 10) * 10
    const subCount = Math.floor(rand() * 6)
    const assignee = pick(ASSIGNEES)
    const subtasks: Subtask[] = []
    for (let s = 0; s < subCount; s++) {
      subtasks.push({
        id: `T-${pad(i + 1, 5)}-${s + 1}`,
        title: `${pick(['調査', '作業', '確認', '修正', '資料作成'])} ${s + 1}`,
        owner: rand() < 0.7 ? assignee : pick(ASSIGNEES),
        hours: Math.round(rand() * 16) / 2,
        done: rand() < 0.4,
      })
    }
    tasks.push({
      id: `T-${pad(i + 1, 5)}`,
      wbs: `${phaseIndex + 1}.${Math.floor(i / 25) % 40 + 1}.${(i % 25) + 1}`,
      title: `${pick(VERBS)}${pick(ACTIONS)}`,
      phase: PHASES[phaseIndex] ?? 'リリース',
      assignee,
      status,
      priority: pick(PRIORITIES),
      start: toDate(start),
      due: toDate(due),
      estimate: Math.round((1 + rand() * 39) * 2) / 2,
      progress,
      note: rand() < 0.15 ? '顧客確認待ち' : '',
      subtasks,
    })
  }
  return tasks
}
