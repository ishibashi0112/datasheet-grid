// 追加(段階 3-3 ポップアップの遅延読み込み): jsdom で描く Solid 版のテストでは、後から読み込むポップアップの部品(列フィルター /
//   ツールパネル)をテストのファイルの始まる前に読み込みます(React 版のルートの vitest.setup.ts と同じ。開いた直後に中身を
//   確かめるテストをそのまま書けるように。利用側のテストへ案内している公開の関数 preloadGridPopups() と同じ手順)。
//   後から読み込む経路そのもの(読み込む前に開く / 暇なときの先読み)は src/lazyPopups.test.tsx が、読み込む前のモジュールで確かめます。
import { beforeAll } from 'vitest';

beforeAll(async () => {
  if (typeof document === 'undefined') {
    return;
  }
  const { preloadGridPopups } = await import('./src/view/lazyPopups');
  await preloadGridPopups();
});