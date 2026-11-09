'use client';

import { useState } from 'react';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/shadcn.css';
import { columns } from '../../users/columns';
import type { User } from '@/lib/types';

function makeRows(n: number): User[] {
  const out: User[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({ id: i, name: `User ${i}`, email: `user${i}@example.com`, role: 'member', plan: (['free', 'pro', 'business', 'enterprise'] as const)[i % 4], status: (['active', 'invited', 'suspended'] as const)[i % 3], country: 'US', seats: i % 50, mrr: (i % 50) * 12, signedUpAt: '2024-01-01', lastActiveAt: '2025-01-01', notes: i % 5 ? '' : 'VIP customer' });
  }
  return out;
}

export function Grid() {
  const [rows, setRows] = useState<User[]>(() => makeRows(50_000));
  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col p-4">
      <div className="min-h-0 flex-1">
        <SpreadsheetGrid<User> columns={columns} rows={rows} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height="100%" theme="class" localeText={localeTextEn} enableRowSelection />
      </div>
    </div>
  );
}
