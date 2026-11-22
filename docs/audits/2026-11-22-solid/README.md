# Solid 版 0.1.0 の前の実アプリ点検(2026-11-22)

まだ公開していない Solid 版 `@ishibashi0112/spreadsheet-grid-solid@0.1.0` の候補を、実際の利用者として 6 本のアプリで使い、実ブラウザで操作して確かめた記録。React 版 1.2.1(npm)と同じ構成・同じ操作の最小のアプリを作って比べ、所見ごとに「Solid だけ」か「React 版も同じ」かを書いた(ユーザーの判断「アプリを 6 本作って確かめる」。2026-11-21)。

- 対象: main c870040(1.2.1)の `packages/solid` を pack した tarball(版は 0.1.0)。core は npm の公開版 1.2.1。Solid 2.0.3、`@solidjs/web` 2.0.3、Vite 8.3.8、`@solidjs/vite-plugin` 3.0.1、`@solidjs/testing-library` 1.0.0-rc.2、`@solidjs/router` 2.0.1。
- 比べた React 版: npm の `@ishibashi0112/spreadsheet-grid@1.2.1`(React 19)。
- 方法: 3 人 × 2 本(S1 + S4 / S2 + S6 / S3 + S5)。資料は Solid 版の README と同梱の API_REFERENCE.md、サイトのガイド(React 版のものを読み替える)だけ。Playwright の Chromium で本番ビルドと dev の両方を操作し、不具合らしいものは最小の構成で再現し直してから React 版で同じ操作をした。手順は `audit/dogfood/2026-11-22-solid/BRIEF.md`。
- アプリのソースは `audit/dogfood/2026-11-22-solid/S1`〜`S6`(node_modules・ビルドの出力・スクリーンショット・測った結果の大きなファイルは除く)。各人の報告(再現手順と証拠のスクリプト)は `findings-S1-S4.md` / `findings-S2-S6.md` / `findings-S3-S5.md`(中の `$D` は `audit/dogfood/2026-11-22-solid`)。
- 報告のドキュメント(ユーザー向け): Claude Doc「Solid 版 0.1.0 前の実アプリ点検」。

## 結論

Solid 版だけの所見は高 1・中 1・低 12。操作の結果・見た目・速さで、React 版 1.2.1 より悪くなったところは無かった。React 版 1.2.1 も同じだった所見は低 16(うち未確定 1)。

## アプリ

| ID | 題材 | 主に確かめたこと |
| --- | --- | --- |
| S1 | 在庫・発注表(2,000 品目) | Tailwind v4 の `style.layer.css`、編集・検査(mark / reject)・Excel からの貼り付け・フィルハンドル・元に戻す・IME の直接入力・CSV・合計行、行を signal と store の 2 通りで持つ、ハンドル(変数 / 関数の ref) |
| S2 | SSR の管理画面(SSRM、50,000 人) | Vite 8 の SSR を手で組む(`renderToString` / `renderToStream` + `hydrate`)、`@solidjs/router` 2 でルートを 30 回往復、SSRM の書き戻しの失敗とロールバック・再試行、英語、URL と状態の同期 |
| S3 | 商品マスタ(5,000 件) | `createSpreadsheetGrid` + `standardFeatures` + 部品、shadcn のテーマ、ラベル行・行のドラッグ・custom エディタ(ポータル)、`<dialog>` の中、入れ忘れの警告、初期 JS の大きさ、全部入りとの混在 |
| S4 | テストと型 | Vitest + jsdom / happy-dom + `@solidjs/testing-library`、`/testing`、Node の SSR、TypeScript 5.8 / 7.0 × bundler / nodenext、`strict` + `exactOptionalPropertyTypes`、包む部品の d.ts(npm / pnpm) |
| S5 | ログ 100 万行と株価のライブ画面 | 検索・フィルター・ソート・遠くへのスクロール、末尾を追うモード、250ms ごとの 100 行の更新(signal / `applyRows`)、`highlightChanges`・条件付き書式・`rowGroup`・固定行、速さとメモリを React 版の同じ画面と比べる |
| S6 | モバイル・読み上げ・ダイアログ | iPhone 13 / iPad Mini 相当のタッチ、キーボードだけの操作、axe-core と aria の木を React 版と比べる、展開行のカード、行のドラッグ、`<dialog>` の中、言語の切り替え |

## 所見と対応状況

「対応」の欄は、0.1.0 の前に何を直すかのユーザーの判断の後に埋める(案: Solid 版だけの所見は `packages/solid` とドキュメントで直し、React 版も同じだった所見は React 版の次の版へ回す)。

### Solid 版だけ

| ID | 重さ | 種類 | 内容 | 対応 |
| --- | --- | --- | --- | --- |
| S5-01 | 高 | 不具合 | README どおりに `let grid!` + `ref={grid}` で受けると、最初の `createEffect` と `onSettled` ではハンドルがまだ `undefined`。呼ぶと本番でも REACTIVITY_HALTED(アプリ全体の反応が止まる)。原因は `SpreadsheetGrid.tsx` がハンドルを `onSettled` で渡していること(子の onSettled は親の後) | 未対応 |
| S1-01 | 中 | 不具合 / 文書 | 行を `createStore` で持つと(`rows={state.rows}`)元に戻すが効かない(store のプロキシは `onRowsChange` で渡した配列と別の参照なので、`historyController` が外からの差し替えと見て履歴を消す)。dev では HUGE_FAN_IN(6,006 の依存)、1 編集 16〜24 件の STRICT_READ_UNTRACKED、IMMUTABLE_UPDATE_IN_STORE | 未対応 |
| S2-01 | 低 | 不具合(dev) | `onSortChange` / `onFiltersChange` / `onStateChange` / `onActiveCellChange` の中で signal を読むと STRICT_READ_UNTRACKED(通知が effect の中から呼ばれる) | 未対応 |
| S2-02 | 低 | 不具合(dev) | SSRM でグローバルフィルターを変えると EFFECT_RELAY_TEAR(effect の名前は fillHandle) | 未対応 |
| S5-03 | 低 | 不具合(dev) | `activeRowFollow` / 編集 / `autoHeightMeasurer` の effect から EFFECT_RELAY_TEAR と EFFECT_WRITES_OWN_SOURCE | 未対応 |
| S3-04 | 低 | 文書(dev) | 共通の props をオブジェクトで作り直して spread すると HUGE_FAN_OUT(本番の負荷は同じ) | 未対応 |
| S6-01 | 低 | 不具合 | タッチで checkbox / 展開トグルの端をタップしたときの当たり判定が React 版より狭い(Chromium のタッチの補正は click のリスナを持つ要素を選ぶ。React は要素に空の `onclick` を付け、Solid の委譲では `onclick` が null) | 未対応 |
| S3-05 | 低 | 文書 | テーマ CSS のコメントが React 版のパスを指す | 未対応 |
| S1-02 | 低 | 文書 | `setRows` の直後の `getViewRowIndex` / `startEditing` に `flush()` が要る(React 版の文書は `flushSync`) | 未対応 |
| S4-01 | 低 | 文書 | プラグイン無しの Vitest は `resolve.conditions` / `ssr.resolve.conditions` / `ssr.resolve.externalConditions` の 3 か所に `browser` が要る | 未対応 |
| S4-02 | 低 | 文書 | テストで signal を変えた / fireEvent を送った直後は `flush()` が要る | 未対応 |
| S2-03 | 低 | 文書 | Solid 2 で SSR を組む手順が無い(SolidStart 2.2.3 は Solid 1 のみ) | 未対応 |
| S2-04 | 低 | 文書 | URL と状態(`getState` / `applyState`)を同期する例が無い | 未対応 |
| S6-05 | 低 | 文書 | 展開行の `render` を呼び直さない規則が「React 版との違い」に無い | 未対応 |

### React 版 1.2.1 も同じ

| ID | 種類 | 内容 | 対応 |
| --- | --- | --- | --- |
| S1-03 | 不具合 | 書けるセルが 1 つも無い貼り付けでも `onRowsChange` が呼ばれ、空の元に戻すが積まれる | 未対応 |
| S4-09 | 不具合 | 選んだ行を消した後も、行の選択のキーが残る | 未対応 |
| S5-02 | 不具合 | 日付のフィルターで期間のプリセットを押すとフォーカスが body へ移り、Escape で閉じない | 未対応 |
| S6-02 | 読み上げ | 展開行を開くと `.ssg-tab-exit[aria-hidden="true"]` に `tabindex="0"`(axe の aria-hidden-focus) | 未対応 |
| S6-03 | 読み上げ | 合成列(行ドラッグ / 展開トグル)の列見出しが空(axe の empty-table-header) | 未対応 |
| S6-04 | 読み上げ | 条件付き書式の chips の既定の色の対比が 3.95:1 | 未対応 |
| S5-04 | 見た目 | グループ行の平均が 100px の列で省略される | 未対応 |
| S4-04 | 型 | pnpm で `numberFormatter()` の結果を推論のまま export すると TS2883 / TS2742(`numberParser` / `restoreColumnsFromState` も同じ形) | 未対応 |
| S4-05 | 型 | select の `options` に readonly の配列を渡せない | 未対応 |
| S4-06 | 型 | `SpreadsheetGridProps<T>` に部品と同じ `T extends object` の制約が無い | 未対応 |
| S4-03 | 文書 | `selectRange` / `applyState` の直後の `exportCsv` が古い範囲・並びで出る | 未対応 |
| S4-07 | 文書 | jsdom の user-event で number の列に打つと逆順(「42」が「24」) | 未対応 |
| S4-08 | 文書 | 値と表示名が別の列で、set フィルターの候補が生の値で並ぶ | 未対応 |
| S3-01 | 文書 | `<dialog>` の中で body へポータルした custom エディタの一覧を押せない(ポータル先は囲む `dialog` にする) | 未対応 |
| S3-02 | 文書 | `ctx.initialText` の中身がドキュメントより広い | 未対応 |
| S3-03 | 未確定 | 自動化のダブルクリックで別のセルを開くと custom エディタにキーが入らない(手で組んだ操作では再現しない) | 未対応 |

要望: CSV に出さない列を選べること、展開トグルの読み上げの名前に行の識別を入れること(どちらも React 版も同じ)。

## 問題が無かった範囲

- Tailwind v4 の preflight との共存(`style.layer.css` + `@layer`)、shadcn のテーマ、`theme="class"` のダークモード、`<dialog>` の中の列メニュー・フィルター・右クリック・select の一覧(前面に出て押せる、Esc はドキュメントどおり)。
- Excel からの貼り付け(全角数字・「１，２００」・「2026/11/1」・select の表示名)、フィルハンドルの連続データ、貼り付け / フィル / 編集の後の Ctrl+Z / Ctrl+Y(signal で持つとき)、IME の直接入力(CDP)、CSV(`includeTotalRow` / `escapeFormulas`)、`renderCell` の中のボタン。
- 入れ忘れの警告(find / fillHandle / enableRowDrag / enableContextMenu / filterType / labelRow / exportCsv())は日本語 + 英語で分かりやすく、部品を足せば動く。全部入りと `createSpreadsheetGrid` を同じページに置いても動き、大きさは全部入りとほぼ同じ。
- Vite 8 の SSR(`renderToString` / `renderToStream`)とハイドレーション(警告・二重の描画なし)、SSRM の列フィルター(text / set / date / number)・ソートがサーバーへ渡る、書き戻しの失敗とロールバック・保存の状態、`refreshServerSide()` / `retryServerSideLoads()`、保存中のグローバルフィルターは書き戻しの決着を待つ。ルートを 30 回往復してもノード 5,162・リスナー 600 で頭打ち、グリッドの無いページで window のリスナーは 18 に戻る(本番、CDP)。
- 英語の画面(列メニュー・ツールパネルの 3 タブ・全種類のフィルター・エディタ・右クリック・エラーのバー)に日本語は 0 件。`localeText` を signal で変えると文言が全部変わる。
- 型: インラインの列定義から行の型を推論、誤りは型エラー(`valueGetter`・number エディタのオプション・項目名・`rowKeyGetter`・`onRowsChange`)、`createSpreadsheetGrid` / `localeTextEn` / `installJsdomLayoutStubs`。npm(hoisted)では包む部品の d.ts に `/internal/` / `/dist/` のパスが出ない。TypeScript 7 で d.ts を出すには `rootDir` が要る(TypeScript の仕様)。
- axe-core の結果と aria の木は React 版と同じ。iPhone 13 / iPad Mini 相当でタッチのスクロール(選択は作られない)、タップでの選択と編集、横向きへの回転。`prefers-reduced-motion` と `forcedColors: 'active'`。

## 速さと大きさ

本番ビルド、4 CPU を 3 人で分けた機械で各 2 回(参考値)。

| ログ 100 万行(S5) | Solid 版 | React 版 |
| --- | --- | --- |
| 最初のセルまで(ms、データ生成を含む) | 1,275 / 1,366 | 1,192 / 1,001 |
| 検索(ms) | 465 / 456 | 395 / 370 |
| グローバルフィルター(ms、打つ時間を含む) | 1,712 / 1,647 | 1,902 / 1,815 |
| 列フィルター(ms) | 98 / 111 | 115 / 124 |
| 絞り込み中のソート(ms) | 164 / 160 | 143 / 152 |
| ホイールのフレーム p50 / p95(ms) | 11.2 / 49.7 | 12.3 / 43.6 |
| 読み込み後のヒープ | 198MB | 195MB |

- 株価(2,000 銘柄を 250ms ごとに 100 銘柄更新)を 3 分: どちらも約 60fps、ヒープの増え方は同じ +0.8MB、コンソールは 0 件。DOM の要素の数は同じ(Solid 版は目印のコメントと空のテキストのぶんノードが多い)。
- 末尾を追うモードで 2 万行 + autoHeight に足すときだけ、Solid 版が 1 回あたり約 15〜25ms 多い(参考値)。100 万行では同じ。
- dev の Solid はスクロールの p95 が 240ms(Solid の dev の計測のため。本番は上の表)。

初期 JS(S3、Vite 8、gzip、空の Solid アプリ 11.55KB を引いた値): 機能なし 約 91.8KB(README 約 90KB)/ standard 約 118.0KB(約 117KB)/ 全部入り 約 159.8KB(約 162KB)/ 全部入りと `/lite` の混在は全部入りとほぼ同じ / 後から読む分 14.80KB(約 16KB)。

## 進み具合

| 段 | 状況 |
| --- | --- |
| 6 本のアプリで点検 | 済み(2026-11-22) |
| 記録をリポジトリへ | このコミット |
| 0.1.0 の前に直すものを決める | ユーザーの判断待ち |
| 直す / ゲート / ハーネス / 再現の台本で確かめる | 未着手 |