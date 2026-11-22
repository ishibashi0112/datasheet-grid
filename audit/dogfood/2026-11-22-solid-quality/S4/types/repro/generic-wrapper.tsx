// S4-06: SpreadsheetGridProps<T> には制約が無いのに、部品は T extends object を要る
import { SpreadsheetGrid, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid-solid'
export function Wrap<T>(props: SpreadsheetGridProps<T>) {
  return <SpreadsheetGrid {...props} />
}
