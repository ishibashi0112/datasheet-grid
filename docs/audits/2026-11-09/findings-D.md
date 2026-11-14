# アプリ D(SaaS 管理画面 / Next.js 16)点検報告

作業場所: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/D/`(アプリは `app/`、操作スクリプトは `scripts/`、スクショは `shots/`)。dev / 本番のサーバーは PID で止めました。3401 番は空いています。

## 1. 作ったもの

**構成**
- Next.js 16.4.5 の App Router(Turbopack)、React 19.3.0、TypeScript、Tailwind v4、pnpm。
- create-next-app の既定のまま使いました。`cacheComponents: true`、`partialPrefetching: true`、`reactStrictMode: true` です。
- shadcn の neutral の変数(oklch、`.dark`)と `themes/shadcn.css`。
- next-themes(`attribute="class"`)と、グリッドの `theme="class"`。
- 英語表示(`localeTextEn`)。

**サーバー側(Route Handler)**
- メモリ上に 50,000 人の DB を置きました(乱数の種で固定)。
- `GET /api/users`: 範囲、ソート、フィルターを受けます。kind ごとに解釈し、120〜320ms 遅らせます。
- `PATCH /api/users`: 300〜800ms 遅らせ、10% で 500 を返します。本文に `#fail` が入っていれば必ず失敗させます。サーバー側で email を小文字にし、seats か plan が変わると MRR を計算し直して `{rows}` を返します。
- そのほか `POST` / `DELETE`、候補用の `/api/users/options`、障害を切り替える `/api/debug`。

**画面**
- `/users` はサーバーコンポーネントです。`<Suspense>` の中で `await searchParams` してから、`'use client'` の UsersGrid へ `initialUrlState` を渡します。
- 渡している props: SSRM(`getRows` / `updateRows`、blockSize 100)、`initialState`、`find`、`showFilterChipBar`、`enableRowSelection` + `rowSelection`、`getFilterOptions`、`onFiltersChange` / `onSortChange` → URL の pushState、戻る / 進むで `applyState`、`onServerSideLoadError` / `onServerSideWriteError` → トースト、`enableContextMenu` + `getContextMenuItems`。
- 列の設定:
  - 固定: id / name。
  - 検証: name は必須で reject、email は正規表現で reject。
  - role / plan / status は select エディタと set フィルター。status には chips。
  - country は set で、候補はサーバーから取ります。
  - seats は number(min 1、integer)と numberFormatter。mrr は USD 表示と dataBar。
  - signedUpAt は dateSet、lastActiveAt は date、notes は flex。
- 招待フォーム(追加して `refreshServerSide()`)、選択した行の削除、Refresh、Retry(`retryServerSideLoads()`)、障害と書き込み失敗率の切り替え。
- `/settings`(画面遷移の確認用)。

## 2. 確かめた操作

Playwright の Chromium で、実際のマウスとキーで操作しました。console と pageerror を集め、StrictMode で、dev と本番(next build → next start)の両方で見ています。断りが無い項目では問題は見つかりませんでした。

**フィルターとソートがサーバーへ渡るか**
- 渡った kind: text の部分一致、set(include / exclude、`filterOptions` の有無で mode が変わる)、number(`>=`、範囲、空白)、dateSet(範囲、今月などのプリセット)、date の部分一致、ソート(昇順 / 降順 / 解除)。
- いずれも `params.query` に wire format どおり入り、サーバーの件数と「Rows N of N」が一致しました。
- set の候補は `getFilterOptions` で、ほかのフィルターを掛けた状態で取れました。
- フィルターチップバーの表示と × での解除、Filter manager / Sort manager / Choose columns も動きました。

**グローバルフィルターと find**
- `globalText` は約 300ms のデバウンスの後に 1 回だけ送られました。
- Ctrl+F(find)はロード済みの範囲だけを数えます(ドキュメントどおり)。

**編集と書き戻し**
- 保存中(pending)→ ✓ と出ます。reject のエディタは開いたままメッセージの吹き出しを出し、Esc で元に戻ります。
- サーバーが返した行はキャッシュへ入ります。email を小文字にしたもの、seats の変更で MRR を計算し直したものが、どちらもセルに出ました。
- select エディタ(キーとマウス)、date エディタ(ネイティブ)が動きました。貼り付けの `2024/4/1` と `April 2, 2024` は `YYYY-MM-DD` に直りました。
- Delete キー:
  - notes は空文字になって保存されました。
  - 必須の name は飛ばされました。
  - seats は null になって保存されました。number の検査は空を通すので、ドキュメントどおりです。
- mark の列(seats に 0 や "abc")は、印が付いたうえでサーバーへも書き戻されます。ドキュメントどおりです(要望 3 を参照)。
- SSRM での Ctrl+Z は何もせず、PATCH も出ません(ドキュメントどおり)。

**書き込みの失敗**
- 1 セルの失敗: ✕、セルのチップ「Couldn't save. The value was restored.」(role=status)、上のバー「Couldn't save changes (1 row)…」(role=alert)、値の巻き戻し、`onServerSideWriteError`。
- 3 行 × 2 列の貼り付け: PATCH は 1 回にまとまり、失敗するとすべて巻き戻り、成功するとすべて ✓ になりました。
- 同じセルを 2 回続けて編集し、2 回目だけが失敗した場合: 1 回目の値へ戻りました。

**編集中・保存中のスクロールや操作**
- 編集中にホイールでスクロールしても、エディタは付いてきて、確定もできました。
- 保存中にスクロールで離れて戻っても、値は正しいままでした。
- 保存中にソートすると、保存が終わるのを待ってから GET が出ました(約 1 秒)。
- 保存中に Refresh して保存が失敗した場合: バーが出て巻き戻り、取り直した値もサーバーと一致しました。
- スケルトン行で文字を打ってもエディタは開きません。

**追加と削除**
- 招待 → `refreshServerSide()` で 50,001 件になり、新しい人が先頭に出ました。スクロール位置はそのままでした。
- 3 行を選んで削除 → refresh で件数が減り、選択も消えました。
- 全選択すると exclude モードになり、深い位置の行も選択済みになりました。

**読み込みの失敗(500)**
- 失敗した範囲はバー「Couldn't load rows (N blocks) Retry ×」になります。
- 失敗した範囲へスクロールしても再要求しません。新しい範囲の失敗はバーに積み上がります。
- 再読み込みは、`retryServerSideLoads()`、バーの Retry、`refreshServerSide()` のどれでも動きました。× で閉じられ、スケルトンも残りませんでした。

**URL との同期**
- フィルター / ソート / グローバル → pushState が動きました。
- 戻る 3 回、進む 3 回で `applyState` し、毎回正しい query で GET が 1 本出ました。
- 再読み込みすると、サーバーの描画の時点から initialState が効いていました。JS 無しの HTML にも、検索欄の値とチップが出ていました。
- 今の列に無い列(`bogus`)は捨てられ、dev では警告が出ました。壊れた JSON は無視されました。
- 列の型に合わない kind(number 列に text)はそのまま受け付けて送ります。チップは `Contains "oops"` でした。

**ダークモード**
- `theme="class"` と next-themes: サーバーの描画の時点からダークになり、ちらつきはありませんでした。
- ポップオーバー、select、失敗表示もダークになり、切り替えにもすぐ追従しました。

**Server Component と Client Component の境目、警告**
- 列定義と `localeTextEn` は `'use client'` 側に置いています。
- ハイドレーションの警告は dev / 本番ともに 0 件でした。
- 英語表示: メニュー、フィルター、各管理パネル、右クリックメニュー、find、集計に、日本語は 1 文字もありませんでした(下の D-03 だけが例外)。

**キー操作とその他**
- Ctrl+End で末尾ブロックを取得、PageUp、Ctrl+Home が動きました。
- Ctrl+C は TSV になります。Ctrl+A + Ctrl+C はロード済みの 100 行だけで(ドキュメントどおり)、集計には「Loaded rows only」と出ます。
- 列幅の変更、自動調整、右クリックメニュー(Copy email)が動きました。
- 列の固定は、`onColumnsChange` が無いと注記つきで無効になります(ドキュメントどおり)。

**ビルドと画面遷移**
- `next build` + `next start` が通りました(/users は Partial Prerender)。
- /users → /settings → /users と移っても、Activity で状態は保たれ、編集もできました(スクロール位置だけが戻らない。D-08)。

**重さ(本番。参考値で、所見にはしていません)**
- 4 CPU を他の点検と共有していて、load average は 5.6〜8.5 でした。
- スクロール位置を 100ms ごとにランダムに 80 回ジャンプさせたときの長いタスク:

  | | 合計(4 回) | 最大 |
  | --- | --- | --- |
  | SSRM | 10.8 / 11.1 / 12.6 / 10.9 秒 | 238〜326ms |
  | 同じ列の clientSide 50,000 行 | 4.5 / 5.7 秒 | 103 / 308ms |

- SSRM は clientSide の約 2 倍です。スケルトンと実際の行で 2 回描くためと思われます。
- ホイール 100 回では、SSRM の長いタスクが 2〜23 個、clientSide は 0 個でした。
- そのほか: DOM の行は約 120 で一定、ヒープは 5.2 → 約 7MB、console の warn / error は 0 件。

## 3. 所見

**D-01 重要度 中 / 種類 不具合**
- 題名: Next 16 の既定(`cacheComponents: true`)では、`<Suspense>` の外に置いたグリッドで `next build` が失敗します。dev でも console.error が出ます。
- 再現手順: `'use client'` の最小のページ(`SpreadsheetGrid` に columns と rows だけ)を、Suspense なしで静的なルートに置きます。`D/repro-static-page/page.tsx` と、chips の列を足した `D/repro-chips-page/page.tsx` で確かめました。
- 期待: クイックスタート(docs/quick-start.mdx)の「サーバーレンダリング(SSR / SSG)でもエラーや警告なく描けます」のとおりに描けること。
- 実際:
  - dev: console.error「Route "/repro/static": Next.js encountered the unstable value `new Date()` in a Client Component.」
  - build: 「Error occurred prerendering page "/repro/chips" … Export encountered an error … exiting the build.」(終了コード 1)
- 切り分け: core の `dist/controllers/dateRolloverStore.js` の `createDateRolloverStore` が、作られた時点で `formatDateKey(new Date())` を計算しています。相対の日付フィルターを使っていなくても計算します。
- 回避策: `<Suspense>` で包みます。ビルドは通り、ページは静的なままで、dev の error も消えます。
- dev / 本番: 両方(本番はビルドが止まる)。確度: 確実。

**D-02 重要度 低 / 種類 不具合**
- 題名: chips の列の自動調整がチップのアイコンと余白を数えないため、調整した直後でも「Suspe…」に切れます。
- 再現手順: `conditionalFormat: { chips: {...} }` の列に、`autoSizeColumns="onMount"` を付けるか、列メニューで「Autosize all columns」を選びます。
- 期待: 一番長い値(suspended)が切れない幅になること。
- 実際: 列幅は 102 / 104px で、ラベルの scrollWidth 74 > clientWidth 50 です。チップでない同じ文字列なら 80px に収まります。
- 証拠: `shots/r-chips.png`、`shots/12-autosize.png`、`D/repro-chips-page/page.tsx`。
- dev で確認。確度: 確実。

**D-03 重要度 低 / 種類 使いにくさ**
- 題名: `localeTextEn` でも、number フィルターの `raw` が日本語(`"100 以上"`)になります。
- 再現手順: 英語表示で Seats に「Greater than or equal to 100」を入れます。
- 期待: 英語か、言語に依存しない文字列。
- 実際: `getRows` の query、URL のクエリ、サーバーのログに `"raw":"100 以上"` が入ります。画面には出ません。ドキュメントは「raw は日本語」と書いているので仕様どおりですが、英語のアプリでは URL に日本語が出ます。
- dev / 本番。確度: 確実。

**D-04 重要度 低 / 種類 ドキュメント**
- 題名: SSRM の wire format の説明に、number の `parsed` の形が書かれていません。
- 内容: API_REFERENCE の「列フィルターの wire format」は、textSet / dateSet の `condition` の形は書いています。一方 number は「`comparison` / `range` / `blank` / `notBlank` / `null`」とだけあり、`{ mode:'comparison', operator, value }` / `{ mode:'range', min, max }` というフィールド名がありません。
- 影響: サーバーを書くのに d.ts を読む必要がありました。
- 確度: 確実。

**D-05 重要度 低 / 種類 ドキュメント**
- 題名: API_REFERENCE の「URL のクエリから戻す」例は、Next 16 の既定構成(cacheComponents)ではビルドが止まります。
- 再現: 例のとおり、Suspense なしで `await searchParams` してグリッドへ渡します(`D/repro-urlstate-page/`)。
- 実際: `next build` が「Uncached data or `searchParams` accessed outside of `<Suspense>`」で失敗します。
- 原因は Next 側の制約です。例を `<Suspense>` で包むか、注記があると助かります。D-01 と同じく、Suspense が要ることをクイックスタートにも書くとよいと思います。
- 本番(build)。確度: 確実。

**D-06 重要度 低 / 種類 見た目**
- 題名: 左寄せ(既定)のテキストセルが、長い文字列を「…」なしで字の途中から切ります。
- 再現: 260px の email 列に長いアドレスを入れます。
- 期待: 右寄せや中央寄せのセルと同じく「…」が付くこと。`showCellOverflowTooltip` の説明も「省略(…)される」と書いています。
- 実際: `mason.brown27216@example.con` のように、最後の字の途中で切れます。
- 切り分け: style.css の ellipsis は `.ssg-body-cell--align-right/center>span` にしか付いていません。
- 証拠: `shots/08-back3.png`。
- 確度: 見た目は確実。Excel 風に意図して切っているのかは判断できません。

**D-07 重要度 低 / 種類 使いにくさ(アクセシビリティ)**
- 題名: mark で不正になったセルに `aria-invalid` が付きません。
- 再現: seats に 0 を入れます。
- 実際: セルには `ssg-body-cell--invalid` クラスと `data-ssg-tooltip="Enter 1 or more"` が付くだけです。支援技術には不正なことが伝わりません。
- 補足: 保存の失敗は role=alert / role=status で伝わるので問題ありません。
- dev / 本番。確度: 確実。

**D-08 重要度 低 / 種類 使いにくさ**
- 題名: Next の画面遷移で別のページへ移って戻ると、グリッドのスクロール位置が先頭に戻ります。
- 再現: /users で 8000px スクロールし、/settings へ移ってから戻る / 進むで /users へ戻ります。
- 実際: scrollTop が 0 になります。行の表示とグリッドの状態は一致していて、編集や選択も保たれています。
- 原因: Activity が display:none で隠すため、ブラウザがスクロール位置を捨てます。グリッドは位置を知っているので、見えたときに戻せるとよいです。
- dev。確度: 確実。

未確定のため所見から外したもの:
- クエリが変わった直後、行がフェードインしている間にアクティブセルの枠が空いた場所に一瞬見えた気がしました。撮り直しでは再現しませんでした。

## 4. ピン留め行

無し。

招待したばかりのユーザーを上に固定したい場面はありましたが、サーバーが先頭へ追加して `refreshServerSide()` することで足りました。

## 5. 要望

1. 描画中の `new Date()` をやめてください(D-01)。マウント後や effect で計算すれば、Suspense なしでも Next 16 の既定構成で通ります。直るまでは、クイックスタートに「cacheComponents では `<Suspense>` で包む」と書いてください。
2. number フィルターの `raw` を `localeText` に従わせるか、言語に依存しない式(`>=100`)にしてください(D-03)。
3. SSRM で mark の列の不正値(number 列の "abc" など)をサーバーへ送らないオプションがほしいです。または、serverSide では reject を勧めると書いてほしいです。
4. SSRM の総件数の表示で、フィルター前の総数も出せるとよいです(例: `getRows` の戻り値に `unfilteredRowCount`)。今は常に「Rows N of N」です。
5. SSRM で Ctrl+A → Ctrl+C がロード済みの行だけになるとき、集計と同じく「Loaded rows only」の表示がほしいです(ドキュメントには書いてありますが、画面からは分かりません)。
6. SSRM のグローバル検索で、見えている列(非表示の列を除く)を `query` に入れてほしいです。今はサーバーが `getState().columns` を別に知る必要があります。
7. `initialState` / `applyState` で、列の filterType と合わない kind(number 列に text)が来たら、dev で警告を出してほしいです。URL を手で直した値がそのまま通ります。
8. 画面遷移から戻ったときに、スクロール位置を戻してほしいです(D-08)。
