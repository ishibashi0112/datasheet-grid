#!/bin/bash
# 指定した PID とその子孫を止める(pkill は使わない)
kt() { for c in $(ps -o pid= --ppid "$1"); do kt "$c"; done; kill "$1" 2>/dev/null; }
for p in "$@"; do kt "$p"; done
