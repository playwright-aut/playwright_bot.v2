#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { sendPushover } = require("./pushover-send");

const HOME = process.env.HOME || `/Users/${process.env.USER}`;
const CRM_DIR = path.join(HOME, "crm-bot-mail");
const DEBUG_DIR = path.join(CRM_DIR, "debug");

const LOG = path.join(DEBUG_DIR, "outlook-sessionwatch.out");
const ERR = path.join(DEBUG_DIR, "outlook-sessionwatch.err");

const RATE_FILE = path.join(DEBUG_DIR, "outlook-sessionwatch.ratelimit");
const RATE_SEC = 10 * 60;
const SLEEP_MS = 3000;
const TIMEOUT_MS = 180000;

const STATE_FILE = path.join(DEBUG_DIR, "outlook-statusnotify.state");
const RECOVER_LOCK = path.join(DEBUG_DIR, "outlook-recover.lock");
const FAIL_STATE_FILE = path.join(DEBUG_DIR, "outlook-sessionwatch.failstate.json");

const GRACE_MS = 2 * 60 * 1000;
const MIN_BAD_CHECKS = 3;

function ts() {
  return new Date().toISOString();
}

function log(line) {
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
    const last = parseInt(fs.readFileSync(RATE_FILE, "utf8").trim(), 10);
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
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? (error.message || String(error)) : ""
      });
    });

    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
    }, timeoutMs + 2000);
  });
}

function readStatusState() {
  try {
    const s = fs.readFileSync(STATE_FILE, "utf8");
    const m = s.match(/STATE=(\w+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function hasRecoverLock(maxAgeMs = 6 * 60 * 1000) {
  try {
    const st = fs.statSync(RECOVER_LOCK);
    return (Date.now() - st.mtimeMs) < maxAgeMs;
  } catch {
    return false;
  }
}

function setRecoverLock() {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(RECOVER_LOCK, `AT=${new Date().toISOString()}\n`, "utf8");
}

function clearRecoverLock() {
  try { fs.unlinkSync(RECOVER_LOCK); } catch {}
}
function readFailState() {
  try {
    return JSON.parse(fs.readFileSync(FAIL_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeFailState(obj) {
  try {
    fs.writeFileSync(FAIL_STATE_FILE, JSON.stringify(obj), "utf8");
  } catch {}
}

function clearFailState() {
  try { fs.unlinkSync(FAIL_STATE_FILE); } catch {}
}

function markBadState(raw, st) {
  const now = Date.now();
  const prev = readFailState();

  const sameKind =
    prev &&
    prev.state === String(st || "") &&
    prev.raw === String(raw || "");

  const next = {
    firstSeenMs: prev?.firstSeenMs || now,
    lastSeenMs: now,
    count: sameKind ? ((prev?.count || 0) + 1) : ((prev?.count || 0) + 1),
    raw: String(raw || ""),
    state: String(st || "")
  };

  writeFailState(next);
  return next;
}

async function push(title, message, extra = {}) {
  try {
    await sendPushover(title, message, extra);
    log(`PUSH SENT title=${title} msg=${message}`);
  } catch (e) {
    err(`PUSH FAIL title=${title} err=${e?.message || String(e)}`);
  }
}

async function runOutlookLoginCheck() {
  const node = process.execPath;
  const file = path.join(CRM_DIR, "outlook-login-check.js");
  const r = await run(node, [file], 70000);
  const out = (r.stdout || "").trim();

  return {
    raw: out,
    online: /^ONLINE\b/i.test(out),
    offline: /^OFFLINE\b/i.test(out),
    unknown: !/^ONLINE\b/i.test(out) && !/^OFFLINE\b/i.test(out)
  };
}

async function recoverOutlookLogin() {
  const node = process.execPath;
  const file = path.join(CRM_DIR, "tools", "outlook-login.js");
  const r = await run(node, [file], TIMEOUT_MS);
  return {
    ok: r.ok,
    code: r.code,
    out: ((r.stdout || "") + "\n" + (r.stderr || "")).trim()
  };
}

function detectRecoverProblem(rec) {
  const text = String(rec?.out || "").toLowerCase();

  if (rec?.code === 3 || text.includes("2fa")) {
    return {
      kind: "2fa",
      title: "🔐 Outlook 2FA szükséges",
      msg: "Az Outlook autologin 2FA-t igényel, kézi jóváhagyás kell."
    };
  }

  if (rec?.code === 4 || text.includes("timeout")) {
    return {
      kind: "timeout",
      title: "❗ Outlook login timeout",
      msg: "Az Outlook autologin nem tudott belépni a megadott időn belül."
    };
  }

  return {
    kind: "fail",
    title: "❗ Outlook login sikertelen",
    msg: "Az Outlook autologin nem tudta helyreállítani a sessiont."
  };
}

(async () => {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });

    log("START");
    await new Promise((res) => setTimeout(res, SLEEP_MS));

    const st = readStatusState();
    const check0 = await runOutlookLoginCheck();

    if (check0.online) {
      clearFailState();
      log(`FRESH CHECK ONLINE -> skip everything (state=${st || "null"} check=${check0.raw || "EMPTY"})`);
      return;
    }

    const hardOffline = (st === "OFFLINE") || check0.offline;
    const fail = markBadState(check0.raw || "EMPTY", st || "null");
    const ageMs = Date.now() - (fail.firstSeenMs || Date.now());

    if (!hardOffline) {
      log(`NOT HARD OFFLINE -> grace wait (state=${st || "null"} check=${check0.raw || "EMPTY"} count=${fail.count} ageMs=${ageMs})`);
      return;
    }

    if (fail.count < MIN_BAD_CHECKS || ageMs < GRACE_MS) {
      log(`HARD OFFLINE but grace active -> skip recover (state=${st || "null"} check=${check0.raw || "EMPTY"} count=${fail.count}/${MIN_BAD_CHECKS} ageMs=${ageMs}/${GRACE_MS})`);
      return;
    }

    if (!canRun()) {
      log("SKIP (rate limit)");
      return;
    }

    log(`HARD OFFLINE -> recover allowed (state=${st || "null"} check=${check0.raw || "EMPTY"} count=${fail.count} ageMs=${ageMs})`);

    if (hasRecoverLock()) {
      log("SKIP (recover.lock held)");
      return;
    }

    markRun();
    setRecoverLock();

    try {
      log(`OUTLOOK OFFLINE -> recover start (state=${st || "null"} check=${check0.raw || "EMPTY"})`);

      const rec = await recoverOutlookLogin();
      log(`RECOVER EXIT code=${rec.code} ok=${rec.ok} out=${String(rec.out || "").slice(0, 400)}`);

      await new Promise((res) => setTimeout(res, 4000));

      const check1 = await runOutlookLoginCheck();
      if (check1.online) {
        clearFailState();
        log(`RECOVER OK -> ONLINE (${check1.raw})`);
        return;
      }

      log(`RECOVER FAIL -> still offline/unknown (check=${check1.raw || "EMPTY"})`);

      const p = detectRecoverProblem(rec);
      await push(p.title, p.msg, p.kind === "2fa" ? { priority: 1 } : {});
    } finally {
      clearRecoverLock();
    }
  } catch (e) {
    err(`FATAL: ${e?.stack || e?.message || String(e)}`);
  }
})();
