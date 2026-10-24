// 追加(lazy-popups): jsdom で描画する React 版のテストでは、遅延読み込みするポップオーバー部品(列フィルター /
//   ツールパネル)をテストファイルの開始前に読み込みます。開いた直後に同期で中身を確かめる既存のテストを従来どおり
//   書けるようにするためで、利用側のテストへ案内している公開関数 preloadGridPopups() と同じ手順です。
//   遅延読み込みの経路そのもの(読み込み前に開く / 暇なときの先読み)は
//   packages/react/src/SpreadsheetGrid.lazyPopups.integration.test.tsx が読み込み前のモジュールで確かめます。
import { beforeAll, expect } from 'vitest';

beforeAll(async () => {
  const testPath = expect.getState().testPath ?? '';
  if (typeof document === 'undefined' || !/[\\/]packages[\\/]react[\\/]/.test(testPath)) {
    return;
  }
  const { preloadGridPopups } = await import('./packages/react/src/view/lazyPopups');
  await preloadGridPopups();
});