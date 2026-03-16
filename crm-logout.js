#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const path = require("path");
const { chromium } = require("playwright");

const PROFILE_DIR = path.resolve(process.env.PW_PROFILE_CRM || "pw-profile-crm");
const OVERVIEW = "https://sls-lds-hu02.cross.porscheinformatik.com/sales-leads/sales-lead-overview";
const LOGOUT = "https://sso.cross.porscheinformatik.com/cas/logout";

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
    u.includes("/cas/login") ||
    u.includes("preventredirect") ||
    b.includes("ldap felhasználónevét és jelszavát") ||
    b.includes("felhasználónév") ||
    b.includes("jelszó") ||
    b.includes("bejelentkezés")
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

    await page.goto(OVERVIEW, {
      waitUntil: "load",
      timeout: 60000
    }).catch(() => {});
    await sleep(2000);

    await page.goto(LOGOUT, {
      waitUntil: "load",
      timeout: 60000
    }).catch(() => {});
    await sleep(4000);

    await ctx.clearCookies().catch(() => {});

    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    }).catch(() => {});

    for (const origin of [
      "https://sso.cross.porscheinformatik.com",
      "https://sls-lds-hu02.cross.porscheinformatik.com"
    ]) {
      const p = await ctx.newPage();
      await p.goto(origin, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      }).catch(() => {});
      await p.evaluate(() => {
        try { localStorage.clear(); } catch {}
        try { sessionStorage.clear(); } catch {}
      }).catch(() => {});
      await p.close().catch(() => {});
    }

    await page.goto(OVERVIEW, {
      waitUntil: "load",
      timeout: 60000
    }).catch(() => {});
    await sleep(5000);

    const finalUrl = page.url();
    const body = await page.locator("body").innerText().catch(() => "");

    if (looksLoggedOut(finalUrl, body)) {
      console.log("[crm-logout] logged out OK");
      process.exit(0);
    }

    console.log("[crm-logout] logout uncertain");
    process.exit(2);
  } catch (e) {
    console.error("[crm-logout] FATAL:", e?.message || String(e));
    process.exit(3);
  } finally {
    try { await ctx?.close(); } catch {}
  }
})();
