// 行ドラッグのハンドル列(合成列)のセルの中身(機能 features/rowDrag の部品)。React 版の features/rowDrag.tsx の
//   renderHandleCell と同じ DOM と class。掴み手の pointerdown だけでドラッグを始め(セルの選択へは伝えない = コントローラが
//   止める)、ソート / フィルター中は淡色 + 理由のツールチップにします(そのときは pointerdown をセルへそのまま伝える)。
type RowDragHandleProps = {
  operable: boolean;
  tooltip: string;
  onPointerDown: (event: PointerEvent & { currentTarget: HTMLElement }) => void;
};

// React 版の <svg focusable="false">(Solid の型には focusable が無いので属性として渡す)。
const SVG_NOT_FOCUSABLE = { focusable: 'false' } as Record<string, string>;

export function RowDragHandle(props: RowDragHandleProps) {
  return (
    <span
      class={['ssg-row-drag-handle', { 'ssg-row-drag-handle--disabled': !props.operable }]}
      data-ssg-tooltip={props.tooltip}
      aria-hidden="true"
      onPointerDown={(event) => {
        if (props.operable) {
          props.onPointerDown(event);
        }
      }}
    >
      <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden="true" {...SVG_NOT_FOCUSABLE}>
        <circle cx="2" cy="3" r="1" />
        <circle cx="6" cy="3" r="1" />
        <circle cx="2" cy="7" r="1" />
        <circle cx="6" cy="7" r="1" />
        <circle cx="2" cy="11" r="1" />
        <circle cx="6" cy="11" r="1" />
      </svg>
    </span>
  );
}