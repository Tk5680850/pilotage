#!/usr/bin/env bash
# Start Pilotage on the fictional demo world (see make-demo.mjs).
#
#   scripts/demo/run-demo.sh           build a fresh world (timestamps relative to now) and start the server
#   scripts/demo/run-demo.sh --keep    reuse the existing world, only restart its fake running sessions
#   scripts/demo/run-demo.sh --login   print a new one-time login link for the running demo
#   scripts/demo/stop-demo.sh          stop it
#
# Env: PILOTAGE_DEMO_DIR (default /tmp/pilotage-demo), PILOTAGE_DEMO_PORT (4963), PILOTAGE_DEMO_LAN_PORT (4962).
# The server runs with `env -i` and a fake HOME, so nothing from your own shell, ~/.claude, ~/.codex or git config
# reaches it. No AI calls (PILOTAGE_NO_AI=1) and no phone forwarder. Your own Pilotage (port 4747) is not touched.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DEMO_DIR="${PILOTAGE_DEMO_DIR:-/tmp/pilotage-demo}"
PORT="${PILOTAGE_DEMO_PORT:-4963}"
LAN_PORT="${PILOTAGE_DEMO_LAN_PORT:-4962}"

# Node 22+: the one on PATH, else the newest nvm install.
major() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0; }
NODE="$(command -v node || true)"
if [ -z "$NODE" ] || [ "$(major "$NODE")" -lt 22 ]; then
  for c in "$HOME"/.nvm/versions/node/v*/bin/node; do
    [ -x "$c" ] && [ "$(major "$c")" -ge 22 ] && NODE="$c"
  done
fi
if [ -z "$NODE" ] || [ "$(major "$NODE")" -lt 22 ]; then
  echo "Node 22 or newer is needed (found: ${NODE:-none})." >&2
  exit 1
fi
if [ ! -f "$ROOT/web/dist/index.html" ]; then
  echo "web/dist is missing: build the UI first (npm run build)." >&2
  exit 1
fi

FAKE_HOME="$DEMO_DIR/home/alex"
DEMO_ENV=(env -i
  "HOME=$FAKE_HOME" USER=alex LOGNAME=alex "LANG=${LANG:-C.UTF-8}"
  "PATH=$FAKE_HOME/.local/bin:$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin"
  "PILOTAGE_DATA=$DEMO_DIR/data" "PILOTAGE_WIN_HOME=$DEMO_DIR/win/Users/alex" "CODEX_HOME=$FAKE_HOME/.codex"
  "PILOTAGE_PORT=$PORT" "PILOTAGE_LAN_INTERNAL_PORT=$LAN_PORT" PILOTAGE_NO_AI=1 PILOTAGE_NO_FORWARDER=1)
# Keep the time zone (an empty TZ would mean UTC).
[ -n "${TZ:-}" ] && DEMO_ENV+=("TZ=$TZ")

if [ "${1:-}" = "--login" ]; then
  "${DEMO_ENV[@]}" "$NODE" "$ROOT/server/cli.js" login-url
  exit $?
fi

"$HERE/stop-demo.sh" --quiet || true
if [ "${1:-}" = "--keep" ] && [ -f "$DEMO_DIR/live.json" ]; then
  "$NODE" "$HERE/make-demo.mjs" --dir "$DEMO_DIR" --live-only
else
  "$NODE" "$HERE/make-demo.mjs" --dir "$DEMO_DIR"
fi

# On WSL, Pilotage asks Windows for the PC's network addresses and Wi-Fi name (ipconfig.exe / netsh.exe under /mnt/c,
# Settings → Phone). Hide /mnt from the demo server in a private mount namespace so those real values never show up in
# the demo. Skipped (with a note) where unprivileged namespaces are not allowed.
WRAP=()
if [ -d /mnt/c ]; then
  if unshare --user --map-root-user --mount true 2>/dev/null; then
    WRAP=(unshare --user --map-root-user --mount sh -c 'mount -t tmpfs tmpfs /mnt && exec "$@"' pilotage-demo)
  else
    echo "note: could not hide /mnt from the demo server; Settings → Phone may show this PC's real network addresses." >&2
  fi
fi

cd "$ROOT"
nohup setsid ${WRAP[@]+"${WRAP[@]}"} "${DEMO_ENV[@]}" "$NODE" "$ROOT/server/index.js" >"$DEMO_DIR/server.log" 2>&1 </dev/null &

for _ in $(seq 1 60); do
  if "$NODE" -e "fetch('http://127.0.0.1:$PORT/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; then
    url="$("${DEMO_ENV[@]}" "$NODE" "$ROOT/server/cli.js" login-url)"
    echo
    echo "Pilotage demo is running on port $PORT (log: $DEMO_DIR/server.log)."
    echo "Open this one-time login link within 2 minutes:"
    echo "  $url"
    echo "New link later: $0 --login   ·   stop: scripts/demo/stop-demo.sh"
    exit 0
  fi
  sleep 0.5
done
echo "The demo server did not start; see $DEMO_DIR/server.log" >&2
tail -n 20 "$DEMO_DIR/server.log" >&2 || true
exit 1
