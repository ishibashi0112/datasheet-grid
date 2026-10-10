// 追加(motion-0): motion prop('auto' | 'on' | 'off')を実効値('on' | 'off')へ解決する純関数です。
//   'auto' の判定材料(OS / ブラウザの「視差効果を減らす」設定)は controllers/reducedMotionStore が供給します。
//   theme の resolveGridTheme と同型(logic/theme.ts)。
import type { GridMotion } from '../model/gridTypes.unbound';

export type ResolvedGridMotion = 'on' | 'off';

// 実効値が 'off' のとき root / 全ポータル root へ付く修飾子クラスです(styles.css の継続時間トークンを 0 にする)。
export const MOTION_OFF_CLASS_NAME = 'ssg-motion-off';

export const resolveGridMotion = (
  motion: GridMotion,
  prefersReducedMotion: boolean,
): ResolvedGridMotion => {
  if (motion === 'off') {
    return 'off';
  }
  if (motion === 'auto') {
    return prefersReducedMotion ? 'off' : 'on';
  }
  return 'on';
};
