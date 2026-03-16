#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const path = require("path");
const { chromium } = require("playwright");

const PROFILE_DIR = path.resolve(process.env.PW_PROFILE_MAILWATCH || "pw-profile-mailwatch");
const OUTLOOK_URL = "https://outlook.office.com/mail/";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function looksLoggedOut(url, body) {
  const u = norm(url);
  const b = norm(body);
  return (
    u.includes("login.microsoftonline.com") ||
    u.includes("prompt=select_account") ||
    u.includes("/mail/logoff.owa") ||
    b.includes("fiók kiválasztása") ||
    b.includes("bejelentkezés a fiókba") ||
    b.includes("másik fiók használata") ||
    b.includes("bejelentkezés másik fiókkal")
  );
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 }
    });

    const page = ctx.pages()[0] || await ctx.newPage();

    await page.goto(OUTLOOK_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }).catch(() => {});

    await sleep(5000);

    const acct = page.locator('button[aria-label*="fiókjának kezelője" i], [role="button"][aria-label*="fiókjának kezelője" i]').first();
    if (!(await acct.count().catch(() => 0))) {
      const url = page.url();
      const body = await page.locator("body").innerText().catch(() => "");
      if (looksLoggedOut(url, body)) {
        console.log("[outlook-logout] already logged out");
        await ctx.close().catch(() => {});
        process.exit(0);
      }
      console.log("[outlook-logout] account button not found");
      await ctx.close().catch(() => {});
      process.exit(2);
    }

    await acct.click({ timeout: 10000 }).catch(() => {});
    console.log("[outlook-logout] account menu opened");
    await sleep(2000);

    const logout = page.locator(
      'a[aria-label*="Kijelentkezés" i], [role="button"][aria-label*="Kijelentkezés" i], a[href*="logoff.owa"]'
    ).first();

    if (!(await logout.count().catch(() => 0))) {
      console.log("[outlook-logout] logout button not found");
      await ctx.close().catch(() => {});
      process.exit(3);
    }

    await logout.click({ timeout: 10000 }).catch(() => {});
    console.log("[outlook-logout] logout clicked");
    await sleep(7000);

    const url = page.url();
    const body = await page.locator("body").innerText().catch(() => "");

    if (looksLoggedOut(url, body)) {
      console.log("[outlook-logout] logged out OK");
      await ctx.close().catch(() => {});
      process.exit(0);
    }

    console.log("[outlook-logout] logout uncertain");
    await ctx.close().catch(() => {});
    process.exit(4);
  } catch (e) {
    console.error("[outlook-logout] FATAL:", e?.message || String(e));
    try { if (ctx) await ctx.close(); } catch {}
    process.exit(1);
  }
})();
