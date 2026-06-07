import type { CSSProperties } from 'react';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';
import {
  formatGridColumnSummary,
  formatGridRowSummary,
} from './gridBarHelpers';
import {
  getGridBarWrapperStyle,
  gridBarContainerStyle,
  gridBarEmphasisChipStyle,
  gridBarInputStyle,
  gridBarLeadingGroupStyle,
  gridBarTitleStyle,
} from './gridBarStyles';

type DefaultGridTopBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: Grid 上部の既定ツールバーです。現時点では Global Filter を主役にしつつ、
//       左側へ件数サマリを薄く出します。
export function DefaultGridTopBar<T>({
  context,
}: DefaultGridTopBarProps<T>) {
  // 追加: 共通 style helper から top bar 用 style を解決します。
  const wrapperStyle: CSSProperties = getGridBarWrapperStyle('top');

  return (
    <div style={wrapperStyle}>
      <div style={gridBarContainerStyle}>
        <div style={gridBarLeadingGroupStyle}>
          <span style={gridBarTitleStyle}>Toolbar</span>

          <span style={gridBarEmphasisChipStyle}>
            {formatGridRowSummary(context)}
          </span>

          <span style={gridBarEmphasisChipStyle}>
            {formatGridColumnSummary(context)}
          </span>
        </div>

        <input
          type="text"
          value={context.globalFilterText}
          onChange={(event) => context.setGlobalFilterText(event.target.value)}
          placeholder="グローバルフィルター"
          style={gridBarInputStyle}
        />
      </div>
    </div>
  );
}

export default DefaultGridTopBar;
``