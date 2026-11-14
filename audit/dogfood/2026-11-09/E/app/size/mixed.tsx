import { createRoot } from 'react-dom/client';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import { createSpreadsheetGrid, standardFeatures } from '@ishibashi0112/spreadsheet-grid/lite';
const Grid = createSpreadsheetGrid({ features: standardFeatures });
createRoot(document.getElementById('root')!).render(<><Grid rows={[]} columns={[]} /><SpreadsheetGrid rows={[]} columns={[]} /></>);
