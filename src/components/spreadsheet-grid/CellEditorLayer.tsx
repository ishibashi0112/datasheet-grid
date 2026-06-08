// 追加: editor 確定後の移動方向です。
export type EditorCommitDirection = 'down' | 'right' | 'left';

import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';

// 変更(10-D): left は「ペイン列領域内ローカル座標」になりました（leadingWidth 非含有）。
type CellEditorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CellEditorLayerProps = {
  rect: CellEditorRect | null;
  headerHeight: number;
  // 変更(10-D): rowHeaderWidth → leadingWidth に一般化しました。
  //             editor は active cell が属するペインの relative コンテナ内へ配置されます。
  leadingWidth: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: (direction?: EditorCommitDirection) => void;
  onCancel: () => void;
};

// 追加: 編集中セルの上に input を重ねる editor layer です。
// 変更(10-D): ペイン別座標系に対応。
export function CellEditorLayer({
  rect,
  headerHeight,
  leadingWidth,
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
    left: leadingWidth + rect.left,
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

  // 追加: Enter で下、Tab で左右へ移動する方向付き commit を呼びます。
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit('down');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      onCommit(event.shiftKey ? 'left' : 'right');
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
        onBlur={() => onCommit()}
        style={inputStyle}
      />
    </div>
  );
}

export default CellEditorLayer;
