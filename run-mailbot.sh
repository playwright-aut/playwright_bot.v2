#!/bin/zsh
/bin/zsh "$HOME/crm-bot-mail/tools/rotate-logs.sh" || true

TS() { date "+%Y-%m-%d %H:%M:%S"; }

echo "[run-mailbot] $(TS) start wrapper..."

cd "$HOME/crm-bot-mail" || exit 1
mkdir -p debug state VU3MailQueue VU3MailQueueProcessed VU3MailQueueBlocked

if ! command -v node >/dev/null 2>&1; then
  echo "[run-mailbot] $(TS) ERROR: node nincs meg"
  exit 1
fi

LOCK="$HOME/crm-bot-mail/state/mailbot-wrapper.lock"

if [ -f "$LOCK" ]; then
  PID="$(cat "$LOCK" 2>/dev/null)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "[run-mailbot] $(TS) Már fut egy wrapper (pid=$PID). Kilépek."
    exit 0
  fi
fi

echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

echo "[run-mailbot] $(TS) Starting bot-mail.js..."
exec node "$HOME/crm-bot-mail/bot-mail.js" >> "$HOME/crm-bot-mail/debug/mailbot.out" 2>> "$HOME/crm-bot-mail/debug/mailbot.err"
