#!/bin/zsh
/bin/zsh "$HOME/crm-bot-mail/tools/rotate-logs.sh" || true

TS() { date "+%Y-%m-%d %H:%M:%S"; }

BASE="$HOME/crm-bot-mail"

echo "[run-mailwatch] $(TS) start wrapper..."

cd "$BASE" || exit 1
mkdir -p debug state VU3MailQueue VU3MailQueueProcessed VU3MailQueueBlocked

if ! command -v node >/dev/null 2>&1; then
  echo "[run-mailwatch] $(TS) ERROR: node nincs meg"
  exit 1
fi

# ATOMIKUS LOCK: ha már fut, ez a példány azonnal kilép
LOCKDIR="$BASE/state/mailwatch-wrapper.lockdir"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "[run-mailwatch] $(TS) Már fut egy wrapper (lockdir). Kilépek."
  exit 0
fi
trap 'rm -rf "$LOCKDIR"' EXIT INT TERM

ms="${MAIL_POLL_MS:-5000}"
# zsh numeric check: <-> = csak szám
if ! [[ "$ms" == <-> ]]; then ms="5000"; fi
sec=$(( (ms + 999) / 1000 ))

echo "[run-mailwatch] $(TS) loop start (every ${ms}ms ~ ${sec}s)"

while true; do
  # NINCS ÁTFEDÉS: ha az előző mail-watch.js még fut, nem indítunk újat
  if pgrep -f "/crm-bot-mail/mail-watch.js" >/dev/null 2>&1; then
    echo "[run-mailwatch] $(TS) previous mail-watch.js still running -> skip"
    sleep 2
    continue
  fi

  node "$BASE/mail-watch.js" \
    >> "$BASE/debug/mailwatch.out" \
    2>> "$BASE/debug/mailwatch.err" || true

  sleep "$sec"
done
