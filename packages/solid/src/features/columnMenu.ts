// 列メニュー(見出しの ⋮ / 見出しの右クリック / Alt+↓)の機能です。メニューのコントローラ(core)の接続とポップアップの部品を
//   シェルへ渡します(React 版の features/columnMenu.ts と同じ)。機能セットに無い構成では ⋮ も見出しの右クリックも出しません
//   (右クリックはブラウザの標準のメニュー)。メニューの項目の処理は engine の columnCommands(本体)。
import { DEFAULT_COLUMN_MENU_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import { createColumnMenu } from '../primitives/columnMenu';
import { ColumnMenuPopover } from '../view/ColumnMenuPopover';
import type { GridFeature, GridFeatureParts } from './types';

export const columnMenuFeature = {
  createColumnMenu,
  ColumnMenuPopover,
  localeText: DEFAULT_COLUMN_MENU_LOCALE_TEXT,
} satisfies GridFeatureParts<'columnMenu'> as unknown as GridFeature<'columnMenu'>;