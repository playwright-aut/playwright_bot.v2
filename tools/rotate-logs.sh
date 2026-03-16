#!/bin/zsh
set -euo pipefail

BASE="$HOME/crm-bot-mail/debug"
MAX_BYTES=$((5 * 1024 * 1024))
KEEP=5

rotate_one() {
  local f="$1"
  [ -f "$f" ] || return 0

  local size
  size=$(wc -c < "$f" 2>/dev/null || echo 0)
  [ "$size" -ge "$MAX_BYTES" ] || return 0

  local i
  i=$KEEP
  while [ "$i" -ge 1 ]; do
    if [ -f "$f.$i" ]; then
      if [ "$i" -eq "$KEEP" ]; then
        rm -f "$f.$i"
      else
        mv "$f.$i" "$f.$((i + 1))"
      fi
    fi
    i=$((i - 1))
  done

  mv "$f" "$f.1"
  : > "$f"
}

mkdir -p "$BASE"

for f in \
  "$BASE/cli.out" \
  "$BASE/mailbot.out" \
  "$BASE/mailbot.err" \
  "$BASE/mailwatch.out" \
  "$BASE/mailwatch.err" \
  "$BASE/statusnotify.out" \
  "$BASE/statusnotify.err" \
  "$BASE/sessionwatch.out" \
  "$BASE/sessionwatch.err" \
  "$BASE/outlook-statusnotify.out" \
  "$BASE/outlook-statusnotify.err" \
  "$BASE/outlook-sessionwatch.out" \
  "$BASE/outlook-sessionwatch.err"
do
  rotate_one "$f"
done
