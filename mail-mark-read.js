#!/usr/bin/env node
"use strict";

require("dotenv").config({ quiet: true });

const { chromium } = require("playwright");

const leadId = process.argv[2];
if (!leadId) {
  console.error("[mail-mark-read] hiányzik a leadId");
  process.exit(2);
}

const FOLDER_NAME = process.env.OUTLOOK_FOLDER_NAME || "VU3 Leads";
const PROFILE_DIR = process.env.PW_PROFILE_MAILWATCH || "pw-profile-mailwatch";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();

    await page.goto("https://outlook.office.com/mail/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    }).catch((e) => console.log("GOTO_ERR:", e.message));

    await sleep(3000);

    const folder = page.getByText(FOLDER_NAME, { exact: true }).last();
    await folder.waitFor({ timeout: 20000 });
    await folder.click();
    await sleep(2500);

    const rows = page.locator('div[role="option"]');
    const n = await rows.count();

    let targetRow = null;
    let rowText = "";
    for (let i = 0; i < Math.min(n, 60); i++) {
      const row = rows.nth(i);
      const t = await row.innerText().catch(() => "");
      if (t.includes(leadId) || t.includes(`/sales-lead-details/${leadId}/`)) {
        targetRow = row;
        rowText = t;
        console.log("[mail-mark-read] row match:", i);
        break;
      }
    }

    if (!targetRow) {
      console.error(`[mail-mark-read] nem találom a lead sort: ${leadId}`);
      process.exit(3);
    }

    const aria = await targetRow.getAttribute("aria-label").catch(() => "");
    const isUnread = /olvasatlan/i.test(String(aria || ""));

    console.log("[mail-mark-read] row aria:", aria || "");
    console.log("[mail-mark-read] isUnread:", isUnread ? "yes" : "no");

    if (!isUnread) {
      console.log("[mail-mark-read] már olvasott, nincs teendő");
      process.exit(0);
    }

    const rowReadBtn = targetRow.locator('button[title*="olvasottként" i]').first();

    if (await rowReadBtn.count().catch(() => 0)) {
      console.log("[mail-mark-read] click row read button");
      await rowReadBtn.click({ timeout: 10000 }).catch((e) => console.log("ROWBTN_CLICK_ERR:", e.message));
      await sleep(1500);
      console.log("[mail-mark-read] ok: marked as read");
      process.exit(0);
    }

    await targetRow.click({ timeout: 5000 }).catch((e) => console.log("ROW_CLICK_ERR:", e.message));
    await sleep(1000);

    const fallback = page.locator('button[title*="olvasottként" i], [role="button"][title*="olvasottként" i]').first();
    if (await fallback.count().catch(() => 0)) {
      console.log("[mail-mark-read] click fallback read button");
      await fallback.click({ timeout: 10000 }).catch((e) => console.log("FALLBACK_CLICK_ERR:", e.message));
      await sleep(1500);
      console.log("[mail-mark-read] ok: fallback marked as read");
      process.exit(0);
    }

    console.error('[mail-mark-read] nem találom a "Megjelölés olvasottként" gombot');
    process.exit(4);
  } finally {
    await context.close().catch(() => {});
  }
})();
