#!/usr/bin/env node
"use strict";

require("dotenv").config({ quiet: true });

const { sendPushover } = require("./pushover-send");

const mode = String(process.argv[2] || "").trim().toLowerCase();

async function main() {
  if (!mode || !["online", "offline"].includes(mode)) {
    console.error('[bot-state-push] usage: node bot-state-push.js <online|offline>');
    process.exit(2);
  }

  const title = "CRM-BOT-MAIL";
  const message = mode === "online"
    ? "✅ A bot felállt. CRM és Outlook ONLINE."
    : "⏹️ A bot leállt. CRM és Outlook OFF.";

  const extra = mode === "offline"
    ? { priority: 0 }
    : { priority: 0 };

  const resp = await sendPushover(title, message, extra);
  console.log(mode === "online" ? "[vu3mail] ONLINE push elküldve" : "[vu3mail] OFFLINE push elküldve");
}

main().catch((e) => {
  console.error("[bot-state-push] fatal:", e?.message || String(e));
  process.exit(1);
});
