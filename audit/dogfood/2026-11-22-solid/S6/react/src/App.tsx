import { useMemo, useRef, useState } from 'react'
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle, type GridContextMenuItem } from '@ishibashi0112/spreadsheet-grid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { createInspections, type Inspection } from './data'
import { tr, type Lang } from './i18n'

const params = new URLSearchParams(location.search)
const motionParam = (params.get('motion') ?? 'auto') as 'auto' | 'on' | 'off'

function DetailCard(props: { row: Inspection; t: ReturnType<typeof tr>; onSave: (p: Partial<Inspection>) => void; onClose: () => void }) {
  const [inspector, setInspector] = useState(props.row.inspector)
  const [action, setAction] = useState(props.row.action)
  const t = props.t
  return (
    <div className="card" data-testid="detail-card">
      <label>{t('inspector')}<input value={inspector} onChange={(e) => setInspector(e.currentTarget.value)} /></label>
      <label>{t('action')}<textarea rows={2} value={action} onChange={(e) => setAction(e.currentTarget.value)} /></label>
      <div className="card-buttons">
        <button type="button" onClick={() => alert('photo')}>{t('addPhoto')}</button>
        <button type="button" onClick={() => props.onSave({ inspector, action })}>{t('save')}</button>
        <button type="button" onClick={() => props.onClose()}>{t('close')}</button>
      </div>
    </div>
  )
}

export function App() {
  const [lang, setLang] = useState<Lang>('ja')
  const t = tr(lang)
  const [rows, setRows] = useState(() => createInspections(200))
  const [tmplRows, setTmplRows] = useState(() => createInspections(30))
  const [moves, setMoves] = useState<string[]>([])
  const grid = useRef<SpreadsheetGridHandle<Inspection>>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const resultOptions = useMemo(() => [{ value: 'ok', label: t('ok') }, { value: 'warn', label: t('warn') }, { value: 'ng', label: t('ng') }], [lang])
  const columns = useMemo<GridColumn<Inspection>[]>(() => [
    { key: 'place', title: t('place'), width: 130, pinned: 'left', filterType: 'set' },
    { key: 'item', title: t('item'), width: 150, filterType: 'text' },
    { key: 'result', title: t('result'), width: 100, editor: { type: 'select', options: resultOptions }, valueFormatter: ({ value }) => resultOptions.find((o) => o.value === value)?.label ?? '', filterType: 'set', filterOptions: [...resultOptions, { value: '', label: lang === 'en' ? '(Blank)' : '(空白)' }], conditionalFormat: { chips: { ok: 'good', warn: 'warning', ng: 'critical' } } },
    { key: 'value', title: t('value'), width: 90, align: 'right', editor: { type: 'number', min: 0, max: 100 }, filterType: 'number' },
    { key: 'memo', title: t('memo'), width: 180, editor: { type: 'text', multiline: true } },
    { key: 'photo', title: t('photo'), width: 70, editor: { type: 'checkbox' } },
  ], [lang, resultOptions])
  const tmplColumns = useMemo<GridColumn<Inspection>[]>(() => [
    { key: 'place', title: t('place'), width: 130, filterType: 'set' },
    { key: 'item', title: t('item'), width: 150, filterType: 'text' },
    { key: 'result', title: t('result'), width: 110, editor: { type: 'select', options: resultOptions } },
    { key: 'value', title: t('value'), width: 90, editor: { type: 'number' } },
  ], [lang, resultOptions])
  const contextItems = (rowKey: unknown): GridContextMenuItem[] => {
    const key = Number(rowKey)
    const index = rows.findIndex((r) => r.id === key)
    return [
      { label: t('moveUp'), disabled: index <= 0, onSelect: () => grid.current?.moveRow(key, index - 1) },
      { label: t('moveDown'), disabled: index >= rows.length - 1, onSelect: () => grid.current?.moveRow(key, index + 1) },
    ]
  }
  return (
    <div className="app">
      <header className="toolbar">
        <h1>{t('title')}</h1>
        <button type="button" id="lang" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{t('lang')}</button>
        <button type="button" id="open-dialog" onClick={() => dialog.current?.showModal()}>{t('openDialog')}</button>
        <span className="moves" aria-live="polite">{moves.at(-1) ?? ''}</span>
      </header>
      <div className="grid-area">
        <SpreadsheetGrid
          ref={grid}
          ariaLabel={t('grid')}
          rows={rows}
          onRowsChange={setRows}
          columns={columns}
          rowKeyGetter={(r) => r.id}
          localeText={lang === 'en' ? localeTextEn : undefined}
          height="100%"
          motion={motionParam}
          enableRowDrag
          onRowMove={(p) => setMoves((m) => [...m, `${p.rowKey}: ${p.fromIndex} → ${p.toIndex}`])}
          enableContextMenu
          getContextMenuItems={(p) => contextItems(p.target.rowKey)}
          detailRow={{
            height: 150,
            render: (ctx) => (
              <DetailCard row={ctx.row} t={t} onClose={ctx.collapse}
                onSave={(patch) => grid.current?.applyRows((prev) => prev.map((r) => (r.id === ctx.row.id ? { ...r, ...patch } : r)))} />
            ),
          }}
        />
      </div>
      <dialog ref={dialog} className="tmpl-dialog" aria-labelledby="tmpl-title">
        <h2 id="tmpl-title">{t('dialogTitle')}</h2>
        <div style={{ height: '320px', width: 'min(560px, 90vw)' }}>
          <SpreadsheetGrid ariaLabel={t('tmpl')} rows={tmplRows} onRowsChange={setTmplRows} columns={tmplColumns} rowKeyGetter={(r) => r.id}
            localeText={lang === 'en' ? localeTextEn : undefined} height="100%" enableContextMenu getContextMenuItems={() => [{ label: t('cancel'), onSelect: () => {} }]} />
        </div>
        <form method="dialog"><button type="submit" id="close-dialog">{t('close')}</button></form>
      </dialog>
    </div>
  )
}
