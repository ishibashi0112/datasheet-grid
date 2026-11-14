import type { NextRequest } from 'next/server';
import type { ServerSideQuery } from '@ishibashi0112/spreadsheet-grid';
import { db, logRequest, runQuery } from '@/lib/db';
import { PLANS, ROLES, STATUSES, type User } from '@/lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseQuery(raw: string | null): ServerSideQuery {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ServerSideQuery;
  } catch {
    return {};
  }
}

// GET /api/users?start=0&end=100&query={...}
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const start = Math.max(0, Number(sp.get('start') ?? 0));
  const end = Math.max(start, Number(sp.get('end') ?? start + 100));
  const query = parseQuery(sp.get('query'));
  logRequest('GET', { start, end, query });
  const d = db();
  await sleep(120 + Math.random() * 200);
  if (d.failReads) {
    return Response.json({ error: 'Service temporarily unavailable' }, { status: 500 });
  }
  const rows = runQuery(query);
  return Response.json({ rows: rows.slice(start, end), totalRowCount: rows.length });
}

type Patch = { id: number; changes: Partial<User> };

const EDITABLE: (keyof User)[] = ['name', 'email', 'role', 'plan', 'status', 'country', 'seats', 'mrr', 'signedUpAt', 'lastActiveAt', 'notes'];

// PATCH /api/users  { patches: [{ id, changes }] }
export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as { patches: Patch[] };
  logRequest('PATCH', body);
  const d = db();
  await sleep(300 + Math.random() * 500);
  if (Math.random() < d.failWriteRate || JSON.stringify(body).includes('#fail')) {
    return Response.json({ error: 'Random write failure' }, { status: 500 });
  }
  const out: User[] = [];
  for (const p of body.patches) {
    const u = d.users.find((x) => x.id === p.id);
    if (!u) return Response.json({ error: `User ${p.id} not found` }, { status: 404 });
    for (const [k, v] of Object.entries(p.changes)) {
      if (!EDITABLE.includes(k as keyof User)) continue;
      if (k === 'role' && !ROLES.includes(v as never)) return Response.json({ error: `bad role ${v}` }, { status: 400 });
      if (k === 'plan' && !PLANS.includes(v as never)) return Response.json({ error: `bad plan ${v}` }, { status: 400 });
      if (k === 'status' && !STATUSES.includes(v as never)) return Response.json({ error: `bad status ${v}` }, { status: 400 });
      (u as Record<string, unknown>)[k] = typeof v === 'string' && k !== 'notes' ? v.trim() : v;
    }
    if (u.email) u.email = u.email.toLowerCase(); // server normalizes
    if ('seats' in p.changes || 'plan' in p.changes) {
      const price = u.plan === 'free' ? 0 : u.plan === 'pro' ? 12 : u.plan === 'business' ? 29 : 59;
      const seats = Number(u.seats);
      u.mrr = Number.isFinite(seats) ? seats * price : 0; // server recomputes MRR
    }
    out.push({ ...u });
  }
  return Response.json({ rows: out });
}

// POST /api/users  { name, email, plan, role }
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<User>;
  logRequest('POST', body);
  const d = db();
  await sleep(200);
  if (!body.name || !body.email) return Response.json({ error: 'name and email are required' }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const user: User = {
    id: d.nextId++,
    name: body.name,
    email: body.email.toLowerCase(),
    role: (body.role as User['role']) ?? 'member',
    plan: (body.plan as User['plan']) ?? 'free',
    status: 'invited',
    country: body.country ?? 'US',
    seats: 1,
    mrr: 0,
    signedUpAt: today,
    lastActiveAt: null,
    notes: '',
  };
  d.users.unshift(user);
  return Response.json({ user });
}

// DELETE /api/users  { ids: number[] }
export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { ids: number[] };
  logRequest('DELETE', body);
  const d = db();
  await sleep(200);
  const ids = new Set(body.ids);
  const before = d.users.length;
  d.users = d.users.filter((u) => !ids.has(u.id));
  return Response.json({ deleted: before - d.users.length });
}
