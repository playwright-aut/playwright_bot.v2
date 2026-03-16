/**
 * Pushover sender (x-www-form-urlencoded)
 * Uses env vars:
 *   PUSHOVER_TOKEN = Application API Token
 *   PUSHOVER_USER  = User/Group Key
 */
async function sendPushover(title, message, extra = {}) {
  const token = (process.env.PUSHOVER_TOKEN || "").trim();
  const user  = (process.env.PUSHOVER_USER  || "").trim();

  if (!token || !user) {
    throw new Error("Missing PUSHOVER_TOKEN or PUSHOVER_USER env var");
  }

  const form = new URLSearchParams();
  form.set("token", token);
  form.set("user", user);
  if (title) form.set("title", String(title));
  form.set("message", String(message || ""));
  // Optional extras (priority, sound, url, url_title, device, etc.)
  for (const [k, v] of Object.entries(extra || {})) {
    if (v === undefined || v === null) continue;
    form.set(String(k), String(v));
  }

  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!res.ok || (data && data.status !== 1)) {
    const msg = (data && data.errors) ? data.errors.join("; ") : (data.raw || txt);
    throw new Error(`Pushover HTTP ${res.status}: ${msg}`);
  }

  return data;
}

module.exports = { sendPushover };
