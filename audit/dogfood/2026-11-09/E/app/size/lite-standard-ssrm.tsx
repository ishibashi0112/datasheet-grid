import { createRoot } from 'react-dom/client';
import { createSpreadsheetGrid, standardFeatures, serverSideFeature } from '@ishibashi0112/spreadsheet-grid/lite';
const Grid = createSpreadsheetGrid({ features: { ...standardFeatures, serverSide: serverSideFeature } });
createRoot(document.getElementById('root')!).render(<Grid rows={[]} columns={[]} />);
