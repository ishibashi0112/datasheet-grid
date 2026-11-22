#!/bin/bash
# 使い方: run-probe.sh <dir> <PROD=1|''> <server TZ> <browser TZ> [query]
dir=$1; prod=$2; stz=$3; btz=$4; q=$5
cd "$dir" || exit 1
PROD=$prod TZ=$stz NODE_ENV=$NODE_ENV_SERVER node server.mjs > probe-server.log 2>&1 &
pid=$!
for i in $(seq 1 30); do grep -q listening probe-server.log && break; sleep 0.3; done
URL="http://localhost:5502/$q" TAG=${TAG:-p} timeout 60 node probe.cjs "$btz"
kill $pid; wait $pid 2>/dev/null
