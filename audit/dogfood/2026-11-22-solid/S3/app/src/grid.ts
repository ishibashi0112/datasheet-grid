// 機能を選んで組み込んだグリッド(モジュールの先頭で 1 回だけ作る)
import {
  createSpreadsheetGrid,
  standardFeatures,
  labelRowFeature,
  rowDragFeature,
  findFeature,
  contextMenuFeature,
  fillHandleFeature,
  selectionAggregatesFeature,
} from '@ishibashi0112/spreadsheet-grid-solid'

// 商品マスタで使う機能: 標準 + ラベル行 + 行ドラッグ + 検索 + 右クリック + フィルハンドル + 選択範囲の集計
export const ProductGrid = createSpreadsheetGrid({
  features: {
    ...standardFeatures,
    labelRow: labelRowFeature,
    rowDrag: rowDragFeature,
    find: findFeature,
    contextMenu: contextMenuFeature,
    fillHandle: fillHandleFeature,
    selectionAggregates: selectionAggregatesFeature,
  },
})

// フィルハンドルを入れ忘れたグリッド(開発時の警告を確かめる)
export const ProductGridNoFill = createSpreadsheetGrid({
  features: {
    ...standardFeatures,
    labelRow: labelRowFeature,
    rowDrag: rowDragFeature,
    find: findFeature,
    contextMenu: contextMenuFeature,
  },
})

// 機能なし(警告の一覧を確かめる)
export const ProductGridBare = createSpreadsheetGrid({ features: {} })
