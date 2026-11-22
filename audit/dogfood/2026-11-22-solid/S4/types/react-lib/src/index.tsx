import { SpreadsheetGrid, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid'
export function MyGrid<T>(props: SpreadsheetGridProps<T>) {
  return <SpreadsheetGrid {...props} />
}
