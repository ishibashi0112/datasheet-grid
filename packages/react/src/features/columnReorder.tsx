// 追加(差し込み式 段階 2): 列ヘッダーのドラッグによる列の並べ替え(onColumnsChange があるときの grip / ドロップの縦線 /
//   live 方式の columnDragMotion)の機能です。中身はシェル(GridShell.tsx)にあった節をそのまま移したもので、シェルは
//   元の位置で useColumnReorder を呼びます(中の hook の順番はシェルにあったときと同じ)。機能セットに無い構成では
//   代役(grip を出さない = onColumnsChange が無いときと同じ見出し、縦線も描かない)が受けます。
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import { useColumnHeaderDragController } from '../hooks/useColumnHeaderDragController';
import type { ColumnReorderFeatureArgs, ColumnReorderFeatureResult, ReactGridFeatures } from './types';

const useColumnReorderFeature = <T,>(args: ColumnReorderFeatureArgs<T>): ColumnReorderFeatureResult<T> => {
  // 追加(13-B3-2): ヘッダー D&D 並べ替え controller(ドロップインジケータ ref + 安定ハンドラ)。
  //   enabled は controlled columns(onColumnsChange あり)のときだけ true。
  const {
    onColumnDragHandlePointerDown,
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    // 追加(案A): 並べ替え確定後に呼ぶ settle アニメ発火関数です。
    applyReorderSettle,
  } = useColumnHeaderDragController<T>(args);

  // 追加(案A): 列レイアウト確定(並べ替え commit を含む)後に settle アニメを発火します。
  //   applyReorderSettle は「直前のドラッグが same-pane 並べ替えで armed のとき」だけ動き、
  //   それ以外(初回 / リサイズ / ピン / 非表示)は即 return するため本 effect が走っても無害です。
  //   useLayoutEffect は paint 前に走るため、瞬間移動は見えず最初から「元位置→新位置」へ滑ります。
  const { paneLayout } = args;
  // 変更(React 18 対応 2026-10-28): React 18 の SSR で警告を出さない useIsomorphicLayoutEffect に(クライアントでは useLayoutEffect のまま)。
  useIsomorphicLayoutEffect(() => {
    applyReorderSettle();
  }, [paneLayout, applyReorderSettle]);

  return {
    onColumnDragHandlePointerDown,
    // ドロップインジケータ(縦線)。controller が ref 経由で display/left を imperative に制御します
    //   (ドラッグ中の再レンダーなし → GridHeaderRow の memo を維持)。
    renderDropIndicator: (pane, style) => (
      <div
        ref={pane === 'left' ? leftIndicatorRef : pane === 'center' ? centerIndicatorRef : rightIndicatorRef}
        className="ssg-col-drop-indicator"
        style={style}
      />
    ),
  };
};

export const columnReorderFeature: NonNullable<ReactGridFeatures['columnReorder']> = {
  useColumnReorder: useColumnReorderFeature,
};