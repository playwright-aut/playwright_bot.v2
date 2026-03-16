#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });
'use strict';


const path = require('path');
const { chromium } = require('playwright');

const PROFILE_DIR = path.resolve(process.env.PW_PROFILE_MAILWATCH || 'pw-profile-mailwatch');
const OUTLOOK_URL = 'https://outlook.office.com/mail/';

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function isOfflineUrl(u) {
  const url = norm(u);
  return (
    url.includes('login.microsoftonline.com') ||
    url.includes('/oauth2/') ||
    url.includes('/kmsi') ||
    url.includes('/common/login') ||
    url.includes('/common/reprocess')
  );
}

function isOnlineUrl(u) {
  const url = norm(u);
  return (
    url.startsWith('https://outlook.cloud.microsoft/mail') ||
    url.startsWith('https://outlook.office.com/mail') ||
    url.startsWith('https://outlook.live.com/mail')
  );
}

async function count(page, sel) {
  try {
    return await page.locator(sel).count();
  } catch {
    return 0;
  }
}

let ctx;
let forced = false;

function finish(text) {
  if (forced) return;
  forced = true;
  try { console.log(text); } catch {}
  setTimeout(() => process.exit(0), 50);
}

setTimeout(() => finish('UNKNOWN'), 15000);

(async () => {
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      viewport: { width: 1280, height: 800 }
    });

    const page = ctx.pages()[0] || await ctx.newPage();

    await page.goto(OUTLOOK_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    }).catch(() => {});

    await page.waitForTimeout(2500);

    const url = page.url() || '';
    const user = String(process.env.OUTLOOK_USER || '').trim();

    const emailCount = await count(page, '#i0116');
    const passCount = await count(page, '#i0118');
    const savedTileCount = user ? await count(page, `[data-test-id="${user}"]`) : 0;
    const otherTileCount = await count(page, '#otherTile');

    const offlineSignals =
      emailCount > 0 ||
      passCount > 0 ||
      savedTileCount > 0 ||
      otherTileCount > 0 ||
      isOfflineUrl(url);

    const onlineSignals =
      isOnlineUrl(url) &&
      !offlineSignals;

    if (process.env.VU3_DEBUG === '1') {
      console.log('DEBUG_URL:', url);
      console.log('DEBUG_EMAIL:', emailCount);
      console.log('DEBUG_PASS:', passCount);
      console.log('DEBUG_SAVED_TILE:', savedTileCount);
      console.log('DEBUG_OTHER_TILE:', otherTileCount);
    }

    if (onlineSignals) return finish('ONLINE');
    if (offlineSignals) return finish('OFFLINE');
    return finish('UNKNOWN');
  } catch (e) {
    if (process.env.VU3_DEBUG === '1') {
      try { console.log('ERR:', e?.message || String(e)); } catch {}
    }
    return finish('UNKNOWN');
  } finally {
    try { if (ctx) await ctx.close(); } catch {}
  }
})();
