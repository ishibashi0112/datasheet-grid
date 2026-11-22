# Solid 版の品質を React 版にそろえる(段階 4)

2026-11-22 に Solid 版 `@ishibashi0112/spreadsheet-grid-solid` 0.1.0 を公開した後、ユーザーの依頼「Solid 版の初版ができたので、
粗を直して品質を React 版に合わせたい。残件があれば対応したい」で始めた。React 版がこれまでに受けた検証
(`docs/audits/README.md`)と同じ物差しで Solid 版を測り直し(段 1)、見つかったものを直して出し(段 2)、残件の大きなものを
0.2.0 にまとめる(段 3)。計画と、React 版と Solid 版の検証の差の棚卸しは Claude Doc「Solid 版の品質を React 版にそろえる計画」。

この表は進み具合の記録も兼ねる。コミットごとに「状況」を更新して push する(週の使用量の上限などで途中で止まっても、
別のセッションがこの表とコミットから再開できるように)。作業のブランチは `claude/project-thread-lw8d5c`。

## 決めたこと

- 2026-11-22: 段 1 の範囲は「全部(React 版と同じ物差し)」(ユーザーの選択)。下の 1-1〜1-6 をすべて行う。
- 段 1 では React 版と core を変えない。Solid 版だけの所見は見つけたら段 1 の中で直す。React 版も同じだった所見は段 2 で
  React 版と core の 1.2.2 と Solid 版の 0.1.1 を 1 回で出す(Solid 版は core の版に固定するので)。
- 段 2 のドキュメント: Solid 版の npm に API_REFERENCE.md と Skill を同梱し、主なガイド 8 本に Solid のタブを足す。
- 段 3(0.2.0)の中身(store で持つ行、遠くへのスクロールの速さ、Solid 版の `/ai`)は段 1 で測ってから決める。

## 段 1(測り直し)の進み具合

| # | 内容 | 状況 |
| --- | --- | --- |
| 1-0 | 始める前のゲート(main bc1d960) | 済み(ルートの vitest 280 ファイル / 2,814 件、Solid 版 173 件、ほかのゲートも緑) |
| 1-1 | React 版のテストの棚卸しと、Solid 版の比較テストへ移す | 済み(棚卸し `test-inventory.md`。比較テストを 77 件足し、Solid 版のテストは 20 ファイル・250 件。足した場面で React 版と Solid 版の差は無し。比較テストのハーネスに機能の入れ忘れの見張りを足し、空振りだった 2 つを直した) |
| 1-3 | 4 系統の全体レビュー(Solid 版の全体を、React 版と並べて別視点で読む) | 済み(所見は下の表。Solid 版だけの中 2・低 1 を段 1 で直す) |
| 1-3a | Solid 版だけの所見の修正(R1-1 / R2-1 / R3-1)と、食い違った SSR の所見(R4-1 / R4-2)の確かめ | 済み。R1-1 / R2-1 / R3-1 は 221f400(比較テストを足し、直す前は落ちることを確かめた。R3 のレビューで書いた比較テスト 24 件も入れた = Solid 版のテストは 23 ファイル・279 件)。R4-1 / R4-2 は 1-5 の SSR のゲートで再現し、R4-1 を直した(R4-2 は段 2)。R4-3 の文書も直した |
| 1-2 | React 版と Solid 版のハーネスのページへ同じでたらめな操作を流して比べる(スクリプトはリポジトリに残す) | まだ |
| 1-4 | Solid の版の組み合わせ(2.0.0 と最新の 2.0.x)を CI で回す | まだ |
| 1-5 | Solid らしい使い方の確かめ(非同期の行・`<Loading>`・`<Errored>`・遷移・HMR・複数のグリッド・`<Show>` の切り替えと編集中のアンマウント(AP-12)・SSR と hydration(`initialState`・`ssrCurrentTime`)) | SSR と hydration は済み(新しいゲート `pnpm --filter ./packages/solid run test:ssr` = `packages/solid/ssr/`。CI にも足した。下の「SSR とハイドレーションのゲート」)。ほかは まだ |
| 1-6 | 実アプリでの確かめ直し(2026-11-22 の 6 本を今の版で作り直し + 新しい 6 本 = 12 本) | まだ |
| 1-7 | 記録をまとめ、段 2 の中身をユーザーに相談する | まだ |

## 全体レビューの所見(1-3)

4 系統(R1 = 本体のシェルと配線、R2 = エディタと編集、R3 = ポップアップと機能、R4 = パッケージ・SSR・ドキュメント)。
それぞれ Solid 版のコードだけを渡し、React 版と比べて読んでもらった。再現のテストは各系統の作業用のコピーで書いたもの。

| ID | 重さ | Solid 版だけか | 内容 | 状況 |
| --- | --- | --- | --- | --- |
| R1-1 | 中 | Solid 版だけ | 自作の上部 / 下部バー(`renderTopBar` / `renderBottomBar`)の関数が 1 回だけ追跡されずに呼ばれ、関数の本体で ctx を読む・分割代入すると後から更新されない(README / ドキュメントの「ctx は読むたびに今の値」と食い違う) | 済み(221f400。追跡して呼び、文脈の値はキーごとに memo) |
| R2-1 | 中〜高 | Solid 版だけ | 編集中に上へ行が足され、編集している行の位置が一瞬グループ行になると、エディタの種類が text に倒れて作り直され、number / date は打ちかけを失い、複数行はフォーカスを失う(React 版は列からエディタを決める) | 済み(221f400。エディタの種類と揃えは列から) |
| R3-1 | 低 | Solid 版だけ | 列メニューの小メニュー(列の固定)の開閉を列が変わっても消さないので、その列へ戻ると開いたまま出る | 済み(221f400) |
| R3-2 | 低 | React 版も同じ | ツールパネルの ✎ で set の列を切り替えても、列フィルターの検索の文字が残る | 段 2 |
| R4-1 | 中 | Solid 版だけ | hydration でサーバーの root の class(テーマ・動き の 'auto')のまま解決し直さない(再現した。R1 の確かめが通ったのは、同じページで 2 回目の `hydrate()` がサーバーの要素を使わずに描き直していたため) | 済み(OS の設定の store をハイドレーションの間は getServerSnapshot から始める。`ssr/hydrate.themeMotion.test.tsx`) |
| R4-2 | 中 | Solid 版だけ | 相対日付のプリセットを SSR と hydration で使い、サーバーとクライアントで今日が違うと行と件数がサーバーのまま残り、使われなかった要素の警告が出る(再現した。React 版はクライアントで描き直して戻る) | 段 2(ハイドレーションの間はサーバーの基準日で絞り込む。core の列フィルターの段階へ基準日を渡す口が要る。`ssr/hydrate.relativeDate.test.tsx` は it.fails で待つ) |
| R4-3 | 低 | Solid 版だけ | README とサイトの SSR の例の import の誤り(`createRequestEvent` は `@solidjs/web`)と SolidStart の書き方の食い違い | 済み(README の「SSR(SolidStart など)」も外した) |
| R4-4 | 低 | core | core の開発時の警告が `/lite` の名前を出す(Solid 版では入口の名前が違う) | 段 2 |
| R4-5 | 低 | Solid 版だけ | Solid 版の npm に API_REFERENCE.md が無く、main のものへリンクしている | 段 2(ドキュメント) |
| R4-6 | 低 | Solid 版だけ | `createSpreadsheetGrid` に JSDoc が無い | 段 2(ドキュメント) |

ゲートの穴として、Solid 版の SSR / hydration のゲートが無いこと、`size:check` が import 条件のビルドだけを測ることも見つかった
(SSR は 1-5 でゲートを作った。サイズは段 2 で扱う)。

## SSR とハイドレーションのゲート(1-5)

`pnpm --filter ./packages/solid run test:ssr`(`packages/solid/ssr/`。約 10 秒。CI の Solid の手順にも足した)。

- `globalSetup.ts` が `render.mjs` を子のプロセスで 1 回走らせ、`fixtures.tsx` の表を Vite の SSR(`@solidjs/vite-plugin` の
  `ssr: true`)と `renderToString` で描く。描く時刻は固定(2026-11-22T12:00Z)、サーバーのタイムゾーンは UTC+14
  (`Pacific/Kiritimati`)で、クライアント(UTC-11 `Pacific/Pago_Pago`)と今日が 1 日ずれる。描いている間の `new Date()` /
  `Date.now()` の呼び出しも数える。
- `server.test.ts`: `initialState` の絞り込みと並べ替えがサーバーの HTML から効く / 日付の条件が無い表は描いている間に現在時刻を
  読まない(React 版の `initialState.ssr` / `ssrCurrentTime.ssr` と同じ)。
- `hydrate.<表>.test.tsx`: サーバーの HTML をハイドレーションできる形(`hydratable`)で変換した部品でハイドレーションし、
  警告(Solid の「使われなかったサーバーの要素」を含む)もエラーも無いこと、サーバーの root の要素をそのまま使うことを確かめる。
  Solid はページで 1 回のハイドレーションを前提にし、2 回目の `hydrate()` はサーバーの要素を使わずに描き直すので、
  表 1 つにつきファイル 1 つにしている(R1 のレビューの確かめが R4-1 を見逃したのはこのため)。
- 分かったこと: Solid 2.0 はハイドレーションでサーバーの要素の class や文字を書き直さない。クライアントだけで決まる値
  (OS の設定・今日の日付)は、ハイドレーションの間はサーバーと同じ値で描き、後から切り替える必要がある
  (Solid の `isHydrating()` の説明どおり)。

## 再開の手順

1. `git fetch origin claude/project-thread-lw8d5c && git checkout claude/project-thread-lw8d5c`、`pnpm install`。
2. 上の表で「まだ」の最初の行から。Solid 版のテストは `pnpm --filter ./packages/solid test`(約 3 分)、比較テストの 1 ファイルは
   `cd packages/solid && pnpm exec vitest run --config vitest.config.ts src/parity/<名前>.parity.test.tsx`。
   `PARITY_DUMP=<ディレクトリ>` で React 版と Solid 版の DOM と通知を `.react.txt` / `.solid.txt` に書き出す(差を見るとき)。
3. 比較テストで機能なしの構成をわざと比べるときは、確かめる機能のキーを `allowMissingFeatures` に並べる(並べないと、機能の
   入れ忘れの見張りがテストを落とす)。