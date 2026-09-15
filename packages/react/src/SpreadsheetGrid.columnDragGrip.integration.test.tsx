// 追加(監査 2026-09-15): 列 D&D の grip(ヘッダー右端の操作群)は controlled columns(onColumnsChange 指定)の
//   ときだけ描画される、という契約の結合テストです。本体分解 / monorepo 分割後も配線(useColumnHeaderDragController →
//   headerDragHandler → GridHeaderRow の onColumnDragHandlePointerDown)が生きていることを DOM で確認します。
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SpreadsheetGrid } from './SpreadsheetGrid';
import { installJsdomLayoutStubs } from './testing';
import type { GridColumn } from './model/gridTypes';

type Row = { id: number; name: string; qty: number };

const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 5 },
  { id: 2, name: 'beta', qty: 12 },
];
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160 },
  { key: 'qty', title: '数量', width: 100 },
];

describe('列 D&D の grip(controlled columns のときだけ描画)', () => {
  let restore: () => void;
  beforeAll(() => {
    restore = installJsdomLayoutStubs();
  });
  afterAll(() => {
    restore();
  });
  afterEach(() => {
    cleanup();
  });

  it('onColumnsChange を渡すと各列ヘッダーに grip が出る(列メニュー ⋮ の隣)', () => {
    const onColumnsChange = vi.fn();
    const { container } = render(
      <SpreadsheetGrid<Row> rows={rows} columns={columns} onColumnsChange={onColumnsChange} />,
    );
    const grips = container.querySelectorAll('.ssg-header-grip');
    expect(grips).toHaveLength(columns.length);
    // grip はヘッダーの操作群(hover でフェードイン)の中にある。
    expect(grips[0].closest('.ssg-header-actions')).not.toBeNull();
    expect(container.querySelectorAll('.ssg-header-actions .ssg-icon-btn').length).toBeGreaterThan(0);
  });

  it('onColumnsChange が無い(uncontrolled)と grip は出ない(列メニューは出る)', () => {
    const { container } = render(<SpreadsheetGrid<Row> rows={rows} columns={columns} />);
    expect(container.querySelectorAll('.ssg-header-grip')).toHaveLength(0);
    expect(container.querySelectorAll('.ssg-header-actions .ssg-icon-btn').length).toBeGreaterThan(0);
  });
});