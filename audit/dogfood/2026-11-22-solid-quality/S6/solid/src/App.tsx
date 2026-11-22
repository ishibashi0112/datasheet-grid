import { createMemo, createSignal, For, untrack } from 'solid-js'
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
  type GridContextMenuItem,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { createInspections, type Inspection } from './data'
import { lang, setLang, t } from './i18n'

const params = new URLSearchParams(location.search)
const motionParam = (params.get('motion') ?? 'auto') as 'auto' | 'on' | 'off'

// 展開行のカード(入力欄とボタン)。保存はハンドルの applyRows で(元に戻せるように)
function DetailCard(props: { row: Inspection; onSave: (patch: Partial<Inspection>) => void; onClose: () => void }) {
  // ?plain: README の勧めどおり、保存前の入力はふつうの signal で持つ(開いたときの値で始める)
  const plain = params.has('plain')
  const [inspector, setInspector] = plain ? createSignal(props.row.inspector) : createSignal(() => props.row.inspector)
  const [action, setAction] = plain ? createSignal(props.row.action) : createSignal(() => props.row.action)
  return (
    <div class="card" data-testid="detail-card">
      <label>
        {t('inspector')}
        <input value={inspector()} onInput={(e) => setInspector(e.currentTarget.value)} />
      </label>
      <label>
        {t('action')}
        <textarea rows={2} value={action()} onInput={(e) => setAction(e.currentTarget.value)} />
      </label>
      <div class="card-buttons">
        <button type="button" onClick={() => alert('photo')}>{t('addPhoto')}</button>
        <button type="button" onClick={() => props.onSave({ inspector: inspector(), action: action() })}>{t('save')}</button>
        <button type="button" onClick={() => props.onClose()}>{t('close')}</button>
      </div>
    </div>
  )
}

export function App() {
  const [rows, setRows] = createSignal(createInspections(200))
  const [moves, setMoves] = createSignal<string[]>([])
  let grid!: SpreadsheetGridHandle<Inspection>
  let dialog!: HTMLDialogElement
  const [tmplRows, setTmplRows] = createSignal(createInspections(30))

  const resultOptions = createMemo(() => [
    { value: 'ok', label: t('ok') },
    { value: 'warn', label: t('warn') },
    { value: 'ng', label: t('ng') },
  ])
  const columns = createMemo<GridColumn<Inspection>[]>(() => [
    { key: 'place', title: t('place'), width: 130, pinned: 'left', filterType: 'set' },
    { key: 'item', title: t('item'), width: 150, filterType: 'text' },
    {
      key: 'result',
      title: t('result'),
      width: 100,
      editor: { type: 'select', options: resultOptions() },
      valueFormatter: ({ value }) => resultOptions().find((o) => o.value === value)?.label ?? '',
      filterType: 'set',
      filterOptions: [...resultOptions(), { value: '', label: lang() === 'en' ? '(Blank)' : '(空白)' }],
      conditionalFormat: { chips: { ok: 'good', warn: 'warning', ng: 'critical' } },
    },
    { key: 'value', title: t('value'), width: 90, align: 'right', editor: { type: 'number', min: 0, max: 100 }, filterType: 'number' },
    { key: 'memo', title: t('memo'), width: 180, editor: { type: 'text', multiline: true } },
    { key: 'photo', title: t('photo'), width: 70, editor: { type: 'checkbox' } },
  ])
  const tmplColumns = createMemo<GridColumn<Inspection>[]>(() => [
    { key: 'place', title: t('place'), width: 130, filterType: 'set' },
    { key: 'item', title: t('item'), width: 150, filterType: 'text' },
    { key: 'result', title: t('result'), width: 110, editor: { type: 'select', options: resultOptions() } },
    { key: 'value', title: t('value'), width: 90, editor: { type: 'number' } },
  ])
  const contextItems = (rowKey: unknown): GridContextMenuItem[] => {
    const key = Number(rowKey)
    const index = rows().findIndex((r) => r.id === key)
    return [
      { label: t('moveUp'), disabled: index <= 0, onSelect: () => grid.moveRow(key, index - 1) },
      { label: t('moveDown'), disabled: index >= rows().length - 1, onSelect: () => grid.moveRow(key, index + 1) },
    ]
  }

  return (
    <div class="app">
      <header class="toolbar">
        <h1>{t('title')}</h1>
        <button type="button" id="lang" onClick={() => setLang(lang() === 'ja' ? 'en' : 'ja')}>{t('lang')}</button>
        <button type="button" id="open-dialog" onClick={() => dialog.showModal()}>{t('openDialog')}</button>
        <span class="moves" aria-live="polite">{moves().slice(-1)[0] ?? ''}</span>
      </header>
      <div class="grid-area">
        <SpreadsheetGrid
          ref={grid}
          ariaLabel={t('grid')}
          rows={rows()}
          onRowsChange={(next) => setRows(next)}
          columns={columns()}
          rowKeyGetter={(r) => r.id}
          localeText={lang() === 'en' ? localeTextEn : undefined}
          height="100%"
          motion={motionParam}
          enableRowDrag
          onRowMove={(p) => setMoves((m) => [...m, `${p.rowKey}: ${p.fromIndex} → ${p.toIndex}`])}
          enableContextMenu
          getContextMenuItems={(p) => contextItems(p.target.rowKey)}
          detailRow={{
            height: 150,
            render: (ctx) => (
              <DetailCard
                row={ctx.row}
                onClose={ctx.collapse}
                onSave={(patch) => grid.applyRows((prev) => prev.map((r) => (r.id === ctx.row.id ? { ...r, ...patch } : r)))}
              />
            ),
          }}
        />
      </div>
      <dialog ref={dialog} class="tmpl-dialog" aria-labelledby="tmpl-title">
        <h2 id="tmpl-title">{t('dialogTitle')}</h2>
        <div style={{ height: '320px', width: 'min(560px, 90vw)' }}>
          <SpreadsheetGrid
            ariaLabel={t('tmpl')}
            rows={tmplRows()}
            onRowsChange={(next) => setTmplRows(next)}
            columns={tmplColumns()}
            rowKeyGetter={(r) => r.id}
            localeText={lang() === 'en' ? localeTextEn : undefined}
            height="100%"
            enableContextMenu
            getContextMenuItems={() => [{ label: t('cancel'), onSelect: () => {} }]}
          />
        </div>
        <form method="dialog">
          <button type="submit" id="close-dialog">{t('close')}</button>
        </form>
      </dialog>
      <ul hidden>
        <For each={moves()}>{(m) => <li>{m}</li>}</For>
      </ul>
    </div>
  )
}
