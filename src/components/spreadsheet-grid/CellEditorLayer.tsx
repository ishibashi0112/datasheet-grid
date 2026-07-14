import { useState, type CSSProperties, type ReactNode } from 'react';
import type { EditorCommitDirection, GridColumnEditor } from './model/gridTypes';
import { TextCellEditor } from './editors/TextCellEditor';
import { NumberCellEditor } from './editors/NumberCellEditor';
import { SelectCellEditor } from './editors/SelectCellEditor';
import { DateCellEditor } from './editors/DateCellEditor';
import { toDateInputValue } from './logic/editorValues';

// 変更(editor 基盤): EditorCommitDirection は model/gridTypes.ts へ移設しました(公開型化)。
//   既存 import 互換のため re-export を残します。
export type { EditorCommitDirection };

// 変更(10-D): left は「ペイン列領域内ローカル座標」になりました（leadingWidth 非含有）。
type CellEditorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// 追加(editor: select): 編集中セルのセッション情報です。SpreadsheetGrid が editingCell から
//   解決して渡します(select の動的 options 解決・初期ハイライト、将来の custom エディタ ctx 用)。
export type CellEditorSession<T> = {
  row: T;
  rowIndex: number;
  colIndex: number;
  value: unknown;
};

type CellEditorLayerProps<T> = {
  rect: CellEditorRect | null;
  headerHeight: number;
  // 変更(10-D): rowHeaderWidth → leadingWidth に一般化しました。
  //             editor は active cell が属するペインの relative コンテナ内へ配置されます。
  leadingWidth: number;
  // 追加(scroll-space 仮想化 修正): 絶対論理 top から差し引く描画ウィンドウ基準オフセット(px)。
  //   no-op では 0(従来と同一配置)。scaling 時のみ正値です(詳細は ActiveCellOverlay と同様)。
  baseOffset?: number;
  // 変更(11-B6): 親が持つのは「編集開始時の初期値」だけになりました。
  //              毎キーストロークのドラフト値は各エディタのローカル state で管理し、
  //              親(SpreadsheetGrid)へは commit 時に最終値だけを渡します。
  //              これにより編集中のタイピングで親（＝3ペイン全体）が再レンダーされなくなります。
  initialValue: string;
  // 追加(editor 基盤): 編集中列のエディタ種別です。未指定は text(従来と同一)。
  editor?: GridColumnEditor<T>;
  // 追加(editor: select): 編集中セルのセッション情報(編集中のみ非 null)。
  editorSession?: CellEditorSession<T> | null;
  // 追加(editor: select): ポータル系エディタへ渡すテーマ修飾子('ssg-theme-dark' | undefined)。
  themeClassName?: string;
  // 変更(11-B6): (direction?) → (value, direction?) に変更。確定値を引数で受け取ります。
  // 変更(editor 基盤): value を unknown 化しました。組み込みエディタはドラフト文字列を、
  //   将来のカスタムエディタは型付きのドメイン値を直接渡せます(string は commit 側で
  //   列パーサを通し、非 string はそのまま書き込む共通規則 = logic/editorValues.ts)。
  onCommit: (value: unknown, direction?: EditorCommitDirection) => void;
  onCancel: () => void;
  // 追加(③): 編集 input の text-align。列 align に追従(右寄せ数値列を編集中も右寄せ維持)。
  align?: 'left' | 'center' | 'right';
};

// 追加: 編集中セルの上にエディタを重ねる editor layer です。
// 変更(10-D): ペイン別座標系に対応。
// 変更(editor 基盤): 単一 input からエディタ種別ディスパッチ層になりました。本コンポーネントは
//   「座標計算・セッション検知・種別分岐」だけを担い、input 実体とドラフト state は
//   editors/ 配下の各エディタが持ちます。
export function CellEditorLayer<T>({
  rect,
  headerHeight,
  leadingWidth,
  baseOffset = 0,
  initialValue,
  editor,
  editorSession,
  themeClassName,
  onCommit,
  onCancel,
  align,
}: CellEditorLayerProps<T>) {
  // 変更(editor 基盤): 「新しい編集セッションの開始」検知を、ドラフト直接リセットから
  //   sessionId カウンタ + key 再マウントへ置き換えました。rect の null → 非 null 遷移を
  //   レンダー中に検知して sessionId を進め、子エディタを key={sessionId} で再マウントします。
  //   各エディタは useState(initialValue) で素直にドラフトを初期化でき、同一セルの連続編集
  //   (Esc → 再 F2 等)でも前回ドラフトが残りません。
  // 実装メモ: 「レンダー中に過去の props と比較して state を調整する」React 公式パターンです
  //   (StrictMode 安全・従来実装と同型)。commit / cancel で必ず rect が null に戻るため、
  //   「null → 非 null」は常に新セッションを意味します。
  const isOpen = rect !== null;
  const [prevOpen, setPrevOpen] = useState(false);
  const [sessionId, setSessionId] = useState(0);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setSessionId(sessionId + 1);
    }
  }

  if (!rect) {
    return null;
  }

  // 変更(UI CSS移行): wrapper は座標のみインライン。zIndex / pointerEvents と input の静的
  //   スタイルは styles.css(.ssg-cell-editor / .ssg-cell-editor-input)へ。枠色は accent 追従。
  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: leadingWidth + rect.left,
    top: headerHeight + rect.top - baseOffset,
    width: rect.width,
    height: rect.height,
  };

  // 追加(editor 基盤): エディタ種別ディスパッチです。未指定 / 'text' は従来の text エディタ。
  let editorNode: ReactNode;
  if (editor?.type === 'number') {
    editorNode = (
      <NumberCellEditor
        key={sessionId}
        initialValue={initialValue}
        min={editor.min}
        max={editor.max}
        step={editor.step}
        onCommit={onCommit}
        onCancel={onCancel}
        align={align}
      />
    );
  } else if (editor?.type === 'date') {
    // date は印字キー開始の initialText を無視し、常に現セル値から開始します
    //   (editorSession 不在時のみ initialValue でフォールバック)。
    editorNode = (
      <DateCellEditor
        key={sessionId}
        initialValue={toDateInputValue(
          editorSession ? editorSession.value : initialValue,
        )}
        onCommit={onCommit}
        onCancel={onCancel}
        align={align}
      />
    );
  } else if (editor?.type === 'select') {
    // 動的 options(行依存)は編集中の行で解決します(消費側関数はレンダー中に呼ばれるため純粋前提)。
    const options =
      typeof editor.options === 'function'
        ? editorSession
          ? editor.options(editorSession.row)
          : []
        : editor.options;
    editorNode = (
      <SelectCellEditor
        key={sessionId}
        options={options}
        value={editorSession?.value}
        onCommit={onCommit}
        onCancel={onCancel}
        align={align}
        themeClassName={themeClassName}
      />
    );
  } else {
    editorNode = (
      <TextCellEditor
        key={sessionId}
        initialValue={initialValue}
        onCommit={onCommit}
        onCancel={onCancel}
        align={align}
      />
    );
  }

  return (
    <div className="ssg-cell-editor" style={wrapperStyle}>
      {editorNode}
    </div>
  );
}

export default CellEditorLayer;