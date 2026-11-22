import { Router } from './router'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import './app.css'

export function App() {
  return (
    <Router>
      {(props) => (
        <div class="shell">
          <nav class="nav">
            <strong>Admin</strong>
            <a href="/users">Users</a>
            <a href="/users/1">User #1</a>
            <a href="/settings">Settings</a>
          </nav>
          <main>{props.children}</main>
        </div>
      )}
    </Router>
  )
}
