import { render } from '@solidjs/web'
import { createSpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { rows, columns } from './common'
const Grid = createSpreadsheetGrid({ features: {} })
render(() => <Grid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />, document.getElementById('root')!)
