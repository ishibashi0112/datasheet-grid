import type { CSSProperties } from 'react';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';
import {
  formatGridCellLabel,
  formatGridColumnSummary,
  formatGridRowSummary,
  formatGridSelectionLabel,
  formatGridSelectionStatsLabel,
  getGridSelectionStats,
} from './gridBarHelpers';
import {
  getGridBarWrapperStyle,
  gridBarChipStyle,
  gridBarContainerStyle,
  gridBarGroupStyle,
} from './gridBarStyles';

type DefaultGridBottomBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: Grid 下部の既定ステータスバーです。
export function DefaultGridBottomBar<T>({
  context,
}: DefaultGridBottomBarProps<T>) {
  // 追加: 共通 style helper から bottom bar 用 style を解決します。
  const wrapperStyle: CSSProperties = getGridBarWrapperStyle('bottom');
  // 追加: 選択統計を helper から取得します。
  const selectionStats = getGridSelectionStats(context);

  return (
    <div style={wrapperStyle}>
      <div style={gridBarContainerStyle}>
        <div style={gridBarGroupStyle}>
          <span style={gridBarChipStyle}>{formatGridRowSummary(context)}</span>
          <span style={gridBarChipStyle}>
            {formatGridColumnSummary(context)}
          </span>
        </div>

        <div style={gridBarGroupStyle}>
          <span style={gridBarChipStyle}>
            Active: {formatGridCellLabel(context.activeCell)}
          </span>
          <span style={gridBarChipStyle}>
            Selection: {formatGridSelectionLabel(context.selection)}
          </span>
          <span style={gridBarChipStyle}>
            {formatGridSelectionStatsLabel(context)}
          </span>
          <span style={gridBarChipStyle}>
            Cols: {selectionStats.selectedColumnCount}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DefaultGridBottomBar;
``