// 追加(DS-4 ①-(2)): メインスレッドへ一旦処理を返す yield ユーティリティです。
//   時間分割した autosize 計測の各チャンク境界で await し、ブラウザに入力処理 / 描画 /
//   スクロールの隙間を与えます。
// scheduler 選定メモ:
//   - setTimeout(fn, 0) は入れ子(タイマーから再度タイマー)で 4ms クランプが入り、
//     チャンク数ぶん遅延が積み上がります。完了までの待ち時間を短く保ちたいので避けます。
//   - MessageChannel.postMessage はクランプの対象外で、マクロタスク境界まで素早く戻ります。
//     本実装は yield ごとに使い捨ての MessageChannel を 1 つ作って解放します
//     (autosize 1 回あたりのチャンク数は数十程度で、生成コストは無視できます)。
//   - 非対応環境(SSR 等)では setTimeout へフォールバックします。
export const yieldToMain = (): Promise<void> =>
  new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });