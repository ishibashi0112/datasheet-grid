import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Switch,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import type {
  GridContextMenuItem,
  GridContextMenuParams,
  LabelRowOptions,
  RowMoveParams,
  SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid/lite';
import { ProductGrid, ProductGridNoFill } from './grid';
import { productColumns } from './columns';
import { CATEGORIES, generateRows, type CategoryRow, type ProductRow, type Row } from './data';

const initialRows = generateRows(5000);

// rows の index から、その行が属するカテゴリ(直前のラベル行)を返す
function categoryOf(rows: readonly Row[], index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const r = rows[i];
    if (r && r.kind === 'category') return r.code;
  }
  return null;
}

const labelRow: LabelRowOptions<Row, CategoryRow> = {
  isLabelRow: (row): row is CategoryRow => row.kind === 'category',
  getLabel: (row) => row.name,
  sticky: true,
  height: 34,
  render: ({ label, sectionRowCount }) => (
    <Group gap={8} wrap="nowrap">
      <Text fw={700} size="sm">
        {label}
      </Text>
      <Badge size="xs" variant="light">
        {sectionRowCount ?? 0} 件
      </Badge>
    </Group>
  ),
};

let seq = 90000;
function newProduct(): ProductRow {
  seq++;
  return {
    kind: 'product',
    id: `P-${seq}`,
    jan: '',
    name: '',
    image: '/thumbs/0.svg',
    maker: 'M001',
    supplier: null,
    price: null,
    cost: null,
    stock: 0,
    status: 'draft',
    releaseDate: null,
    taxRate: 8,
    discontinued: false,
    note: '',
  };
}

export default function App() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  // テスト用に公開
  (window as unknown as { __grid: typeof gridRef }).__grid = gridRef;
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const [message, setMessage] = useState<string | null>(null);
  const [useNoFill, setUseNoFill] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState('C01');
  const [moveLog, setMoveLog] = useState<string[]>([]);
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);

  const productCount = useMemo(() => rows.filter((r) => r.kind === 'product').length, [rows]);

  const handleRowMove = ({ rowKey, fromIndex, toIndex, rows: next }: RowMoveParams<Row>) => {
    const before = categoryOf(rows, fromIndex);
    const after = categoryOf(next, toIndex);
    setMoveLog((log) => [`${String(rowKey)}: ${fromIndex} → ${toIndex} (${before} → ${after})`, ...log].slice(0, 5));
    if (before !== after) {
      // カテゴリをまたぐ移動は認めない(元に戻す)
      gridRef.current?.undo();
      setMessage(`カテゴリをまたいだ移動はできません(${before} → ${after})。元に戻しました。`);
    }
  };

  const addRowBelow = () => {
    const grid = gridRef.current;
    const row = newProduct();
    let insertAt = rows.length;
    if (activeRowKey != null) {
      const idx = rows.findIndex((r) => r.id === activeRowKey);
      if (idx >= 0) insertAt = idx + 1;
    }
    flushSync(() => setRows((prev) => [...prev.slice(0, insertAt), row, ...prev.slice(insertAt)]));
    const viewRowIndex = grid?.getViewRowIndex(row.id) ?? -1;
    const colIndex = grid?.getColIndex('name') ?? -1;
    if (viewRowIndex >= 0 && colIndex >= 0) grid?.startEditing(viewRowIndex, colIndex);
  };

  const deleteSelected = () => {
    const keys = new Set(gridRef.current?.getSelectedRowKeys() ?? []);
    if (keys.size === 0) {
      setMessage('削除する行をチェックボックスで選んでください');
      return;
    }
    gridRef.current?.applyRows(rows.filter((r) => r.kind === 'category' || !keys.has(r.id)));
  };

  const getContextMenuItems = (params: GridContextMenuParams<Row>): GridContextMenuItem[] => {
    const target = params.target;
    const row = target.row;
    if (!row || row.kind !== 'product') return [];
    const items: GridContextMenuItem[] = [{ kind: 'label', label: row.id }];
    if (target.type === 'cell') {
      const value = target.value;
      items.push({ label: '値をコピー', icon: '📋', onSelect: () => void navigator.clipboard?.writeText(String(value ?? '')) });
    }
    items.push({
      label: '行を複製',
      onSelect: () => {
        const idx = rows.findIndex((r) => r.id === row.id);
        const copy: ProductRow = { ...row, id: `${row.id}-copy`, jan: '' };
        gridRef.current?.applyRows([...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)]);
      },
    });
    items.push({ kind: 'separator' });
    items.push({
      label: 'この行を削除',
      danger: true,
      onSelect: () => gridRef.current?.applyRows(rows.filter((r) => r.id !== row.id)),
    });
    return items;
  };

  const Grid = useNoFill ? ProductGridNoFill : ProductGrid;

  // モーダルで 1 カテゴリだけ編集する
  const modalRows = useMemo(() => {
    const start = rows.findIndex((r) => r.kind === 'category' && r.code === modalCategory);
    const out: Row[] = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i]!;
      if (i > start && r.kind === 'category') break;
      out.push(r);
    }
    return out;
  }, [rows, modalCategory]);

  const onModalRowsChange = (next: Row[]) => {
    // カテゴリの範囲を差し替える
    const start = rows.findIndex((r) => r.kind === 'category' && r.code === modalCategory);
    const end = start + modalRows.length;
    setRows([...rows.slice(0, start), ...next, ...rows.slice(end)]);
  };

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Title order={4}>商品マスタ</Title>
            <Badge variant="light" data-testid="product-count">
              {productCount.toLocaleString()} 件
            </Badge>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" variant="default" onClick={addRowBelow} data-testid="add-row">
              行を追加
            </Button>
            <Button size="xs" variant="default" color="red" onClick={deleteSelected} data-testid="delete-rows">
              選択行を削除
            </Button>
            <Button size="xs" variant="default" onClick={() => gridRef.current?.openFind()} data-testid="open-find">
              検索
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => gridRef.current?.downloadCsv('products.csv', { includeLabelRows: true })}
              data-testid="export-csv"
            >
              CSV 出力
            </Button>
            <Button size="xs" onClick={() => setModalOpen(true)} data-testid="open-modal">
              カテゴリをモーダルで編集
            </Button>
            <Switch
              size="xs"
              label="フィル無し版"
              checked={useNoFill}
              onChange={(e) => setUseNoFill(e.currentTarget.checked)}
              data-testid="nofill-switch"
            />
            <SegmentedControl
              size="xs"
              value={colorScheme}
              onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
              data={[
                { label: 'ライト', value: 'light' },
                { label: 'ダーク', value: 'dark' },
                { label: '自動', value: 'auto' },
              ]}
              data-testid="scheme"
            />
            <ActionIcon variant="default" aria-label="元に戻す" onClick={() => gridRef.current?.undo()} data-testid="undo">
              ↶
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        {message && (
          <Alert color="yellow" withCloseButton onClose={() => setMessage(null)} mb="xs" data-testid="message">
            {message}
          </Alert>
        )}
        <div style={{ height: 'calc(100vh - 56px - 32px - 24px)' }} data-testid="grid-wrap">
          <Grid
            ref={gridRef}
            rows={rows}
            onRowsChange={setRows}
            columns={productColumns}
            rowKeyGetter={(row) => row.id}
            labelRow={labelRow}
            enableRowDrag
            isRowDraggable={(row) => row.kind === 'product' && !row.discontinued}
            onRowMove={handleRowMove}
            find
            enableContextMenu
            getContextMenuItems={getContextMenuItems}
            fillHandle
            enableRowSelection
            rowHeight={36}
            theme={scheme}
            height="100%"
            ariaLabel="商品マスタ"
            onActiveCellChange={(cell) => setActiveRowKey(cell ? String(cell.rowKey) : null)}
          />
        </div>
        <Text size="xs" c="dimmed" data-testid="move-log">
          {moveLog.join(' / ')}
        </Text>
      </AppShell.Main>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="カテゴリを編集"
        size="90%"
        data-testid="modal"
      >
        <Group mb="xs">
          <SegmentedControl
            size="xs"
            value={modalCategory}
            onChange={setModalCategory}
            data={CATEGORIES.slice(0, 4).map((c) => ({ label: c.name, value: c.code }))}
          />
        </Group>
        <div style={{ height: 420 }} data-testid="modal-grid-wrap">
          <ProductGrid
            rows={modalRows}
            onRowsChange={onModalRowsChange}
            columns={productColumns}
            rowKeyGetter={(row) => row.id}
            labelRow={labelRow}
            enableContextMenu
            getContextMenuItems={getContextMenuItems}
            find
            theme={scheme}
            height="100%"
            ariaLabel="カテゴリの商品"
          />
        </div>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={() => setModalOpen(false)} data-testid="modal-close">
            閉じる
          </Button>
        </Group>
      </Modal>
    </AppShell>
  );
}
