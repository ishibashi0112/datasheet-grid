// マイルストーンの表。行は書き込める派生の signal(createSignal(fn))で持ち、
// 編集はそのまま signal へ戻してから裏で保存する(action を使わない書き方)。
import { createMemo, createSignal, Loading, Show } from 'solid-js'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { fetchMilestones, saveMilestones, type Milestone } from './api'
import { milestoneColumns } from './columns'

declare global {
  interface Window {
    __msGrid?: SpreadsheetGridHandle<Milestone> | undefined
  }
}

export function MilestonesPanel(props: { projectId: string }) {
  const server = createMemo(() => fetchMilestones(props.projectId))
  const [rows, setRows] = createSignal<Milestone[]>(() => server())
  const [status, setStatus] = createSignal('')

  const onRowsChange = (next: Milestone[]) => {
    setRows(next)
    setStatus('保存中…')
    saveMilestones(props.projectId, next).then(() => setStatus('保存しました'))
  }

  return (
    <Loading fallback={<div class="panel-loading">マイルストーンを読み込み中…</div>}>
      <div class="panel">
        <div class="panel-head">
          <span class="count">{rows().length} 件</span>
          <Show when={status()}>
            <span class="badge" data-testid="ms-status">
              {status()}
            </span>
          </Show>
        </div>
        <div class="grid-box">
          <SpreadsheetGrid
            ref={(h) => (window.__msGrid = h)}
            rows={rows()}
            columns={milestoneColumns}
            onRowsChange={onRowsChange}
            rowKeyGetter={(row) => row.id}
            height="100%"
            ariaLabel="マイルストーン"
          />
        </div>
      </div>
    </Loading>
  )
}
