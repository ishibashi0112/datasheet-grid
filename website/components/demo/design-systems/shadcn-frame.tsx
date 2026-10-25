'use client';

// shadcn/ui の画面: shadcn/ui の配色の変数(shadcn-frame.css)の上にグリッドを置き、themes/shadcn.css で配色を揃える。
// ボタンとバッジは shadcn/ui の Button / Badge と同じクラスを書いたもの(shadcn/ui は部品をコピーして使う形のため)。
// ライト / ダークは <html> の dark クラスで決まるので、グリッドの theme にも同じものを渡す。
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid';
import './shadcn-frame.css';
import '@ishibashi0112/spreadsheet-grid/style.css';
import '@ishibashi0112/spreadsheet-grid/themes/shadcn.css';
import { buildColumns, gridProps, initialRows, nextRow, useSiteDark, type Row, type Status } from './shared';

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const buttonVariant = {
  default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  outline:
    'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
};
const buttonSize = { default: 'h-9 px-4 py-2', xs: 'h-7 rounded-md px-2.5 text-xs' };

function ShadcnButton({
  variant = 'default',
  size = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariant; size?: keyof typeof buttonSize }) {
  return <button type="button" className={`${buttonBase} ${buttonVariant[variant]} ${buttonSize[size]}`} {...props} />;
}

const badgeBase =
  'inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium';
const badgeVariant = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  destructive: 'border-transparent bg-destructive text-white dark:bg-destructive/60',
  outline: 'text-foreground',
};

function ShadcnBadge({ variant = 'default', children }: { variant?: keyof typeof badgeVariant; children: ReactNode }) {
  return <span className={`${badgeBase} ${badgeVariant[variant]}`}>{children}</span>;
}

const STATUS_VARIANT: Record<Status, keyof typeof badgeVariant> = { 有効: 'secondary', 保留: 'outline', 停止: 'destructive' };

export function ShadcnFrame() {
  const siteDark = useSiteDark();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const columns = buildColumns({
    status: (status) => <ShadcnBadge variant={STATUS_VARIANT[status]}>{status}</ShadcnBadge>,
    action: (row) => (
      <ShadcnButton variant="outline" size="xs" onClick={() => setLastOpened(row.name)}>
        詳細
      </ShadcnButton>
    ),
  });

  // サイトのライト / ダークが分かるまで(ハイドレーションまで)描かない。
  if (siteDark === null) return null;

  return (
    <div className="flex min-h-screen flex-col gap-3 bg-background p-3 text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <ShadcnButton onClick={() => setRows((current) => [...current, nextRow(current)])}>行を追加</ShadcnButton>
        <ShadcnButton variant="outline" onClick={() => setRows(initialRows)}>
          元に戻す
        </ShadcnButton>
        <ShadcnBadge variant="outline">{rows.length} 件</ShadcnBadge>
        {lastOpened !== null && <span className="text-sm text-muted-foreground">「{lastOpened}」の詳細を押しました</span>}
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