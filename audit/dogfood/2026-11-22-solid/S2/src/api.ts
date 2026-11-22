import type { ServerSideDataSource } from '@ishibashi0112/spreadsheet-grid-solid'

export type User = {
  id: number
  name: string
  email: string
  role: string
  status: string
  department: string
  createdAt: string
  lastLogin: string
  logins: number
  note: string
}

export const ROLES = ['admin', 'editor', 'viewer', 'billing']
export const STATUSES = ['active', 'suspended', 'invited']
export const DEPTS = ['Sales', 'Engineering', 'Support', 'Marketing', 'Finance', 'HR']

export async function fetchUser(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
export async function createUser(body: Partial<User>): Promise<User> {
  const res = await fetch('/api/users', { method: 'POST', body: JSON.stringify(body) })
  return res.json()
}
export async function deleteUser(id: number) {
  await fetch(`/api/users/${id}`, { method: 'DELETE' })
}
export async function setChaos(c: { getFailRate?: number; patchFailRate?: number; getDelay?: number }) {
  const res = await fetch('/api/_chaos', { method: 'POST', body: JSON.stringify(c) })
  return res.json()
}
export async function getChaos() {
  return (await fetch('/api/_chaos')).json()
}

// SSRM のデータソース(モジュールの先頭で 1 回だけ作る)
export const usersDataSource: ServerSideDataSource<User> = {
  getRows: async ({ startIndex, endIndex, query, signal }) => {
    const qs = new URLSearchParams({ start: String(startIndex), end: String(endIndex), query: JSON.stringify(query) })
    const res = await fetch(`/api/users?${qs}`, { signal })
    if (!res.ok) throw new Error(`GET /api/users failed: HTTP ${res.status}`)
    return res.json()
  },
  updateRows: async ({ updates }) => {
    const body = {
      updates: updates.map((u) => ({
        id: u.rowKey,
        changes: Object.fromEntries(u.changes.map((c) => [c.columnKey, c.newValue])),
      })),
    }
    const res = await fetch('/api/users', { method: 'PATCH', body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`PATCH /api/users failed: HTTP ${res.status}`)
    const json = (await res.json()) as { rows: User[] }
    return { rows: json.rows }
  },
  initialRowCount: 50_000,
  blockSize: 100,
}
