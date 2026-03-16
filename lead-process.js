require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const { sendPushover } = require('./pushover-send');
const { buildLeadSummary } = require('./lead-summary');

const BASE = 'https://sls-lds-hu02.cross.porscheinformatik.com';
const TENANT_ID = process.env.VU3_TENANT_ID || '362';
const USER_UUID = process.env.VU3_USER_UUID || '5e55c3c0-b38b-4ec9-9d0f-fb71f63ceeb8';
const PROFILE_DIR = process.env.PW_PROFILE_CRM || 'pw-profile-crm';

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function isLoginUrl(url){ return /cas\/login|login|identity|signin/i.test(url || ''); }

async function setStatus(page, leadId, status){
  const url =
    `${BASE}/sales-leads/internal/api/lead/sales/lead/${leadId}/status` +
    `?preventLoadingIndicator=true&crossng-tenant-id=${TENANT_ID}`;

  const payload = { status, sessionUserUuid: USER_UUID };

  return await page.evaluate(async ({ url, payload }) => {
    const res = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(()=> '');
    return { ok: res.ok, status: res.status, text };
  }, { url, payload });
}

function reloginHard(){
  try {
    spawnSync('/bin/zsh', ['-lc', 'cd "$HOME/crm-bot-mail" && ./tools/relogin-hard.sh'], { stdio: 'ignore' });
  } catch {}
}

(async () => {
  const leadId = process.argv[2];
  if (!leadId) {
    console.log('Hasznalat: node lead-process.js <leadId>');
    process.exit(2);
  }

  const qfile = path.join(process.cwd(), 'VU3MailQueue', `${leadId}.json`);
  const doneFile = path.join(process.cwd(), 'VU3MailQueueProcessed', `${leadId}.json`);
  const sourceFile = fs.existsSync(qfile) ? qfile : doneFile;

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Nincs ilyen queue/done file: ${leadId}.json`);
  }

  const payload = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  console.log('[lead-process] leadId=', leadId);
  console.log('[lead-process] profile=', PROFILE_DIR);
  console.log('[lead-process] link=', payload.link);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto(payload.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('[lead-process] url after goto:', page.url());

  if (isLoginUrl(page.url())) {
    console.log('[lead-process] LOGIN DETECTED -> relogin-hard...');
    reloginHard();
    await sleep(1500);
    await page.goto(payload.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[lead-process] url after relogin:', page.url());
  }

  if (isLoginUrl(page.url())) {
    console.log('[lead-process] STILL LOGIN -> STOP');
    await context.close();
    process.exit(3);
  }

  const a = await setStatus(page, leadId, 'ASSIGNED');
  console.log('[lead-process] ASSIGNED:', a);

  if (a.status === 403) {
    console.log('[lead-process] 403 -> relogin-hard + exit(4)');
    reloginHard();
    await context.close();
    process.exit(4);
  }
  if (!a.ok) {
    console.log('[lead-process] ASSIGNED FAILED -> exit(5)');
    await context.close();
    process.exit(5);
  }

  await sleep(Number(process.env.AFTER_ASSIGNED_DELAY_MS || 3500));

  const retries = Number(process.env.INPROCESS_RETRIES || 4);
  const retryDelay = Number(process.env.INPROCESS_RETRY_DELAY_MS || 1500);

  let p = null;
  for (let i=1; i<=retries; i++){
    p = await setStatus(page, leadId, 'IN_PROCESS');
    console.log(`[lead-process] IN_PROCESS try ${i}/${retries}:`, p);
    if (p.ok) break;
    await sleep(retryDelay);
  }

  if (!p || !p.ok) {
    console.log('[lead-process] IN_PROCESS FAILED -> exit(6)');
    await context.close();
    process.exit(6);
  }

  console.log('[lead-process] DONE assigned+in_process');

  try {
    let obj = null;
    try { obj = JSON.parse((p && p.text) || (a && a.text) || ''); } catch {}
    const msg = buildLeadSummary(obj, leadId);
    if (msg) {
      await sendPushover(`Lead #${leadId} feldolgozva`, msg, { priority: 0 });
      console.log('[lead-process] pushover sent');
    }
  } catch (e) {
    console.log('[lead-process] pushover summary fail:', e?.message || String(e));
  }

  try {
    const outDir = path.join(process.cwd(), 'debug');
    fs.mkdirSync(outDir, { recursive: true });
    const shot = path.join(outDir, `lead-${leadId}-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log('[lead-process] screenshot:', shot);
  } catch {}

  await context.close();
  process.exit(0);

})().catch(e => {
  console.error('[lead-process] FATAL:', e?.message || e);
  process.exit(1);
});
