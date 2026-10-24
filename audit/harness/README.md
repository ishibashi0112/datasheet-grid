# 監査ハーネス(audit/harness)

2026-10-04 の全体監査(`docs/audits/2026-10-04/`)で使った、ライブラリを実ブラウザ(Chromium)で叩く自動検証です。
ルートのゲート(tsc / eslint / vitest / build)の**対象外**で、定期的な「壊れていないか」確認に手動で回します。

## 使い方

```bash
# 1. 依存(ルートの devDependencies に playwright-core を含む)
vp install

# 2. ハーネスの dev サーバー(port 5177。ライブラリのソースを直接 import)
pnpm run audit:dev

# 3. 別ターミナルでシナリオを実行(PASS / FAIL を標準出力に出す)
pnpm run audit:test            # 基本 + 1M 行 + SSRM + ライフサイクル + 機能群 + 所見追試 + 集計 + 合計行 + フィルハンドル + 見送り分 + 遅延読み込み + 優先順位
node audit/harness/t-basic.mjs # 個別に 1 本だけ
node audit/harness/perf-big.mjs            # 1M 行の計測(dev ビルド)
HARNESS_BASE=http://127.0.0.1:5178/ node audit/harness/perf-big.mjs  # 本番ビルド(vp build → vp preview --port 5178)に対して
```

- Chromium は `SSG_AUDIT_CHROME`(実行ファイルパス)で指定できる。未指定なら Claude Code クラウド環境の既知パス、無ければ playwright-core の既定解決(`npx playwright install chromium` 済みが前提)。
- シナリオは `main.tsx` の `?s=<scenario>` で切り替わる: `basic` / `big` / `autoheight` / `grouping` / `detail` / `label` / `rowdrag` / `ssrm` / `empty` / `height` / `two`。`&strict=1` で StrictMode、`&n=<rows>` で行数、SSRM は `&noinit=1` で `initialRowCount` 未指定、autoheight は `&detail=1` で展開行を併用。
- `window.__grid`(ハンドル)/ `window.__rows()` / `window.__setRows` / `window.__setProps` / `window.__setColumns` / `window.__events`(コールバック記録)/ `window.__errors`(console.error / warn)/ `window.__listeners`(window / document リスナー数)/ `window.__ssrm`(SSRM モック制御)を公開しているので、ブラウザの DevTools から手で叩いて追試できる。
- `t-aggregates.mjs` は選択範囲の集計(下部バー)の値・表示・100 万行の時間分割・SSRM の部分集計。
- `t-total.mjs` は合計行(`totalRow`)の値・下端固定・最終行が合計行に隠れないこと(スクロール / 矢印キー / `scrollToRow` / `scrollToBottom`)・横スクロールと固定列の揃い・列ドラッグ(live)・行が少ないとき・ダークテーマ・100 万行・auto-height / グルーピング / ラベル行 / SSRM との併用。
- `t-fill.mjs` はフィルハンドル(`fillHandle`)のハンドルの位置・ドラッグ(点線 / 値のツールチップ / 自動スクロール)・連続データ / コピー・`Ctrl` で入れ替え・`Escape`・上 / 左へ・固定ペインをまたぐ・`validate` の reject / 編集不可を飛ばす・埋めたあとのボタンとメニュー(マウス / キーボード)・元に戻す / やり直し・ダブルクリック・出さないとき・ダークテーマ・グルーピング / ラベル行 / SSRM / 100 万行。
- `t-leftovers.mjs` は §11 で見送り、2026-10-12 に対応した所見(`docs/audits/2026-10-04/README.md` §12)の確認: B-09 flex の幅が整数 px で横スクロールバーが出ない / L-15 相対日付プリセットが深夜 0 時・スリープ明けの focus で翌日へ追従し、プリセットが無ければ何もしない・SSRM は取り直す(「今月」は月内の 0 時では取り直さずスクロールも保ち、月が変わるときだけ取り直す)(`open(…, { beforeGoto: (p) => p.clock.install(…) })` で Playwright の時計を差し込む)/ B-10 100 万行のソート中の編集で並びが正しい(ソート列以外 / ソート列 / 行のその場書き換え)/ M-04 開発ビルドでも 100 万行のソートが数十秒かからない。
- `t-lazy.mjs` は列フィルターポップオーバー / ツールパネルの部品の遅延読み込み(lazy-popups): 先読みを止めると初期表示では読み込まない / 開いたときにその部品だけ読み込む / 読み込みが遅く(`page.route` で遅延)ても出たあと入力欄へフォーカスが入り、複合フィルターも画面内に収まる / 読み込み中に Escape で閉じられる / マウント後の暇なときに先読みし、先読み後は次のフレームで出る / 読み込みに失敗(`route.abort`)しても例外にせず、閉じてキーボード操作を続けられる。失敗後の開き直しはブラウザが失敗した import をキャッシュするため `INFO` として出すだけ。
- `t-priority.mjs` はキーとポインタの優先順位(差し込み式への移行で処理の順番が変わっていないかの見張り。2026-10-24 時点の実際の挙動を期待値にしている): Escape が 1 回で 1 つだけ効く順番(編集 → 列メニュー / フィルター / 右クリックメニュー / ツールパネル → 検索バー → 選択の解除)/ ドラッグ中の Escape(範囲選択・列・フィルハンドル・行。列と行のドラッグは現状、選択の解除にも届く)/ ヘッダーの見出し・⋮・右クリック・幅の境界・grip とセルのダブルクリックの割り当て / `find` の有無と Ctrl+F / Ctrl+C 後とツールチップ表示中の Escape。
- `t-verify.mjs` は監査所見(RD-1 / RD-2 / C-1 / L-01 / C-3 / B-01 / B-02 / B-03 / V-02 …)の再現スクリプト。修正後は FAIL → PASS に変わることを確認する回帰テストとして使う。

## 出力の読み方

- `PASS` / `FAIL`: 期待どおり / 不具合または回帰。`FAIL` が 0 件であることが基準。
- `PENDING(判断待ち・未解消 / 解消済み)`: 監査所見のうち**挙動変更を伴うため未修正**のもの(`docs/audits/2026-10-04/README.md` §9)の追試。FAIL には数えない。修正したら「解消済み」に変わるので、そのとき `check` に格上げする。

## 注意

- テストは `waitIdle` の固定待ち時間を含むため、極端に遅いマシンではタイミング起因の FAIL が出ることがある(再実行で安定するものは所見ではない)。
- 列フィルター / グローバルフィルターの評価は低優先度の遅延レンダー(`useDeferredValue`)で反映されるため、`applyState` 等でフィルターを変えた直後は「ソートは新しく、フィルターは古い」表示が本番ビルドで約 0.1 秒、dev ビルドで 0.1〜0.3 秒続く(CPU が混んでいるとさらに長い)。その直後に行 index でセルを触る / 書き出す確認では、`waitIdle` ではなく `waitForViewRows(page, n)`(表示行数が n になるまで待つ)を使う(2026-10-24、t-basic のエクスポート 2 件 / t-total の「編集で再計算」が負荷の高いときだけ FAIL していた原因)。
- 1M 行シナリオの dev ビルド計測は React の開発ビルド固有の遅さを含む(所見 M-04 の props 差分は 2026-10-12 に解消したが、開発ビルドは本番より遅い)。性能判断は本番ビルド(`HARNESS_BASE` で preview を指す)で行うこと。