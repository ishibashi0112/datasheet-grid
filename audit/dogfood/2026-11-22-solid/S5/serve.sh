#!/bin/bash
# 使い方: serve.sh <アプリのディレクトリ> <dev|preview> <ログ>  → PID を表示
cd "$1" || exit 1
if [ "$2" = preview ]; then
  nohup node node_modules/vite/bin/vite.js preview > "$3" 2>&1 &
else
  nohup node node_modules/vite/bin/vite.js > "$3" 2>&1 &
fi
echo $!
