// セル / 行番号の右クリックメニュー(enableContextMenu + getContextMenuItems)の機能です。中身は core の
//   controllers/contextMenuController の接続(primitives/contextMenu)と、ポップアップの部品(view/CellContextMenuPopover)、
//   右クリックの対象(セル / 行番号)の解決です。右クリックの委譲のハンドラはシェルに置き、対象の解決をここへ任せます(React 版と
//   同じ)。機能セットに無い構成では enableContextMenu を false として扱い(createSpreadsheetGrid)、ブラウザの標準のメニューのまま。
//   - 対象の解決(buildBodyContextMenuParams / buildCellContextMenuParams)は core の logic/contextMenuTarget(React 版と同じ処理。
//     1.3.0 / 段 2-9 で寄せた)。
import {
  buildBodyContextMenuParams,
  buildCellContextMenuParams,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/contextMenuTarget';
import { DEFAULT_CONTEXT_MENU_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createCellContextMenu } from '../primitives/contextMenu';
import { CellContextMenuPopover } from '../view/CellContextMenuPopover';
import type { GridFeature, GridFeatureParts } from './types';

export const contextMenuFeature = {
  // メニューの読み上げの名前の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_CONTEXT_MENU_LOCALE_TEXT,
  createCellContextMenu,
  CellContextMenuPopover,
  buildBodyContextMenuParams,
  buildCellContextMenuParams,
} satisfies GridFeatureParts<'contextMenu'> as unknown as GridFeature<'contextMenu'>;