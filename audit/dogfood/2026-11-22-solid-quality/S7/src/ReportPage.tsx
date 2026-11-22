// 進み具合のレポート(グリッドの無いページ)
import { createMemo, For, Loading } from 'solid-js'
import { useParams } from '@solidjs/router'
import { fetchTasks, STATUSES } from './api'

export function ReportPage() {
  const params = useParams()
  const tasks = createMemo(() => fetchTasks(params.id ?? 'web'))
  const byStatus = createMemo(() => STATUSES.map((s) => ({ s, n: tasks().filter((t) => t.status === s).length })))
  return (
    <section class="report">
      <h2>レポート</h2>
      <Loading fallback={<p>集計中…</p>}>
        <ul>
          <For each={byStatus()}>{(x) => <li>{x.s}: {x.n} 件</li>}</For>
        </ul>
      </Loading>
    </section>
  )
}
