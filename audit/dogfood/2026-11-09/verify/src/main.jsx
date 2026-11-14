import { StrictMode, useRef, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

const q = new URLSearchParams(location.search);
const s = q.get('s') ?? 'basic';

const mk = (n, cols) =>
  Array.from({ length: n }, (_, i) => {
    const r = { id: i + 1 };
    cols.forEach((c) => (r[c] = `${c}${i}`));
    return r;
  });

function Harness({ initialRows, columns, extra = {}, toolbar }) {
  const ref = useRef(null);
  const [rows, setRows] = useState(initialRows);
  window.grid = ref;
  window.getRows = () => rows;
  window.__rows = rows;
  return (
    <div style={{ padding: 12 }}>
      <input id="outside" placeholder="outside" />
      {toolbar?.(ref, rows, setRows)}
      <div style={{ height: 420, width: 900 }}>
        <SpreadsheetGrid
          ref={ref}
          rows={rows}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          onRowsChange={setRows}
          height="100%"
          {...extra}
        />
      </div>
    </div>
  );
}

const textCols = (keys) => keys.map((k) => ({ key: k, title: k.toUpperCase(), width: 120 }));

function App() {
  if (s === 'date') {
    return <Harness initialRows={[{ id: 1, d: null }, { id: 2, d: null }, { id: 3, d: null }, { id: 4, d: null }, { id: 5, d: null }, { id: 6, d: null }]}
      columns={[{ key: 'd', title: 'D', width: 160, editor: { type: 'date' } }]} />;
  }
  if (s === 'paste') {
    return <Harness initialRows={mk(12, ['a', 'b', 'c'])} columns={textCols(['a', 'b', 'c'])} />;
  }
  if (s === 'selall') {
    return <Harness initialRows={[{ id: 1, f: 'apple' }, { id: 2, f: 'orange' }, { id: 3, f: 'apple' }, { id: 4, f: 'grape' }]}
      columns={[{ key: 'f', title: 'F', width: 160, filterType: 'text' }]}
      extra={{ enableRowSelection: true }}
      toolbar={(ref, rows, setRows) => (
        <button id="del" onClick={() => { const keys = new Set(ref.current.getSelectedRowKeys()); setRows(rows.filter((r) => !keys.has(r.id))); }}>delete selected</button>
      )} />;
  }
  if (s === 'grouppaste') {
    return <Harness initialRows={[{ id: 1, team: 'A', v: 'a1' }, { id: 2, team: 'A', v: 'a2' }, { id: 3, team: 'B', v: 'b1' }, { id: 4, team: 'B', v: 'b2' }]}
      columns={[{ key: 'team', title: 'Team', width: 100, rowGroup: true }, { key: 'v', title: 'V', width: 120 }]} />;
  }
  if (s === 'fast') {
    return <Harness initialRows={Array.from({ length: 20 }, (_, i) => ({ id: i + 1, code: '' }))}
      columns={[{ key: 'code', title: 'Code', width: 160 }]} />;
  }
  if (s === 'ctx') {
    return <Harness initialRows={mk(10, ['a', 'b'])} columns={textCols(['a', 'b'])}
      extra={{ enableContextMenu: true, getContextMenuItems: () => [{ label: 'edit', onSelect: () => { window.__started = window.grid.current.startEditing(); } }] }} />;
  }
  if (s === 'custom') {
    return <Harness initialRows={mk(10, ['a', 'b'])}
      columns={[{ key: 'a', title: 'A', width: 160, editor: { type: 'custom', render: (ctx) => (
        <input autoFocus defaultValue={String(ctx.value ?? '')} onKeyDown={(e) => { if (e.key === 'Enter') ctx.commit(e.currentTarget.value, 'down'); if (e.key === 'Escape') ctx.cancel(); }} />
      ) } }, { key: 'b', title: 'B', width: 120 }]} />;
  }
  if (s === 'removedcol') {
    return <RemovedCol />;
  }
  return <Harness initialRows={mk(30, ['a', 'b', 'c'])} columns={textCols(['a', 'b', 'c'])} />;
}

function RemovedCol() {
  const [many, setMany] = useState(true);
  const cols = useMemo(() => textCols(many ? ['a', 'b', 'c', 'd', 'e'] : ['a', 'b', 'c']).map((c) => ({ ...c, filterType: 'text' })), [many]);
  return <Harness initialRows={mk(10, ['a', 'b', 'c', 'd', 'e'])} columns={cols}
    toolbar={() => <button id="toggle" onClick={() => setMany((m) => !m)}>toggle</button>} />;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
