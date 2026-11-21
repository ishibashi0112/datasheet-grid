# 1.2.1 の確かめ直し — 共通の手順

以下 `$S` = `/tmp/claude-0/-home-user/eb21e188-0cf8-51a9-aa1e-6d2dc24ac0be/scratchpad`(新しいコンテナでは自分のスクラッチに読み替える)。

## 目的

1.2.1 は新しい機能の無い版です。中身は、Solid 版を作るために React 版の中の判断と DOM の処理を core へ移した作り替え(React 版の
公開 API と挙動は変えないつもり)と、2 つの修正です。前に npm の 1.0.0 で作ったアプリ(`$S/dogfood/<アプリID>/`。元は
`audit/dogfood/2026-11-09/<アプリID>/`)で、

1. **npm の公開版 1.2.0 と、1.2.1 の候補とで、同じ操作の結果が同じか**(回帰が無いか)。前に書いたスクリプト(`pw/` /
   `scripts/` / `t/` など)を両方の版で回して比べ、下の「作り替えた所」を中心に、題材の利用者が普段やる操作も足す
2. 2 つの修正が直っているか(下の「直したもの」)

を確かめる。**ライブラリの修正はしない**(確かめて報告するだけ。自分のアプリのコードは変えてよい)。

## 1.2.1 で変わること

- 直したもの(`$S/dogfood/docs/CHANGELOG.md` の「## 未リリース」):
  - ツールパネルを開いたまま開き直したとき(列メニューの「並び替えを管理…」「フィルターを管理…」「列の表示」・上部バーの絞り込みの
    チップ・ハンドルの `openFilterManager()`)に、パネルの枠が光る(0.46.1 から光っていなかった)。`motion="off"` と OS の
    「視差効果を減らす」では光らない。現れるときの動きはやり直さない。
  - ハンドルの `scrollToBottom()` の後に表の高さが変わったとき(行を足した直後・autoHeight で行の高さが決まったとき)の末尾への
    合わせ直し(内部の直し。挙動は 1.2.0 と同じはず)。
- 作り替えた所(React 版のコードから core へ移したもの。挙動は 1.2.0 と同じはず):
  - キーボード・マウス(範囲選択・ドラッグ)・クリップボード(コピー / 切り取り / 貼り付け)の処理が、イベントの時点の状態を読む形に
  - セルの置き場所(固定列のペイン・行の高さ・密度 `density`)、セルのコマンド(Delete で消す等)、ホバー・ドラッグ中などの一時的な状態
  - 下部バーの文字列(件数・セルの番地・選択範囲の集計)と、`renderHeader` の中のボタンを押したときに列の選択を始めない判定
  - エディタの判断と DOM の処理: 打ち始め / F2 / ダブルクリック / Enter で開くか、エディタの中のキー(Enter / Tab / Escape /
    矢印 / Alt+Enter)、複数行のエディタ(`multiline`)、エディタが見えている所に収まる位置、検査のエラーの吹き出しの位置、
    select エディタのキー操作、IME の直接入力(`imeDirectInput`)
  - custom エディタ: エディタの中のキーが表まで上がってきたときの扱い、閉じた後の古い `setValue` を無視する
  - 展開行(`detailRow`)の開閉と、カードの中の `Tab` の順

## ルール

1. 作業場所は `$S/dogfood/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. 2 つの版を入れ替えて使う。どちらも版の番号は 1.2.0 なので、入れ替えるたびに `node_modules/@ishibashi0112` を消してから入れる。
   - **公開版**: `npm install @ishibashi0112/spreadsheet-grid@1.2.0 @ishibashi0112/spreadsheet-grid-core@1.2.0`(pnpm のアプリは `pnpm add`)
   - **候補**: pack した tarball `$S/v121/pack/ishibashi0112-spreadsheet-grid-core-1.2.0.tgz` と `$S/v121/pack/ishibashi0112-spreadsheet-grid-1.2.0.tgz`
     を**2 つ一緒に**入れる(`npm install <core の tgz> <react の tgz>`)
   - 入れた後に印で確かめる: 候補なら `grep -rl settleBottomPin node_modules/@ishibashi0112/spreadsheet-grid-core/dist` と
     `grep -c 'ssg-popover.ssg-toolpanel--flash' node_modules/@ishibashi0112/spreadsheet-grid/dist/style.css` の両方が見つかる、
     公開版ならどちらも見つからない。違えば npm のキャッシュか lockfile で別のものが入っているので、`package-lock.json` も消して
     入れ直す。pnpm のアプリは、React 版から見た core がどちらか realpath でも確かめる。Vite の開発サーバーは入れ替えたら
     `--force` で起動し直す(古い依存の事前の束ねが残る)。
3. リポジトリ `/home/user/datasheet-grid` のソース(`packages/` / `audit/harness` など)は読まない。読んでよいのは: 自分のアプリ、
   `node_modules` の中の同梱の資料(README / API_REFERENCE.md / SKILL.md)、`$S/dogfood/docs/`(website のドキュメント
   `website-docs/`・API_REFERENCE.md・CHANGELOG.md)、あなたの前の報告 `/home/user/datasheet-grid/docs/audits/2026-11-09/findings-<アプリID>.md`、
   直したことの一覧 `/home/user/datasheet-grid/docs/audits/2026-11-09/README.md`。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` はどこからでも使え、`chromium.launch()` は引数不要。
   `playwright install` はしない)。console と pageerror を集める。StrictMode のまま。dev と本番ビルドの両方で、少なくとも主要な
   操作を一度は確かめる。両方の版で `tsc` も通すこと。
5. 比べ方: 同じスクリプトを両方の版で回し、DOM(`.ssg-root` の中の要素・class・属性・文字)・`document.activeElement`・
   コールバックの引数・クリップボード・エクスポートの中身・`getState()` を比べる。違いが出たら、どちらが正しいかをドキュメントで
   確かめ、**最小の構成で再現し直す**。動きのある所(モーション)は `motion="off"` にすると比べやすい。時間で変わる値(アニメの
   途中・計測値)は違いとして数えない。再現が安定しないものは「未確定」。
6. ポートは前と同じものだけ(A 5401 / B 5402 / C 5403 / D 3401 / E 5405 / F 5406 / G 5407 / H 5408 / I 5409 / J 5410 /
   K 5411・3411 / L 5412)。終わったら自分が起動したサーバーとブラウザを PID で止める(`pkill -f` は使わない。ほかのエージェントも
   同じマシンで動いている)。長く動くサーバーは Bash の `run_in_background` で起動する。
7. マシンは 4 CPU を共有している。時間の数値は参考値で、重さの判断は本番ビルドで 2 回以上測ってから。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、アプリごとに:

1. **入れた版の確認**: 両方の版で印が期待どおりだったか、dev / 本番の両方で起動したか、tsc が通ったか。
2. **比べた操作**: 両方の版で回した操作の一覧と、結果が同じだったか(**同じだった範囲も**書く。後で「どこまで見たか」を記録するため)。
   上の「作り替えた所」のどれを確かめたか。
3. **違い**: 1.2.0 と候補で結果が違った操作。違いごとに、どちらが正しいか(ドキュメントの根拠)、最小の再現、dev / 本番、確度。
   重要度は **高** = データが壊れる・失われる / 間違った値が保存・出力される / 例外で落ちる / よくある構成で機能が使えない、
   **中** = 現実的な場面で明らかに誤った挙動、**低** = 見た目・まれな条件。違いが無ければ「無し」。
4. **直したものの確認**: ツールパネルの枠の光り(開いたまま開き直す・`motion="off"`)を試したか、結果。
5. **そのほか気づいたこと**(あれば。1.2.0 にもある既知でない問題は「1.2.0 から」と書く)。

## アプリごとの割り当て(4 人 × 3 本)

どのアプリでも: キー操作(矢印 / Shift+矢印 / Ctrl+矢印 / Home / End / PageUp / PageDown / Tab / Enter)、マウスの範囲選択、
コピー / 貼り付け / 切り取り / Delete / 元に戻す、打ち始め・F2・ダブルクリックでの編集と確定 / 取り消し、下部バーの文字、
列メニュー・列フィルター・ツールパネル(開いたまま開き直す)、右クリックメニュー。加えて:

| アプリ | 特に見る所 |
| --- | --- |
| A 経費精算(Tailwind v4) | 複数行のエディタ(Enter / Alt+Enter / Tab)、検査の吹き出しの位置(mark / reject)、Excel からの貼り付け、フィルハンドル、`imeDirectInput`(CDP の変換の模擬)、グリッドの上のフォームとのフォーカスの行き来 |
| B 株価ボード(英語・ライブ更新) | 更新中のソート・選択・コピー・集計・メモの編集、`activeCellFollows: 'row'`、英語の下部バーの文字 |
| C シフト表(HeroUI) | 固定列と中央をまたぐ範囲、`renderHeader` の中のボタン、select エディタのキー操作、ラベル行、`hoverHighlight: 'cross'` |
| D SaaS 管理画面(Next.js・SSRM・pnpm) | SSRM の編集と書き戻し・失敗のロールバック、`scrollToBottom()`、ハイドレーション、`next build` + `next start` |
| E 商品マスタ(`/lite`・Mantine) | custom エディタ(Mantine の `Select`)のキーとポータル、行のドラッグ、Modal の中、`/lite` の大きさ(公開版と比べて増減) |
| F 見積書(React 18.3) | custom エディタと `imeDirectInput: true`、展開行(あれば)、React 18 の警告 |
| G ログビューア(100 万行) | `scrollToBottom()` と末尾を追う(行が増える表)、`isAtBottom()`、遠くへのスクロール、検索 |
| H WBS(グループ化) | グループの開閉・集計・グループ行の選択とコピー、`includeGroupingInState` |
| I AI 売上分析(`/ai`) | `/ai` のバーと表、絞り込みの後の選択・集計 |
| J ダッシュボード(ダイアログ) | ダイアログの中のポップアップ・エディタ・右クリックメニュー、展開行(あれば)とカードの `Tab` の順 |
| K テストと SSR と型 | jsdom / happy-dom のテストを両方の版で回して結果を比べる、型のライブラリの d.ts、SSR |
| L モバイル・タッチ・a11y(React 18.3) | タッチの操作、axe の結果を両方の版で比べる、読み上げの名前(aria-*) |