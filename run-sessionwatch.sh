#!/bin/zsh
/bin/zsh "$HOME/crm-bot-mail/tools/rotate-logs.sh" || true
set -euo pipefail

TS() { date "+%Y-%m-%d %H:%M:%S"; }

echo "[run-sessionwatch] $(TS) start wrapper..."

cd "$HOME/crm-bot-mail" || exit 1
mkdir -p debug state

# .env betöltés (hogy a PUSHOVER_TOKEN/USER is menjen)
if [ -f "$HOME/crm-bot-mail/.env" ]; then
  set -a
  source "$HOME/crm-bot-mail/.env"
  set +a
fi

if ! command -v /usr/local/bin/node >/dev/null 2>&1; then
  echo "[run-sessionwatch] $(TS) ERROR: /usr/local/bin/node nincs meg"
  exit 1
fi

LOCK="$HOME/crm-bot-mail/state/sessionwatch-wrapper.lock"
if [ -f "$LOCK" ]; then
  PID="$(cat "$LOCK" 2>/dev/null || true)"
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    echo "[run-sessionwatch] $(TS) Már fut egy wrapper (pid=$PID). Kilépek."
    exit 0
  fi
fi

echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

echo "[run-sessionwatch] $(TS) loop start (every 60s)"

while true; do
  # 1) állapot frissítés + változásra push
  /usr/local/bin/node "$HOME/crm-bot-mail/status-notify.js" \
    >> "$HOME/crm-bot-mail/debug/statusnotify.out" \
    2>> "$HOME/crm-bot-mail/debug/statusnotify.err" || true

  # 2) session watchdog (autologin/relogin logika)
  /usr/local/bin/node "$HOME/crm-bot-mail/session-watch.js" \
    >> "$HOME/crm-bot-mail/debug/sessionwatch.out" \
    2>> "$HOME/crm-bot-mail/debug/sessionwatch.err" || true

  sleep 60
done
