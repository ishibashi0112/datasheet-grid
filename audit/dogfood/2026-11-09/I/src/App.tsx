import { useEffect, useMemo, useRef, useState } from 'react';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import { GridAskBar, type GridAskApplyEvent } from '@ishibashi0112/spreadsheet-grid/ai';
import { gridAskLocaleTextEn, localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en';
import { createColumns } from './columns';
import { createSales, type Lang, type Sale } from './data';
import { createMockAsk } from './mockAsk';
import { CustomAsk } from './CustomAsk';

declare global {
  interface Window {
    __applyLog: GridAskApplyEvent[];
    __errorLog: unknown[];
    __grid: SpreadsheetGridHandle<Sale> | null;
    __rows: Sale[];
    __columns: GridColumn<Sale>[];
  }
}
window.__applyLog = [];
window.__errorLog = [];

const params = new URLSearchParams(location.search);
const lang: Lang = params.get('lang') === 'en' ? 'en' : 'ja';
const ui = params.get('ui') === 'custom' ? 'custom' : 'bar';
const ask = createMockAsk();

const EXAMPLES = {
  ja: ['関東の 10 万円以上', '先月の売上を金額の大きい順', '状態が未入金のもの', 'さらに数量 10 以上だけ', '今月の分'],
  en: ['Kanto, 100,000 yen or more', 'Last month, largest amount first', 'Unpaid ones', 'Also qty 10 or more', 'This month'],
};

const HINTS: Record<string, string | false> = {
  amount: '円・税込',
  qty: '個',
  customer: '顧客コードは C-10001 の形',
  ...(params.get('hideMemo') ? { memo: false } : {}),
  ...(params.get('hintTypo') ? { amout: '円' } : {}),
};

export function App() {
  const gridRef = useRef<SpreadsheetGridHandle<Sale>>(null);
  const [rows, setRows] = useState<Sale[]>(() => createSales());
  const [columns, setColumns] = useState<GridColumn<Sale>[]>(() => createColumns(lang, { groupByRegion: false }));
  const [allowFilter, setAllowFilter] = useState(true);
  const [allowColumnVisibility, setAllowColumnVisibility] = useState(false);
  const [dark, setDark] = useState(false);
  const [lastApply, setLastApply] = useState<GridAskApplyEvent | null>(null);
  const theme = dark ? 'dark' : 'light';
  const grouped = columns.some((c) => c.rowGroup);
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  useEffect(() => {
    window.__grid = gridRef.current;
    window.__rows = rows;
    window.__columns = columns;
  });

  const toggleGroup = () =>
    setColumns((cols) => cols.map((c) => (c.key === 'region' ? { ...c, rowGroup: !c.rowGroup } : c)));

  const onApply = (event: GridAskApplyEvent) => {
    window.__applyLog.push(event);
    setLastApply(event);
  };
  const onError = (error: unknown) => {
    window.__errorLog.push(String(error));
  };

  return (
    <div className={`app ${dark ? 'app--dark' : ''}`}>
      <header className="app-header">
        <h1>{lang === 'ja' ? 'AI 売上分析' : 'AI Sales Analysis'}</h1>
        <span className="app-total" data-testid="app-total">
          {lang === 'ja' ? '全体の売上' : 'Total'}: {totalAmount.toLocaleString()} {lang === 'ja' ? '円' : 'JPY'}
        </span>
        <nav className="app-toolbar">
          <a href={`?lang=${lang === 'ja' ? 'en' : 'ja'}${ui === 'custom' ? '&ui=custom' : ''}`}>{lang === 'ja' ? 'English' : '日本語'}</a>
          <a href={`?lang=${lang}${ui === 'custom' ? '' : '&ui=custom'}`}>{ui === 'custom' ? '標準のバー' : '自作の UI'}</a>
          <label>
            <input type="checkbox" checked={grouped} onChange={toggleGroup} data-testid="toggle-group" /> {lang === 'ja' ? '地域でグループ化' : 'Group by region'}
          </label>
          <label>
            <input type="checkbox" checked={allowFilter} onChange={(e) => setAllowFilter(e.target.checked)} data-testid="toggle-filter" /> allowFilter
          </label>
          <label>
            <input type="checkbox" checked={allowColumnVisibility} onChange={(e) => setAllowColumnVisibility(e.target.checked)} data-testid="toggle-colvis" /> allowColumnVisibility
          </label>
          <label>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} data-testid="toggle-dark" /> dark
          </label>
        </nav>
      </header>

      {ui === 'bar' ? (
        <GridAskBar
          grid={gridRef}
          columns={columns}
          ask={ask}
          examples={EXAMPLES[lang]}
          columnHints={HINTS}
          allowFilter={allowFilter}
          allowColumnVisibility={allowColumnVisibility}
          onApply={onApply}
          onError={onError}
          theme={theme}
          localeText={lang === 'en' ? gridAskLocaleTextEn : undefined}
        />
      ) : (
        <CustomAsk
          grid={gridRef}
          columns={columns}
          ask={ask}
          columnHints={HINTS}
          allowFilter={allowFilter}
          allowColumnVisibility={allowColumnVisibility}
          onApply={onApply}
          onError={onError}
          lang={lang}
        />
      )}

      <div className="grid-wrap">
        <SpreadsheetGrid
          ref={gridRef}
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          onColumnsChange={setColumns}
          rowKeyGetter={(row) => row.id}
          enableColumnFilter={allowFilter}
          showFilterChipBar
          totalRow
          theme={theme}
          localeText={lang === 'en' ? localeTextEn : undefined}
          height="100%"
        />
      </div>

      {lastApply && (
        <section className="app-debug" data-testid="apply-log">
          <strong>onApply</strong>: {lastApply.text} / dropped {lastApply.dropped.length} / unsupported {String(lastApply.unsupported)}
        </section>
      )}
    </div>
  );
}
