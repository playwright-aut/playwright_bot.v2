#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");

const PROFILE_DIR = path.resolve(process.env.PW_PROFILE_MAILWATCH || "pw-profile-mailwatch");
const OUTLOOK_URL = "https://outlook.office.com/mail/";
const USER = process.env.OUTLOOK_USER || "";
const PASS = process.env.OUTLOOK_PASS || "";
const LOGIN_TIMEOUT_MS = 180000;

function norm(s) { return String(s || "").trim().toLowerCase(); }

function looksLoggedIn(url) {
  const u = norm(url);
  return u.startsWith("https://outlook.cloud.microsoft/mail")
      || u.startsWith("https://outlook.office.com/mail")
      || u.startsWith("https://outlook.live.com/mail");
}

function looksLoginUrl(url) {
  const u = norm(url);
  return u.includes("login.microsoftonline.com")
      || u.includes("login.live.com")
      || u.includes("account.live.com")
      || u.includes("/oauth2/")
      || u.includes("/kmsi");
}

async function exists(locator) {
  try { return (await locator.count()) > 0; } catch { return false; }
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 }
    });

    const page = ctx.pages()[0] || await ctx.newPage();
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;

    await page.goto(OUTLOOK_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);

    while (Date.now() < deadline) {
      const url = page.url();

      if (looksLoggedIn(url)) {
        console.log("[outlook-open] OK: Outlook login kész, ablak nyitva marad.");
        console.log("[outlook-open] Ha végeztél, nyomj Entert a terminálban.");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise((resolve) => rl.question("", () => { rl.close(); resolve(); }));
        break;
      }

      if (looksLoginUrl(url)) {
        const savedAccount = page.locator(`[data-test-id="${String(USER).trim()}"]`).first();
        const otherTile = page.locator("#otherTile").first();
        const emailInput = page.locator('input[type="email"], input[name="loginfmt"], #i0116').first();
        const passInput = page.locator('input[type="password"], input[name="passwd"], #i0118').first();
        const yesBtn = page.getByRole("button", { name: /igen|yes/i }).first();
        const nextBtn = page.getByRole("button", { name: /tovább|next|bejelentkezés|sign in/i }).first();

        if (await exists(savedAccount)) {
          await savedAccount.click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1800);
          continue;
        }

        if (await exists(otherTile)) {
          await otherTile.click({ timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1800);
          continue;
        }

        if (await exists(emailInput)) {
          await emailInput.click({ timeout: 8000 }).catch(() => {});
          await emailInput.fill(USER, { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(400);
          await nextBtn.click({ timeout: 10000 }).catch(async () => {
            await page.keyboard.press("Enter").catch(() => {});
          });
          await page.waitForTimeout(1800);
          continue;
        }

        if (await exists(passInput)) {
          await passInput.click({ timeout: 8000 }).catch(() => {});
          await passInput.fill(PASS, { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(400);
          await nextBtn.click({ timeout: 10000 }).catch(async () => {
            await page.keyboard.press("Enter").catch(() => {});
          });
          await page.waitForTimeout(1800);
          continue;
        }

        if (await exists(yesBtn)) {
          await yesBtn.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(1800);
          continue;
        }
      }

      await page.waitForTimeout(1200);
    }

  } catch (e) {
    console.error("[outlook-open] FATAL:", e?.message || String(e));
    process.exitCode = 1;
  } finally {
    try { await ctx?.close(); } catch {}
    console.log("[outlook-open] Bezárva.");
  }
})();
