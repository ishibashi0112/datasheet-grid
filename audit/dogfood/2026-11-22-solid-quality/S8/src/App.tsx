import type { JSX } from '@solidjs/web'
import { Router } from './router'

function Layout(props: { children?: JSX.Element }) {
  return (
    <div class="layout">
      <nav class="nav">
        <h1>会議室の予約表</h1>
        <a href="/">予約</a>
        <a href="/rooms">会議室</a>
        <a href="/week">今週(非同期)</a>
        <a href="/?date=today">今日の予約</a>
      </nav>
      {props.children}
    </div>
  )
}

export function App() {
  return <Router>{(props) => <Layout>{props.children}</Layout>}</Router>
}
