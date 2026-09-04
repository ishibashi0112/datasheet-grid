import { memo, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import type { VerticalRow } from '../logic/verticalGeometry';
import { cx } from '../logic/cx';

// 展開行(detail)レイヤーです(detail batch 3)。
//
// 配置(合意済み設計の具体化):
//   - 各ペインの「overlay + body の絶対配置レイヤー」の中に、GridBodyLayer の後続として置きます。
//     帯(detail 帯の背景)は mode に関わらず各ペイン幅いっぱいに描き、カード(消費側 UI)は
//     中央ペイン(mode='center')にだけ描きます。ペイン内に置くことで、既存の sticky ヘッダー
//     (ペイン内 z-index 6)の背面へ自動的に潜り、ポインタも既存のペイン経路で届きます。
//   - カードは帯(絶対配置・ペイン幅)の中の position: sticky 要素で、横スクロールしても
//     ビューポート左端(左固定ペイン / 行ヘッダーの右隣)に留まります。幅はビューポートの
//     中央可視幅です。JS のスクロール同期は使いません。
//   - 縦位置は virtualRow.start + size(セル行の直下)。スクロールアウトした行の帯は描画窓から
//     外れるため自然にアンマウントされます(React key = rowKey)。
//   - カード要素は data-ssg-detail を持ち、キーボード / クリップボード / コンテキストメニュー /
//     ドラッグ開始のイベントをグリッド本体へ伝播させません(イベント境界)。
//     ポインタイベントは止めません(親 shell のホバー解除・ポインタ追跡は無害で、止めると
//     グリッドのドラッグ選択中にカード上を通過したとき追従が途切れるため)。

export type GridDetailLayerEntry = {
  rowKey: string | number;
  virtualRow: VerticalRow;
};

type GridDetailLayerProps = {
  // 展開中かつ描画窓内のマスター行(detailSize 付き)。
  entries: readonly GridDetailLayerEntry[];
  // 'center' はカードも描画。'band' は帯の背景だけ(左右固定ペイン用)。
  mode: 'center' | 'band';
  // このペインの幅(帯の幅)。
  paneWidth: number;
  // 追加(scroll-space 仮想化): 絶対論理 top から差し引く基準オフセット(metrics 経路では 0)。
  baseOffset: number;
  // カードの sticky 左オフセット(= 左固定ペイン幅 + 中央ペイン先頭幅)とカード幅(中央可視幅)。
  cardStickyLeft: number;
  cardWidth: number;
  cardClassName?: string;
  renderCard: (entry: GridDetailLayerEntry) => ReactNode;
};

// イベント境界: グリッド本体(shell)の onKeyDown / onPaste / onContextMenu / onDragStart や
//   セル側のダブルクリック編集開始へ、カード内の操作を伝播させません。
const stopPropagation = (event: SyntheticEvent): void => {
  event.stopPropagation();
};

function GridDetailLayerInner({
  entries,
  mode,
  paneWidth,
  baseOffset,
  cardStickyLeft,
  cardWidth,
  cardClassName,
  renderCard,
}: GridDetailLayerProps) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      {entries.map((entry) => {
        const { virtualRow } = entry;
        const detailSize = virtualRow.detailSize ?? 0;
        if (detailSize <= 0) {
          return null;
        }
        const bandStyle: CSSProperties = {
          position: 'absolute',
          left: 0,
          top: virtualRow.start + (virtualRow.size ?? 0) - baseOffset,
          width: paneWidth,
          height: detailSize,
        };
        return (
          <div
            key={entry.rowKey}
            className="ssg-detail-band"
            data-detail-row-index={virtualRow.index}
            style={bandStyle}
          >
            {mode === 'center' && (
              <div
                className="ssg-detail-card-holder"
                style={{ left: cardStickyLeft, width: cardWidth }}
              >
                <div
                  className={cx('ssg-detail-card', cardClassName)}
                  data-ssg-detail=""
                  onKeyDown={stopPropagation}
                  onKeyUp={stopPropagation}
                  onPaste={stopPropagation}
                  onCopy={stopPropagation}
                  onCut={stopPropagation}
                  onContextMenu={stopPropagation}
                  onDragStart={stopPropagation}
                  onDoubleClick={stopPropagation}
                >
                  {renderCard(entry)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export const GridDetailLayer = memo(GridDetailLayerInner);

export default GridDetailLayer;