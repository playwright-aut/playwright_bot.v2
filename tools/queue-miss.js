#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const QUEUE = path.join(ROOT, "VU3MailQueue");
const MISS  = path.join(ROOT, "VU3MailMiss");
const MARK_READ = path.join(ROOT, "mail-mark-read.js");

if (!fs.existsSync(MISS)) fs.mkdirSync(MISS, { recursive: true });

const files = fs.existsSync(QUEUE)
  ? fs.readdirSync(QUEUE).filter(f => f.endsWith(".json")).sort()
  : [];

if (files.length === 0) {
  console.log("📭 Nincs kihagyott lead.");
  process.exit(0);
}

let moved = 0;
let marked = 0;
let markFail = 0;

for (const f of files) {
  const src = path.join(QUEUE, f);
  const dst = path.join(MISS, f);

  let obj = null;
  try {
    obj = JSON.parse(fs.readFileSync(src, "utf8"));
  } catch (e) {
    console.error("Hiba JSON olvasás közben:", f);
    continue;
  }

  const leadId = String(obj?.leadId || "").trim();
  if (!leadId) {
    console.error("Hiányzó leadId:", f);
    continue;
  }

  try {
    fs.renameSync(src, dst);
    moved++;
  } catch (e) {
    console.error("Hiba mozgatás közben:", f);
    continue;
  }

  const r = spawnSync(process.execPath, [MARK_READ, leadId], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  });

  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();

  if (r.status === 0) {
    marked++;
  } else {
    markFail++;
    console.error(`Mark-read hiba lead ${leadId}:`, out || err || `exit=${r.status}`);
  }
}

console.log("");
console.log("📭 MISSED LEADS");
console.log("");
console.log("Moved:", moved);
console.log("Marked read:", marked);
if (markFail) console.log("Mark-read fail:", markFail);
console.log("Queue cleared");
console.log("");
console.log("📁 Miss mappa: VU3MailMiss");
console.log("");
console.log("Most már indíthatod:");
console.log("vu3mail on");
console.log("");
