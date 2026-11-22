import { createMemo, For, Loading } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { useIsRouting, useLocation } from '@solidjs/router'
import { fetchProjects } from './api'
import { saveSettings, settings, type Settings } from './settings'

export function Layout(props: { children?: JSX.Element }) {
  const projects = createMemo(() => fetchProjects())
  const location = useLocation()
  const isRouting = useIsRouting()
  // プロジェクトを切り替えても並び・絞り込み(クエリ)は残す
  const href = (id: string) => `/projects/${id}${location.search}`
  return (
    <div class="app">
      <aside class="side">
        <h1>タスク管理</h1>
        <Loading fallback={<p>…</p>}>
          <nav class="projects">
            <For each={projects()}>
              {(p) => (
                <a href={href(p.id)} data-project={p.id}>
                  {p.name}({p.taskCount})
                </a>
              )}
            </For>
          </nav>
        </Loading>
        <nav class="pages">
          <a href="/projects/web/report" data-link="report">レポート(web)</a>
          <a href="/members" data-link="members">メンバー</a>
        </nav>
        <fieldset class="settings">
          <legend>書き方</legend>
          <label>
            行
            <select value={settings.loadMode} onChange={(e) => saveSettings({ loadMode: e.currentTarget.value as Settings['loadMode'] })}>
              <option value="memo">createMemo(async)</option>
              <option value="deferred">createDeferred</option>
            </select>
          </label>
          <label>
            保存
            <select value={settings.saveMode} onChange={(e) => saveSettings({ saveMode: e.currentTarget.value as Settings['saveMode'] })}>
              <option value="direct">通知の中で action</option>
              <option value="onFlush">onFlush で action</option>
              <option value="timeout">setTimeout で action</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={settings.loadingOn} onChange={(e) => saveSettings({ loadingOn: e.currentTarget.checked })} />
            Loading on
          </label>
          <label>
            <input type="checkbox" checked={settings.fill} onChange={(e) => saveSettings({ fill: e.currentTarget.checked })} />
            fillHandle
          </label>
          <label>
            タブ
            <select value={settings.tabMode} onChange={(e) => saveSettings({ tabMode: e.currentTarget.value as Settings['tabMode'] })}>
              <option value="switch">Switch</option>
              <option value="show">Show</option>
            </select>
          </label>
        </fieldset>
      </aside>
      <main class={['main', { routing: isRouting() }]}>{props.children}</main>
    </div>
  )
}
