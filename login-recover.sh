#!/bin/bash
set -euo pipefail

cd "$HOME/crm-bot-mail"

LOCK="$HOME/crm-bot-mail/debug/login-recover.lock"
STAMP="$HOME/crm-bot-mail/debug/login-recover.last"
LOG="$HOME/crm-bot-mail/debug/login-recover.log"

PROFILE_DIR="$HOME/crm-bot-mail/pw-profile-crm"
GUARD="$HOME/crm-bot-mail/tools/pw-profile-guard.sh"

# ha a profil foglalt (bot/notif már használja), ne próbáljunk új PW persistent contextet indítani
if "$GUARD" "$PROFILE_DIR" >/dev/null 2>&1; then :; else
  echo "[login-recover] skip (profile in use)" >> "$LOG"
  exit 0
fi

# Ne fusson párhuzamosan
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "[login-recover] already running pid=$(cat "$LOCK")" >> "$LOG"
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Rate limit: 1 próbálkozás / 10 perc
# VU3_FORCE_RECOVER=1 esetén a rate limit átugorható
NOW=$(date +%s)
LAST=0
FORCE_RECOVER="${VU3_FORCE_RECOVER:-0}"

[ -f "$STAMP" ] && LAST=$(cat "$STAMP" 2>/dev/null || echo 0)

if [ "$FORCE_RECOVER" != "1" ] && [ $((NOW - LAST)) -lt 600 ]; then
  echo "[login-recover] skip (rate limit)" >> "$LOG"
  exit 0
fi

echo "$NOW" > "$STAMP"

echo "[login-recover] START $(date '+%Y-%m-%dT%H:%M:%S%z')" >> "$LOG"

OUT=$(node auto-login-vu3.js 2>&1 | tee -a "$LOG" || true)

if echo "$OUT" | grep -q "NEED_2FA"; then
  echo "[login-recover] NEED_2FA -> manual required" >> "$LOG"
  exit 0
fi

echo "[login-recover] DONE" >> "$LOG"
