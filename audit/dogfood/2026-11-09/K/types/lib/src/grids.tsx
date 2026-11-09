import { useRef, type ComponentProps } from 'react'
import {
  SpreadsheetGrid,
  restoreColumnsFromState,
  preloadGridPopups,
  type GridState,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid'
import {
  createSpreadsheetGrid,
  standardFeatures,
  findFeature,
  labelRowFeature,
  fillHandleFeature,
  serverSideFeature,
} from '@ishibashi0112/spreadsheet-grid/lite'
import { localeTextEn, gridAskLocaleTextEn } from '@ishibashi0112/spreadsheet-grid/locales/en'
import { GridAskBar, useGridAsk } from '@ishibashi0112/spreadsheet-grid/ai'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { itemColumns, type Item } from './columns.js'

// ドキュメント(versioning)の例そのまま
export const companyFeatures = { ...standardFeatures, find: findFeature }
export const CompanyGrid = createSpreadsheetGrid({ features: companyFeatures })

export const fullFeatures = { ...standardFeatures, labelRow: labelRowFeature, fillHandle: fillHandleFeature, serverSide: serverSideFeature }
export const BigGrid = createSpreadsheetGrid({ features: fullFeatures })

// 英語の文言を少し変えたもの
export const companyLocaleText = { ...localeTextEn, rowCount: 'Rows' }
export const companyAskLocaleText = { ...gridAskLocaleTextEn }

// グリッドを包む部品(React 19 の ref-as-prop)
export type InventoryGridProps = Omit<SpreadsheetGridProps<Item>, 'columns'> & { dense?: boolean }
export function InventoryGrid({ dense, ...props }: InventoryGridProps) {
  return <SpreadsheetGrid<Item> columns={itemColumns} density={dense ? 'compact' : undefined} {...props} />
}

// 推論のまま返すフック
export function useInventoryGridRef() {
  return useRef<SpreadsheetGridHandle<Item>>(null)
}

export const restoreItemColumns = (saved: GridState | undefined) => restoreColumnsFromState(itemColumns, saved)

// 公開型のプロパティを推論のまま再公開
export type InventoryHandle = SpreadsheetGridHandle<Item>
export const getStateOf = (h: InventoryHandle) => h.getState()
export const exportOf = (h: InventoryHandle) => h.getExportData()
export const selectionOf = (h: InventoryHandle) => h.getSelection()

export const preload = preloadGridPopups
export const stubs = installJsdomLayoutStubs

// AI バー
export function InventoryAsk(props: Omit<ComponentProps<typeof GridAskBar<Item>>, 'columns'>) {
  return <GridAskBar<Item> columns={itemColumns} {...props} />
}
export const useInventoryAsk = (opts: Omit<Parameters<typeof useGridAsk<Item>>[0], 'columns'>) => useGridAsk<Item>({ columns: itemColumns, ...opts })
