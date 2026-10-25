'use client';

// Astryx の画面: Astryx の <Theme> の中にグリッドを置き、themes/astryx.css で配色を Astryx のテーマへ揃える。
// グリッドには Astryx の useTheme() の mode を渡す(利用側のアプリと同じ書き方)。
import { useState } from 'react';
import { Theme, useTheme } from '@astryxdesign/core/theme';
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { SpreadsheetGrid, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/astryx.css';
import { buildColumns, gridProps, initialRows, nextRow, useSiteDark, type Row, type Status } from './shared';

const STATUS_VARIANT: Record<Status, BadgeVariant> = { 有効: 'success', 保留: 'warning', 停止: 'error' };

// Astryx の <Theme> の内側で、実効のライト / ダークをグリッドの theme へ渡す。
function AstryxGrid(props: SpreadsheetGridProps<Row>) {
  const { mode } = useTheme();
  return <SpreadsheetGrid {...props} theme={mode} />;
}

export function AstryxFrame() {
  const siteDark = useSiteDark();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const columns = buildColumns({
    status: (status) => <Badge variant={STATUS_VARIANT[status]} label={status} />,
    action: (row) => <Button label="詳細" size="sm" variant="secondary" onClick={() => setLastOpened(row.name)} />,
  });

  return (
    <Theme theme={neutralTheme} mode={siteDark ? 'dark' : 'light'}>
      <div className="flex min-h-screen flex-col gap-3 p-3" style={{ background: 'var(--color-background-body)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <Button label="行を追加" variant="primary" onClick={() => setRows((current) => [...current, nextRow(current)])} />
          <Button label="元に戻す" variant="secondary" onClick={() => setRows(initialRows)} />
          <Badge variant="info" label={`${rows.length} 件`} />
          {lastOpened !== null && (
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              「{lastOpened}」の詳細を押しました
            </span>
          )}
        </div>
        <AstryxGrid {...gridProps} rows={rows} columns={columns} onRowsChange={setRows} />
      </div>
    </Theme>
  );
}