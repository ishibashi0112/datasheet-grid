import { createEffect, createSignal, Show, untrack } from 'solid-js'
import { useParams } from '@solidjs/router'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import { localeTextEn } from '@ishibashi0112/spreadsheet-grid-solid/locales/en'
import { fetchUser, type User } from '../api'

type Login = { at: string; ip: string; device: string; ok: boolean }
const loginColumns: GridColumn<Login>[] = [
  { key: 'at', title: 'When', width: 160 },
  { key: 'ip', title: 'IP', width: 140 },
  { key: 'device', title: 'Device', width: 160, filterType: 'set' },
  { key: 'ok', title: 'Success', width: 100, editor: { type: 'checkbox' } },
]

function makeLogins(id: number): Login[] {
  return Array.from({ length: 60 }, (_, i) => ({
    at: `2026-10-${String((i % 28) + 1).padStart(2, '0')} 0${i % 10}:1${i % 6}`,
    ip: `10.0.${id % 255}.${i}`,
    device: ['Chrome / macOS', 'Safari / iOS', 'Firefox / Linux'][i % 3]!,
    ok: i % 7 !== 0,
  }))
}

export default function UserDetail() {
  const params = useParams()
  const [user, setUser] = createSignal<User>()
  createEffect(
    () => Number(params.id),
    (id) => {
      fetchUser(id).then(setUser)
    },
  )
  const [logins, setLogins] = createSignal<Login[]>(untrack(() => makeLogins(Number(params.id))))
  return (
    <section class="page">
      <p><a href="/users">← Back to users</a></p>
        <Show when={user()} fallback={<p>Loading user…</p>}>
          {(u) => (
            <div class="detail" data-testid="detail">
              <h1>{u().name}</h1>
              <dl>
                <dt>Email</dt><dd>{u().email}</dd>
                <dt>Role</dt><dd>{u().role}</dd>
                <dt>Status</dt><dd>{u().status}</dd>
                <dt>Logins</dt><dd>{u().logins}</dd>
              </dl>
            </div>
          )}
        </Show>
      <h2>Recent logins</h2>
      <div style={{ height: '320px' }}>
        <SpreadsheetGrid
          rows={logins()}
          onRowsChange={(next) => setLogins(next)}
          columns={loginColumns}
          rowKeyGetter={(r) => r.ip}
          localeText={localeTextEn}
          height="100%"
          ariaLabel="Recent logins"
        />
      </div>
    </section>
  )
}
