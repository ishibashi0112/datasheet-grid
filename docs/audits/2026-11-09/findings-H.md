H(WBS / タスク管理)の点検が終わりました。3,000 件のタスク管理アプリを作り、`@ishibashi0112/spreadsheet-grid@1.0.0` を dev と本番の両方で確かめています。重要度「高」の不具合が 2 件あり、どちらもデータを失います。1 件は絞り込み中の全選択で、全行が消えます(H-01)。もう 1 件はグループ行をまたぐ貼り付けで、値がずれて 1 つ消えます(H-02)。

作業場所: /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H
- 自分の dev サーバーは PID で止めました。自分のブラウザも残っていません。
- 残っている Chromium は別の点検(L)のものなので、触っていません。
- 本番は `vite build` → `vite preview`(ポート 5408)で確かめました。

# 1. 作ったもの

**構成**
- Vite 8 + React 19.3 + TypeScript 5.9(strict / verbatimModuleSyntax)+ Mantine 8.3 + `themes/mantine.css`。npm、StrictMode、日本語。
- `tsc -b && vite build` は通っています。

**データ**
- WBS のタスク 3,000 件。決まった乱数で作るので、再読み込みしても同じです。

**列**
- ID: 左固定、`aggFunc: 'count'`
- WBS
- タスク名: 必須の validate
- フェーズ: select、`rowGroup: false`
- 担当者: select、`rowGroup: true`
- 状態: select、`rowGroup: true`、chips
- 優先度: select、chips
- 開始日 / 期限: date、dateSet。期限には「開始日より前は NG」の validate
- 見積(h): number、sum、numberFormatter
- 進捗(%): number 0〜100 の整数、avg、dataBar
- サブタスク数: getValue
- メモ: multiline

**グリッドの機能**
- グループは「担当者 → 状態」。列メニューで切り替えられます。合計行は `totalRow` の「全体」。
- `columnDragMotion="live"`、`animateRows`、`find`、`showFilterChipBar`
- コンテキストメニューの独自項目: 「サブタスクを開く」「完了にする」
- ツールパネル

**ツールバー(Mantine)**
- すべて開く / すべて閉じる: `expandAllGroups` / `collapseAllGroups`
- サブタスクをすべて閉じる: `collapseAllDetailRows`
- 選択件数
- 状態の一括変更: `getSelectedRowKeys` → `applyRows`
- 選択を削除: `applyRows` + `clearRowSelection`
- タスクを追加: `flushSync` → `getViewRowIndex` → `getColIndex` → `startEditing`
- CSV(小計つき): `exportCsv({ includeGroupRows: true })`
- 元に戻す: `undo`
- 表示をリセット

**展開行**
- `detailRow`(高さ 240)の中に、入れ子の `SpreadsheetGrid` を置きました。
- 中身はサブタスクで、列は担当(select)/ 工数(number)/ 完了(checkbox)。compact、`showTopBar={false}`、「追加」「閉じる」ボタンつき。

**行選択**
- チェックボックスの行選択を controlled で使いました。

**状態の保存と復元**
- `onStateChange` → localStorage → `initialState` + `restoreColumnsFromState` の形です。
- グループ化と展開行は GridState に入らないので、別のキーに保存しました。展開行は `setDetailRowExpanded` で戻します。

**配色**
- Mantine のライト / ダークに連動させています(`theme={useComputedColorScheme()}`)。
- `?teal` を付けると primaryColor / radius を変えて開き、追従を確かめられます。

**最小再現**(いずれも /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/min/ の下)
- paste.tsx
- reset.tsx
- selcount.tsx
- selall.tsx
- label.tsx(比較用)

**Playwright のスクリプトとスクリーンショット**
- スクリプトは /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/ 直下に `t-*.cjs` が約 45 本あります。
- スクリーンショットは /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/ にあります。deviceScaleFactor 1 で撮り、自分で見ています。

# 2. 確かめた操作

各項目の最後に「問題なし」か、関係する所見の ID を書いています。

**グループ化**
- 担当者 → 状態の集計(sum / avg / count)を手計算と照らしました。群の小計と合計行が一致しています。問題なし。
- 列メニューの操作を試しました。
  - 担当者を外す: 問題なし
  - フェーズを足す: 問題なし
  - 「列のリセット」: H-03
- すべて開く / すべて閉じる、個別の開閉、`animateRows` での開閉を試しました。開閉の途中のスクリーンショットで、行が滑って動いていました。問題なし。
- グループ中の編集を試しました。見積・進捗を変える、状態を変えて別の群へ移す、の両方で小計と合計行がすぐ更新されます。群が空になると見出しも消えます。問題なし。
- グループ中のソートは群の中で並びます。問題なし。
- グループ中の列フィルター(set / number / text)、グローバルフィルター、フィルターチップは問題なし。
- グループ行のキー操作とグループ列の幅も見ました。問題なし。
- 一括変更や削除で群の並びが変わる点は、ドキュメントに書いてある「最初に出てきた順」どおりです。

**入れ子のグリッド(展開行)**
- 内側でのクリック・矢印・Tab・Enter 編集・Esc は、外側へ漏れません。
- 選択とコピーは内側だけで完結します。
- 内側をホイールでスクロールしても、外側は動きません。
- 内側の select / number / checkbox エディタ、サブタスクの追加、「閉じる」は動きます。
- カードの中でのキー操作も問題ありません。
- 展開したまま外側をスクロール・ソートしたり、群を開閉したりしても、展開は保たれます。
- 展開状態の保存と復元、`collapseAllDetailRows` も動きます。
- 以上は問題なし。外側の元に戻す履歴が消える点だけ H-06 です。

**行選択**
- チェックボックス 1 つずつと Shift での範囲選択: 問題なし。
- 一括変更は群をまたいで移動し、集計も更新されます。削除、`clearRowSelection`、元に戻すも動きます。問題なし。
- 絞り込み中の全選択は H-01、コールバックの中で読める件数は H-07 です。

**ツールパネル**
- 列の表示切り替え、パネル内のドラッグでの並び替えは問題なし。
- 「すべての列を初期状態に戻す」は H-03 です。

**列**
- live のドラッグを試しました。同じペインの中、固定ペインへまたいでピン留めする操作の両方で問題なし。
- 列メニューの固定(左 / 右 / 解除)、幅の変更、自動調整は問題なし。H-10 と H-11 は見た目です。

**状態の保存と復元**
- 幅・並び・固定・表示・ソート・フィルターは、再読み込みで戻ります。問題なし。
- `initialState` に古い列のキーを入れると開発時に警告が出ます。日本語と英語の 2 行で、正しい内容でした。
- グループ化と開閉が保存されない点は H-04 です。

**エクスポート**
- `includeGroupRows` で、群の見出しと小計が出ます。
- 折りたたんでいても leaf の行はすべて出ます。フィルターも反映されます。
- 問題なし。

**編集**
- validate の印とツールチップ(必須・期限が開始日より前)は問題なし。
- multiline、日付、number の範囲チェック、元に戻す / やり直す、Ctrl+C / Ctrl+V は問題なし。
- グループ行をまたぐ貼り付けは H-02 です。

**タスクを追加**
- 追加した行の群が開いていれば、そのまま編集が始まります。閉じていれば `getViewRowIndex` が -1 を返します。仕様どおりです。

**その他の機能**
- コンテキストメニューの独自項目: 問題なし。
- find は開いている行に対しては正常です。H-05 は折りたたみ中の話です。

**配色(ダーク / Mantine のテーマ)**
- ポップオーバー、フィルター、エディタ、検証の吹き出し、入れ子のグリッドまで追従します。
- teal / radius xl の変更も反映されます。
- Mantine のドキュメントは 9.7 で確かめたとありますが、v8 でも問題ありませんでした。

**コンソール**
- dev / 本番とも、出たのは React DevTools の案内だけで、pageerror も出ませんでした。
- グループ列 `__ssg_group__` の幅について、誤った警告は出ません。

**性能**(本番、2 回。他の点検と CPU を共有していたので、絶対値は大きめです)

| 操作 | 時間 |
| --- | --- |
| すべて閉じる | 約 260ms(long task 55〜58ms) |
| すべて開く | 470〜550ms(long task 約 190ms) |
| ソート | 690〜730ms |
| グローバルフィルター | 470〜490ms |
| 編集の確定 | 110〜1,070ms(ばらつきが大きい。未確定) |
| スクロール 1 フレームの中央値 | 27〜36ms |
| ヒープ | 17〜26MB |

グループ化・条件付き書式・アニメーションを切っても、大きな差はありませんでした。所見にはしていません。

# 3. 所見

## H-01 絞り込み中に全選択すると、フィルターを外したときに全行が選択になる(行の削除で全件消える)
- **重要度** 高
- **種類** 不具合
- **再現手順**(/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/min/selall.tsx)
  1. 4 行(りんご / みかん / りんご / ぶどう)で `enableRowSelection` にする。
  2. グローバルフィルターに「りんご」と入れる。
  3. 見出しのチェックボックスで全選択する。この時点で `getSelectedRowKeys()` は [1,3]、モデルは `{type:'exclude', rowKeys:[]}` です。
  4. フィルターを消す。
- **期待** 全選択は見えていた行(りんごの 2 行)で決まり、フィルターを外しても増えない。
- **実際**
  - フィルターを消すと [1,2,3,4] がすべてチェックされます。
  - 続けて「ぶどう」で絞ると [4] になり、選んでいない行が選択として数えられます。
  - 全選択の後に足した行(アプリでは T-03001)も、自動で選択になります。
  - フィルターが変わっても `onRowSelectionChange` は呼ばれないので、利用側は選択が変わったことを知れません。
- **アプリでの実害**
  1. 優先度「高」で絞って(1,035 行)全選択する。
  2. フィルターを外す。全行にチェックが付きますが、件数の表示は「選択 1035 件」のままです。
  3. 「選択を削除」を押すと、3,000 行すべてが消えて「行 0 / 0」になります。
- **回避策** 次のどれかが利用側で要ります。
  - `onFiltersChange` で選択を消す
  - include のモデルに直す
  - 全選択を使わない
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-min-selall.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/min-selall.png
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-selall-filter.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-selall-add.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/s-selall-filter-delete.png
- **dev / 本番** 両方
- **確度** 高

## H-02 グループ行をまたいで貼り付けると、グループ行に当たった 1 行ぶんが捨てられ、残りがずれる(コピー → 貼り付けの往復で値が壊れる)
- **重要度** 高
- **種類** 不具合
- **再現手順**(/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/min/paste.tsx)
  1. チームでグループ化し、A 群に a1・a2、B 群に b1・b2 を置く。
  2. a2 から b2 までを選んで Ctrl+C する。コピーはグループ行を飛ばすので "a2\nb1\nb2" になります。
  3. a2 で Ctrl+V する。
- **期待**
  - ラベル行と同じく、グループ行を飛ばして続きの行へ貼る。往復しても値は変わらない。
  - ドキュメントはラベル行について「飛ばして続けて貼る」と書いています。比較用の /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/min/label.tsx で同じ往復をすると、a1 a2 b1 b2 のまま保たれます。
- **実際**
  - 結果は「A:a1 A:a2 B:b2 B:b2」です。2 行目の "b1" がグループ行に当たって捨てられ、b1 に "b2" が入ります。
  - X / Y / Z の 3 行を a1 に貼ると X / Y だけが書かれ、Z が消えます。
  - アプリでは、4 行の貼り付けの P3 が消え、P4 が 52 行目に入りました。
  - 元に戻すことはできます。
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-min-paste.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-min-label.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/min-paste.png
- **dev / 本番** 両方
- **確度** 高

## H-03 列メニューでグループ化したあとに「列のリセット」をすると、列の順だけが初期へ戻り、グループの指定は残る(階層がどちらでもない 3 つ目の順になる)
- **重要度** 中
- **種類** 不具合
- **再現手順**(/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/min/reset.tsx)
  1. 列を 部署(`rowGroup: false`)/ チーム(`rowGroup: true`)/ 名前 の順に置く。
  2. 部署の列メニューで「この列でグループ化」を選ぶ。階層は「チーム > 部署」になります。
  3. 「列のリセット」を選ぶ。ツールパネルの「すべての列を初期状態に戻す」でも同じです。
- **期待** グループも初期(チームだけ)へ戻る。少なくとも、ユーザーが作った「チーム > 部署」は保たれる。
- **実際**
  - 列の順が初期へ戻り、rowGroup の指定は残るので、階層が「部署 > チーム」に変わります。
  - アプリでは「担当者 → 状態 → フェーズ」が「フェーズ → 担当者 → 状態」になりました。
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-min-reset.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-min-reset2.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-reset.cjs
- **dev / 本番** 両方
- **確度** 高

## H-04 グループ化の指定と開閉の状態が GridState に入らず、ドキュメントどおりに保存するとグループ化が再読み込みで消える
- **重要度** 低
- **種類** ドキュメント / 使いにくさ
- **再現手順**
  1. 列メニューでグループ化を変える。
  2. ガイドどおりに `onStateChange` → `initialState` + `restoreColumnsFromState` で保存する。
  3. 再読み込みする。
- **期待** グループ化(と開閉)も戻る。戻らないなら、そのことと保存の書き方がドキュメントにある。
- **実際**
  - GridState / GridColumnState(`{key, visible?, pinned?}`)に rowGroup が無いので、グループ化は初期に戻ります。`onColumnsChange` から rowGroup の列キーを自分で保存する必要がありました。
  - 開閉の状態は保存できません。`GridGroupRow` に collapsed が無く、開閉の通知もありません。
  - 折りたたまれた中の行を見せたいときは、内部の形の groupKey を推測して `setGroupCollapsed` するしかありません。
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-state.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/src/App.tsx の GROUP_KEY / applyGrouping
- **dev / 本番** 両方
- **確度** 高(仕様が足りないもの)

## H-05 find(Ctrl+F)が、折りたたんだ群の中の行と、グループ元の列の値を探さない
- **重要度** 低
- **種類** 使いにくさ / ドキュメント
- **再現手順**
  1. 「すべて閉じる」を押す。
  2. Ctrl+F で「T-01500」を探す。
  3. 開いた状態で「佐藤」を探す。担当者は隠れているグループ元の列で、群のラベルにだけ出ています。
- **期待** 群を開いてその行へ移る。そうしないなら、そのことをドキュメントに書く。
- **実際**
  - どちらも 0 件です。
  - グローバルフィルターなら「佐藤」で絞り込めます。
  - ドキュメントは「ビュー行 × 可視列」とだけ書いていて、グループ化の場合に触れていません。
- **証拠** /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-misc2.cjs
- **dev / 本番** 両方
- **確度** 高

## H-06 入れ子のグリッドで編集して親の rows を差し替えると、外側の元に戻す履歴が消える
- **重要度** 低
- **種類** ドキュメント
- **再現手順**
  1. 外側のメモを「A1」に編集する。
  2. サブタスクを開き、工数を編集する(親の `setRows` が呼ばれる)。
  3. 外側で Ctrl+Z を押す。
- **期待** 外側のメモの編集が戻る。履歴が消えるのが仕様なら、展開行のガイドに書き戻しの書き方(`applyRows` を使うなど)と履歴の扱いがある。
- **実際**
  - メモは「A1」のままで、外側の履歴が消えています。
  - 展開行のガイドには、入れ子のグリッドから親の行へ書き戻す例がありません。
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-detail4.cjs
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/src/SubtaskGrid.tsx
- **dev / 本番** 両方
- **確度** 高(履歴が消えること自体は仕様の可能性あり)

## H-07 `onRowSelectionChange` の中でハンドルの `getSelectedRowCount` / `getSelectedRowKeys` を読むと、1 つ前の値が返る
- **重要度** 低
- **種類** 使いにくさ
- **再現手順**(/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/min/selcount.tsx)
  1. 1 行にチェックを付ける。
  2. コールバックの中ですぐハンドルを読む。
- **期待** コールバックの中で、新しい件数が分かる。
- **実際**
  - controlled でも uncontrolled でも、モデルは 1 件なのに件数は 0 です。
  - コールバックはモデルしか渡しません。exclude のモデルのとき、件数を知るにはハンドルを読むしかなく、`queueMicrotask` で後から読む回避策が要りました。
  - フィルターや行の追加で、実際に選ばれている行が変わっても通知がありません(H-01 とつながっています)。
- **証拠** /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-min-selcount.cjs
- **dev / 本番** 両方
- **確度** 高

## H-08 入れ子の compact のグリッドで、エディタの文字だけが 16px と大きい
- **重要度** 低
- **種類** 不具合(見た目)
- **再現手順** サブタスクを開き、内側のセルをダブルクリックする。
- **期待** エディタの文字がセルと同じ大きさ。
- **実際**
  - セルの文字は 11.05px です(`.ssg-detail-card` の 13px × compact の 0.85em)。
  - エディタの入力欄は `.ssg-cell-editor-input{font-size:16px}` の固定値なので、開いた瞬間に文字が大きくなります。
- **証拠** /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/dark-inner-select.png
- **dev / 本番** 両方
- **確度** 高

## H-09 「この列でグループ化」が、rowGroup を書いていない列にも出る
- **重要度** 低
- **種類** ドキュメント / 使いにくさ
- **再現手順** rowGroup を書いていない「タスク名」の列メニューを開く。
- **期待**
  - ドキュメントの「グループ化できる列に rowGroup: false を書きます」は、書いた列だけがグループ化できる(opt-in)と読めます。
  - 全部の列に出るのが仕様なら、列ごとに出さない書き方がある。
- **実際**
  - 集計の列以外のすべての列に出ます。
  - 列ごとに出さないようにする方法がありません。
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/min-menu.png
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-menu.cjs
- **dev / 本番** 両方
- **確度** 高

## H-10 列メニューの「すべての列の幅を自動調整」が 2 行に折り返す
- **重要度** 低
- **種類** 不具合(見た目)
- **再現手順** 列メニューを開く。
- **期待** ほかの項目と同じく 1 行で収まる。
- **実際**
  - この項目だけ高さが 50px(ほかの項目は 32px)。
  - Mantine を入れても入れなくても同じです。
- **証拠** /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-menuwrap.cjs
- **dev / 本番** 両方
- **確度** 未確定(コンテナのフォントに左右される可能性あり)

## H-11 列の合計幅がビューポートより狭いとき、右固定の列が右端ではなく中央の列の直後に付く
- **重要度** 低
- **種類** 使いにくさ
- **再現手順** 列を減らすか幅を広げて、列の合計幅をビューポートより狭くし、1 列を右固定にする。
- **期待** 右固定の列はグリッドの右端に付く。
- **実際** 中央の列のすぐ後ろに付き、その右に空いた帯が残ります。
- **証拠**
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/shots/c-rightpin-narrow.png
  - /tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad/dogfood/H/t-rightpin.cjs
- **dev / 本番** 両方
- **確度** 未確定(仕様の可能性あり)

# 4. ピン留め行
- **欲しかった場面 1: 追加したタスク**
  - 「タスクを追加」した新しいタスクを、入力し終わるまで一番上に固定したかったです。
  - 実際は担当者 → 状態の群の奥(ビュー行 2976)に入ります。群が閉じていると見えず、`getViewRowIndex` は -1 です。
  - 今はメッセージを出すか、`startEditing` で移るしかありません。
- **欲しかった場面 2: マイルストーンなど**
  - 期限が近いマイルストーンや、注目しているタスクを上に固定したかったです。
- **ラベル行での代用はできない**
  - `labelRow` は rowGroup と一緒に使えないので、グループ化している表では代わりになりません。
- **欲しい形**
  - 上か下に固定する行を rowKey で指定でき、グループ化・フィルター・ソートの影響を受けないこと。
  - 編集でき、選択とコピーの対象になること。

# 5. 要望
- **行選択**
  - 絞り込み中の全選択を、見えている行だけで決める設定(AG Grid の selectAll: 'filtered' に当たるもの)。H-01 の根本対策として。
  - 実際に選ばれている行が変わったときの通知と、コールバックへの件数の受け渡し(H-07)。
- **グループ化**
  - GridState への rowGroup と開閉の状態の追加、開閉の通知、`GridGroupRow` の collapsed(H-04)。
  - 群の見出しにチェックボックスを置き、その群の行をまとめて選ぶ。
  - グループ元の列を、表示して編集できるまま残す設定。
  - 列ごとに「この列でグループ化」を出さない設定(H-09)。
- **行の表示**
  - 折りたたみやスクロールを越えて、指定した行を見せる API(仮に `revealRow(rowKey)`。群を開いてスクロールする)。find もこれで折りたたみの中へ届くとよいです(H-05)。
- **WBS 向け**
  - 親子の階層をそのまま表に出すツリーデータ。今は展開行に入れ子のグリッドを置いて代用しています。
- **ドキュメント**
  - 展開行の中のグリッドから親の行へ書き戻す例と、そのときの元に戻す履歴の扱い(H-06)。
- **貼り付け**
  - グループ行をラベル行と同じ扱いにする(H-02)。