# 既知の所見(作り直しの組 S1〜S6 で見つけたもの。報告しなくてよい)

新しいアプリの組(S7〜S12)は、下と同じ現象を見たら「既知の S4-21 と同じ」のように 1 行で触れるだけでよい(再現を詰め直さない)。新しい条件で別の形で出たときや、下より重い影響が出たときは所見にする。

- S4-21 高(直している途中。この tarball では直っていない): `onRowsChange` などグリッドの通知の中で `action` を始めると(例 `action` + `createOptimistic` で保存)、その action が終わるまでグリッドの表示の更新が止まる(アクティブセル・選択・エディタが画面に出ない、止まっている間の操作は届いた後にまとめて効く)。同じ通知の中で signal の rows を書いてから action を始めたときも同じ。
- S5-21 中: rows を Solid 2 のふつうの非同期(`createMemo(async)` / `createSignal(async fn)`)で持つと、取り直しの間グリッドが止まる(スクロールしても行が描かれない、矢印キーが効かない、列メニューが開かない。届いた後にまとめて効く)。`createDeferred` なら動く。`<Loading on>` は fallback に切り替わるので見えない。
- S4-22 中(React 版も同じ): アンマウントした後のハンドルを呼ぶと古いグリッドに効いたように見える。
- S4-23 中: `<Loading>` の中で rows が届く前に呼んだハンドルのメソッドは捨てられる。
- S2-21 中: SSR の本番で、サーバーの `NODE_ENV` が `production` でないとハイドレーションの後もグリッドが枠だけのまま動かない(サーバーは `NODE_ENV=production` で起動すること)。
- S2-22 中: 相対日付のプリセット(今日)を入れたまま clientSide で SSR し、サーバーとブラウザで日付が違うと、件数・行数がサーバーのまま残り、行番号だけの行が残る(React 版は作り直して直る)。
- S2-23 低(React 版も同じ): SSRM で相対日付のプリセットの「今日」はサーバーのタイムゾーンで決まるが、ドキュメントに無い。
- S3-21 中(React 版も同じ): グループ化した表で、グループの先頭の行の custom エディタを打っている途中に上へ行が足されると、エディタが作り直されて打ちかけが消える。
- S3-22 低: `{...gridProps()}` のように作り直す props のオブジェクトを spread で渡すと dev で STRICT_READ_UNTRACKED が 1 回出る。
- S6-21 低(React 版も同じ): 2 つのグリッドで、片方の列メニューを開いたままもう片方の列見出しのメニューボタンを押すと 2 つ開く。
- S6-22 低: 展開行のカードの入力を `createSignal(ctx.row.x)` と書くと dev で STRICT_READ_UNTRACKED(`untrack` で包むと出ない)。
- S1-21 低: バーの関数の本体で `ctx.derivedSummary.sortSummaryText` だけを読んでも、並び以外の変化でも呼び直される(粒度の説明が無い)。
- S5-22 低: 100 万行での Ctrl+End / Ctrl+Home が React 版の約 2 倍の時間。
- 開発時の診断 `EFFECT_RELAY_TEAR` / `HUGE_FAN_OUT` / `STACKED_HOLDS` は README の「Development diagnostics」の表にあるもの(表に無い名前の組み合わせが出たら、文言をそのまま書けばよい)。
