// メモリ上の 50,000 人のユーザーと、その API(範囲・ソート・フィルター・書き戻し)
const ROLES = ['admin', 'editor', 'viewer', 'billing']
const STATUSES = ['active', 'suspended', 'invited']
const DEPTS = ['Sales', 'Engineering', 'Support', 'Marketing', 'Finance', 'HR', '']
const FIRST = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj', 'Olivia', 'Peggy', 'Rupert', 'Sybil', 'Trent', 'Victor', 'Walter', 'Yuki']
const LAST = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Garcia', 'Lee', 'Walker', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams']

let seed = 42
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (a) => a[Math.floor(rand() * a.length)]
const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export const users = []
let nextId = 1
function makeUser() {
  const id = nextId++
  const first = pick(FIRST), last = pick(LAST)
  const created = new Date(Date.UTC(2022, 0, 1) + Math.floor(rand() * 1400) * 86400000)
  const lastLogin = rand() < 0.1 ? '' : dateStr(new Date(created.getTime() + Math.floor(rand() * 300) * 86400000))
  return {
    id,
    name: `${first} ${last}`,
    email: `${first}.${last}${id}@example.com`.toLowerCase(),
    role: pick(ROLES),
    status: pick(STATUSES),
    department: pick(DEPTS),
    createdAt: dateStr(created),
    lastLogin,
    logins: Math.floor(rand() * 2000),
    note: '',
  }
}
for (let i = 0; i < 50_000; i++) users.push(makeUser())

export const chaos = { getFailRate: 0, patchFailRate: 0.1, getDelay: 150 }
export const log = []

const norm = (v) => (v == null ? '' : String(v))
function todayStr() { return dateStr(new Date()) }
function addDays(s, n) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return dateStr(d) }

function matchNumberParsed(parsed, v) {
  if (!parsed) return true
  const blank = v === null || v === undefined || v === ''
  if (parsed.mode === 'blank') return blank
  if (parsed.mode === 'notBlank') return !blank
  if (blank) return false
  const n = Number(v)
  if (parsed.mode === 'range') return n >= parsed.min && n <= parsed.max
  switch (parsed.operator) {
    case '>': return n > parsed.value
    case '>=': return n >= parsed.value
    case '<': return n < parsed.value
    case '<=': return n <= parsed.value
    case '=': return n === parsed.value
    case '!=': return n !== parsed.value
  }
  return true
}
function matchSet(set, v) {
  if (!set) return true
  const s = norm(v)
  const has = set.values.includes(s)
  return (set.mode ?? 'include') === 'include' ? has : !has
}
function matchDateCond(c, v) {
  if (!c) return true
  const s = norm(v)
  if (c.mode === 'blank') return s === ''
  if (c.mode === 'notBlank') return s !== ''
  if (s === '') return false
  switch (c.mode) {
    case 'range': return (!c.from || s >= c.from) && (!c.to || s <= c.to)
    case 'onOrAfter': return s >= c.value
    case 'onOrBefore': return s <= c.value
    case 'equals': return s === c.value
    case 'notEquals': return s !== c.value
    case 'preset': {
      const t = todayStr()
      if (c.preset === 'today') return s === t
      if (c.preset === 'thisMonth') return s.slice(0, 7) === t.slice(0, 7)
      if (c.preset === 'last30days') return s >= addDays(t, -29) && s <= t
      return true
    }
  }
  return true
}
function matchText(c, v) {
  if (!c) return true
  const s = norm(v).toLowerCase()
  if (c.mode === 'blank') return s === ''
  if (c.mode === 'notBlank') return s !== ''
  const q = String(c.value).toLowerCase()
  if (c.mode === 'contains') return s.includes(q)
  if (c.mode === 'equals') return s === q
  if (c.mode === 'startsWith') return s.startsWith(q)
  if (c.mode === 'endsWith') return s.endsWith(q)
  return true
}
export function matchFilter(f, v) {
  switch (f.kind) {
    case 'text': case 'date': return norm(v).toLowerCase().includes(String(f.value).toLowerCase())
    case 'select': return norm(v) === f.value
    case 'set': return matchSet(f, v)
    case 'number': return f.parsed ? matchNumberParsed(f.parsed, v) : norm(v).includes(f.raw)
    case 'numberSet': return matchNumberParsed(f.condition, v) && matchSet(f.set, v)
    case 'textSet': return matchText(f.condition, v) && matchSet(f.set, v)
    case 'dateSet': return matchDateCond(f.condition, v) && matchSet(f.set, v)
    default: return true
  }
}

const SEARCH_KEYS = ['name', 'email', 'role', 'status', 'department', 'note']
export function applyQuery(query) {
  let list = users
  const g = (query?.globalText ?? '').trim().toLowerCase()
  if (g) list = list.filter((u) => SEARCH_KEYS.some((k) => norm(u[k]).toLowerCase().includes(g)) || String(u.id) === g)
  const cf = query?.columnFilters ?? {}
  for (const [key, f] of Object.entries(cf)) list = list.filter((u) => matchFilter(f, u[key]))
  const sort = query?.sort ?? []
  if (sort.length) {
    list = [...list].sort((a, b) => {
      for (const s of sort) {
        const av = a[s.columnKey], bv = b[s.columnKey]
        const ae = av === '' || av == null, be = bv === '' || bv == null
        if (ae && be) continue
        if (ae) return 1
        if (be) return -1
        const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
        if (c !== 0) return s.direction === 'desc' ? -c : c
      }
      return a.id - b.id
    })
  }
  return list
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function readBody(req) {
  let s = ''
  for await (const c of req) s += c
  return s ? JSON.parse(s) : {}
}
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function handleApi(req, res, url) {
  const p = url.pathname
  if (p === '/api/_chaos') {
    if (req.method === 'POST') Object.assign(chaos, await readBody(req))
    return send(res, 200, chaos)
  }
  if (p === '/api/_log') {
    if (req.method === 'DELETE') log.length = 0
    return send(res, 200, log)
  }
  if (p === '/api/users' && req.method === 'GET') {
    const start = Number(url.searchParams.get('start') ?? 0)
    const end = Number(url.searchParams.get('end') ?? 100)
    const query = JSON.parse(url.searchParams.get('query') ?? '{}')
    log.push({ t: Date.now(), method: 'GET', start, end, query })
    await sleep(chaos.getDelay)
    if (rand() < chaos.getFailRate) return send(res, 503, { error: 'unavailable' })
    const list = applyQuery(query)
    return send(res, 200, { rows: list.slice(start, end), totalRowCount: list.length })
  }
  if (p === '/api/users' && req.method === 'PATCH') {
    const body = await readBody(req)
    log.push({ t: Date.now(), method: 'PATCH', body })
    await sleep(300 + Math.floor(Math.random() * 500))
    if (Math.random() < chaos.patchFailRate) return send(res, 500, { error: 'write failed' })
    const out = []
    for (const u of body.updates ?? []) {
      const user = users.find((x) => x.id === u.id)
      if (!user) return send(res, 404, { error: 'not found ' + u.id })
      for (const [k, v] of Object.entries(u.changes)) if (k !== 'id') user[k] = v
      out.push(user)
    }
    return send(res, 200, { rows: out })
  }
  if (p === '/api/users' && req.method === 'POST') {
    const body = await readBody(req)
    const u = makeUser()
    Object.assign(u, body, { id: u.id })
    users.unshift(u)
    log.push({ t: Date.now(), method: 'POST', id: u.id })
    return send(res, 200, u)
  }
  const m = p.match(/^\/api\/users\/(\d+)$/)
  if (m) {
    const id = Number(m[1])
    const i = users.findIndex((x) => x.id === id)
    if (req.method === 'DELETE') {
      if (i >= 0) users.splice(i, 1)
      log.push({ t: Date.now(), method: 'DELETE', id })
      return send(res, 200, { ok: i >= 0 })
    }
    if (i < 0) return send(res, 404, { error: 'not found' })
    return send(res, 200, users[i])
  }
  return send(res, 404, { error: 'no route' })
}
