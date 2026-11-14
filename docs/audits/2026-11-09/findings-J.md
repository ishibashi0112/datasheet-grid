# J. ダッシュボードへの埋め込み: 点検の報告

`@ishibashi0112/spreadsheet-grid@1.0.0` を使った営業ダッシュボードを作り、Playwright の Chromium で dev と本番の両方を確かめました。所見は 12 件で、内訳は高 1、中 8、低 3 です(うち 1 件は未確定)。

- **いちばん大きい所見(J-01):** モーダルの Dialog の中ではグリッドのポップアップが使えません。shadcn と同じ Radix の Dialog では見えるのに押せず、HTML の `<dialog>.showModal()` ではダイアログの後ろに隠れます。
- **警告とエラー:** どの実行でも console の警告・エラーと pageerror は 0 件でした(React DevTools の案内だけ)。
- **後片付け:** 起動したサーバー(ポート 5410 の vite の dev と preview)は、すべて PID で止めました。

## 1. 作ったもの

**構成**
- Vite 7.3.7、React 19.3.1(StrictMode)、TypeScript 5.9(strict、bundler、verbatimModuleSyntax)。
- Tailwind CSS v4.3.5(`@tailwindcss/vite`。ダークは `<html class="dark">` で切り替え、グリッドは `theme="class"`)。
- Radix UI: Dialog 1.3.1 / Tabs 1.2.1 / Popover 1.3.1。react-resizable-panels 4.21.0。npm。日本語(既定)。
- CSS は `style.css` を読み込み、その後に Tailwind を読み込みました。
- アプリの場所: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/`
  - アプリの本体は `src/`、試験のスクリプトは `t/`、最小再現は `min/`、スクショは `shots/` にあります。

**画面「営業ダッシュボード」(縦に長いページ)**
- **ヘッダー**
  - Popover「表示設定」: タブの方式の切り替え、グリッドの表示 / 非表示、作り直し。
  - Popover「在庫を確認」: 中に小さなグリッド。select の列と右クリックメニューを入れた。
  - 「顧客を選ぶ…」: Radix Dialog の中に顧客 300 行のグリッド。セルを選んで「決定」、その場で編集もできる。
  - ダークの切り替え。
- **KPI のタイル**
- **タブ(Radix Tabs)**
  - 売上明細 5,000 行
    - 左右の固定列、date / select / number / checkbox のエディタ、chips、`totalRow`、`fillHandle`、`find`。
    - 右クリックメニュー、元に戻す / やり直しのボタン(`onUndoRedoStateChange`)、CSV。
  - 在庫 800 行: dataBar、`autoSizeColumns="onMount"`。
  - グラフ(準備中の表示だけ)。
  - 隠れたタブは `forceMount` で描いたままにする方式(display:none)と、アンマウントする方式(`?tabs=unmount`)を切り替えられる。
  - Alt+1〜3 のショートカットと、「SKU-00500 を在庫で開く」ボタン(ハンドルの `getViewRowIndex` / `selectCell` / `focus`)。
- **受注一覧 2,000 行(react-resizable-panels)**
  - 横の分割と縦の分割、畳む / 開く。
  - `hoverHighlight="cross"`、`onActiveCellChange` で右のペインに詳細を出す。
- **担当者別 KPI**
  - `transform: scale(0.8)` の箱の中(倍率を 1 / 0.8 / 0.6 で切り替え)。
  - `totalRow`、dataBar と colorScale、fillHandle、列の並べ替え(`onColumnsChange`)。
- **長い「お知らせ」**
- **クエリでの切り替え:** `?tabs=` / `?dlg=w1|w2|nogrid` / `?scale=` / `?jump=a|b|c` / `?dark=1`

## 2. 確かめた操作

括弧の中が結果です。

**分割パネル**
- 横の境目をマウスとキーボードで動かす: 幅 846→646→446→1046(列幅、横スクロール、詳細の追従ともに問題なし)。
- 縦の境目を動かす(高さの追従は問題なし)。
- 畳んで開く: スクロール位置 71,648px も戻る(問題なし)。

**隠れていたタブ**
- display:none から表示すると、行の描画とスクロール位置 72,000px が保たれる(問題なし)。
- 次の確定は問題なし:
  - 編集中にショートカットで切り替えたときの確定(force 方式)。
  - マウスでタブを押したときの確定(blur による)。
- 隠れたグリッドで開いていたフィルターは、タブを切り替えると閉じる(問題なし)。
- 隠れたタブの行へ飛ぶ:
  - `flushSync` で見せてから `selectCell` → `focus` まで動く(問題なし)。
  - 見せる前に呼ぶと、選択とスクロールはされるがフォーカスは移らない(想定どおり)。
- アンマウント方式で戻ると、スクロール位置とアクティブセルは失われる(想定どおり。要望に記載)。

**Dialog**
- Radix のモーダル / 非モーダル、HTML の `<dialog>`、グリッド無しの Dialog を比べた。
- 出現のアニメーション(scale 0.95→1)の間も、グリッドの大きさは正しい(920px)。
- Dialog の中のツールチップ(z 9000 で上に出る)と Tab の出入りは問題なし。
- `modal={false}` + `onInteractOutside` で `.ssg-*` を除いた形(w2)なら、列メニュー・フィルター(検索欄への入力を含む)・select・右クリックメニューがすべて動く。

**非モーダルの Radix Popover の中のグリッド**
- select の候補、列メニューのソート、右クリックメニューのクリックは問題なし(Esc は J-02)。

**拡大縮小の箱(0.8 / 0.6)**
- クリック、Shift+クリック、エディタの位置、列メニューの位置、フィルハンドルの描画位置、列の並べ替え、ホイールは問題なし(問題は J-07 / J-11)。

**メモリとリスナー(本番)**

| 操作 | 回数 | DOM ノード | リスナー | ヒープ |
| --- | --- | --- | --- | --- |
| タブの切り替え(アンマウント方式) | 50 回 | 4,553 で一定 | 1,325 で一定 | 9.0→9.2MB |
| タブの切り替え(force 方式) | 50 回 | 3,992 で一定 | 1,168 で一定 | — |
| グリッドの作り直し | 150 回 | 6,596 で一定 | 1,896 で一定 | 10.4→12.4MB |
| Dialog の開閉 | 30 回 | 3,372 で一定 | 1,141 で一定 | — |

- 作り直しのヒープの増え方は、スナップショットの差分で 50 個以上増えた型が無いことを確かめた。
- window のリスナーは 31〜35、document は 10 で一定。
- 以上からリークは無し。

**ウィンドウの大きさ、ダーク、表示倍率**
- ウィンドウの幅 1440 / 1100 / 800 / 600 / 390 と往復(問題は J-08 だけ)。
- ダーク: その場で切り替えても、本体・列メニュー・フィルター・ツールチップ・Dialog がついてくる(問題なし)。
- 表示倍率 1.25 / 1.5: 3 つのペインの行の位置がそろい、見た目も正しい(問題なし)。

**ページの中のグリッド**
- PageDown / Ctrl+End / Ctrl+Home / ホイールではページは動かない(問題なし)。
- 列メニューは、ページをスクロールするとボタンに付いてくる(問題なし)。
- グリッドの外までドラッグすると、グリッドが自動でスクロールし、ページは動かない(問題なし)。

**複数のグリッドが混ざらないこと**
- Ctrl+Z / C / V / F、検索、選択範囲の集計、グリッドの間の貼り付けで確かめた(問題なし)。
- コピー元の点線は、別のグリッドへ貼った後も残る(Excel と同じ)。

**dev と本番**
- 本番ビルド(`vite build` + `vite preview`)で確かめ直した: J-01〜J-07、J-10、J-11、メモリ、Popover。
- 最小再現も多ページの本番ビルドで確かめた。

## 3. 所見

### J-01 高・不具合: モーダルの Dialog の中で、グリッドのポップアップ(列メニュー・列フィルター・select の候補・右クリックメニュー)が使えない

**再現(最小)**
1. Radix の `Dialog`(既定の modal。shadcn の Dialog と同じ)の Content の中に `SpreadsheetGrid` を置く。
2. 列見出しの ⋮ を押す → 列メニューは見える。
3. 「フィルター…」を押す → 何も起きず、フィルターは開かない。
   - 右クリックメニューの項目と select エディタの候補も、押しても反応しない(地域の値は変わらない)。
4. HTML の `<dialog>.showModal()` の場合は、列メニューがダイアログの後ろに描かれて見えない(トップレイヤーのため)。

**期待:** モーダルの中でもポップアップを使える(置き先を指定できるか、グリッドの近くへ出す)。少なくともドキュメントに方法がある。

**実際**
- ポップアップは `document.body` の直下(z-index 1000)に出る。
- Radix はモーダルの間、body に `pointer-events: none` を付ける。当たり判定では、メニューの上の点は `{"menuInside":false,"pointerEvents":"none"}` になる。
- `classNames.popover` で `pointer-events: auto` にした場合(w1):
  - メニューは押せる。
  - フィルターの検索欄には FocusScope がフォーカスを入れさせず、打っても値は ""。
  - 右クリックメニューの項目と select の候補は反応しないまま。
- ドキュメントには、モーダルの中に置くときの記述も、置き先の prop も無い。

**回避策**
- Radix: `modal={false}` にして、`onInteractOutside` で `.ssg-*` を除く(w2 なら全部動く)。ただし、フォーカスの閉じ込め・背景の操作禁止・aria-modal というモーダルの性質を失う。
- `<dialog>`: `show()` を使う(非モーダルになる)。
- 回避策はモーダルをやめることだけなので、「よくある構成で使えない」として高にした。

**証拠**
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/dialog-colmenu.png`
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/min-native-dialog-menu.png`
- 最小再現:
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/radix-dialog.tsx`
  - `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/native-dialog.tsx`
  - 出力はどちらも「フィルター… を押した後 filter popover: false」。

**dev / 本番:** 両方 / **確度:** 確実

### J-02 中・使いにくさ: Radix の Dialog / Popover の中では、グリッドの操作のための Esc で Dialog / Popover ごと閉じる

**再現**
- Dialog の中のグリッドで、次のどれでも Dialog が閉じる:
  - セルを編集中に Esc
  - select の候補を開いて Esc
  - 範囲を選んで Esc
  - グローバルフィルターに打って Esc
- 非モーダルの Popover の中のグリッドでも、編集中の Esc で Popover が閉じる。

**期待:** グリッドが使った Esc(編集の取り消し、候補を閉じる)では、外側は閉じない。

**実際**
- Radix は Esc を document の capture 段階で聞くので、グリッドより先に閉じる。
- `<dialog>.showModal()` では閉じない。

**回避策と問題**
- `onEscapeKeyDown` で `e.target.closest('.ssg-root')` なら `preventDefault` する。
- ただしそうすると、グリッドにフォーカスがある間は Esc で閉じられなくなる。
- グリッドが Esc を使ったかどうか(編集中かどうか)を知る手段がハンドルに無い。

**証拠**
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/radix-dialog.tsx`: 「編集中に Esc → dialog open: false」
- `<dialog>` の場合は「dialog open: true」。
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/dialog3.cjs` の text / select / selection / global filter の各 Esc で dialog が false になる。

**dev / 本番:** 両方 / **確度:** 確実

### J-03 中・不具合: display:none の中で作ったグリッドの `autoSizeColumns="onMount"` が、幅を約 71px に縮めてしまう

**再現**
1. `display:none` の箱(Radix Tabs の forceMount で隠れたタブ)の中で、`autoSizeColumns="onMount"` のグリッドを作る。
2. 箱を表示する。

**期待:** 見えたときに中身へ合った幅になる(アンマウント方式で作ると SKU 113 / 品名 229 / 倉庫 86)。

**実際**
- SKU 73 / 品名 71 / 倉庫 71 になり、中身が「…」で切れる。
- 最小再現の値: 隠して作った方は 品名 71 / 備考 71、最初から見えている方は 204 / 253。

**回避策**
- 隠れたタブはアンマウントする。
- 見せるときに key で作り直す。
- 利用者が列メニューの「すべての列の幅を自動調整」を押す。
- 全列を自動調整するハンドルのメソッドは無い。

**証拠**
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/tabs-force-stock.png`
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/min-hidden-autosize.png`
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/hidden-autosize.tsx`

**dev / 本番:** 両方 / **確度:** 確実

### J-04 中・不具合: 編集中にグリッドがアンマウントされると、打っていた値が黙って捨てられる(隠した場合は確定される)

**再現(最小)**
1. セルに `draft` と打つ(エディタにフォーカスがある状態)。
2. window の keydown のショートカット Alt+H で、親がグリッドをアンマウントする。

**期待:** display:none で隠した場合と同じく確定される。少なくとも、確定する手段がある。

**実際**
- アンマウントでは rows は `["","","","",""]` のままで、入力は消える。
- 同じ操作で display:none にすると `["","draft",...]` で確定される。
- アプリでも同じ:
  - アンマウント方式のタブを Alt+2 で切り替えると、備考の draft が消える。
  - マウスでタブを押すと blur で確定される。
  - force 方式では残る。
- ハンドルに stopEditing のような確定 / 取り消しのメソッドは無い。
- 確定前の入力だが、キーボードでの画面遷移(ショートカットやコマンドパレット)で現実に起きる消失なので中にした。

**回避策:** 切り替える前に `document.activeElement.blur()` を呼ぶ。

**証拠**
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/unmount-edit.tsx`(`?mode=unmount` / `?mode=hide`)
- 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/minunmount.cjs`
- 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/tabedit.cjs`

**dev / 本番:** 両方 / **確度:** 確実

### J-05 中・不具合: 幅 560〜850px くらいのグリッドで、下部バーの選択範囲の集計の左側が切れ、平均が別の数に見える

**再現(最小)**
1. 幅 640px の箱にグリッドを置く。
2. 数値の列のセルを 4 つ選ぶ。

**期待:** 入りきらないときは折り返すか、省略記号で切る(見出しと値を組で出す)。

**実際**
- 幅 638 では「平均: 2.5」が丸ごと消える。幅 558 では「データの個数」も途中から切れる。
- アプリ(受注一覧、金額を 4 セル選ぶ):
  - 幅 846: 「平均: 3,02」が隠れて「9,250」だけが見え、平均が 9,250 に読める。
  - 幅 646: 「17,000」だけが残る(合計の末尾)。
  - 幅 500 以下ではバーが 2 段になり、正しく出る。
- `.ssg-bar-aggregates` は flex 1 1 0 / min-width 0 / overflow visible で、幅 158px に中身 418px を収めている。

**証拠**
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/bottombar-846.png`
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/bottombar-646.png`
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/min-bottombar-640.png`
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/min-bottombar-560.png`
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/bottombar.tsx`(`?w=640`)

**dev / 本番:** 両方 / **確度:** 確実

### J-06 中・不具合: 編集できないセル(`editable: false`)で Space を押すと、ページがスクロールする

**再現(最小)**
1. 縦に長いページ(グリッドの下に 3,000px の内容)を用意する。
2. `editable: false` の列のセルを押して Space。

**期待:** グリッドにフォーカスがある間、Space でページは動かない(PageDown / Ctrl+End などは既に動かない)。

**実際**
- scrollY が 0 から 700 になり、グリッドが画面の外へ出る。
- 編集できる列(text / select / chips の select / 計算列)では Space で編集が始まり、ページは動かない。
- アプリでは売上明細の No. / 金額で scrollY が 0 から 787 になる。

**証拠**
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/space.tsx`
- 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/minspace.cjs`

**dev / 本番:** 両方 / **確度:** 確実

### J-07 中・不具合: `transform: scale()` の箱の中では、ドラッグでの範囲選択・フィルハンドル・列幅のドラッグが、ポインタとずれた位置になる

**再現(最小)**
- `transform: scale(0.8)`(transform-origin は左上)の箱の中のグリッドで、次の 3 つを操作する。

**期待:** 倍率 1 と同じく、ポインタの下のセル・位置になる。

**実際**

| 操作 | 期待(倍率 1) | 実際(倍率 0.8) |
| --- | --- | --- |
| A1 から C3 へドラッグ | 範囲 A1:C3 | 範囲 A1:C2 |
| A1 のフィルハンドルを A4 まで引く | A4 まで埋まる | A3 まで |
| 列の右端を 100px 右へ引く | 画面で 100px 広がる | 画面で 80px だけ。右端はポインタ 224 に対して 206 |

- 0.6 ではずれがもっと大きい。
- クリック・Shift+クリック・エディタ・メニュー・フィルハンドルの描画位置・列の並べ替えは正しい。
- transform の中に置いた場合の記述は、ドキュメントに無い。

**証拠**
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/scale3-0.8-fill.png`
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/scaled.tsx`(`?scale=0.8`)
- 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/min-scaled.cjs`

**dev / 本番:** 両方 / **確度:** 確実

### J-08 中・使いにくさ: 固定列の合計がグリッドの幅を超えると、右の固定列が左の固定列に重なり、中央の列が見られない

**再現**
1. 売上明細(固定列は、左が行番号 56 + No. 70 + 顧客 160、右が金額 130)を、ウィンドウ幅 390(グリッド 340px)で表示する。
2. 横にスクロールする。

**期待:** 固定を外すか、中央に最低限の幅を残す。またはドキュメントに注意がある。

**実際**
- 右の固定の「金額」が左の「顧客」に重なる。
- 中央の 8 列(受注日〜備考)は、横スクロールしても見えない(scrollLeft は 0 から 1029 まで動く)。

**回避策:** アプリ側で、狭い幅のときは pinned を外す。

**証拠**
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/resize-390.png`
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/narrow-390-scrolled.png`

**dev / 本番:** dev / **確度:** 確実

### J-09 中・ドキュメント: `style.css` と Tailwind v4 の組み合わせでは、`classNames` に渡した Tailwind のクラスが効かない

**再現(最小)**
1. README の「Tailwind v4 でも `style.css` でそのまま動く」の形にする。
2. `classNames={{ root: 'rounded-none border-x-0 border-b-0', bodyCell: 'text-red-600' }}` を渡す。

**期待:** ドキュメントのとおりにすれば効く。または、効かないことと直し方がドキュメントにある。

**実際**
- 何も効かない(角丸 8px、罫線 1px、文字色そのまま)。
- 効く形は 2 つあった:
  - `style.layer.css` を使い、`@layer theme, base, ssg-base, components, utilities;` を宣言する。
  - `!rounded-none` のように重要度を付ける。
- `classNames` の説明は「同特異度のクラスは読み込み順で決まる」だが、Tailwind v4 のユーティリティはレイヤーの中にあるので、読み込み順に関係なく未レイヤーの基底に必ず負ける。
- Tailwind で `classNames` を使う例も無い。

**証拠**
- 最小再現 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/tw/plain.html` と `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/tw/layer.html`(中身は `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/min/tw/app.tsx`)
- 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/twslot.cjs`

**dev / 本番:** dev / **確度:** 確実

### J-10 低・使いにくさ: グリッドの下半分がウィンドウの外にあるとき、↓ でアクティブセルが画面の外へ出てもページがついてこない

**再現**
1. ページを少しスクロールし、グリッドの下側が窓の外にある状態にする。
2. 見えているセルを押して、↓ を 6 回。

**期待:** ページも最小限スクロールしてアクティブセルを見せる。

**実際**
- アクティブセルの上端は 1048(窓の高さは 900)で見えなくなるが、ページもグリッドも動かない。
- 打ち始めると、エディタのフォーカスで初めてページが動く。

**証拠:** 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/page.cjs` の出力 `active cell {"top":1048,"inWindow":false}`

**dev / 本番:** 両方 / **確度:** 確実

### J-11 低・不具合: `scale(0.8)` の箱の中で、合計行の下に 1px ほどの隙間ができ、スクロールした行の文字がのぞく

**再現:** `transform: scale(0.8)`、deviceScaleFactor 1、`totalRow` あり、行が見える高さより多い状態。

**期待:** 隙間ができない。

**実際**
- 合計行と下部バーの間の細い帯に、本体の行の文字の上端が見える。
- 倍率 1 と、行が全部入る 0.6 では出ない。dsf 3 でも出ない。

**証拠**
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/scale-zoom-1x3.png`(dev)
- `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/scale-zoom-1x3-prod.png`(本番)
- 比較用に倍率 1: `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/shots/scale-zoom-1x3-s1.png`
- いずれも 3 倍に拡大した画像。

**dev / 本番:** 両方 / **確度:** 確実

### J-12 低・不具合: date の列に打ち込むと、年がおかしな値で確定する

**再現**
- date の列で Enter を押して開くネイティブの `type="date"` に `20250315` や `2025/03/15` と打って Enter → `50315-02-02` で確定する。
- エディタを開かずに打ち始めた場合は `0315-02-05` で確定する。

**期待:** 打った日付で確定する。読めない値は確定しない。

**実際:** 上のおかしな値がそのまま保存される。

**確度の理由:** ヘッドレス Chromium でネイティブの日付欄にキーを送ったときの挙動の可能性があり、人の手では確かめていない。J の範囲外なので深追いしていない。

**証拠:** 試験 `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/J/t/datetype.cjs`

**dev / 本番:** dev / **確度:** 未確定

## 4. ピン留め行

無し。KPI の合計は `totalRow` で足りました。受注一覧で「選んだ行を見たい」場面は、右のペインに詳細を出す形で済みました。

## 5. 要望

- ポップアップの置き先を指定する prop(例: `portalContainer`)を足すか、Dialog の中では近くに出す(J-01)。
- Esc の扱い(J-02 / J-04)
  - グリッドが使った Esc は、外の document の capture にも届かないようにする。または、使ったことが分かるようにする。
  - ハンドルに `isEditing()` / `stopEditing({ cancel? })` を足す。
- `autoSizeColumns` は、幅 0 から見えるようになったときに測る。ハンドルに全列の自動調整を足す(J-03)。
- 「モーダル / タブ(display:none とアンマウント)/ 分割パネル / transform の中に置く」の節を sizing のガイドに足す。
  - 隠れたグリッドへの `focus()` は効かないので、`flushSync` で見せてから呼ぶ、という点も書く。
- アンマウント方式のタブのために、スクロール位置とアクティブセルを `getState` / `initialState` で持ち越せるようにする。

