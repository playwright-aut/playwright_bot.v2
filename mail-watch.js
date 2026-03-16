#!/usr/bin/env node
"use strict";

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const FOLDER_NAME = process.env.OUTLOOK_FOLDER_NAME || "VU3 Leads";
const LEAD_FROM = process.env.LEAD_FROM || "no_reply@porscheinformatik.com";
const LEAD_SUBJECT = process.env.LEAD_SUBJECT || "Értékesítési lead-ek - Új lead került hozzárendelésre a csoportjához";
const PROFILE_DIR = process.env.PW_PROFILE_MAILWATCH || "pw-profile-mailwatch";

const QUEUE_DIR = path.join(process.cwd(), "VU3MailQueue");
const DONE_DIR = path.join(process.cwd(), "VU3MailQueueProcessed");
const BLOCKED_DIR = path.join(process.cwd(), "VU3MailQueueBlocked");
const MISS_DIR = path.join(process.cwd(), "VU3MailMiss");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function existsAnywhere(fileName) {
  return (
    fs.existsSync(path.join(QUEUE_DIR, fileName)) ||
    fs.existsSync(path.join(DONE_DIR, fileName)) ||
    fs.existsSync(path.join(BLOCKED_DIR, fileName)) ||
    fs.existsSync(path.join(MISS_DIR, fileName))
  );
}

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isOnlineMailboxUrl(u) {
  const url = String(u || "").toLowerCase();
  return (
    url.startsWith("https://outlook.cloud.microsoft/mail") ||
    url.startsWith("https://outlook.office.com/mail") ||
    url.startsWith("https://outlook.live.com/mail")
  );
}

function looksLikeLoginUrl(u) {
  const url = String(u || "").toLowerCase();
  return (
    url.includes("login.microsoftonline.com") ||
    url.includes("login.live.com") ||
    url.includes("account.live.com") ||
    url.includes("/oauth2/") ||
    url.includes("/kmsi") ||
    url.includes("/common/login") ||
    url.includes("/common/reprocess")
  );
}

function extractLead(rowText) {
  const txt = norm(rowText);
  if (!txt.includes(LEAD_SUBJECT)) return null;

  const fromNeedle = LEAD_FROM.toLowerCase().split("@")[0];
  const txtLower = txt.toLowerCase();
  if (!txtLower.includes(fromNeedle) && !txtLower.includes("debrecen autóház zrt")) return null;

  const m = txt.match(/https:\/\/sls-lds-hu02\.cross\.porscheinformatik\.com\/sales-leads\/lp\/sales-lead-details\/(\d+)\/select-bp/i);
  if (!m) return null;

  return {
    leadId: m[1],
    link: m[0],
    raw: txt
  };
}

async function countSafe(locator) {
  try { return await locator.count(); } catch { return 0; }
}

async function firstExisting(locators) {
  for (const loc of locators) {
    try {
      if (await loc.count()) return loc.first();
    } catch {}
  }
  return null;
}

(async () => {
  ensureDir(QUEUE_DIR);
  ensureDir(DONE_DIR);
  ensureDir(BLOCKED_DIR);

  console.log("[mail-watch] indul...");
  console.log("[mail-watch] keresett folder:", FOLDER_NAME);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true
  });

  try {
    const page = context.pages()[0] || await context.newPage();

    await page.goto("https://outlook.office.com/mail/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }).catch(() => {});

    await page.waitForTimeout(3000);

    const url = page.url();
    console.log("[mail-watch] current url:", url);

    const savedTileCount = await countSafe(page.locator(`[data-test-id="${String(process.env.OUTLOOK_USER || "").trim()}"]`));
    const otherTileCount = await countSafe(page.locator("#otherTile"));
    const emailCount = await countSafe(page.locator("#i0116"));
    const passCount = await countSafe(page.locator("#i0118"));

    if (
      looksLikeLoginUrl(url) ||
      savedTileCount > 0 ||
      otherTileCount > 0 ||
      emailCount > 0 ||
      passCount > 0 ||
      !isOnlineMailboxUrl(url)
    ) {
      throw new Error(`[mail-watch] Outlook nem ONLINE mailbox állapotban van. url=${url}`);
    }

    console.log("[mail-watch] outlook online mailbox ok");

    try { await page.waitForSelector('[role="tree"]', { timeout: 20000 }); } catch {}

    const folder = await firstExisting([
      page.getByRole("treeitem", { name: FOLDER_NAME }),
      page.locator('[role="treeitem"]').filter({ hasText: FOLDER_NAME }),
      page.getByText(FOLDER_NAME, { exact: true }),
      page.getByText(FOLDER_NAME)
    ]);

    if (!folder) {
      throw new Error(`[mail-watch] Nem találom a folder-t: "${FOLDER_NAME}"`);
    }

    try { await folder.scrollIntoViewIfNeeded(); } catch {}
    await folder.click({ timeout: 45000 });
    console.log("[mail-watch] folderre kattintva:", FOLDER_NAME);

    await page.waitForTimeout(3000);

    const rows = page.locator('div[role="option"]');
    const count = await rows.count();
    console.log("[mail-watch] levélsorok száma:", count);

    let queued = 0;

    for (let i = 0; i < Math.min(count, 20); i++) {
      const row = rows.nth(i);
      const rowText = await row.innerText().catch(() => "");
      const hit = extractLead(rowText);
      if (!hit) continue;

      const rowAria = await row.getAttribute("aria-label").catch(() => "");
      const isUnread =
        /olvasatlan|unread/i.test(`${rowAria} ${rowText}`) ||
        (await countSafe(row.locator('[aria-label*="olvasatlan" i], [title*="olvasatlan" i], [aria-label*="unread" i], [title*="unread" i]'))) > 0;

      if (!isUnread) {
        console.log(`[mail-watch] skip read lead: ${hit.leadId}`);
        continue;
      }

      const fileName = `${hit.leadId}.json`;
      if (existsAnywhere(fileName)) {
        console.log(`[mail-watch] skip meglévő lead: ${hit.leadId}`);
        continue;
      }

      const payload = {
        leadId: hit.leadId,
        link: hit.link,
        queuedAt: new Date().toISOString(),
        source: "outlook-web"
      };

      const outFile = path.join(QUEUE_DIR, fileName);
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
      console.log("[mail-watch] queue write:", outFile);
      queued++;
    }

    console.log("[mail-watch] új queue elemek:", queued);
    console.log("[mail-watch] closed");
  } finally {
    await context.close().catch(() => {});
  }
})().catch(err => {
  console.error("[mail-watch] FATAL:", err?.message || err);
  process.exit(1);
});
