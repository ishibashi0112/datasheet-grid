'use client';

// HeroUI(v3)の画面: HeroUI の部品と並べてグリッドを置き、themes/heroui.css で配色を HeroUI のテーマへ揃える。
// HeroUI のライト / ダークは <html> の dark クラスで決まるので、グリッドの theme にも同じものを渡す。
import { useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import './heroui-frame.css';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/heroui.css';
import { buildColumns, gridProps, initialRows, nextRow, useSiteDark, type Row, type Status } from './shared';

const STATUS_COLOR: Record<Status, 'success' | 'warning' | 'danger'> = { 有効: 'success', 保留: 'warning', 停止: 'danger' };

export function HeroUIFrame() {
  const siteDark = useSiteDark();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const columns = buildColumns({
    status: (status) => (
      <Chip color={STATUS_COLOR[status]} variant="soft" size="sm">
        {status}
      </Chip>
    ),
    action: (row) => (
      <Button size="sm" variant="secondary" onPress={() => setLastOpened(row.name)}>
        詳細
      </Button>
    ),
  });

  // サイトのライト / ダークが分かるまで(ハイドレーションまで)描かない。
  if (siteDark === null) return null;

  return (
    <div className="flex min-h-screen flex-col gap-3 bg-background p-3 text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onPress={() => setRows((current) => [...current, nextRow(current)])}>
          行を追加
        </Button>
        <Button variant="secondary" onPress={() => setRows(initialRows)}>
          元に戻す
        </Button>
        <Chip color="accent" variant="soft">
          {rows.length} 件
        </Chip>
        {lastOpened !== null && <span className="text-sm text-muted">「{lastOpened}」の詳細を押しました</span>}
      </div>
      <SpreadsheetGrid
        {...gridProps}
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        theme={siteDark ? 'dark' : 'light'}
      />
    </div>
  );
}