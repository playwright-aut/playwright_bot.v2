#!/usr/bin/env node
'use strict';

const path = require('path');
const { chromium } = require('playwright');

// FONTOS: mindig a crm-bot mappában lévő pw-profile-crm-t használd, ne a cwd-t
const PROFILE_DIR = path.join(__dirname, 'pw-profile-crm');

const SALES_URL = 'https://sls-lds-hu02.cross.porscheinformatik.com/sales-leads/sales-lead-overview';

function isOfflineUrl(u){
  return /\/cas\/login/i.test(u) || /preventRedirect/i.test(u);
}
function isOnlineUrl(u){
  return /\/sales-leads\/sales-lead-overview/i.test(u);
}

(async () => {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
    const page = await ctx.newPage();

    await page.goto(SALES_URL, { waitUntil: 'load', timeout: 60000 }).catch(()=>{});
    await page.waitForTimeout(1200);

    const u = page.url() || '';

    if (isOnlineUrl(u)) { console.log('ONLINE'); process.exit(0); }
    if (isOfflineUrl(u)) { console.log('OFFLINE'); process.exit(0); }

    console.log('UNKNOWN');
    if (process.env.VU3_DEBUG === '1') console.log('FINAL_URL:', u);
    process.exit(0);

  } catch (e) {
    console.log('UNKNOWN');
    if (process.env.VU3_DEBUG === '1') console.log('ERR:', e?.message || String(e));
    process.exit(0);
  } finally {
    try { await ctx?.close(); } catch {}
  }
})();
