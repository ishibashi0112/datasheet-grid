// 追加: editor 確定後の移動方向です。
export type EditorCommitDirection = 'down' | 'right' | 'left';

import {
  useEffect,
  useRef,
  useState,
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
  // 追加(scroll-space 仮想化 修正): 絶対論理 top から差し引く描画ウィンドウ基準オフセット(px)。
  //   no-op では 0(従来と同一配置)。scaling 時のみ正値です(詳細は ActiveCellOverlay と同様)。
  baseOffset?: number;
  // 変更(11-B6): 親が持つのは「編集開始時の初期値」だけになりました。
  //              毎キーストロークのドラフト値は本コンポーネントのローカル state で管理し、
  //              親(SpreadsheetGrid)へは commit 時に最終値だけを渡します。
  //              これにより編集中のタイピングで親（＝3ペイン全体）が再レンダーされなくなります。
  initialValue: string;
  // 変更(11-B6): (direction?) → (value, direction?) に変更。確定値を引数で受け取ります。
  onCommit: (value: string, direction?: EditorCommitDirection) => void;
  onCancel: () => void;
};

// 追加: 編集中セルの上に input を重ねる editor layer です。
// 変更(10-D): ペイン別座標系に対応。
// 変更(11-B6): ドラフト値をローカル state 化しました（コントロールドのまま、状態の置き場だけ移動）。
export function CellEditorLayer({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset = 0,
  initialValue,
  onCommit,
  onCancel,
}: CellEditorLayerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 追加(11-B6): 編集中のドラフト値です。タイピングはこの state だけを更新します。
  const [draftValue, setDraftValue] = useState('');

  // 追加(11-B6): 「新しい編集セッションの開始」を rect の null → 非 null 遷移で検知し、
  //              ドラフトを initialValue へリセットします。
  // 実装メモ: これは React 公式ドキュメントの「レンダー中に過去の props と比較して
  //   state を調整する」パターンです（effect ではなく render 中に setState することで、
  //   古いドラフトが 1 フレームでも描画されるのを防ぎます。StrictMode 安全）。
  //   commit / cancel で必ず rect が null に戻るため、「null → 非 null」は常に
  //   新セッションを意味します。同一セルを連続編集（Esc キャンセル → 再 F2 等）しても
  //   前回のドラフトが残りません。
  const isOpen = rect !== null;
  const [prevOpen, setPrevOpen] = useState(false);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setDraftValue(initialValue);
    }
  }

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
    top: headerHeight + rect.top - baseOffset,
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
  // 変更(11-B6): commit にローカルのドラフト値を引数で渡します。
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(draftValue, 'down');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      onCommit(draftValue, event.shiftKey ? 'left' : 'right');
    }
  };

  return (
    <div style={wrapperStyle}>
      <input
        ref={inputRef}
        type="text"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit(draftValue)}
        style={inputStyle}
      />
    </div>
  );
}

export default CellEditorLayer;