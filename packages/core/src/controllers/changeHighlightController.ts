// 追加(motion-6 / M-2): rows の参照が変わったとき、値が変わったセルへ一過性のフラッシュ(ssg-body-cell--changed)を
//   直付けし、数値は旧値 → 新値へカウントアップ(文字ノードの nodeValue を rAF で補間)する DOM コントローラです
//   (React 非依存)。セル編集 / 貼り付け / クリア / undo・redo / 外部からの rows 差し替えのすべてが対象で、
//   「どこが変わったか」を一瞬で知らせます(highlightChanges。clientSide 専用)。
//   差分の取り方(コスト上限):
//   - 行は参照で比較し、同じ参照の行は飛ばします(グリッド起点の編集は変更行だけ新しいオブジェクトになる)。
//   - 参照が違う行は rowKey が一致することを確認します(一致しない = 挿入 / 削除 / 並べ替え = 構造変化)。構造変化と
//     参照の違う行が MAX_CHANGED_ROWS を超える場合(データの読み直し)は何もしません。
//   - 変わったセルが MAX_FLASH_CELLS を超えたら何もせず、MAX_TWEEN_CELLS を超えたらフラッシュだけ(トゥイーンなし)。
//   - DOM は描画中のセルだけを探します(仮想化の外は触らない)。既定セル(文字ノード 1 つ)だけトゥイーンし、
//     renderCell 列はフラッシュのみ。トゥイーン中の表示は column.valueFormatter で整形します。
import type { GridColumn, GridRowKey } from '../model/gridTypes.unbound';
import { getCellValue } from '../utils/permissions';

type ReadonlyRef<V> = { readonly current: V };

export type ChangeHighlightArgs<T> = {
  enabled: boolean;
  rows: readonly T[];
  rowKeyGetter: (row: T, index: number) => GridRowKey;
  columns: readonly GridColumn<T>[];
  scrollContainerRef: ReadonlyRef<HTMLElement | null>;
};

export type ChangeHighlightController<T> = {
  update: (args: ChangeHighlightArgs<T>) => void;
  dispose: () => void;
};

export const CHANGED_CLASS_NAME = 'ssg-body-cell--changed';
export const MAX_CHANGED_ROWS = 5000;
export const MAX_FLASH_CELLS = 2000;
export const MAX_TWEEN_CELLS = 200;
// animationend が届かないときのフォールバック。
export const CHANGED_FALLBACK_MS = 1500;
// トゥイーンの既定継続時間(--ssg-motion-base が読めない環境)。
const DEFAULT_TWEEN_MS = 260;

type ChangedCell<T> = {
  rowKey: GridRowKey;
  column: GridColumn<T>;
  row: T;
  prevValue: unknown;
  nextValue: unknown;
};

const formatValue = <T,>(column: GridColumn<T>, row: T, value: unknown): string =>
  column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// CSS の継続時間(例 "260ms" / "0.26s" / "0ms")を ms へ。読めなければ既定。
export const parseCssDuration = (raw: string | null | undefined, fallback: number): number => {
  if (!raw) {
    return fallback;
  }
  const text = raw.trim();
  const match = /^(-?[\d.]+)\s*(ms|s)$/.exec(text);
  if (!match) {
    return fallback;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return match[2] === 's' ? value * 1000 : value;
};

export const diffChangedCells = <T,>(
  prevRows: readonly T[],
  prevKeyOf: (row: T, index: number) => GridRowKey,
  nextRows: readonly T[],
  nextKeyOf: (row: T, index: number) => GridRowKey,
  columns: readonly GridColumn<T>[],
): ChangedCell<T>[] | null => {
  if (prevRows.length !== nextRows.length) {
    return null;
  }
  const changed: ChangedCell<T>[] = [];
  let changedRows = 0;
  for (let index = 0; index < nextRows.length; index += 1) {
    const prevRow = prevRows[index];
    const nextRow = nextRows[index];
    if (prevRow === nextRow) {
      continue;
    }
    changedRows += 1;
    if (changedRows > MAX_CHANGED_ROWS) {
      return null;
    }
    const rowKey = nextKeyOf(nextRow, index);
    if (prevKeyOf(prevRow, index) !== rowKey) {
      return null;
    }
    for (const column of columns) {
      const prevValue = getCellValue(prevRow, column);
      const nextValue = getCellValue(nextRow, column);
      if (Object.is(prevValue, nextValue)) {
        continue;
      }
      changed.push({ rowKey, column, row: nextRow, prevValue, nextValue });
      if (changed.length > MAX_FLASH_CELLS) {
        return null;
      }
    }
  }
  return changed;
};

const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

export const createChangeHighlightController = <T,>(): ChangeHighlightController<T> => {
  let prev: { rows: readonly T[]; rowKeyGetter: (row: T, index: number) => GridRowKey } | null = null;
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const tweens = new Set<number>();

  const clear = (el: HTMLElement) => {
    el.classList.remove(CHANGED_CLASS_NAME);
    const timer = timers.get(el);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(el);
    }
  };

  const flash = (el: HTMLElement) => {
    // 連続変更でも再生し直す(クラスを外して reflow を挟む)。
    clear(el);
    void el.offsetWidth;
    el.classList.add(CHANGED_CLASS_NAME);
    const handleEnd = () => {
      el.removeEventListener('animationend', handleEnd);
      clear(el);
    };
    el.addEventListener('animationend', handleEnd);
    timers.set(
      el,
      setTimeout(() => {
        el.removeEventListener('animationend', handleEnd);
        clear(el);
      }, CHANGED_FALLBACK_MS),
    );
  };

  // 既定セル(span > 文字ノード 1 つ)の文字ノードを返す。renderCell 列や複合内容では null。
  const textNodeOf = (cell: HTMLElement): Text | null => {
    const span = cell.firstElementChild;
    if (!span || span.childNodes.length !== 1) {
      return null;
    }
    const node = span.firstChild;
    return node && node.nodeType === Node.TEXT_NODE ? (node as Text) : null;
  };

  const tween = (cell: HTMLElement, change: ChangedCell<T>, durationMs: number) => {
    if (!isFiniteNumber(change.prevValue) || !isFiniteNumber(change.nextValue) || durationMs <= 0) {
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    const node = textNodeOf(cell);
    if (!node) {
      return;
    }
    const finalText = node.nodeValue ?? '';
    const from = change.prevValue;
    const to = change.nextValue;
    // 小数桁は新値に合わせる(最大 2)。
    const decimalsMatch = /\.(\d+)$/.exec(String(to));
    const decimals = Math.min(2, decimalsMatch ? decimalsMatch[1].length : 0);
    const start = performance.now();
    node.nodeValue = formatValue(change.column, change.row, from);
    const step = (now: number) => {
      tweens.delete(frameId);
      const progress = Math.min(1, (now - start) / durationMs);
      if (progress >= 1 || node.parentNode === null) {
        node.nodeValue = finalText;
        return;
      }
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Number((from + (to - from) * eased).toFixed(decimals));
      node.nodeValue = formatValue(change.column, change.row, current);
      frameId = requestAnimationFrame(step);
      tweens.add(frameId);
    };
    let frameId = requestAnimationFrame(step);
    tweens.add(frameId);
  };

  return {
    update: (args) => {
      const { enabled, rows, rowKeyGetter, columns, scrollContainerRef } = args;
      const previous = prev;
      prev = { rows, rowKeyGetter };
      if (!enabled || previous === null || previous.rows === rows) {
        return;
      }
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }
      const changed = diffChangedCells(previous.rows, previous.rowKeyGetter, rows, rowKeyGetter, columns);
      if (!changed || changed.length === 0) {
        return;
      }
      const durationMs = parseCssDuration(
        getComputedStyle(container).getPropertyValue('--ssg-motion-base'),
        DEFAULT_TWEEN_MS,
      );
      const allowTween = changed.length <= MAX_TWEEN_CELLS;
      for (const change of changed) {
        const selector = `.ssg-body-row[data-row-key="${cssEscape(String(change.rowKey))}"] .ssg-body-cell[data-ssg-col-key="${cssEscape(String(change.column.key))}"]`;
        container.querySelectorAll<HTMLElement>(selector).forEach((cell) => {
          flash(cell);
          if (allowTween && !change.column.renderCell) {
            tween(cell, change, durationMs);
          }
        });
      }
    },
    dispose: () => {
      for (const el of Array.from(timers.keys())) {
        clear(el);
      }
      if (typeof cancelAnimationFrame === 'function') {
        for (const id of tweens) {
          cancelAnimationFrame(id);
        }
      }
      tweens.clear();
      prev = null;
    },
  };
};
