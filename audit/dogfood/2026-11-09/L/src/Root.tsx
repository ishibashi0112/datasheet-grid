import { useEffect, useState } from 'react'
import { App } from './App'
import { DailySheet } from './DailySheet'

function currentView() {
  return location.hash === '#daily' ? 'daily' : 'list'
}

export function Root() {
  const [view, setView] = useState(currentView)
  useEffect(() => {
    const on = () => setView(currentView())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return (
    <div className="root-layout">
      <nav className="tabs" aria-label="画面">
        <a href="#list" aria-current={view === 'list' ? 'page' : undefined}>点検項目</a>
        <a href="#daily" aria-current={view === 'daily' ? 'page' : undefined}>日常点検表</a>
      </nav>
      {view === 'list' ? <App /> : <DailySheet />}
    </div>
  )
}
