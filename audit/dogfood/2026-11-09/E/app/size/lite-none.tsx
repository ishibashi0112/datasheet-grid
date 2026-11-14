import { createRoot } from 'react-dom/client';
import { createSpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid/lite';
const Grid = createSpreadsheetGrid({ features: {} });
createRoot(document.getElementById('root')!).render(<Grid rows={[]} columns={[]} />);
