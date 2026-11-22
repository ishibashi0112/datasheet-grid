// タスクの表。行は非同期の createMemo(または createDeferred)で読み、
// 編集は action + createOptimistic でサーバーへ保存する。並びと絞り込みは URL のクエリと同期する。
import {
  action,
  createDeferred,
  createEffect,
  createMemo,
  createOptimistic,
  createSignal,
  Errored,
  isPending,
  Loading,
  onFlush,
  refresh,
  Show,
} from 'solid-js'
import { useSearchParams } from '@solidjs/router'
import { SpreadsheetGrid, type GridState, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { changedRows, fetchTasks, saveTasks, type Task } from './api'
import { taskColumns } from './columns'
import { settings } from './settings'
import { filtersToParams, sameView, searchToState, sortToParam, type ViewSearch } from './urlState'

declare global {
  interface Window {
    __tasksGrid?: SpreadsheetGridHandle<Task> | undefined
    __events: string[]
  }
}
window.__events ??= []

export function TasksPanel(props: { projectId: string }) {
  const load = () => fetchTasks(props.projectId)
  const serverTasks = settings.loadMode === 'deferred' ? createDeferred(load) : createMemo(load)
  const [tasks, setTasks] = createOptimistic(() => serverTasks())
  const [saving, setSaving] = createOptimistic(false)
  const [message, setMessage] = createSignal<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const save = action(function* (projectId: string, prev: readonly Task[], next: Task[]) {
    setSaving(true)
    setTasks(next)
    const changed = changedRows(prev, next)
    yield saveTasks(projectId, changed)
    refresh(serverTasks)
    return changed.length
  })

  const onRowsChange = (next: Task[]) => {
    const prev = tasks()
    const projectId = props.projectId
    window.__events.push(`rowsChange:${projectId}`)
    const run = () =>
      save(projectId, prev, next).then(
        (n) => setMessage({ kind: 'ok', text: `${n} 件を保存しました` }),
        (err: unknown) => setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) }),
      )
    if (settings.saveMode === 'direct') run()
    else if (settings.saveMode === 'onFlush') onFlush(run)
    else setTimeout(run, 0)
  }

  // URL のクエリ(s / f / q)と並び・絞り込みを同期する
  const [search, setSearch] = useSearchParams<ViewSearch>()
  let grid: SpreadsheetGridHandle<Task> | undefined
  const onStateChange = (state: GridState) => {
    const next: ViewSearch = { s: sortToParam(state.sort), ...filtersToParams(state.filters) }
    window.__events.push(`stateChange:${next.s ?? ''}|${next.f ?? ''}|${next.q ?? ''}`)
    if (!sameView({ s: search.s, f: search.f, q: search.q }, next)) setSearch(next)
  }
  // 戻る / 進むで URL が変わったら表へ入れる
  createEffect(
    () => ({ s: search.s, f: search.f, q: search.q }),
    (view) => {
      if (!grid) return
      const st = grid.getState()
      const cur: ViewSearch = { s: sortToParam(st.sort), ...filtersToParams(st.filters) }
      if (!sameView(cur, view)) {
        window.__events.push(`applyState:${view.s ?? ''}|${view.f ?? ''}|${view.q ?? ''}`)
        grid.applyState(searchToState(view))
      }
    },
  )

  const remaining = createMemo(() => tasks().filter((t) => t.status !== '完了').length)

  return (
    <Errored
      fallback={(err, reset) => (
        <div class="panel-error" role="alert">
          <p>読み込めませんでした: {String((err() as Error)?.message ?? err())}</p>
          <button type="button" onClick={reset}>
            再試行
          </button>
        </div>
      )}
    >
      <Loading fallback={<div class="panel-loading">タスクを読み込み中…</div>} on={settings.loadingOn ? props.projectId : undefined}>
        <div class={['panel', { stale: isPending(() => tasks()) }]}>
          <div class="panel-head">
            <span class="count" data-testid="remaining">
              未完了 {remaining()} 件 / 全 {tasks().length} 件
            </span>
            <Show when={isPending(() => tasks())}>
              <span class="badge pending" data-testid="pending">
                更新中…
              </span>
            </Show>
            <Show when={saving()}>
              <span class="badge saving" data-testid="saving">
                保存中…
              </span>
            </Show>
            <Show when={message()}>
              {(m) => (
                <span class={['badge', m().kind]} data-testid="save-message">
                  {m().text}
                </span>
              )}
            </Show>
            <button type="button" onClick={() => refresh(serverTasks)}>
              再読み込み
            </button>
            <button type="button" onClick={() => grid?.downloadCsv(`tasks-${props.projectId}.csv`)}>
              CSV
            </button>
          </div>
          <div class="grid-box">
            <SpreadsheetGrid
              ref={(h) => {
                grid = h
                window.__tasksGrid = h
              }}
              rows={tasks()}
              columns={taskColumns}
              onRowsChange={onRowsChange}
              rowKeyGetter={(row) => row.id}
              initialState={searchToState({ s: search.s, f: search.f, q: search.q })}
              onStateChange={onStateChange}
              height="100%"
              totalRow
              fillHandle={settings.fill}
              enableContextMenu
              getContextMenuItems={(params) =>
                params.target.type === 'cell'
                  ? [
                      {
                        label: '完了にする',
                        onSelect: () => {
                          const key = params.target.rowKey
                          onRowsChange(tasks().map((t) => (t.id === key ? { ...t, status: '完了' as const } : t)))
                        },
                      },
                      {
                        label: '担当を外す',
                        onSelect: () => {
                          const key = params.target.rowKey
                          onRowsChange(tasks().map((t) => (t.id === key ? { ...t, assignee: null } : t)))
                        },
                      },
                    ]
                  : []
              }
              ariaLabel="タスク"
            />
          </div>
        </div>
      </Loading>
    </Errored>
  )
}
