import { render } from '@solidjs/web'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { rows, columns } from './common'
render(() => <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />, document.getElementById('root')!)
