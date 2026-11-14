// 同じページに /lite のグリッドと全部入りのグリッドを並べる
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/mantine.css';
import { MantineProvider, SimpleGrid, Title } from '@mantine/core';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import { ProductGrid } from './grid';
import { productColumns } from './columns';
import { generateRows, type CategoryRow, type Row } from './data';

const labelRow = { isLabelRow: (r: Row): r is CategoryRow => r.kind === 'category', getLabel: (r: CategoryRow) => r.name, sticky: true };
function App() {
  const [rows, setRows] = useState<Row[]>(() => generateRows(2000));
  return (
    <MantineProvider>
      <SimpleGrid cols={2} p="md">
        <div data-testid="lite" style={{ height: 600 }}>
          <Title order={5}>/lite</Title>
          <ProductGrid rows={rows} onRowsChange={setRows} columns={productColumns} rowKeyGetter={(r) => r.id} labelRow={labelRow} find fillHandle height={560} />
        </div>
        <div data-testid="full" style={{ height: 600 }}>
          <Title order={5}>全部入り</Title>
          <SpreadsheetGrid rows={rows} onRowsChange={setRows} columns={productColumns} rowKeyGetter={(r) => r.id} labelRow={labelRow} find fillHandle height={560} />
        </div>
      </SimpleGrid>
    </MantineProvider>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
