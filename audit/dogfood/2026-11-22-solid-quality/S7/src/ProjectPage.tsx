// プロジェクトのページ。タブで「タスク」と「マイルストーン」の 2 つのグリッドを切り替える。
import { createSignal, Match, Show, Switch } from 'solid-js'
import { useParams } from '@solidjs/router'
import { settings } from './settings'
import { TasksPanel } from './TasksPanel'
import { MilestonesPanel } from './MilestonesPanel'

export function ProjectPage() {
  const params = useParams()
  const projectId = () => params.id ?? 'web'
  const [tab, setTab] = createSignal<'tasks' | 'milestones'>('tasks')

  return (
    <section class="project">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab() === 'tasks' ? 'true' : 'false'} onClick={() => setTab('tasks')}>
          タスク
        </button>
        <button type="button" role="tab" aria-selected={tab() === 'milestones' ? 'true' : 'false'} onClick={() => setTab('milestones')}>
          マイルストーン
        </button>
      </div>
      <Show
        when={settings.tabMode === 'switch'}
        fallback={
          <>
            <Show when={tab() === 'tasks'}>
              <TasksPanel projectId={projectId()} />
            </Show>
            <Show when={tab() === 'milestones'}>
              <MilestonesPanel projectId={projectId()} />
            </Show>
          </>
        }
      >
        <Switch>
          <Match when={tab() === 'tasks'}>
            <TasksPanel projectId={projectId()} />
          </Match>
          <Match when={tab() === 'milestones'}>
            <MilestonesPanel projectId={projectId()} />
          </Match>
        </Switch>
      </Show>
    </section>
  )
}
