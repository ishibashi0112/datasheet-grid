import 'server-only';
import type {
  ColumnFilterValue,
  ParsedDateFilter,
  ParsedNumberFilter,
  ParsedTextFilter,
  ServerSideQuery,
} from '@ishibashi0112/spreadsheet-grid';
import { PLANS, ROLES, STATUSES, type User } from './types';

// ---- tiny deterministic PRNG ----
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'James', 'Isabella', 'Lucas', 'Mia', 'Mason', 'Amelia', 'Ethan', 'Harper', 'Logan', 'Evelyn', 'Aiden', 'Yuki', 'Hiro', 'Sakura', 'Kenji', 'Priya', 'Arjun', 'Chen', 'Wei', 'Fatima', 'Omar', 'Lena', 'Mateo'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Tanaka', 'Suzuki', 'Sato', 'Kim', 'Lee', 'Patel', 'Singh', 'Nguyen', 'Müller', 'Schmidt', 'Rossi', 'Dubois', 'Silva', 'Kowalski'];
const COUNTRIES = ['US', 'JP', 'DE', 'GB', 'FR', 'IN', 'BR', 'CA', 'AU', 'KR', 'NL', 'SE', 'ES', 'IT', 'MX', 'SG'];
const NOTES = ['', '', '', '', 'VIP customer', 'Asked for invoice billing', 'Churn risk', 'Migrating from competitor', 'Needs SSO', 'Renewal in Q1', '=HYPERLINK("http://evil")'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function generate(count: number): User[] {
  const rand = mulberry32(42);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const base = Date.UTC(2022, 0, 1);
  const now = Date.UTC(2026, 10, 9);
  const out: User[] = [];
  for (let i = 1; i <= count; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const plan = pick(PLANS);
    const seats = plan === 'free' ? 1 : 1 + Math.floor(rand() * (plan === 'enterprise' ? 500 : 50));
    const price = plan === 'free' ? 0 : plan === 'pro' ? 12 : plan === 'business' ? 29 : 59;
    const signed = base + Math.floor(rand() * (now - base));
    const last1 = rand() < 0.08 ? null : signed + Math.floor(rand() * (now - signed));
    out.push({
      id: i,
      name: `${first} ${last}`,
      email: `${first}.${last}${i}@example.com`.toLowerCase(),
      role: i % 97 === 0 ? 'owner' : pick(ROLES.slice(1)),
      plan,
      status: rand() < 0.8 ? 'active' : rand() < 0.5 ? 'invited' : 'suspended',
      country: pick(COUNTRIES),
      seats,
      mrr: seats * price,
      signedUpAt: isoDate(new Date(signed)),
      lastActiveAt: last1 === null ? null : isoDate(new Date(last1)),
      notes: pick(NOTES),
    });
  }
  return out;
}

type Db = {
  users: User[];
  nextId: number;
  failReads: boolean;
  failWriteRate: number;
  log: { at: number; method: string; detail: unknown }[];
};

const g = globalThis as unknown as { __usersDb?: Db };
export function db(): Db {
  if (!g.__usersDb) {
    const users = generate(50_000);
    g.__usersDb = { users, nextId: users.length + 1, failReads: false, failWriteRate: 0.1, log: [] };
  }
  return g.__usersDb;
}

export function logRequest(method: string, detail: unknown) {
  const d = db();
  d.log.push({ at: Date.now(), method, detail });
  if (d.log.length > 500) d.log.splice(0, d.log.length - 500);
}

// ---- query evaluation ----
type Getter = (u: User) => unknown;
const getters: Record<string, Getter> = {
  id: (u) => u.id,
  name: (u) => u.name,
  email: (u) => u.email,
  role: (u) => u.role,
  plan: (u) => u.plan,
  status: (u) => u.status,
  country: (u) => u.country,
  seats: (u) => u.seats,
  mrr: (u) => u.mrr,
  signedUpAt: (u) => u.signedUpAt,
  lastActiveAt: (u) => u.lastActiveAt,
  notes: (u) => u.notes,
};
const GLOBAL_COLUMNS = ['name', 'email', 'role', 'plan', 'status', 'country', 'notes'];

function isBlank(v: unknown) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}
function str(v: unknown) {
  return isBlank(v) ? '' : String(v);
}

function matchNumber(v: unknown, p: ParsedNumberFilter): boolean {
  if (p.mode === 'blank') return isBlank(v);
  if (p.mode === 'notBlank') return !isBlank(v);
  if (isBlank(v)) return false;
  const n = Number(v);
  if (!Number.isFinite(n)) return false;
  if (p.mode === 'range') return n >= p.min && n <= p.max;
  switch (p.operator) {
    case '>': return n > p.value;
    case '>=': return n >= p.value;
    case '<': return n < p.value;
    case '<=': return n <= p.value;
    case '=': return n === p.value;
    case '!=': return n !== p.value;
  }
}

function matchText(v: unknown, p: ParsedTextFilter): boolean {
  if (p.mode === 'blank') return isBlank(v);
  if (p.mode === 'notBlank') return !isBlank(v);
  const s = str(v).toLowerCase();
  const q = p.value.toLowerCase();
  switch (p.mode) {
    case 'contains': return s.includes(q);
    case 'equals': return s === q;
    case 'startsWith': return s.startsWith(q);
    case 'endsWith': return s.endsWith(q);
  }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(dt);
}

function resolvePreset(preset: string): { from?: string; to?: string } | null {
  const t = todayIso();
  if (preset === 'today') return { from: t, to: t };
  if (preset === 'thisMonth') return { from: t.slice(0, 8) + '01', to: t };
  if (preset === 'last30days') return { from: addDays(t, -29), to: t };
  if (preset === 'last7days') return { from: addDays(t, -6), to: t };
  if (preset === 'thisYear') return { from: t.slice(0, 4) + '-01-01', to: t };
  return null; // unknown => no condition
}

function matchDate(v: unknown, p: ParsedDateFilter): boolean {
  if (p.mode === 'blank') return isBlank(v);
  if (p.mode === 'notBlank') return !isBlank(v);
  const s = str(v).slice(0, 10);
  if (p.mode === 'preset') {
    const r = resolvePreset(p.preset);
    if (!r) return true;
    if (!s) return false;
    return (!r.from || s >= r.from) && (!r.to || s <= r.to);
  }
  if (!s) return false;
  if (p.mode === 'range') return s >= p.from && s <= p.to;
  switch (p.mode) {
    case 'onOrAfter': return s >= p.value;
    case 'onOrBefore': return s <= p.value;
    case 'equals': return s === p.value;
    case 'notEquals': return s !== p.value;
  }
  return true;
}

function matchSet(v: unknown, set: { mode?: 'include' | 'exclude'; values: string[] } | null, dateKey = false) {
  if (!set) return true;
  let s = str(v);
  if (dateKey) s = s.slice(0, 10);
  const has = set.values.includes(s);
  return (set.mode ?? 'include') === 'include' ? has : !has;
}

export function matchFilter(u: User, key: string, f: ColumnFilterValue): boolean {
  const get = getters[key];
  if (!get) return true;
  const v = get(u);
  switch (f.kind) {
    case 'text':
    case 'date':
      return str(v).toLowerCase().includes(f.value.toLowerCase());
    case 'select':
      return str(v) === f.value;
    case 'set':
      return matchSet(v, f);
    case 'number':
      if (!f.parsed) return str(v).includes(f.raw);
      return matchNumber(v, f.parsed);
    case 'numberSet':
      return (!f.condition || matchNumber(v, f.condition)) && matchSet(v, f.set);
    case 'textSet':
      return (!f.condition || matchText(v, f.condition)) && matchSet(v, f.set);
    case 'dateSet':
      return (!f.condition || matchDate(v, f.condition)) && matchSet(v, f.set, true);
    case 'custom':
      return true;
  }
  return true;
}

export function runQuery(query: ServerSideQuery): User[] {
  const d = db();
  let rows = d.users;
  const gt = query.globalText?.trim().toLowerCase();
  const cf = query.columnFilters ?? {};
  const keys = Object.keys(cf);
  if (gt || keys.length) {
    rows = rows.filter((u) => {
      if (gt && !GLOBAL_COLUMNS.some((k) => str(getters[k](u)).toLowerCase().includes(gt))) return false;
      for (const k of keys) if (!matchFilter(u, k, cf[k])) return false;
      return true;
    });
  }
  const sort = query.sort ?? [];
  if (sort.length) {
    rows = [...rows].sort((a, b) => {
      for (const s of sort) {
        const get = getters[s.columnKey];
        if (!get) continue;
        const va = get(a);
        const vb = get(b);
        const ba = isBlank(va);
        const bb = isBlank(vb);
        if (ba && bb) continue;
        if (ba) return 1; // blanks last in both directions
        if (bb) return -1;
        let c = 0;
        if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
        else c = String(va).localeCompare(String(vb));
        if (c !== 0) return s.direction === 'desc' ? -c : c;
      }
      return a.id - b.id;
    });
  }
  return rows;
}

export function distinct(key: string, query: ServerSideQuery, limit: number) {
  const rows = runQuery(query);
  const get = getters[key];
  const seen = new Set<string>();
  for (const u of rows) {
    seen.add(str(get(u)));
    if (seen.size > limit) break;
  }
  return [...seen].sort();
}
