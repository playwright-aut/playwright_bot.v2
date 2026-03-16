#!/bin/zsh
set -euo pipefail

BASE="$HOME/crm-bot-mail"

echo "[purge] Playwright profilok törlése..."

rm -rf "$BASE/pw-profile-mailwatch" 2>/dev/null || true
rm -rf "$BASE/pw-profile-crm" 2>/dev/null || true

echo "[purge] kész"
