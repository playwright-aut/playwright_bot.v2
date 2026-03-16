#!/bin/zsh
set -euo pipefail

BASE="${BASE:-$HOME/crm-bot-mail}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

say() { echo "[install] $*"; }
die() { echo "[install] HIBA: $*" >&2; exit 1; }

say "CRM-BOT-MAIL telepítő indul"

echo
echo "Ez a telepítő létrehozza a következő mappát:"
echo "  $BASE"
echo

if [ -e "$BASE" ]; then
  echo "A célmappa már létezik:"
  echo "  $BASE"
  echo
  echo "A telepítő most nem írja felül automatikusan."
  echo "Nevezd át / mozgasd el, vagy töröld, és futtasd újra."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "[install] HIBA: A Node.js nincs telepítve."
  echo
  echo "Telepítsd a Node.js LTS verzióját, majd futtasd újra a telepítőt."
  echo
  echo "Ajánlott lehetőségek macOS-en:"
  echo "  1. https://nodejs.org"
  echo "  2. brew install node"
  echo
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo
  echo "[install] HIBA: Az npm nincs telepítve."
  echo
  echo "Az npm általában a Node.js része. Telepítsd újra a Node.js-t, majd futtasd újra a telepítőt."
  echo
  echo "Ajánlott lehetőségek macOS-en:"
  echo "  1. https://nodejs.org"
  echo "  2. brew install node"
  echo
  exit 1
fi

say "Rendszerellenőrzés rendben"
echo "  node: $(node -v)"
echo "  npm:  $(npm -v)"
echo

mkdir -p "$BASE"
say "Projektfájlok másolása ide: $BASE"

rsync -a \
  --exclude node_modules \
  --exclude .env \
  --exclude .git \
  --exclude debug \
  --exclude state \
  --exclude pw-profile \
  --exclude pw-profile-crm \
  --exclude pw-profile-mailwatch \
  --exclude VU3MailQueue \
  --exclude VU3MailQueueProcessed \
  --exclude VU3MailQueueBlocked \
  --exclude VU3MailMiss \
  "$SRC_DIR/" "$BASE/"

mkdir -p \
  "$BASE/debug" \
  "$BASE/state" \
  "$BASE/VU3MailQueue" \
  "$BASE/VU3MailQueueProcessed" \
  "$BASE/VU3MailQueueBlocked" \
  "$BASE/VU3MailMiss"

echo
echo "Add meg a szükséges adatokat."
echo "A beírt szöveg látható marad a terminálban."
echo

read "VU3_USER?CRM felhasználónév: "
read "VU3_PASS?CRM jelszó: "
read "OUTLOOK_USER?Outlook e-mail / felhasználó: "
read "OUTLOOK_PASS?Outlook jelszó: "
read "PUSHOVER_TOKEN?Pushover app token: "
read "PUSHOVER_USER?Pushover user key: "

cat > "$BASE/.env" <<ENVEOF
VU3_USER=$VU3_USER
VU3_PASS=$VU3_PASS

OUTLOOK_USER=$OUTLOOK_USER
OUTLOOK_PASS=$OUTLOOK_PASS

PUSHOVER_TOKEN=$PUSHOVER_TOKEN
PUSHOVER_API_TOKEN=$PUSHOVER_TOKEN
PUSHOVER_USER=$PUSHOVER_USER
PUSHOVER_USER_KEY=$PUSHOVER_USER

OUTLOOK_FOLDER_NAME="VU3 Leads"
LEAD_SUBJECT="Értékesítési lead-ek - Új lead került hozzárendelésre a csoportjához"
LEAD_FROM="VU3 HU 00979 - Debrecen Autóház Zrt. <no_reply@porscheinformatik.com>"

AFTER_ASSIGNED_DELAY_MS=1500
INPROCESS_RETRIES=3
INPROCESS_RETRY_DELAY_MS=1200
VU3_ALERT_COOLDOWN_MS=600000
VU3_ALERT_GRACE_MS=180000
SESSIONWATCH_VERBOSE=0
VU3_DEBUG=0

PW_PROFILE_CRM=$BASE/pw-profile-crm
PW_PROFILE_MAILWATCH=$BASE/pw-profile-mailwatch
ENVEOF

chmod 600 "$BASE/.env"
say ".env létrehozva"

cd "$BASE"

say "npm install indul..."
npm install

say "Playwright Chromium telepítés indul..."
npx playwright install chromium

say "Futtathatóságok beállítása..."
chmod +x \
  "$BASE/vu3mail" \
  "$BASE/run-mailbot.sh" \
  "$BASE/run-mailwatch.sh" \
  "$BASE/run-outlookwatch.sh" \
  "$BASE/run-sessionwatch.sh" \
  "$BASE/login-recover.sh" \
  "$BASE/tools/"*.sh \
  "$BASE/"*.js || true

mkdir -p "$HOME/bin"
ln -sf "$BASE/vu3mail" "$HOME/bin/vu3mail"

if ! grep -q 'export PATH="$HOME/bin:$PATH"' "$HOME/.zshrc" 2>/dev/null; then
  echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.zshrc"
fi
export PATH="$HOME/bin:$PATH"

say "Gyors ellenőrzés..."
vu3mail help >/dev/null 2>&1 || die "A vu3mail parancs nem indítható."

echo
echo "✅ A telepítés kész."
echo
echo "Projekt mappa:"
echo "  $BASE"
echo
echo "Használat:"
echo "  vu3mail on"
echo "  vu3mail off"
echo "  vu3mail status"
echo "  vu3mail restart"
echo "  vu3mail crm-open"
echo "  vu3mail outlook-open"
echo "  vu3mail miss"
echo
echo "Ha új terminált nyitsz, a PATH automatikusan betöltődik."
