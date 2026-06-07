import type { CSSProperties } from 'react';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';
import  {   
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
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  return (
    <div style={wrapperStyle}>
      <div style={gridBarContainerStyle}>
        <div style={gridBarLeadingGroupStyle}>
          <span style={gridBarTitleStyle}>Toolbar</span>

          <span style={gridBarEmphasisChipStyle}>
            {derivedSummary.rowSummaryText}
          </span>

          <span style={gridBarEmphasisChipStyle}>
            {derivedSummary.columnSummaryText}
          </span>

          <span style={gridBarEmphasisChipStyle}>
            {derivedSummary.filterSummaryText}
          </span>

          <span style={gridBarEmphasisChipStyle}>
            {derivedSummary.sortSummaryText}
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


