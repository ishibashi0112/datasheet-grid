// 追加(差し込み式 段階 2): セル / 行のコンテキストメニュー(enableContextMenu + getContextMenuItems)の機能です。中身は
//   シェル(GridShell.tsx)にあった controller の接続と popover の描画、右クリックの対象(セル / 行番号)の解決をそのまま
//   移したもので、シェルは controller を元の位置で useCellContextMenu から受け取り、右クリックの委譲ハンドラ(シェル)は
//   対象の解決を buildBodyContextMenuParams に任せます。機能セットに無い構成では enableContextMenu を false として扱い
//   (createSpreadsheetGrid)、ブラウザ標準のメニューのままです。
import { CellContextMenuPopover } from '../view/CellContextMenuPopover';
import { useCellContextMenuController } from '../hooks/useCellContextMenuController';
// 変更(1.3.0 / Solid 版の品質の段 2-9): params を作る処理は core(Solid 版と同じ処理)。
import {
  buildBodyContextMenuParams,
  buildCellContextMenuParams,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/contextMenuTarget';
// 追加(1.2.0 / RV3-H2): メニューの読み上げの名前の既定(機能の localeText でシェルが埋める)。
import { DEFAULT_CONTEXT_MENU_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import type { FeatureLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import type { GridContextMenuItem } from '../model/gridTypes';
import type {
  CellContextMenuFeatureArgs,
  CellContextMenuFeatureResult,
  GridFeature,
  GridFeatureParts,
} from './types';

const EMPTY_CONTEXT_MENU_ITEMS: GridContextMenuItem[] = [];
type ContextMenuTexts = FeatureLocaleText<typeof DEFAULT_CONTEXT_MENU_LOCALE_TEXT>;

// 追加(バッチ②): セル/行の汎用コンテキストメニュー(完全カスタム)の controller です。
//             配置(右クリック座標)/ outside click / Escape / scroll close を管理します。
const useCellContextMenuFeature = <T,>({
  gridRootRef,
  localeTexts,
}: CellContextMenuFeatureArgs): CellContextMenuFeatureResult<T> => {
  const {
    contextMenuState,
    contextMenuLayout,
    contextMenuRef,
    isContextMenuOpen,
    openContextMenu,
    closeContextMenu,
  } = useCellContextMenuController<T>({ gridRootRef });
  return {
    isContextMenuOpen,
    openContextMenu,
    // コンテキストメニュー popover の描画です(portal で body 直下へ出します)。
    //   closed 時はコンポーネント側が null を返すため、常時この 1 要素を tail に置きます。
    renderContextMenuPopover: (slots, themeClassName) => (
      <CellContextMenuPopover
        slots={slots}
        themeClassName={themeClassName}
        isOpen={isContextMenuOpen}
        items={contextMenuState?.items ?? EMPTY_CONTEXT_MENU_ITEMS}
        layout={contextMenuLayout}
        popoverRef={contextMenuRef}
        onRequestClose={closeContextMenu}
        // 追加(1.2.0 / RV3-H2): メニューの読み上げの名前(セル / 行番号)。
        ariaLabel={
          contextMenuState?.params.target.type === 'rowHeader'
            ? (localeTexts as ContextMenuTexts).contextMenuRow
            : (localeTexts as ContextMenuTexts).contextMenuCell
        }
      />
    ),
  };
};

export const contextMenuFeature = {
  localeText: DEFAULT_CONTEXT_MENU_LOCALE_TEXT,
  useCellContextMenu: useCellContextMenuFeature,
  buildBodyContextMenuParams,
  buildCellContextMenuParams,
} satisfies GridFeatureParts<'contextMenu'> as unknown as GridFeature<'contextMenu'>;