import { createEffect, createSignal, Show, untrack } from 'solid-js'
import { useLocation, useNavigate, useSearchParams } from '@solidjs/router'
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'
import { createUser, deleteUser, DEPTS, ROLES, STATUSES, usersDataSource, type User } from '../api'
import { parseUrlState, sameState, toSearch } from '../urlState'
import { density, showSave } from '../settings'

const opts = (vs: string[]) => vs.map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))

// 画面の外から使う(削除ボタン)ため、列はモジュールの先頭で作り、ハンドルは後から入れる
let gridForActions: SpreadsheetGridHandle<User> | undefined

const columns: GridColumn<User>[] = [
  { key: 'id', title: 'ID', width: 80, pinned: 'left', align: 'right', editable: false, filterType: 'number' },
  { key: 'name', title: 'Name', width: 180, pinned: 'left', filterType: 'text', validate: ({ value }) => (String(value ?? '').trim() ? true : 'Name is required'), validationMode: 'reject' },
  {
    key: 'email',
    title: 'Email',
    width: 240,
    filterType: 'text',
    validate: ({ value }) => /^[^@\s]+@[^@\s]+$/.test(String(value ?? '')) || 'Invalid email',
  },
  { key: 'role', title: 'Role', width: 110, editor: { type: 'select', options: opts(ROLES) }, filterType: 'set', filterOptions: opts(ROLES) },
  {
    key: 'status',
    title: 'Status',
    width: 120,
    editor: { type: 'select', options: opts(STATUSES) },
    filterType: 'set',
    filterOptions: opts(STATUSES),
    conditionalFormat: { chips: { active: 'good', invited: 'info', suspended: 'critical' } },
  },
  {
    key: 'department',
    title: 'Department',
    width: 130,
    editor: { type: 'select', options: [{ value: '', label: '(none)' }, ...DEPTS.map((d) => ({ value: d, label: d }))] },
    filterType: 'set',
    filterOptions: [{ value: '', label: '(Blanks)' }, ...DEPTS.map((d) => ({ value: d, label: d }))],
  },
  { key: 'createdAt', title: 'Created', width: 130, editable: false, filterType: 'dateSet' },
  { key: 'lastLogin', title: 'Last login', width: 130, editor: { type: 'date' }, filterType: 'date' },
  {
    key: 'logins',
    title: 'Logins',
    width: 100,
    align: 'right',
    editor: { type: 'number', min: 0, integer: true },
    filterType: 'number',
  },
  { key: 'note', title: 'Note', width: 200, filterType: 'text' },
  {
    key: 'actions',
    title: '',
    width: 130,
    editable: false,
    getValue: () => '',
    renderCell: (ctx) => (
      <span class="cell-actions">
        <a href={`/users/${ctx.row.id}`}>Open</a>
        <button
          type="button"
          onClick={async () => {
            await deleteUser(ctx.row.id)
            gridForActions?.refreshServerSide()
          }}
        >
          Delete
        </button>
      </span>
    ),
  },
]

export default function Users() {
  const [search, setSearch] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const initial = untrack(() => parseUrlState({ ...search } as Record<string, string>))
  let grid!: SpreadsheetGridHandle<User>
  const [lastError, setLastError] = createSignal('')
  const [saving, setSaving] = createSignal('')

  // URL(戻る / 進む)→ グリッド
  createEffect(
    () => location.search,
    () => {
      if (!grid) return
      const fromUrl = parseUrlState(untrack(() => ({ ...search }) as Record<string, string>))
      const now = grid.getState()
      if (!sameState(now, fromUrl)) grid.applyState({ sort: fromUrl.sort, filters: fromUrl.filters })
    },
    { defer: true },
  )

  // グリッド → URL
  const syncToUrl = () => {
    if (!grid) return
    const st = grid.getState()
    // onSortChange / onFiltersChange はグリッドの effect の中から呼ばれるので、router の store は untrack で読む
    const fromUrl = untrack(() => parseUrlState({ ...search } as Record<string, string>))
    if (sameState(st, fromUrl)) return
    setSearch(toSearch(st))
  }

  const addUser = async () => {
    const u = await createUser({ name: 'New User', email: `new${Date.now()}@example.com`, role: 'viewer', status: 'invited' })
    setSaving(`Added #${u.id}`)
    grid.refreshServerSide()
  }

  return (
    <section class="page">
      <div class="toolbar">
        <h1>Users</h1>
        <button type="button" onClick={addUser}>Add user</button>
        <button type="button" onClick={() => grid.refreshServerSide()}>Refresh</button>
        <button type="button" onClick={() => grid.retryServerSideLoads()}>Retry failed loads</button>
        <button type="button" onClick={() => navigate('/users')}>Clear URL state</button>
        <span class="status" data-testid="status">{saving()}</span>
        <Show when={lastError()}>
          <span class="error" data-testid="last-error">{lastError()}</span>
        </Show>
      </div>
      <div class="grid-area">
        <SpreadsheetGrid
          ref={(h) => {
            grid = h
            gridForActions = h
          }}
          dataSource={usersDataSource}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          localeText={localeTextEn}
          initialState={initial}
          height="100%"
          density={density()}
          showSaveStatus={showSave()}
          enableContextMenu
          getContextMenuItems={(params) => {
            const target = params.target
            return [
              { kind: 'label', label: `User #${String(target.rowKey)}` },
              { label: 'Open details', onSelect: () => navigate(`/users/${String(target.rowKey)}`) },
              {
                label: 'Delete user',
                danger: true,
                onSelect: async () => {
                  await deleteUser(Number(target.rowKey))
                  grid.refreshServerSide()
                },
              },
              { kind: 'separator' },
              { label: 'Export loaded rows (CSV)', onSelect: () => grid.downloadCsv('users.csv') },
            ]
          }}
          find
          onSortChange={syncToUrl}
          onFiltersChange={syncToUrl}
          onServerSideLoadError={(e) => setLastError(`load: ${(e as Error).message}`)}
          onServerSideWriteError={(e, p) => setLastError(`write: ${(e as Error).message} (${p.updates.length} rows)`)}
          ariaLabel="Users"
        />
      </div>
    </section>
  )
}
