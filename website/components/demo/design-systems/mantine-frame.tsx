'use client';

// Mantine の画面: MantineProvider の中にグリッドを置き、themes/mantine.css で配色を Mantine のテーマへ揃える。
// グリッドには useComputedColorScheme の値を渡す(利用側のアプリと同じ書き方)。
import { useState } from 'react';
import { Badge, Button, Group, MantineProvider, Text, useComputedColorScheme } from '@mantine/core';
import { SpreadsheetGrid, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid';
import '@mantine/core/styles.css';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/mantine.css';
import { buildColumns, gridProps, initialRows, nextRow, useSiteDark, type Row, type Status } from './shared';

const STATUS_COLOR: Record<Status, string> = { 有効: 'teal', 保留: 'yellow', 停止: 'red' };

// MantineProvider の内側で、実効のライト / ダークをグリッドの theme へ渡す。
function MantineGrid(props: SpreadsheetGridProps<Row>) {
  const scheme = useComputedColorScheme('light');
  return <SpreadsheetGrid {...props} theme={scheme} />;
}

export function MantineFrame() {
  const siteDark = useSiteDark();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const columns = buildColumns({
    status: (status) => (
      <Badge color={STATUS_COLOR[status]} variant="light">
        {status}
      </Badge>
    ),
    action: (row) => (
      <Button size="compact-sm" variant="default" onClick={() => setLastOpened(row.name)}>
        詳細
      </Button>
    ),
  });

  // サイトのライト / ダークが分かるまで(ハイドレーションまで)描かない。
  if (siteDark === null) return null;

  return (
    <MantineProvider forceColorScheme={siteDark ? 'dark' : 'light'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, minHeight: '100vh' }}>
        <Group gap="xs">
          <Button onClick={() => setRows((current) => [...current, nextRow(current)])}>行を追加</Button>
          <Button variant="default" onClick={() => setRows(initialRows)}>
            元に戻す
          </Button>
          <Badge variant="outline">{rows.length} 件</Badge>
          {lastOpened !== null && (
            <Text size="sm" c="dimmed">
              「{lastOpened}」の詳細を押しました
            </Text>
          )}
        </Group>
        <MantineGrid {...gridProps} rows={rows} columns={columns} onRowsChange={setRows} />
      </div>
    </MantineProvider>
  );
}