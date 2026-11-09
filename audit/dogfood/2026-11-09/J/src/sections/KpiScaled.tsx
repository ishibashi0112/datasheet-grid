import { useState } from 'react'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
import { kpiColumns } from '../columns'
import { makeKpi, type KpiRow } from '../data'

// 大きなモニター用のウィジェットを 80% に縮めて並べる箱
export function KpiScaled() {
  const [rows, setRows] = useState<KpiRow[]>(() => makeKpi())
  const [cols, setCols] = useState(kpiColumns)
  const [scale, setScale] = useState(() => {
    const s = Number(new URLSearchParams(window.location.search).get('scale'))
    return Number.isFinite(s) && s > 0 ? s : 0.8
  })
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="scale-section">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="font-semibold">担当者別 KPI(縮小表示)</h2>
        <label className="ml-auto text-sm">
          倍率
          <select className="ml-2 rounded border px-1 dark:border-slate-700 dark:bg-slate-800" value={scale} onChange={(e) => setScale(Number(e.target.value))} data-testid="scale-select">
            <option value={1}>100%</option>
            <option value={0.8}>80%</option>
            <option value={0.6}>60%</option>
          </select>
        </label>
      </div>
      <div className="h-[340px] overflow-hidden">
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100 / scale}%`, height: `${100 / scale}%` }} data-testid="scale-box">
          <SpreadsheetGrid
            ariaLabel="担当者別 KPI"
            rows={rows}
            columns={cols}
            onRowsChange={setRows}
            rowKeyGetter={(r) => r.rep}
            height="100%"
            theme="class"
            totalRow={{ label: '合計' }}
            fillHandle
            onColumnsChange={setCols}
          />
        </div>
      </div>
    </section>
  )
}
