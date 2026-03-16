require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const QUEUE_DIR = path.join(process.cwd(), 'VU3MailQueue');
const DONE_DIR = path.join(process.cwd(), 'VU3MailQueueProcessed');
const BLOCKED_DIR = path.join(process.cwd(), 'VU3MailQueueBlocked');
const POLL_MS = 2000;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function ensureDir(dir){ fs.mkdirSync(dir, { recursive: true }); }

function listJsonFiles(dir){
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
}

function listQueueFiles(){
  return listJsonFiles(QUEUE_DIR).map(f => path.join(QUEUE_DIR, f));
}

function alreadyProcessed(file){
  const base = path.basename(file);
  return fs.existsSync(path.join(DONE_DIR, base));
}

function moveTo(file, dir){
  const dest = path.join(dir, path.basename(file));
  fs.renameSync(file, dest);
  return dest;
}

(async () => {
  ensureDir(QUEUE_DIR);
  ensureDir(DONE_DIR);
  ensureDir(BLOCKED_DIR);

  console.log('[bot-mail] indul...');
  console.log('[bot-mail] queue:', QUEUE_DIR);
  console.log('[bot-mail] done:', DONE_DIR);
  console.log('[bot-mail] blocked:', BLOCKED_DIR);

  while (true) {
    const files = listQueueFiles();

    if (!files.length) {
      await sleep(POLL_MS);
      continue;
    }

    const file = files[0];
    const leadId = path.basename(file, '.json');

    if (alreadyProcessed(file)) {
      console.log(`[bot-mail] skip, már processed-ben van: ${leadId}`);
      try { fs.unlinkSync(file); } catch {}
      await sleep(300);
      continue;
    }

    console.log(`[bot-mail] feldolgozás indul: ${leadId}`);

    const r = spawnSync('/usr/local/bin/node', ['lead-process.js', leadId], {
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    const code = Number(r.status ?? 1);
    console.log(`[bot-mail] exit code lead ${leadId}:`, code);

    if (code === 0) {
      const dest = moveTo(file, DONE_DIR);
      console.log('[bot-mail] processed ->', dest);

      // outlook: mark as read (best effort)
      try {
        const rr = spawnSync('/usr/local/bin/node', ['mail-mark-read.js', leadId], { cwd: process.cwd(), stdio: 'inherit' });
        console.log('[bot-mail] mark-read exit:', rr.status);
      } catch (e) {
        console.log('[bot-mail] mark-read failed:', e?.message || String(e));
      }

    } else if (code === 5 || code === 6) {
      const dest = moveTo(file, BLOCKED_DIR);
      console.log('[bot-mail] blocked ->', dest);
    } else {
      console.log('[bot-mail] retry later, queue-ban marad:', file);
      await sleep(3000);
    }

    await sleep(500);
  }
})().catch(err => {
  console.error('[bot-mail] FATAL:', err?.message || err);
  process.exit(1);
});
