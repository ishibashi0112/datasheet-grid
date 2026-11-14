import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridCellRef,
  type GridColumn,
  type GridContextMenuItem,
  type GridContextMenuParams,
  type SpreadsheetGridHandle,
  type UndoRedoState,
} from '@ishibashi0112/spreadsheet-grid';
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import '@ishibashi0112/spreadsheet-grid/style.css';
import { generateQuotes, tick, type Quote } from './data';
import './App.css';

type FeedMode = 'replace' | 'apply';

const params = new URLSearchParams(location.search);
const INITIAL_MODE: FeedMode = params.get('mode') === 'apply' ? 'apply' : 'replace';
const INITIAL_RUNNING = params.get('run') !== '0';
const ROWS_PER_TICK = Number(params.get('n') ?? 100);
const TICK_MS = Number(params.get('ms') ?? 250);
const ROW_COUNT = Number(params.get('rows') ?? 2000);
const PREFILL_MEMO = params.get('memo') === '1';
// Debug toggles used while profiling.
const HIGHLIGHT = params.get('hl') !== '0';
const ANIMATE = params.get('anim') !== '0';
const COND_FORMAT = params.get('cf') !== '0';

const price = numberFormatter({ locale: 'en-US', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = numberFormatter({ locale: 'en-US', maximumFractionDigits: 0 });
const compactUsd = new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const signed = (digits: number, suffix = '') => ({ value }: { value: unknown }) => {
  if (typeof value !== 'number') return '';
  const s = value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value > 0 ? '+' : ''}${s}${suffix}`;
};

const columns: GridColumn<Quote>[] = [
  { key: 'symbol', title: 'Symbol', width: 90, pinned: 'left', readOnly: true, filterType: 'text' },
  { key: 'name', title: 'Company', width: 220, readOnly: true, filterType: 'textSet' },
  { key: 'sector', title: 'Sector', width: 170, readOnly: true, filterType: 'set' },
  { key: 'exchange', title: 'Exch', width: 80, readOnly: true, filterType: 'select' },
  { key: 'last', title: 'Last', width: 100, align: 'right', readOnly: true, valueFormatter: price, filterType: 'number' },
  { key: 'change', title: 'Chg', width: 90, align: 'right', readOnly: true, valueFormatter: signed(2) },
  {
    key: 'changePct',
    title: 'Chg %',
    width: 100,
    align: 'right',
    readOnly: true,
    valueFormatter: signed(2, '%'),
    filterType: 'numberSet',
    aggFunc: 'avg',
    conditionalFormat: COND_FORMAT ? { colorScale: { type: 'diverging', min: -3, mid: 0, max: 3 } } : undefined,
  },
  {
    key: 'volume',
    title: 'Volume',
    width: 150,
    align: 'right',
    readOnly: true,
    valueFormatter: integer,
    filterType: 'number',
    aggFunc: 'sum',
    conditionalFormat: COND_FORMAT ? { dataBar: {} } : undefined,
  },
  { key: 'high', title: 'High', width: 90, align: 'right', readOnly: true, valueFormatter: price },
  { key: 'low', title: 'Low', width: 90, align: 'right', readOnly: true, valueFormatter: price },
  {
    key: 'marketCap',
    title: 'Mkt Cap',
    width: 110,
    align: 'right',
    readOnly: true,
    valueFormatter: ({ value }) => (typeof value === 'number' ? compactUsd.format(value) : ''),
    aggFunc: 'sum',
  },
  {
    key: 'status',
    title: 'Status',
    width: 120,
    readOnly: true,
    filterType: 'set',
    conditionalFormat: COND_FORMAT
      ? { chips: { Trading: 'good', 'Pre-market': 'info', Halted: 'critical', Closed: { tone: 'neutral', label: 'Closed' } } }
      : undefined,
  },
  {
    key: 'target',
    title: 'Target',
    width: 100,
    align: 'right',
    valueFormatter: price,
    filterType: 'numberSet',
    editor: { type: 'number', min: 0, step: 0.01 },
    validate: ({ value, row }) => {
      if (typeof value !== 'number') return true;
      if (value > row.last * 3) return 'Target is more than 3x the last price';
      return true;
    },
  },
  {
    key: 'memo',
    title: 'Memo',
    width: 240,
    minWidth: 200,
    flex: 1,
    filterType: 'textSet',
    validationMode: 'reject',
    validate: ({ value }) => (typeof value === 'string' && value.length > 60 ? 'Memo must be 60 characters or fewer' : true),
  },
  {
    key: 'updatedAt',
    title: 'Updated',
    width: 100,
    readOnly: true,
    filterType: 'dateSet',
    valueFormatter: ({ value }) => (typeof value === 'string' ? timeFmt.format(new Date(value)) : ''),
  },
];

declare global {
  interface Window {
    __app?: {
      getRows: () => readonly Quote[];
      grid: () => SpreadsheetGridHandle<Quote> | null;
      ticks: () => number;
      setRunning: (v: boolean) => void;
      setMode: (m: FeedMode) => void;
    };
  }
}

export default function App() {
  const [rows, setRows] = useState<Quote[]>(() => {
    const q = generateQuotes(ROW_COUNT);
    return PREFILL_MEMO ? q.map((r) => ({ ...r, memo: `note ${r.symbol}` })) : q;
  });
  const [running, setRunning] = useState(INITIAL_RUNNING);
  const [mode, setMode] = useState<FeedMode>(INITIAL_MODE);
  const [tickCount, setTickCount] = useState(0);
  const [active, setActive] = useState<GridCellRef<Quote> | null>(null);
  const [undoState, setUndoState] = useState<UndoRedoState>({ canUndo: false, canRedo: false });
  const [findLabel, setFindLabel] = useState('');
  const gridRef = useRef<SpreadsheetGridHandle<Quote>>(null);
  const rowsRef = useRef(rows);
  const ticksRef = useRef(0);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    window.__app = {
      getRows: () => rowsRef.current,
      grid: () => gridRef.current,
      ticks: () => ticksRef.current,
      setRunning,
      setMode,
    };
  }, []);

  // Price feed.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      ticksRef.current += 1;
      setTickCount((c) => c + 1);
      if (mode === 'replace') {
        setRows((prev) => tick(prev, ROWS_PER_TICK));
      } else {
        const next = tick(rowsRef.current, ROWS_PER_TICK);
        rowsRef.current = next;
        gridRef.current?.applyRows(next);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, mode]);

  const activeQuote = useMemo(() => {
    if (!active) return null;
    return rows.find((r) => r.symbol === active.rowKey) ?? null;
  }, [active, rows]);

  const getContextMenuItems = useCallback(
    (p: GridContextMenuParams<Quote>): GridContextMenuItem[] => {
      const row = p.target.row;
      const symbol = row?.symbol ?? '';
      return [
        { kind: 'label', label: symbol },
        { label: 'Copy symbol', onSelect: () => void navigator.clipboard?.writeText(symbol) },
        {
          label: 'Set target to last price',
          onSelect: () => {
            const next = rowsRef.current.map((r) => (r.symbol === symbol ? { ...r, target: r.last } : r));
            gridRef.current?.applyRows(next);
          },
        },
        {
          label: 'Clear memo',
          danger: true,
          disabled: !row?.memo,
          onSelect: () => {
            const next = rowsRef.current.map((r) => (r.symbol === symbol ? { ...r, memo: '' } : r));
            gridRef.current?.applyRows(next);
          },
        },
        { kind: 'separator' },
        {
          label: 'Export selection (CSV)',
          disabled: !p.isTargetSelected,
          onSelect: () => gridRef.current?.downloadCsv('selection.csv', { scope: 'selection' }),
        },
      ];
    },
    [],
  );

  return (
    <div className="board">
      <header className="toolbar">
        <h1>Market Board</h1>
        <button type="button" onClick={() => setRunning((v) => !v)} data-testid="toggle-feed">
          {running ? 'Pause feed' : 'Start feed'}
        </button>
        <label>
          Feed mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as FeedMode)} data-testid="mode">
            <option value="replace">Replace rows</option>
            <option value="apply">applyRows (undoable)</option>
          </select>
        </label>
        <button type="button" onClick={() => gridRef.current?.applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] })}>
          Top gainers
        </button>
        <button type="button" onClick={() => gridRef.current?.applyState({ sort: [] })}>
          Clear sort
        </button>
        <button type="button" disabled={!undoState.canUndo} onClick={() => gridRef.current?.undo()}>
          Undo
        </button>
        <button type="button" disabled={!undoState.canRedo} onClick={() => gridRef.current?.redo()}>
          Redo
        </button>
        <button type="button" onClick={() => gridRef.current?.openFind()}>
          Find
        </button>
        <button type="button" onClick={() => gridRef.current?.downloadCsv('quotes.csv', { includeTotalRow: true })}>
          Export CSV
        </button>
        <span className="ticks" data-testid="ticks">
          ticks: {tickCount}
        </span>
        <span className="find-label">{findLabel}</span>
      </header>
      <div className="main">
        <div className="grid-wrap">
          <SpreadsheetGrid<Quote>
            ref={gridRef}
            ariaLabel="Quotes"
            rows={rows}
            columns={columns}
            onRowsChange={setRows}
            rowKeyGetter={(row) => row.symbol}
            localeText={localeTextEn}
            height="100%"
            highlightChanges={HIGHLIGHT}
            animateRows={ANIMATE}
            find
            onFindChange={({ matchCount, currentIndex, open }) =>
              setFindLabel(open && matchCount > 0 ? `${(currentIndex ?? 0) + 1} / ${matchCount}` : '')
            }
            showFilterChipBar
            totalRow
            enableContextMenu
            getContextMenuItems={getContextMenuItems}
            onActiveCellChange={setActive}
            onUndoRedoStateChange={setUndoState}
            density="compact"
          />
        </div>
        <aside className="detail" data-testid="detail">
          {activeQuote ? (
            <>
              <h2>{activeQuote.symbol}</h2>
              <p>{activeQuote.name}</p>
              <dl>
                <dt>Last</dt>
                <dd data-testid="detail-last">{activeQuote.last.toFixed(2)}</dd>
                <dt>Chg %</dt>
                <dd>{activeQuote.changePct.toFixed(2)}%</dd>
                <dt>Memo</dt>
                <dd>{activeQuote.memo || '—'}</dd>
              </dl>
            </>
          ) : (
            <p>Select a cell to see the quote.</p>
          )}
        </aside>
      </div>
    </div>
  );
}