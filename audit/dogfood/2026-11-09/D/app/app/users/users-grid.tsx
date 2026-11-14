'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  SpreadsheetGrid,
  type GridStatePatch,
  type RowSelectionModel,
  type ServerSideDataSource,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/shadcn.css';
import { columns } from './columns';
import { PLANS, type User } from '@/lib/types';
import { parseUrlState, toSearchString, type UrlGridState } from '@/lib/url-state';

type Toast = { id: number; tone: 'error' | 'info' | 'ok'; text: string };

function sameState(a: UrlGridState, b: UrlGridState) {
  return toSearchString(a) === toSearchString(b);
}

export function UsersGrid({ initialUrlState }: { initialUrlState: UrlGridState }) {
  const gridRef = useRef<SpreadsheetGridHandle<User>>(null);
  const searchParams = useSearchParams();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selection, setSelection] = useState<RowSelectionModel>({ type: 'include', rowKeys: [] });
  const [outage, setOutage] = useState(false);
  const [failRate, setFailRate] = useState(0.1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', plan: 'free' });
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const initialState = useMemo<Omit<GridStatePatch, 'columns'>>(
    () => ({
      sort: initialUrlState.sort,
      filters: { globalText: initialUrlState.globalText, columnFilters: initialUrlState.columnFilters },
    }),
    [initialUrlState],
  );

  const dataSource = useMemo<ServerSideDataSource<User>>(
    () => ({
      initialRowCount: 50_000,
      blockSize: 100,
      getRows: async ({ startIndex, endIndex, query, signal }) => {
        const sp = new URLSearchParams({ start: String(startIndex), end: String(endIndex), query: JSON.stringify(query) });
        const res = await fetch(`/api/users?${sp}`, { signal });
        if (!res.ok) throw new Error(`GET /api/users failed: ${res.status}`);
        return (await res.json()) as { rows: User[]; totalRowCount: number };
      },
      updateRows: async ({ updates }) => {
        const patches = updates.map((u) => ({
          id: Number(u.rowKey),
          changes: Object.fromEntries(u.changes.map((c) => [c.columnKey, c.newValue])),
        }));
        const res = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patches }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `PATCH failed: ${res.status}`);
        }
        const { rows } = (await res.json()) as { rows: User[] };
        return { rows };
      },
    }),
    [],
  );

  // ---- URL <-> grid state ----
  const currentGridUrlState = useCallback((): UrlGridState | null => {
    const s = gridRef.current?.getState();
    if (!s) return null;
    return { sort: s.sort, globalText: s.filters.globalText, columnFilters: s.filters.columnFilters };
  }, []);

  const syncUrlFromGrid = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const st = currentGridUrlState();
      if (!st) return;
      const next = toSearchString(st);
      if (next !== window.location.search) {
        window.history.pushState(null, '', `${window.location.pathname}${next}`);
      }
    }, 400);
  }, [currentGridUrlState]);

  // back / forward: the URL changed but the grid did not
  useEffect(() => {
    const fromUrl = parseUrlState(searchParams);
    const current = currentGridUrlState();
    if (!current || sameState(fromUrl, current)) return;
    gridRef.current?.applyState({
      sort: fromUrl.sort,
      filters: { globalText: fromUrl.globalText, columnFilters: fromUrl.columnFilters },
    });
  }, [searchParams, currentGridUrlState]);

  useEffect(() => () => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
  }, []);

  // ---- debug toggles ----
  const setDebug = async (body: { failReads?: boolean; failWriteRate?: number }) => {
    await fetch('/api/debug', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  };

  // ---- add / delete ----
  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast('error', 'Name and email are required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`POST failed: ${res.status}`);
      const { user } = (await res.json()) as { user: User };
      toast('ok', `Invited ${user.name} (#${user.id})`);
      setForm({ name: '', email: '', plan: 'free' });
      gridRef.current?.refreshServerSide();
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = selection.type === 'include' ? selection.rowKeys.length : null;

  const deleteSelected = async () => {
    if (selection.type !== 'include' || selection.rowKeys.length === 0) {
      toast('error', 'Select specific users to delete (select-all delete is not supported)');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: selection.rowKeys.map(Number) }),
      });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      const { deleted } = (await res.json()) as { deleted: number };
      toast('ok', `Deleted ${deleted} user(s)`);
      setSelection({ type: 'include', rowKeys: [] });
      gridRef.current?.refreshServerSide();
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Manage workspace members and billing.</p>
        </div>
        <form onSubmit={addUser} className="ml-auto flex flex-wrap items-end gap-2" data-testid="add-form">
          <label className="flex flex-col text-xs text-muted-foreground">
            Name
            <input
              data-testid="add-name"
              className="h-8 w-40 rounded-md border bg-background px-2 text-sm text-foreground"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Email
            <input
              data-testid="add-email"
              type="email"
              className="h-8 w-56 rounded-md border bg-background px-2 text-sm text-foreground"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Plan
            <select
              data-testid="add-plan"
              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            data-testid="add-submit"
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Invite user
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          data-testid="delete-selected"
          onClick={deleteSelected}
          disabled={busy || selectedCount === 0}
          className="h-8 rounded-md border px-3 text-destructive disabled:opacity-50"
        >
          Delete selected{selectedCount ? ` (${selectedCount})` : ''}
        </button>
        <button type="button" data-testid="refresh" onClick={() => gridRef.current?.refreshServerSide()} className="h-8 rounded-md border px-3">
          Refresh
        </button>
        <button type="button" data-testid="retry" onClick={() => gridRef.current?.retryServerSideLoads()} className="h-8 rounded-md border px-3">
          Retry failed loads
        </button>
        <label className="ml-4 flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="outage"
            checked={outage}
            onChange={async (e) => {
              setOutage(e.target.checked);
              await setDebug({ failReads: e.target.checked });
            }}
          />
          Simulate API outage
        </label>
        <label className="flex items-center gap-1">
          Write failure rate
          <select
            data-testid="fail-rate"
            className="h-8 rounded-md border bg-background px-2"
            value={failRate}
            onChange={async (e) => {
              const v = Number(e.target.value);
              setFailRate(v);
              await setDebug({ failWriteRate: v });
            }}
          >
            <option value={0}>0%</option>
            <option value={0.1}>10%</option>
            <option value={1}>100%</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1" data-testid="grid-wrap">
        <SpreadsheetGrid<User>
          ref={gridRef}
          ariaLabel="Users"
          columns={columns}
          dataSource={dataSource}
          rowKeyGetter={(row) => row.id}
          height="100%"
          theme="class"
          localeText={localeTextEn}
          initialState={initialState}
          find
          showFilterChipBar
          enableRowSelection
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          getFilterOptions={async ({ columnKey, columnFilters, globalText, signal }) => {
            const sp = new URLSearchParams({ column: columnKey, query: JSON.stringify({ columnFilters, globalText }) });
            const res = await fetch(`/api/users/options?${sp}`, { signal });
            if (!res.ok) throw new Error('options failed');
            return res.json();
          }}
          onFiltersChange={syncUrlFromGrid}
          onSortChange={syncUrlFromGrid}
          onServerSideLoadError={(error, { startIndex, endIndex }) => toast('error', `Load failed (${startIndex}-${endIndex}): ${String(error)}`)}
          onServerSideWriteError={(error, { updates }) =>
            toast('error', `Could not save ${updates.length} row(s): ${error instanceof Error ? error.message : String(error)}`)
          }
          enableContextMenu
          getContextMenuItems={({ target }) => {
            const row = target.row;
            return [
              { kind: 'label', label: row.name },
              {
                label: 'Copy email',
                onSelect: () => {
                  void navigator.clipboard.writeText(row.email);
                },
              },
              { kind: 'separator' },
              {
                label: 'Suspend user',
                danger: true,
                disabled: row.status === 'suspended',
                onSelect: () => toast('info', `Would suspend ${row.name}`),
              },
            ];
          }}
        />
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex flex-col gap-2" data-testid="toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow ${
              t.tone === 'error' ? 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-card'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
