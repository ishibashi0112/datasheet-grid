import {
  createSpreadsheetGrid,
  standardFeatures,
  labelRowFeature,
  rowDragFeature,
  findFeature,
  contextMenuFeature,
  fillHandleFeature,
  selectionAggregatesFeature,
} from '@ishibashi0112/spreadsheet-grid/lite';

// 商品マスタで使う機能(モジュールの先頭で 1 回だけ作る)
export const productGridFeatures = {
  ...standardFeatures,
  labelRow: labelRowFeature,
  rowDrag: rowDragFeature,
  find: findFeature,
  contextMenu: contextMenuFeature,
  fillHandle: fillHandleFeature,
  selectionAggregates: selectionAggregatesFeature,
};

export const ProductGrid = createSpreadsheetGrid({ features: productGridFeatures });

// fillHandle を入れていない版(警告の確認用)
export const ProductGridNoFill = createSpreadsheetGrid({
  features: {
    ...standardFeatures,
    labelRow: labelRowFeature,
    rowDrag: rowDragFeature,
    find: findFeature,
    contextMenu: contextMenuFeature,
  },
});
