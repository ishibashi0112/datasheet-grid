import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const d = db();
  return Response.json({ failReads: d.failReads, failWriteRate: d.failWriteRate, count: d.users.length, log: d.log });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { failReads?: boolean; failWriteRate?: number; clearLog?: boolean };
  const d = db();
  if (typeof body.failReads === 'boolean') d.failReads = body.failReads;
  if (typeof body.failWriteRate === 'number') d.failWriteRate = body.failWriteRate;
  if (body.clearLog) d.log = [];
  return Response.json({ failReads: d.failReads, failWriteRate: d.failWriteRate });
}
