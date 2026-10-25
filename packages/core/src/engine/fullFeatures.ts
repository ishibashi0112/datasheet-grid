// 追加(差し込み式 段階 2): core の全機能の機能セットです(createGridEngine の init.features に渡す)。
//   createGridEngine / createGridApi は渡された機能だけを動かし、無い機能は何もしない代役にします(差し込み式の
//   lite 構成のため)。core を直接使って従来どおり全機能を動かすとき(フレームワークのアダプタを自作するとき等)は
//   これを渡します。React 版は features/full.ts で、これと同じ部品に描画の部品を足した表を使います。
import { createFindController } from '../controllers/findController';
import { createImeInputController } from '../controllers/imeInputController';
import { createChangeHighlightController } from '../controllers/changeHighlightController';
import { createAutoHeightMeasurer } from '../controllers/autoHeightMeasurer';
import { buildRowHeightStore, createAutoHeightRowMetrics } from '../logic/rowHeightStore';
import { createTotalRowCellsResolver } from '../logic/totalRow';
import { canStartImeEdit, resolveImeEditText } from '../logic/imeInput';
import { createConditionalFormatStatsResolver } from '../logic/conditionalFormat';
import { createExportCommands } from './exportCommands';
import { createColumnFilterStage } from './columnFilterStage';
import { createDateRolloverStore } from '../controllers/dateRolloverStore';
import { createSaveStatusController } from '../controllers/saveStatusController';
import {
  buildLabelDisplay,
  createLabelFreeOrder,
  createLabelRowModel,
  resolveLabelRowLayout,
  resolveStickyLabel,
  wrapRowModelWithLabelRows,
} from '../logic/labelRows';
import type { GridCoreFeatures } from './features';

export const fullCoreFeatures: Required<GridCoreFeatures> = {
  find: { createFindController },
  totalRow: { createTotalRowCellsResolver },
  imeDirectInput: { createImeInputController, canStartImeEdit, resolveImeEditText },
  conditionalFormat: { createConditionalFormatStatsResolver },
  motionExtras: { createChangeHighlightController },
  export: { createExportCommands },
  autoHeight: { createAutoHeightMeasurer, buildRowHeightStore, createAutoHeightRowMetrics },
  filtering: { createColumnFilterStage, createDateRolloverStore },
  serverSide: { createSaveStatusController },
  labelRow: {
    resolveLabelRowLayout,
    createLabelFreeOrder,
    buildLabelDisplay,
    createLabelRowModel,
    wrapRowModelWithLabelRows,
    resolveStickyLabel,
  },
};