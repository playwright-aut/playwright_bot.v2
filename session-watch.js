'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const HOME = process.env.HOME || `/Users/${process.env.USER}`;
const CRM_DIR = path.join(HOME, 'crm-bot-mail');

const START_URL = 'https://sls-lds-hu02.cross.porscheinformatik.com/sales-leads/';
const DEBUG_DIR = path.join(CRM_DIR, 'debug');
const LOG = path.join(DEBUG_DIR, 'sessionwatch.out');
const ERR = path.join(DEBUG_DIR, 'sessionwatch.err');

const RATE_FILE = path.join(DEBUG_DIR, 'sessionwatch.ratelimit');
const RATE_SEC = 10 * 60; // 10 perc
const SLEEP_MS = 4000;
const TIMEOUT_MS = 90000;

const STATE_FILE = path.join(DEBUG_DIR, 'statusnotify.state'); // status-notify.js írja
const RECOVER_LOCK = path.join(DEBUG_DIR, 'recover.lock');     // párhuzamos recover ellen

// --- ALERT "only if stuck" (grace + cooldown) ---
const ALERT_DIR = DEBUG_DIR;
const ALERT_2FA_FILE = path.join(ALERT_DIR, 'sessionwatch.2fa.pending.json');
const ALERT_FAIL_FILE = path.join(ALERT_DIR, 'sessionwatch.fail.pending.json');

// mennyi ideig "tűrjük" a login flappet, mielőtt riasztunk
const ALERT_GRACE_MS = Number(process.env.VU3_ALERT_GRACE_MS || 120000); // 120s

// ha már riasztottunk, ennyi ideig ne küldje újra
const ALERT_COOLDOWN_MS = Number(process.env.VU3_ALERT_COOLDOWN_MS || 1800000); // 30m

function ts() {
  return new Date().toISOString();
}

function log(line) {
  if (!process.env.SESSIONWATCH_VERBOSE && String(line ?? '').includes('lock held')) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.appendFileSync(LOG, `[${ts()}] ${line}\n`);
}

function err(line) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.appendFileSync(ERR, `[${ts()}] ${line}\n`);
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function canRun() {
  try {
    const last = parseInt(fs.readFileSync(RATE_FILE, 'utf8').trim(), 10);
    if (!Number.isFinite(last)) return true;
    return (nowSec() - last) >= RATE_SEC;
  } catch {
    return true;
  }
}

function markRun() {
  try {
    fs.writeFileSync(RATE_FILE, String(nowSec()));
  } catch {}
}

function run(cmd, args, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? (error.message || String(error)) : ''
      });
    });

    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs + 2000);
  });
}

/** statusnotify.state -> "ONLINE" / "OFFLINE" / null */
function readStatusState() {
  try {
    const s = fs.readFileSync(STATE_FILE, 'utf8');
    const m = s.match(/STATE=(\w+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** párhuzamos recover ellen */
function hasRecoverLock(maxAgeMs = 6 * 60 * 1000) { // 6 perc
  try {
    const st = fs.statSync(RECOVER_LOCK);
    return (Date.now() - st.mtimeMs) < maxAgeMs;
  } catch {
    return false;
  }
}

function setRecoverLock() {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(RECOVER_LOCK, `AT=${new Date().toISOString()}\n`, 'utf8');
}

function clearRecoverLock() {
  try { fs.unlinkSync(RECOVER_LOCK); } catch {}
}

function shouldSendStuckAlert(file) {
  try { fs.mkdirSync(ALERT_DIR, { recursive: true }); } catch {}

  const now = Date.now();
  let st = null;

  try {
    st = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}

  // first time -> create pending, NO send yet
  if (!st || !st.firstSeen) {
    try {
      fs.writeFileSync(file, JSON.stringify({ firstSeen: now }, null, 2));
    } catch {}
    return false;
  }

  // cooldown after a sent alert
  if (st.lastSent && (now - st.lastSent) < ALERT_COOLDOWN_MS) return false;

  // still within grace -> don't send
  if ((now - st.firstSeen) < ALERT_GRACE_MS) return false;

  // ok -> mark sent and allow sending now
  st.lastSent = now;
  try {
    fs.writeFileSync(file, JSON.stringify(st, null, 2));
  } catch {}
  return true;
}

function clearFile(file) {
  try { fs.unlinkSync(file); } catch {}
}

function clearStuckAlerts() {
  clearFile(ALERT_2FA_FILE);
  clearFile(ALERT_FAIL_FILE);
}

async function sendPushover(title, message) {
  const node = process.execPath;
  const sender = path.join(CRM_DIR, 'send-pushover.js');
  await run(node, [sender, title, message], 30000);
}

async function runLoginCheck() {
  const node = process.execPath;
  const file = path.join(CRM_DIR, 'login-check.js');
  const r = await run(node, [file], 30000);
  const out = (r.stdout || '').trim();
  return {
    raw: out,
    online: /^ONLINE\b/i.test(out),
    offline: /^OFFLINE\b/i.test(out)
  };
}

/**
 * Playwright probe: megmondja, hogy be vagy-e lépve.
 * FONTOS: ezt csak OFFLINE/unknown esetben futtatjuk. ONLINE-nál NULLA Playwright.
 */
async function playwrightLoggedInProbe() {
  const node = process.execPath;

  const probeJs = `
    (async () => {
      const { chromium } = require('playwright');

      const START_URL = ${JSON.stringify(START_URL)};
      const PROFILE_DIR = ${JSON.stringify(path.join(CRM_DIR, 'pw-profile-crm'))};

      let ctx;
      try {
        ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
        const page = await ctx.newPage();

        await page.goto(START_URL, { waitUntil: 'load', timeout: 60000 }).catch(()=>{});
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{});
        await page.waitForTimeout(1500).catch(()=>{});

        const url = page.url();
        const bodyText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 800)).catch(()=>'');

        const isSSO = /sso\\.cross\\.porscheinformatik\\.com\\/cas\\/login/i.test(url);
        const isIdentity = /identity\\.auto-partner\\.net\\/identity\\/authenticate/i.test(url);

        const looksLikeLoggedIn =
          !isSSO && !isIdentity &&
          /sls-lds-hu02\\.cross\\.porscheinformatik\\.com\\/sales-leads/i.test(url);

        const hasOtpInput = await page.locator(
          'input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i], input[name*="one-time" i], input[id*="one-time" i]'
        ).count().catch(()=>0);

        const maybe2fa =
          (hasOtpInput > 0) ||
          /one[-\\s]?time|otp|ellenőrző kód|hitelesítő kód|authenticator|kétlépcsős|two[-\\s]?factor|2fa|mfa/i.test(bodyText) ||
          /\\bmfa\\b/i.test(url);

        console.log(JSON.stringify({ url, looksLikeLoggedIn, isSSO, isIdentity, maybe2fa }));
      } catch (e) {
        console.log(JSON.stringify({ fatal: String(e && (e.message || e)) }));
      } finally {
        try { await ctx?.close(); } catch {}
      }
    })();
  `;

  const r = await run(node, ['-e', probeJs], 70000);
  const out = (r.stdout || '').trim().split('\n').pop() || '{}';

  try {
    return JSON.parse(out);
  } catch {
    return { fatal: 'bad-json', raw: out };
  }
}

async function recoverLogin() {
  // 1) prefer relogin-hard.sh
  const zsh = '/bin/zsh';
  let r = await run(zsh, ['-lc', 'cd "$HOME/crm-bot-mail" && VU3_FORCE_RECOVER=1 ./tools/relogin-hard.sh'], TIMEOUT_MS);
  let all = (r.stdout || '') + '\n' + (r.stderr || '');

  // 2) fallback: auto-login-vu3.js
  if (!r.ok) {
    const node = process.execPath;
    const file = path.join(CRM_DIR, 'auto-login-vu3.js');
    const r2 = await run(node, [file], TIMEOUT_MS);
    all += '\n' + (r2.stdout || '') + '\n' + (r2.stderr || '');
    r = {
      ok: r2.ok,
      stdout: r2.stdout,
      stderr: r2.stderr,
      error: r2.error,
      code: r2.code
    };
  }

  return { ok: r.ok, out: all };
}

(async () => {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });

    if (!process.env.SESSIONWATCH_VERBOSE) log('START');
    await new Promise((res) => setTimeout(res, SLEEP_MS));

    const st = readStatusState(); // ONLINE / OFFLINE / null
    const loginCheck = await runLoginCheck();

    // ONLINE esetén: SEMMI autologin, SEMMI Playwright
    if (st === 'ONLINE' || loginCheck.online) {
      clearStuckAlerts();
      log(`STATE=ONLINE -> skip everything (state=${st || 'null'} loginCheck=${loginCheck.raw || 'EMPTY'})`);
      return;
    }

    // OFFLINE / unknown eset
    const probe0 = await playwrightLoggedInProbe();

    if (!probe0 || probe0.fatal || !probe0.url) {
      log(`PROBE0 BAD/NOURL -> ${JSON.stringify(probe0)} state=${st || 'null'} loginCheck=${loginCheck.raw || 'EMPTY'}`);
    } else if (probe0.looksLikeLoggedIn) {
      clearStuckAlerts();
      log(`OK (PW PROBE): logged in url=${probe0.url} state=${st || 'null'}`);
      return;
    }

    // hard offline:
    // - ha statusnotify.state szerint OFFLINE
    // - vagy ha a state nem ONLINE és a login-check szerint OFFLINE
    const hardOffline = (st === 'OFFLINE') || (st !== 'ONLINE' && loginCheck.offline);

    if (!hardOffline && !canRun()) {
      if (process.env.SESSIONWATCH_VERBOSE) log('SKIP (rate limit)');
      return;
    }

    if (hardOffline) {
      log(`HARD OFFLINE -> bypass rate limit (state=${st || 'null'} loginCheck=${loginCheck.raw || 'EMPTY'})`);
    }

    if (hasRecoverLock()) {
      log('SKIP (recover.lock held)');
      return;
    }

    markRun();
    setRecoverLock();

    try {
      log(`LOGOUT/OFFLINE -> recover start (state=${st || 'null'} loginCheck=${loginCheck.raw || 'EMPTY'})`);

      const rec = await recoverLogin();
      const txt = rec.out || '';

      await new Promise((res) => setTimeout(res, 3000));

      const probe1 = await playwrightLoggedInProbe();

      if (!probe1 || probe1.fatal || !probe1.url) {
        log(`PROBE1 BAD/NOURL -> ${JSON.stringify(probe1)}`);
        return;
      }

      if (probe1.looksLikeLoggedIn) {
        clearStuckAlerts();
        log(`RECOVER OK -> logged in url=${probe1.url}`);
        return;
      }

      const stuckSSO = !!(probe1.isSSO || probe1.isIdentity);
      const maybe2fa = !!probe1.maybe2fa;
      const need2faHint = /NEED_2FA/i.test(txt);

      // 2FA alert csak akkor, ha tényleg 2FA-gyanús elakadás van
      if (need2faHint && stuckSSO && maybe2fa) {
        log(`RECOVER RESULT: NEED_2FA (probe url=${probe1.url})`);

        // FAIL alert ne maradjon pendingben, ha ez valójában 2FA
        clearFile(ALERT_FAIL_FILE);

        if (shouldSendStuckAlert(ALERT_2FA_FILE)) {
          await sendPushover(
            '🔐 2FA szükséges',
            'VU3 beléptetés megállt 2FA miatt. TeamViewer -> manuális 2FA, majd futtasd: cd ~/crm-bot-mail && ./tools/relogin-hard.sh (vagy vu3 login) és utána vu3 restart.'
          );
        } else {
          log(`2FA hint -> pending (grace ${Math.round(ALERT_GRACE_MS / 1000)}s), no push yet`);
        }

        return;
      }

      // ha nem 2FA, akkor a 2FA pending törlődjön
      clearFile(ALERT_2FA_FILE);

      // FAIL
      log(`RECOVER FAIL -> still not logged in (probe url=${probe1.url})`);

      if (stuckSSO) {
        if (shouldSendStuckAlert(ALERT_FAIL_FILE)) {
          await sendPushover(
            '🔐 Login FAIL',
            'VU3 nem tudott visszalépni automatikusan. TeamViewer + futtasd: vu3 health. (Lehet SSO változás / jelszó / 2FA).'
          );
        } else {
          log(`LOGIN FAIL -> pending (grace ${Math.round(ALERT_GRACE_MS / 1000)}s), no push yet`);
        }
      } else {
        clearFile(ALERT_FAIL_FILE);
        log('RECOVER FAIL (not SSO/Identity) -> silent');
      }

    } finally {
      clearRecoverLock();
    }

  } catch (e) {
    err(`FATAL: ${e?.stack || e?.message || String(e)}`);
  }
})();