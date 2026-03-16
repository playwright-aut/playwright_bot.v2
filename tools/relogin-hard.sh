#!/bin/bash
set -euo pipefail

cd "$HOME/crm-bot-mail" || exit 1

echo "[relogin-hard] stopping services to free pw-profile-crm..."

launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.vu3.emailbot.plist" 2>/dev/null || true
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.vu3.notifbot.plist" 2>/dev/null || true

# biztos ami biztos: PW headless profil process kilövés
pkill -f -- "--user-data-dir=$HOME/crm-bot-mail/pw-profile-crm" 2>/dev/null || true

echo "[relogin-hard] running login-recover..."
./login-recover.sh || true

echo "[relogin-hard] starting services back..."
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.vu3.notifbot.plist" 2>/dev/null || true
launchctl enable "gui/$(id -u)/com.vu3.notifbot" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/com.vu3.notifbot" 2>/dev/null || true

launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.vu3.emailbot.plist" 2>/dev/null || true
launchctl enable "gui/$(id -u)/com.vu3.emailbot" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/com.vu3.emailbot" 2>/dev/null || true

echo "[relogin-hard] done."
