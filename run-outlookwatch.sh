#!/bin/zsh
/bin/zsh "$HOME/crm-bot-mail/tools/rotate-logs.sh" || true
set -euo pipefail

TS() { date "+%Y-%m-%d %H:%M:%S"; }

echo "[run-outlookwatch] $(TS) start wrapper..."

cd "$HOME/crm-bot-mail" || exit 1
mkdir -p debug state

if [ -f "$HOME/crm-bot-mail/.env" ]; then
  set -a
  source "$HOME/crm-bot-mail/.env"
  set +a
fi

if ! command -v /usr/local/bin/node >/dev/null 2>&1; then
  echo "[run-outlookwatch] $(TS) ERROR: /usr/local/bin/node nincs meg"
  exit 1
fi

LOCK="$HOME/crm-bot-mail/state/outlookwatch-wrapper.lock"
if [ -f "$LOCK" ]; then
  PID="$(cat "$LOCK" 2>/dev/null || true)"
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    echo "[run-outlookwatch] $(TS) Már fut egy wrapper (pid=$PID). Kilépek."
    exit 0
  fi
fi

echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

echo "[run-outlookwatch] $(TS) loop start (every 60s)"

while true; do
  /usr/local/bin/node "$HOME/crm-bot-mail/outlook-status-notify.js" \
    >> "$HOME/crm-bot-mail/debug/outlook-statusnotify.out" \
    2>> "$HOME/crm-bot-mail/debug/outlook-statusnotify.err" || true

  /usr/local/bin/node "$HOME/crm-bot-mail/outlook-session-watch.js" \
    >> "$HOME/crm-bot-mail/debug/outlook-sessionwatch.out" \
    2>> "$HOME/crm-bot-mail/debug/outlook-sessionwatch.err" || true

  sleep 60
done
