#!/bin/bash
# S2 本体の本番サーバーを 5502 で一時的に起動し、probe.cjs で開いて止める。引数: <path> <browser TZ> [server TZ]
cd "$(dirname "$0")"
PORT=5502 PROD=1 NODE_ENV=$NODE_ENV_SERVER TZ=${3:-Pacific/Kiritimati} node server.js > probe-main.log 2>&1 &
pid=$!
for i in $(seq 1 30); do grep -q listening probe-main.log && break; sleep 0.3; done
URL="http://localhost:5502$1" TAG=${TAG:-main} timeout 60 node repro-tz/probe.cjs "$2"
kill $pid; wait $pid 2>/dev/null
