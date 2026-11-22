// ブラウザ内の擬似 API。200〜1,500ms の遅延と、ときどき失敗する。
// 台本から決めた動きにするため、window.__api で遅延・失敗率・次の 1 回の失敗を変えられる。

export type Priority = '高' | '中' | '低'
export type Status = '未着手' | '進行中' | 'レビュー' | '完了'

export type Task = {
  id: string
  projectId: string
  title: string
  assignee: string | null
  due: string | null
  priority: Priority
  estimate: number | null
  status: Status
  memo: string
  version: number
}

export type Milestone = {
  id: string
  projectId: string
  name: string
  dueDate: string
  owner: string
  progress: number
}

export type Project = { id: string; name: string; taskCount: number }

export const MEMBERS = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'] as const
export const PRIORITIES: Priority[] = ['高', '中', '低']
export const STATUSES: Status[] = ['未着手', '進行中', 'レビュー', '完了']

type ApiConfig = {
  minDelay: number
  maxDelay: number
  loadFailRate: number
  saveFailRate: number
  failNextLoad: number
  failNextSave: number
  log: string[]
}

declare global {
  interface Window {
    __api: ApiConfig
  }
}

const params = new URLSearchParams(location.search)
export const api: ApiConfig = (window.__api = {
  minDelay: Number(params.get('minDelay') ?? 200),
  maxDelay: Number(params.get('maxDelay') ?? 1500),
  loadFailRate: Number(params.get('loadFail') ?? 0.05),
  saveFailRate: Number(params.get('saveFail') ?? 0.1),
  failNextLoad: 0,
  failNextSave: 0,
  log: [],
})

const PROJECTS: Project[] = [
  { id: 'web', name: 'Web リニューアル', taskCount: 60 },
  { id: 'app', name: 'モバイルアプリ', taskCount: 400 },
  { id: 'infra', name: '基盤移行', taskCount: 3000 },
]

const TITLES = ['画面設計', 'API 実装', 'テスト作成', 'レビュー対応', '不具合修正', '資料作成', '打ち合わせ', '性能改善', '移行手順', 'リリース準備']

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const db = new Map<string, Task[]>()
const milestoneDb = new Map<string, Milestone[]>()

for (const [pi, p] of PROJECTS.entries()) {
  const rnd = seeded(pi + 7)
  const tasks: Task[] = []
  for (let i = 0; i < p.taskCount; i++) {
    const day = 1 + Math.floor(rnd() * 60)
    const d = new Date(2026, 10, day)
    tasks.push({
      id: `${p.id}-${i + 1}`,
      projectId: p.id,
      title: `${TITLES[i % TITLES.length]} ${i + 1}`,
      assignee: rnd() < 0.1 ? null : MEMBERS[Math.floor(rnd() * MEMBERS.length)]!,
      due: rnd() < 0.1 ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      priority: PRIORITIES[Math.floor(rnd() * 3)]!,
      estimate: rnd() < 0.1 ? null : Math.round(rnd() * 16 * 2) / 2,
      status: STATUSES[Math.floor(rnd() * 4)]!,
      memo: rnd() < 0.3 ? '確認待ち' : '',
      version: 1,
    })
  }
  db.set(p.id, tasks)
  milestoneDb.set(
    p.id,
    Array.from({ length: 6 }, (_, i) => ({
      id: `${p.id}-m${i + 1}`,
      projectId: p.id,
      name: `フェーズ ${i + 1}`,
      dueDate: `2026-${String(11 + Math.floor(i / 3)).padStart(2, '0')}-${String(5 + (i % 3) * 10).padStart(2, '0')}`,
      owner: MEMBERS[i % MEMBERS.length]!,
      progress: Math.min(100, i * 20),
    })),
  )
}

const wait = () => new Promise<void>((r) => setTimeout(r, api.minDelay + Math.random() * (api.maxDelay - api.minDelay)))

function shouldFail(kind: 'load' | 'save') {
  if (kind === 'load' && api.failNextLoad > 0) {
    api.failNextLoad--
    return true
  }
  if (kind === 'save' && api.failNextSave > 0) {
    api.failNextSave--
    return true
  }
  return Math.random() < (kind === 'load' ? api.loadFailRate : api.saveFailRate)
}

export async function fetchProjects(): Promise<Project[]> {
  await wait()
  return PROJECTS.map((p) => ({ ...p, taskCount: db.get(p.id)!.length }))
}

export async function fetchTasks(projectId: string): Promise<Task[]> {
  api.log.push(`load:${projectId}:start`)
  await wait()
  if (shouldFail('load')) {
    api.log.push(`load:${projectId}:fail`)
    throw new Error(`タスクを読み込めませんでした(${projectId})`)
  }
  const rows = db.get(projectId)
  if (!rows) throw new Error(`プロジェクトがありません: ${projectId}`)
  api.log.push(`load:${projectId}:ok`)
  return rows.map((r) => ({ ...r }))
}

export async function fetchMilestones(projectId: string): Promise<Milestone[]> {
  await wait()
  return (milestoneDb.get(projectId) ?? []).map((m) => ({ ...m }))
}

export async function saveTasks(projectId: string, changed: Task[]): Promise<Task[]> {
  api.log.push(`save:${projectId}:${changed.length}:start`)
  await wait()
  if (shouldFail('save')) {
    api.log.push(`save:${projectId}:fail`)
    throw new Error('保存に失敗しました(サーバーが混み合っています)')
  }
  const rows = db.get(projectId)!
  const byId = new Map(rows.map((r, i) => [r.id, i]))
  const saved: Task[] = []
  for (const c of changed) {
    const i = byId.get(c.id)
    const next = { ...c, version: (i === undefined ? 0 : rows[i]!.version) + 1 }
    if (i === undefined) rows.push(next)
    else rows[i] = next
    saved.push(next)
  }
  api.log.push(`save:${projectId}:ok`)
  return saved
}

export async function saveMilestones(projectId: string, next: Milestone[]): Promise<void> {
  await wait()
  milestoneDb.set(projectId, next.map((m) => ({ ...m })))
}

/** 変わった行だけを取り出す(参照の違いで見る) */
export function changedRows<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const prevById = new Map(prev.map((r) => [r.id, r]))
  return next.filter((r) => prevById.get(r.id) !== r)
}

/** 台本から DB の中身を読む */
;(window as unknown as { __db: unknown }).__db = { tasks: db, milestones: milestoneDb }
