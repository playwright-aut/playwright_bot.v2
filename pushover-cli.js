#!/usr/bin/env node
"use strict";

const { sendPushover } = require("./pushover-send");

const title = process.argv[2] || "TEST";
const message = process.argv.slice(3).join(" ") || "hello";

(async () => {
  const resp = await sendPushover(title, message);
  console.log(`OK req=${resp.request}`);
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e?.message || String(e));
  process.exit(1);
});
