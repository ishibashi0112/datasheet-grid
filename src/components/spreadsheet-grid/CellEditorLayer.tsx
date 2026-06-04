import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

type CellEditorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CellEditorLayerProps = {
  rect: CellEditorRect | null;
  headerHeight: number;
  rowHeaderWidth: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

// 追加: 編集中セルの上に input を重ねる editor layer です。
export function CellEditorLayer({
  rect,
  headerHeight,
  rowHeaderWidth,
  value,
  onChange,
  onCommit,
  onCancel,
}: CellEditorLayerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 追加: editor 表示時に自動フォーカスし、末尾へキャレット移動します。
  useEffect(() => {
    if (!rect || !inputRef.current) {
      return;
    }

    inputRef.current.focus();
    const end = inputRef.current.value.length;
    inputRef.current.setSelectionRange(end, end);
  }, [rect]);

  if (!rect) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: rowHeaderWidth + rect.left,
    top: headerHeight + rect.top,
    width: rect.width,
    height: rect.height,
    zIndex: 5,
    pointerEvents: 'none',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    border: '2px solid #2563eb',
    outline: 'none',
    padding: '0 10px',
    margin: 0,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    pointerEvents: 'auto',
  };

  // 追加: Enter で確定、Escape でキャンセル、Tab も確定のみ行います。
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      onCommit();
    }
  };

  return (
    <div style={wrapperStyle}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
        style={inputStyle}
      />
    </div>
  );
}

export default CellEditorLayer;