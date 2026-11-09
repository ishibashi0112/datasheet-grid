import type { NextRequest } from 'next/server';
import type { ServerSideQuery } from '@ishibashi0112/spreadsheet-grid';
import { distinct, logRequest } from '@/lib/db';

const LIMIT = 200;

// GET /api/users/options?column=country&query={...}
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const column = sp.get('column') ?? '';
  let query: ServerSideQuery = {};
  try {
    query = JSON.parse(sp.get('query') ?? '{}');
  } catch {}
  logRequest('OPTIONS', { column, query });
  await new Promise((r) => setTimeout(r, 150));
  const values = distinct(column, query, LIMIT);
  return Response.json({
    options: values.slice(0, LIMIT).map((v) => ({ label: v === '' ? '(Blanks)' : v, value: v })),
    truncated: values.length > LIMIT,
  });
}
