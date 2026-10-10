// 追加(F-2 / セル内検索): グリッド右上に浮く検索バーです(find prop)。入力 → findController.setQuery、Enter / ↓ で次、
//   Shift+Enter / ↑ で前、Esc / × で閉じる(閉じたらグリッド本体へフォーカスを戻す)。件数は aria-live で読み上げ。
//   位置はヘッダー直下の右端(top はヘッダー高 + 6px をインライン)。
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ChangeEvent } from 'react';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import type { FindSnapshot } from '@ishibashi0112/spreadsheet-grid-core/controllers/findController';
import type { GridResolvedSlot } from '../model/gridTypes';

type GridFindBarProps = {
  snapshot: FindSnapshot;
  headerHeight: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  slot?: GridResolvedSlot;
};

export function GridFindBar({ snapshot, headerHeight, onQueryChange, onNext, onPrev, onClose, slot }: GridFindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 開いたときに入力へフォーカス(マウント時のみ。再描画では奪わない)。
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const count = snapshot.matches.length;
  const countLabel =
    snapshot.query.length === 0
      ? ''
      : snapshot.scanning
        ? '検索中…'
        : count === 0
          ? '0 件'
          : `${(snapshot.currentIndex ?? 0) + 1} / ${count}${snapshot.truncated ? '+' : ''}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onNext();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      onPrev();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    // グリッド本体のショートカット(矢印でのセル移動等)へ伝播させない。
    event.stopPropagation();
  };

  const style: CSSProperties = { ...slot?.style, top: headerHeight + 6 };

  return (
    <div
      className={cx('ssg-find-bar', slot?.className)}
      style={style}
      role="search"
      aria-label="セル内検索"
      // 検索バー内のポインタ操作をグリッド本体(選択開始 / 外側クリック判定)へ伝播させない。
      onPointerDown={(event) => event.stopPropagation()}
      data-ssg-find-bar=""
    >
      <span className="ssg-find-bar-icon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="20" y1="20" x2="16.5" y2="16.5" />
        </svg>
      </span>
      <input
        ref={inputRef}
        className="ssg-find-bar-input"
        type="text"
        value={snapshot.query}
        placeholder="検索"
        aria-label="検索文字列"
        onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span
        className={cx('ssg-find-bar-count', snapshot.query.length > 0 && !snapshot.scanning && count === 0 && 'ssg-find-bar-count--none')}
        aria-live="polite"
      >
        {countLabel}
      </span>
      <button type="button" className="ssg-find-bar-btn" onClick={onPrev} disabled={count === 0} aria-label="前のヒットへ" data-ssg-tooltip="前へ(Shift+Enter)">
        ↑
      </button>
      <button type="button" className="ssg-find-bar-btn" onClick={onNext} disabled={count === 0} aria-label="次のヒットへ" data-ssg-tooltip="次へ(Enter)">
        ↓
      </button>
      <button type="button" className="ssg-find-bar-btn" onClick={onClose} aria-label="検索を閉じる" data-ssg-tooltip="閉じる(Esc)">
        ×
      </button>
    </div>
  );
}

export default GridFindBar;
