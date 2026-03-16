#!/usr/bin/env node
"use strict";

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const CRM_DIR = process.env.CRM_DIR || `/Users/${process.env.USER}/crm-bot-mail`;
const DEBUG_DIR = path.join(CRM_DIR, "debug");
const LOCK_FILE = path.join(DEBUG_DIR, "statusnotify.lock");
const STATE_FILE = path.join(DEBUG_DIR, "statusnotify.state");
const FORCE_FLAG = path.join(DEBUG_DIR, "statusnotify.force_online");

function nowIso() {
  return new Date().toISOString();
}

function acquireLock(maxAgeMs = 60_000) {
  try {
    const st = fs.statSync(LOCK_FILE);
    if (Date.now() - st.mtimeMs < maxAgeMs) return false;
  } catch {}
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid), "utf8");
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

function readPrevState() {
  try {
    const t = fs.readFileSync(STATE_FILE, "utf8");
    const m = t.match(/^STATE=(.+)$/m);
    return (m && m[1] ? m[1].trim() : null) || null;
  } catch {
    return null;
  }
}

function writeState(state, raw = "") {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const rawOneLine = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" | ")
    .slice(0, 600);

  fs.writeFileSync(
    STATE_FILE,
    `STATE=${state}\nAT=${nowIso()}\nRAW=${rawOneLine}\n`,
    "utf8"
  );
}

function runLoginCheck() {
  const script = path.join(CRM_DIR, "login-check.js");

  const r = spawnSync(process.execPath, [script], {
    cwd: CRM_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });

  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();

  if (r.error || r.status !== 0) {
    return {
      ok: false,
      state: "OFFLINE",
      raw: out || err || (r.error?.message || "login-check failed"),
    };
  }

  if (/^ONLINE\b/i.test(out)) return { ok: true, state: "ONLINE", raw: out };
  if (/^OFFLINE\b/i.test(out)) return { ok: true, state: "OFFLINE", raw: out };

  return {
    ok: false,
    state: "OFFLINE",
    raw: out || err || "unknown login-check output",
  };
}

async function main() {
  if (!acquireLock()) {
    console.error("[status-notify] lock active -> skip");
    return;
  }

  try {
    const prev = readPrevState();
    const res = runLoginCheck();
    const cur = (typeof res === "string") ? res : res?.state;
    const raw = (typeof res === "string") ? res : (res?.raw || "");

    console.log(`[status-notify] DEBUG prev=${prev} cur=${cur} raw=${String(raw).slice(0,120)}`);
    console.log(`[status-notify] DEBUG stateFile=${STATE_FILE}`);

    if (!cur || (cur !== "ONLINE" && cur !== "OFFLINE")) {
      console.error("[status-notify] no definitive state from login-check; skip. raw=", raw);
      return;
    }

    writeState(cur, raw);

    if (cur === "ONLINE" && fs.existsSync(FORCE_FLAG)) {
      try { fs.unlinkSync(FORCE_FLAG); } catch {}
      return;
    }

    if (!prev) return;

    if (prev !== cur) {
      console.log(`[state-change only] ${prev} -> ${cur}`);
    }
  } finally {
    releaseLock();
  }
}

main().catch((e) => {
  console.error("[status-notify] fatal:", e?.message || String(e));
  process.exit(1);
});
