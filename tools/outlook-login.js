#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });

const path = require("path");
const { chromium } = require("playwright");

const PROFILE_DIR = path.resolve(process.env.PW_PROFILE_MAILWATCH || "pw-profile-mailwatch");
const OUTLOOK_URL = "https://outlook.office.com/mail/";
const OUTLOOK_USER = String(process.env.OUTLOOK_USER || "").trim();
const OUTLOOK_PASS = String(process.env.OUTLOOK_PASS || "").trim();
const LOGIN_TIMEOUT_MS = 180000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function isOnlineUrl(url) {
  const u = norm(url);
  return (
    u.startsWith("https://outlook.cloud.microsoft/mail") ||
    u.startsWith("https://outlook.office.com/mail") ||
    u.startsWith("https://outlook.live.com/mail")
  );
}

function isOfflineUrl(url) {
  const u = norm(url);
  return (
    u.includes("login.microsoftonline.com") ||
    u.includes("/oauth2/") ||
    u.includes("/kmsi") ||
    u.includes("/common/login") ||
    u.includes("/common/reprocess")
  );
}

async function count(page, sel) {
  try { return await page.locator(sel).count(); } catch { return 0; }
}

async function visible(page, sel) {
  try {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) return false;
    return await loc.isVisible().catch(() => false);
  } catch {
    return false;
  }
}

async function bodyText(page) {
  try { return await page.locator("body").innerText(); } catch { return ""; }
}

async function isOnline(page) {
  const url = page.url() || "";
  const savedTileCount = OUTLOOK_USER ? await count(page, `[data-test-id="${OUTLOOK_USER}"]`) : 0;
  const otherTileCount = await count(page, "#otherTile");
  const emailCount = await count(page, "#i0116");
  const passCount = await count(page, "#i0118");

  const offlineSignals =
    savedTileCount > 0 ||
    otherTileCount > 0 ||
    emailCount > 0 ||
    passCount > 0 ||
    isOfflineUrl(url);

  return isOnlineUrl(url) && !offlineSignals;
}

async function looksLike2FA(page) {
  const url = norm(page.url());
  const txt = norm(await bodyText(page));

  if (await count(page, "#i0116")) return false;
  if (await count(page, "#i0118")) return false;
  if (await count(page, "#otherTile")) return false;
  if (OUTLOOK_USER && await count(page, `[data-test-id="${OUTLOOK_USER}"]`)) return false;

  if (
    url.includes("mfa") ||
    url.includes("twofactor") ||
    url.includes("proofup") ||
    url.includes("deviceauth")
  ) return true;

  return (
    txt.includes("authenticator") ||
    txt.includes("approve sign in request") ||
    txt.includes("verify your identity") ||
    txt.includes("kétlépcs") ||
    txt.includes("ellenőrizze az identitását") ||
    txt.includes("hiteles")
  );
}

async function openFreshPage(ctx) {
  const oldPages = ctx.pages();
  for (const p of oldPages) {
    try { await p.close(); } catch {}
  }
  const page = await ctx.newPage();
  await page.goto(OUTLOOK_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return page;
}

(async () => {
  let ctx;
  try {
    if (!OUTLOOK_USER || !OUTLOOK_PASS) {
      console.log("[outlook-login] missing OUTLOOK_USER / OUTLOOK_PASS");
      process.exit(2);
    }

    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 }
    });

    let page = await openFreshPage(ctx);
    console.log("[outlook-login] indul");

    if (await isOnline(page)) {
      console.log("[outlook-login] már be van jelentkezve");
      await ctx.close().catch(() => {});
      process.exit(0);
    }

    const started = Date.now();

    while (Date.now() - started < LOGIN_TIMEOUT_MS) {
      // console.log("[outlook-login] következő lépés");

      if (await isOnline(page)) {
        console.log("[outlook-login] OK: Outlook login kész");
        await ctx.close().catch(() => {});
        process.exit(0);
      }

      // 1) saved account tile
      if (OUTLOOK_USER && await visible(page, `[data-test-id="${OUTLOOK_USER}"]`)) {
        // console.log("[outlook-login] mentett fiók kiválasztva");
        await page.locator(`[data-test-id="${OUTLOOK_USER}"]`).first().click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2500);
        continue;
      }

      // 2) other account tile
      if (await visible(page, "#otherTile")) {
        // console.log("[outlook-login] másik fiók");
        await page.locator("#otherTile").first().click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2500);
        continue;
      }

      // 3) email
      if (await visible(page, "#i0116")) {
        // console.log("[outlook-login] e-mail mező");
        const email = page.locator("#i0116").first();
        await email.click({ timeout: 10000 }).catch(() => {});
        await email.fill(OUTLOOK_USER, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(500);

        if (await visible(page, "#idSIButton9")) {
          await page.locator("#idSIButton9").first().click({ timeout: 10000 }).catch(() => {});
        } else {
          await page.keyboard.press("Enter").catch(() => {});
        }

        await page.waitForTimeout(2500);
        continue;
      }

      // 4) password
      if (await visible(page, "#i0118")) {
        // console.log("[outlook-login] jelszó mező");
        const pass = page.locator("#i0118").first();
        await pass.click({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(300);
        await pass.fill(OUTLOOK_PASS, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(500);

        if (await visible(page, "#idSIButton9")) {
          await page.locator("#idSIButton9").first().click({ timeout: 10000 }).catch(() => {});
        } else {
          await page.keyboard.press("Enter").catch(() => {});
        }

        await page.waitForTimeout(4000);
        continue;
      }

      // 5) KMSI
      {
        const txt = norm(await bodyText(page));
        const kmsi =
          txt.includes("bejelentkezve marad") ||
          txt.includes("stay signed in");

        if (kmsi && await visible(page, "#idSIButton9")) {
          // console.log("[outlook-login] maradjon bejelentkezve: igen");
          await page.locator("#idSIButton9").first().click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(7000);
          continue;
        }
      }

      // 6) 2FA
      if (await looksLike2FA(page)) {
        console.log("[outlook-login] 2FA szükséges");
        await page.waitForTimeout(120000);

        if (await isOnline(page)) {
          console.log("[outlook-login] OK: Outlook login kész 2FA után");
          await ctx.close().catch(() => {});
          process.exit(0);
        }

        await ctx.close().catch(() => {});
        process.exit(3);
      }

      await page.waitForTimeout(1500);
    }

    console.log("[outlook-login] timeout");
    await ctx.close().catch(() => {});
    process.exit(4);
  } catch (e) {
    console.error("[outlook-login] FATAL:", e?.message || String(e));
    try { if (ctx) await ctx.close(); } catch {}
    process.exit(1);
  }
})();
