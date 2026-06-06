import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
} from 'react';

// 追加: popover のレイアウト情報です。
export type ColumnFilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
};

// 追加: select フィルター候補の最小型です。
export type ColumnFilterPopoverOption = {
  label: string;
  value: string;
};

type ColumnFilterPopoverProps = {
  isOpen: boolean;
  title: string;
  filterType: 'text' | 'number' | 'date' | 'select' | 'custom';
  draftValue: string;
  currentValueText: string;
  layout: ColumnFilterPopoverLayout | null;
  selectOptions: ColumnFilterPopoverOption[];
  popoverRef: RefObject<HTMLDivElement | null>;
  textInputRef: RefObject<HTMLInputElement | null>;
  selectRef: RefObject<HTMLSelectElement | null>;
  onRequestClose: () => void;
  onDraftChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
};

// 追加: 列フィルター popover の view component です。
export function ColumnFilterPopover({
  isOpen,
  title,
  filterType,
  draftValue,
  currentValueText,
  layout,
  selectOptions,
  popoverRef,
  textInputRef,
  selectRef,
  onRequestClose,
  onDraftChange,
  onApply,
  onClear,
}: ColumnFilterPopoverProps) {
  if (typeof document === 'undefined' || !isOpen || !layout) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: layout.top,
    left: layout.left,
    width: layout.width,
    padding: 12,
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
    zIndex: 1000,
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // 追加: portal 内 keyboard イベントを React ツリー上の parent へ流しません。
    event.stopPropagation();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 追加: popover 内 pointer 操作を外側へ伝播させません。
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={popoverRef}
      onPointerDown={handlePointerDown}
      onKeyDownCapture={handleKeyDownCapture}
      onPasteCapture={(event) => {
        // 追加: portal 内 paste も grid 側へ流しません。
        event.stopPropagation();
      }}
      style={wrapperStyle}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#334155',
          marginBottom: 8,
        }}
      >
        列フィルター: {title}
      </div>

      {filterType === 'select' ? (
        <>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 8,
            }}
          >
            フィルター種別: select
          </div>
          <select
            ref={selectRef}
            value={draftValue}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // 追加: select 内操作を grid 側へ伝播させません。
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                onApply();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onRequestClose();
              }
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
              marginBottom: 8,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">（すべて）</option>
            {selectOptions.map((option) => (
              <option key={`${title}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 10,
            }}
          >
            候補数: {selectOptions.length}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 8,
            }}
          >
            フィルター種別: {filterType === 'number' ? 'number' : 'text'}
          </div>
          <input
            ref={textInputRef}
            type="text"
            value={draftValue}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // 追加: filter input 内入力を grid 側へ伝播させません。
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                onApply();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onRequestClose();
              }
            }}
            placeholder={
              filterType === 'number'
                ? '例: >=10 / <20 / 10..20 / =5'
                : '部分一致で絞り込み'
            }
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              outline: 'none',
              marginBottom: 8,
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 10,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {filterType === 'number'
              ? '数量系は =, >, >=, <, <=, .. が使えます'
              : 'text は部分一致検索です'}
          </div>
        </>
      )}

      <div
        style={{
          fontSize: 11,
          color: '#64748b',
          marginBottom: 10,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        現在値: {currentValueText}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClear();
          }}
          onKeyDown={(event) => {
            // 追加: popover 内 button の key 操作を grid 側へ流しません。
            event.stopPropagation();
          }}
          style={{
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#475569',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          クリア
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onApply();
          }}
          onKeyDown={(event) => {
            // 追加: popover 内 button の key 操作を grid 側へ流しません。
            event.stopPropagation();
          }}
          style={{
            border: '1px solid #2563eb',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            borderRadius: 8,
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          適用
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default ColumnFilterPopover;
