'use strict';

require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const USER  = process.env.PUSHOVER_USER || process.env.PUSHOVER_USER_KEY;
const TOKEN = process.env.PUSHOVER_TOKEN || process.env.PUSHOVER_API_TOKEN;

async function main() {
  const title = process.argv[2] || 'VU3 BOT';
  const message = process.argv.slice(3).join(' ') || '(no message)';

  if (!USER || !TOKEN) {
    console.error('[send-pushover] missing PUSHOVER_USER/PUSHOVER_TOKEN in .env');
    process.exit(2);
  }

  const body = new URLSearchParams({
    token: TOKEN,
    user: USER,
    title,
    message,
    priority: '0'
  });

  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const txt = await res.text().catch(()=> '');
  if (!res.ok) {
    console.error('[send-pushover] http', res.status, txt);
    process.exit(3);
  }
  console.log('[send-pushover] ok');
}

main().catch(e => {
  console.error('[send-pushover] fatal', e?.message || e);
  process.exit(4);
});
