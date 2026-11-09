import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonGroup, Chip, Switch } from '@heroui/react';
import {
  SpreadsheetGrid,
  type GridColumn,
  type LabelRowOptions,
  type SpreadsheetGridHandle,
  type UndoRedoState,
} from '@ishibashi0112/spreadsheet-grid';
import {
  DEPTS,
  MONTHS,
  SHIFTS,
  WEEKDAYS,
  daysOf,
  makeMonthRows,
  makeStaffList,
  type DayInfo,
  type DeptLabel,
  type MonthKey,
  type Row,
  type Shift,
  type Staff,
} from './data';

// 計測用: ?plain で条件付き書式を外す
const PLAIN = typeof location !== 'undefined' && new URLSearchParams(location.search).has('plain');

const SHIFT_LABEL: Record<Shift, string> = { 早: '早番', 遅: '遅番', 夜: '夜勤', 休: '公休' };

// Excel から貼られる表記ゆれを 早 / 遅 / 夜 / 休 に寄せる
function parseShift(raw: string): unknown {
  const s = raw.trim();
  if (s === '') return null;
  const map: Record<string, Shift> = {
    早: '早', 早番: '早', 遅: '遅', 遅番: '遅', 夜: '夜', 夜勤: '夜', 休: '休', 公休: '休', 休み: '休',
  };
  return map[s] ?? s; // 読めない値はそのまま(validate が印を付ける)
}

const isStaff = (row: Row): row is Staff => row.kind === 'staff';

function countWork(row: Row) {
  if (!isStaff(row)) return undefined;
  return row.shifts.filter((s) => s === '早' || s === '遅' || s === '夜').length;
}
function countNight(row: Row) {
  if (!isStaff(row)) return undefined;
  return row.shifts.filter((s) => s === '夜').length;
}

function dayColumn(info: DayInfo): GridColumn<Row> {
  const idx = info.day - 1;
  const off = info.weekday === 0 || info.weekday === 6 || !!info.holiday;
  return {
    key: `d${info.day}`,
    title: `${info.day}日`,
    width: 46,
    align: 'center',
    editor: { type: 'select', options: SHIFTS.map((s) => ({ value: s, label: SHIFT_LABEL[s] })) },
    getValue: (row) => (isStaff(row) ? (row.shifts[idx] ?? null) : undefined),
    setValue: (row, value) => {
      if (!isStaff(row)) return row;
      const shifts = row.shifts.slice();
      shifts[idx] = (value === '' || value == null ? null : value) as Shift | null;
      return { ...row, shifts };
    },
    parseClipboardValue: (raw) => parseShift(raw),
    validate: ({ value, row }) => {
      if (value == null || value === '') return true;
      if (!SHIFTS.includes(value as Shift)) return '早 / 遅 / 夜 / 休 のどれかを入れてください';
      if (isStaff(row) && value === '早' && row.shifts[idx - 1] === '夜') return '夜勤明けの早番はできません';
      return true;
    },
    conditionalFormat: PLAIN ? undefined : {
      chips: {
        早: { tone: 'info', icon: false },
        遅: { tone: 'warning', icon: false },
        夜: { color: '#7c3aed', icon: false },
        休: { tone: 'neutral', icon: false },
      },
    },
    cellClassName: off ? (info.weekday === 6 ? 'shift-sat' : 'shift-sun') : undefined,
    filterType: 'set',
    renderHeader: () => (
      <div className="day-head" title={info.holiday}>
        <span className="day-head__num">{info.day}</span>
        <span
          className={
            'day-head__wd ' +
            (info.holiday || info.weekday === 0 ? 'is-sun' : info.weekday === 6 ? 'is-sat' : '')
          }
        >
          {info.holiday ? '祝' : WEEKDAYS[info.weekday]}
        </span>
      </div>
    ),
    // 合計行: その日の 早 / 遅 / 夜 の人数
    aggFunc: ({ values }) => {
      const c = { 早: 0, 遅: 0, 夜: 0 };
      for (const v of values) if (v === '早' || v === '遅' || v === '夜') c[v]++;
      return `${c.早}/${c.遅}/${c.夜}`;
    },
    suppressAutoSize: false,
  };
}

function buildColumns(month: MonthKey): GridColumn<Row>[] {
  return [
    {
      key: 'name',
      title: '氏名',
      width: 120,
      pinned: 'left',
      editable: false,
      filterType: 'text',
      getValue: (row) => (isStaff(row) ? row.name : undefined),
    },
    {
      key: 'dept',
      title: '部署',
      width: 90,
      pinned: 'left',
      editable: false,
      filterType: 'set',
      getValue: (row) => row.dept,
    },
    ...daysOf(month).map(dayColumn),
    {
      key: 'workDays',
      title: '出勤日数',
      width: 76,
      pinned: 'right',
      align: 'right',
      editable: false,
      filterType: 'number',
      getValue: countWork,
      aggFunc: 'sum',
    },
    {
      key: 'nightCount',
      title: '夜勤回数',
      width: 76,
      pinned: 'right',
      align: 'right',
      editable: false,
      filterType: 'number',
      getValue: countNight,
      aggFunc: 'sum',
      cellClassName: ({ value }) => (typeof value === 'number' && value > 8 ? 'night-over' : undefined),
    },
  ];
}

const labelRow: LabelRowOptions<Row, DeptLabel> = {
  isLabelRow: (row): row is DeptLabel => row.kind === 'label',
  getLabel: (row) => row.dept,
  sticky: true,
  height: 30,
  render: ({ label, sectionRowCount }) => (
    <span className="dept-label">
      <strong>{label}</strong>
      <span className="dept-label__count">{sectionRowCount} 名</span>
    </span>
  ),
};

const STAFF = makeStaffList();

export default function App() {
  const [month, setMonth] = useState<MonthKey>('2026-12');
  const [rowsByMonth, setRowsByMonth] = useState<Partial<Record<MonthKey, Row[]>>>(() => ({
    '2026-12': makeMonthRows('2026-12', STAFF),
  }));
  const rows = rowsByMonth[month] ?? [];
  const columns = useMemo(() => buildColumns(month), [month]);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const [undo, setUndo] = useState<UndoRedoState>({ canUndo: false, canRedo: false });
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // E2E 用(ブラウザのコンソールからハンドルと行を触れるように)
  useEffect(() => {
    const w = window as unknown as { __grid?: unknown; __rows?: unknown; __month?: unknown };
    w.__grid = gridRef;
    w.__rows = rows;
    w.__month = month;
  });

  const switchMonth = (next: MonthKey) => {
    setRowsByMonth((prev) => (prev[next] ? prev : { ...prev, [next]: makeMonthRows(next, STAFF) }));
    setMonth(next);
  };

  const onRowsChange = useCallback(
    (next: Row[]) => setRowsByMonth((prev) => ({ ...prev, [month]: next })),
    [month],
  );

  const totals = useMemo(() => {
    let night = 0;
    let work = 0;
    for (const r of rows) {
      night += countNight(r) ?? 0;
      work += countWork(r) ?? 0;
    }
    return { night, work, staff: rows.filter(isStaff).length };
  }, [rows]);

  const exportCsv = () => {
    gridRef.current?.downloadCsv(`shift-${month}.csv`, { includeLabelRows: true, includeTotalRow: true });
  };

  const jumpToday = () => {
    const g = gridRef.current;
    if (!g) return;
    const col = g.getColIndex('d15');
    g.selectCell(Math.max(0, g.getViewRowIndex('S001')), col, { scrollIntoView: true });
    g.focus();
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">勤務シフト表</h1>
        <ButtonGroup>
          {MONTHS.map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant={m.key === month ? 'primary' : 'tertiary'}
              onPress={() => switchMonth(m.key)}
              data-month={m.key}
            >
              {m.label}
            </Button>
          ))}
        </ButtonGroup>
        <Button size="sm" variant="secondary" isDisabled={!undo.canUndo} onPress={() => gridRef.current?.undo()}>
          元に戻す
        </Button>
        <Button size="sm" variant="secondary" isDisabled={!undo.canRedo} onPress={() => gridRef.current?.redo()}>
          やり直し
        </Button>
        <Button size="sm" variant="secondary" onPress={jumpToday}>
          15日へ
        </Button>
        <Button size="sm" variant="secondary" onPress={exportCsv}>
          CSV 出力
        </Button>
        <Switch isSelected={dark} onChange={setDark} aria-label="ダークモード">
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>ダーク</Switch.Content>
        </Switch>
        <div className="ml-auto flex items-center gap-2 text-sm" data-testid="summary">
          <Chip size="sm">職員 {totals.staff} 名</Chip>
          <Chip size="sm" color="accent">
            出勤 延べ {totals.work} 日
          </Chip>
          <Chip size="sm" color="danger">
            夜勤 延べ {totals.night} 回
          </Chip>
        </div>
      </header>
      <p className="text-xs text-[var(--muted)]">
        凡例: 早 = 早番 / 遅 = 遅番 / 夜 = 夜勤 / 休 = 公休。合計行は その日の 早/遅/夜 の人数。部署: {DEPTS.join('・')}
      </p>
      <div className="min-h-0 flex-1" data-testid="grid-wrap">
        <SpreadsheetGrid<Row, DeptLabel>
          ref={gridRef}
          ariaLabel="勤務シフト表"
          rows={rows}
          columns={columns}
          onRowsChange={onRowsChange}
          rowKeyGetter={(row) => row.id}
          labelRow={labelRow}
          hoverHighlight="cross"
          fillHandle
          totalRow={{ label: '早/遅/夜' }}
          height="100%"
          headerHeight={48}
          theme="class"
          find
          onUndoRedoStateChange={setUndo}
          getRowClassName={(row) => (isStaff(row) && row.employment === 'パート' ? 'row-part' : undefined)}
        />
      </div>
    </div>
  );
}
