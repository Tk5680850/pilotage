#!/usr/bin/env bash
# Stop the Pilotage demo server and the fake running sessions (the `sleep` processes) started by run-demo.sh.
# Only touches processes that belong to the demo: the server must run on the demo's data dir, the sleeps must be
# the ones listed in live.pids. Your own Pilotage is never touched.
set -uo pipefail
DEMO_DIR="${PILOTAGE_DEMO_DIR:-/tmp/pilotage-demo}"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1
say() { [ "$QUIET" = 1 ] || echo "$@"; }

pidfile="$DEMO_DIR/data/pilotage.pid"
if [ -f "$pidfile" ]; then
  pid="$(cat "$pidfile")"
  if [ -r "/proc/$pid/environ" ] && tr '\0' '\n' <"/proc/$pid/environ" | grep -qxF "PILOTAGE_DATA=$DEMO_DIR/data"; then
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 20); do [ -d "/proc/$pid" ] || break; sleep 0.25; done
    say "stopped the demo server (pid $pid)"
  fi
  rm -f "$pidfile"
fi

if [ -f "$DEMO_DIR/live.pids" ]; then
  n=0
  while read -r p; do
    [ -n "$p" ] && [ -r "/proc/$p/cmdline" ] || continue
    if [ "$(tr '\0' '\n' <"/proc/$p/cmdline" | head -n 1)" = "sleep" ]; then
      kill "$p" 2>/dev/null && n=$((n + 1))
    fi
  done <"$DEMO_DIR/live.pids"
  rm -f "$DEMO_DIR/live.pids"
  say "stopped $n fake running session(s)"
fi
exit 0
