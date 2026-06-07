import type { CSSProperties } from 'react';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

type DefaultGridTopBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
};

// 追加: Grid 上部の既定ツールバーです。現時点では Global Filter を主役にしつつ、
//       左側へ件数サマリを薄く出します。
export function DefaultGridTopBar<T>({
  context,
}: DefaultGridTopBarProps<T>) {
  const wrapperStyle: CSSProperties = {
    marginBottom: 12,
  };

  const barStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid #d7dce3',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  };

  const leftStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: '1 1 auto',
    color: '#334155',
    fontSize: 13,
    flexWrap: 'wrap',
  };

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 9999,
    backgroundColor: '#e2e8f0',
    color: '#334155',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    maxWidth: 320,
    boxSizing: 'border-box',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    outline: 'none',
    backgroundColor: '#ffffff',
  };

  return (
    <div style={wrapperStyle}>
      <div style={barStyle}>
        <div style={leftStyle}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#334155',
            }}
          >
            Toolbar
          </span>

          <span style={badgeStyle}>
            Rows: {context.filteredRows.length} / {context.rows.length}
          </span>

          <span style={badgeStyle}>
            Columns: {context.visibleColumns.length} / {context.columns.length}
          </span>
        </div>

        <input
          type="text"
          value={context.globalFilterText}
          onChange={(event) => context.setGlobalFilterText(event.target.value)}
          placeholder="グローバルフィルター"
          style={inputStyle}
        />
      </div>
    </div>
  );
}

export default DefaultGridTopBar;