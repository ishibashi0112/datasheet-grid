// 追加(F-3): 条件付き書式の状態チップ(GridColumn.conditionalFormat.chips)の既定描画です。
//   角丸のピル + 色味ごとのアイコン(色だけで意味を運ばない)+ ラベル。色はトークン --ssg-cf-<tone> /
//   --ssg-cf-<tone>-bg(任意色は --ssg-cf-chip-color 経由で .ssg-chip--custom)。
import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import type { GridChipSpec, GridChipTone } from '@ishibashi0112/spreadsheet-grid-core/model/gridTypes.core';
import { resolveChipTone } from '@ishibashi0112/spreadsheet-grid-core/logic/conditionalFormat';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';

// 色味ごとのアイコン(12px の円の中に白い記号)。
const ICON_PATHS: Record<GridChipTone, ReactNode> = {
  neutral: <circle cx="6" cy="6" r="1.7" fill="currentColor" stroke="none" />,
  info: (
    <>
      <path d="M6 5.4v3.3" />
      <path d="M6 3.3v.1" />
    </>
  ),
  good: <path d="M3.2 6.3 5.2 8.3 8.9 4.3" />,
  warning: (
    <>
      <path d="M6 3.2v3.3" />
      <path d="M6 8.6v.1" />
    </>
  ),
  critical: (
    <>
      <path d="M3.9 3.9l4.2 4.2" />
      <path d="M8.1 3.9l-4.2 4.2" />
    </>
  ),
};

export function GridChip({ spec, children }: { spec: GridChipSpec; children: ReactNode }) {
  const tone = resolveChipTone(spec);
  const custom = spec.color !== undefined && spec.color !== '';
  const style = custom ? ({ '--ssg-cf-chip-color': spec.color } as CSSProperties) : undefined;
  return (
    <span className={cx('ssg-chip', custom ? 'ssg-chip--custom' : `ssg-chip--${tone}`)} style={style}>
      {spec.icon !== false && (
        <span className="ssg-chip-icon" aria-hidden="true">
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            {ICON_PATHS[tone]}
          </svg>
        </span>
      )}
      <span className="ssg-chip-label">{children}</span>
    </span>
  );
}
