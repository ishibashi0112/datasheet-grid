import type { CSSProperties } from 'react';
import {
  getGridBarWrapperStyle,
  gridBarChipStyle,
  gridBarContainerStyle,
  gridBarGroupStyle,
} from './gridBarStyles';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

type DefaultGridBottomBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: Grid 下部の既定ステータスバーです。
export function DefaultGridBottomBar<T>({
  context,
}: DefaultGridBottomBarProps<T>) {
  // 追加: 共通 style helper から bottom bar 用 style を解決します。
  const wrapperStyle: CSSProperties = getGridBarWrapperStyle('bottom');
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  return (
    <div style={wrapperStyle}>
      <div style={gridBarContainerStyle}>
        <div style={gridBarGroupStyle}>
          <span style={gridBarChipStyle}>{derivedSummary.rowSummaryText}</span>
          <span style={gridBarChipStyle}>
            {derivedSummary.columnSummaryText}
          </span>
        </div>

        <div style={gridBarGroupStyle}>
          <span style={gridBarChipStyle}>
            Active: {derivedSummary.activeCellLabel}
          </span>
          <span style={gridBarChipStyle}>
            Selection: {derivedSummary.selectionLabel}
          </span>
          <span style={gridBarChipStyle}>
            {derivedSummary.selectionStatsText}
          </span>
          <span style={gridBarChipStyle}>
            Cols: {derivedSummary.selectionStats.selectedColumnCount}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DefaultGridBottomBar;

