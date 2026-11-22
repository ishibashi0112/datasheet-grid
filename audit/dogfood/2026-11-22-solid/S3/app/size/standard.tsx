import { render } from '@solidjs/web'
import { createSpreadsheetGrid, standardFeatures } from '@ishibashi0112/spreadsheet-grid-solid'
import '@ishibashi0112/spreadsheet-grid-solid/style.css'
import { rows, columns } from './common'
const Grid = createSpreadsheetGrid({ features: standardFeatures })
render(() => <Grid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} />, document.getElementById('root')!)
