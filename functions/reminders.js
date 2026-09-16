// Reminder scheduling + Web Push delivery for the exam planner.
//
// The planner page keeps a snapshot of its own calendar (school exams, events
// and hand-added entries, minus anything hidden) inside the synced document, so
// this Worker can work out what's coming up without knowing anything about the
// timetable itself. A cron trigger runs periodically, decides what's due, and
// wakes the phone.
//
// Pushes are sent WITHOUT a payload. Encrypting a payload means ECDH + HKDF +
// AES-GCM per subscription, and getting that subtly wrong fails silently on a
// real phone. Instead the push is an empty "tickle": the service worker wakes,
// asks this Worker what the notification says, and shows it. Only VAPID signing
// is needed, which is a plain ES256 JWT.

export const DEFAULT_OFFSETS = {
  exams:     ['1w','1d','0d'],
  important: ['1d','0d'],
  social:    ['1d'],
  sport:     ['0d'],
  other:     ['0d'],
};

export const OFFSETS = ['1w','3d','1d','0d','1h'];
export const OFFSET_LABELS = {
  '1w':'A week before', '3d':'3 days before', '1d':'The day before',
  '0d':'On the day', '1h':'An hour before',
};

const DAY = 86400000;

export function settingValue(doc, key, fallback){
  const s = doc && doc.settings && doc.settings[key];
  return (s && s.value !== undefined && s.value !== null) ? s.value : fallback;
}

// ---- Time zones -------------------------------------------------------------
// The Worker runs in UTC but reminders have to land at 7am *her* time, so a
// wall-clock time in her zone has to be turned back into an instant.
export function tzOffsetMs(utcMs, tz){
  try{
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12:false,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit',
    });
    const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map(x=>[x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return asUTC - utcMs;
  }catch(err){
    return 0;  // unknown zone — fall back to UTC rather than dropping the reminder
  }
}

export function zonedToUtc(dateStr, hhmm, tz){
  const [h, m] = String(hhmm || '07:00').split(':').map(Number);
  const guess = Date.parse(`${dateStr}T${String(h||0).padStart(2,'0')}:${String(m||0).padStart(2,'0')}:00Z`);
  if(Number.isNaN(guess)) return NaN;
  // One correction pass is exact everywhere except within an hour of a DST
  // change, and Singapore has no DST.
  return guess - tzOffsetMs(guess, tz);
}

export function shiftDate(dateStr, days){
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}

export function todayIn(tz, nowMs){
  return new Date(nowMs + tzOffsetMs(nowMs, tz)).toISOString().slice(0,10);
}

// ---- What should fire, and when --------------------------------------------
export function plannedReminders(doc, tz, nowMs){
  const items = (doc && doc.snapshot && doc.snapshot.cal && doc.snapshot.cal.value) || [];
  const timeOfDay = settingValue(doc, 'remind.time', '07:00');
  const out = [];

  for(const it of items){
    if(!it || !it.date) continue;
    const offsets = Array.isArray(it.remind)
      ? it.remind
      : settingValue(doc, `remind.${it.kind}`, DEFAULT_OFFSETS[it.kind] || ['1d']);

    for(const off of offsets){
      if(off === '1h'){
        if(!it.time) continue;
        const at = zonedToUtc(it.date, it.time, tz) - 3600000;
        out.push({key:`${it.id}|1h|${it.date}`, at, title:it.title, body:`Starts at ${it.time} — in an hour.`});
        continue;
      }
      const days = off === '1w' ? 7 : off === '3d' ? 3 : off === '1d' ? 1 : 0;
      const at = zonedToUtc(shiftDate(it.date, -days), timeOfDay, tz);
      const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
      const time = it.time ? ` at ${it.time}` : '';
      out.push({key:`${it.id}|${off}|${it.date}`, at, title:it.title, body:`${when}${time}.`});
    }
  }

  if(settingValue(doc, 'remind.digest', false)){
    const today = todayIn(tz, nowMs);
    const todays = items.filter(it=>it && it.date === today);
    if(todays.length){
      const names = todays.map(it=>it.title).join(', ');
      out.push({
        key: `digest|${today}`,
        at: zonedToUtc(today, settingValue(doc, 'remind.digestTime', '07:00'), tz),
        title: todays.length === 1 ? 'Today' : `${todays.length} things today`,
        body: names.length > 180 ? names.slice(0,177) + '…' : names,
      });
    }
  }

  return out.filter(r=>Number.isFinite(r.at));
}

// Everything whose moment has passed but is still recent enough to be worth
// sending. `windowMs` covers a cron run that was missed or ran late; the caller
// records what it has already sent so nothing goes out twice.
export function dueReminders(doc, tz, nowMs, windowMs = 2 * 3600000){
  return plannedReminders(doc, tz, nowMs)
    .filter(r=> r.at <= nowMs && r.at > nowMs - windowMs)
    .sort((a,b)=> a.at - b.at);
}

// ---- VAPID ------------------------------------------------------------------
export function b64uToBytes(s){
  const norm = String(s).replace(/-/g,'+').replace(/_/g,'/');
  const padded = norm + '='.repeat((4 - norm.length % 4) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c=>c.charCodeAt(0));
}
export function bytesToB64u(bytes){
  let s = '';
  for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export async function sha256hex(text){
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

// Pasting a key into a dashboard field very easily picks up a newline, a stray
// space, or quotes. Strip all of that before anything tries to decode it.
export function cleanKey(raw){
  return String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
}

// The public key is the uncompressed P-256 point (0x04 ‖ X ‖ Y); the private key
// is the raw scalar. Together they make the JWK WebCrypto wants.
export async function importVapidKey(publicKey, privateKey){
  const pubRaw = cleanKey(publicKey);
  const privRaw = cleanKey(privateKey);
  if(!pubRaw) throw new Error('VAPID_PUBLIC_KEY is empty.');
  if(!privRaw) throw new Error('VAPID_PRIVATE_KEY is empty.');

  const pub = b64uToBytes(pubRaw);
  if(pub.length !== 65 || pub[0] !== 4){
    throw new Error(`VAPID_PUBLIC_KEY should decode to 65 bytes starting with 0x04, but got ${pub.length} bytes — check it was pasted whole.`);
  }
  const priv = b64uToBytes(privRaw);
  if(priv.length !== 32){
    throw new Error(`VAPID_PRIVATE_KEY should decode to 32 bytes, but got ${priv.length} — the public and private keys may have been swapped.`);
  }

  const jwk = {
    kty:'EC', crv:'P-256',
    x: bytesToB64u(pub.slice(1,33)),
    y: bytesToB64u(pub.slice(33,65)),
    d: bytesToB64u(priv),
    ext:true,
  };
  try{
    return await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
  }catch(err){
    throw new Error('The VAPID keys are not a matching pair — the private key does not go with this public key.');
  }
}

// Checks the key material without sending anything, so a bad paste reports
// itself instead of surfacing as "could not reach the push service".
export async function verifyVapidKeys(env){
  if(!env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY){
    return {ok:false, error:'Neither VAPID key is set on the Worker.'};
  }
  try{
    const key = await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    // Signing proves the pair actually works, not just that it parsed.
    await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, key, new TextEncoder().encode('check'));
  }catch(err){
    return {ok:false, error: err.message};
  }
  const sub = String(env.VAPID_SUBJECT || '');
  if(!/^(mailto:|https:)/.test(sub)){
    return {ok:false, error:'VAPID_SUBJECT must start with "mailto:" or "https:" — push services reject anything else.'};
  }
  return {ok:true};
}

export async function vapidJwt(audience, env, nowMs = Date.now()){
  const key = await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const enc = new TextEncoder();
  const header = bytesToB64u(enc.encode(JSON.stringify({typ:'JWT', alg:'ES256'})));
  const payload = bytesToB64u(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(nowMs/1000) + 12*3600,
    sub: env.VAPID_SUBJECT || 'mailto:planner@invalid',
  })));
  const sig = await crypto.subtle.sign(
    {name:'ECDSA', hash:'SHA-256'}, key, enc.encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${bytesToB64u(new Uint8Array(sig))}`;
}

// An empty push. The service worker fetches the text once it wakes up.
// Returns {status, error, detail} — never throws, so callers can report the
// real reason rather than a generic failure.
export async function sendTickle(endpoint, env){
  let jwt;
  try{
    jwt = await vapidJwt(new URL(endpoint).origin, env);
  }catch(err){
    return {status:0, error: err.message};
  }
  try{
    const res = await fetch(endpoint, {
      method:'POST',
      headers:{
        'TTL':'3600',
        'Urgency':'normal',
        'Content-Length':'0',
        'Authorization': `vapid t=${jwt}, k=${cleanKey(env.VAPID_PUBLIC_KEY)}`,
      },
    });
    // Push services explain rejections in the body; that text is what actually
    // identifies a bad key or an expired subscription.
    let detail = '';
    if(res.status >= 400) detail = (await res.text().catch(()=>'')).slice(0, 300);
    return {status: res.status, detail};
  }catch(err){
    return {status:0, error: `Could not reach ${new URL(endpoint).host}: ${err.message}`};
  }
}

export const subKey = (hash)=> `push:${hash}`;
export const pendingKey = (hash)=> `pending:${hash}`;
export const sentKey = (hash, reminderKey)=> `pushsent:${hash}:${reminderKey}`;

// ---- The cron job -----------------------------------------------------------
export async function runReminders(env, nowMs = Date.now()){
  const result = {subscriptions:0, sent:0, dropped:0, skipped:0};
  if(!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY){
    result.error = 'VAPID keys are not configured on this Worker.';
    return result;
  }

  const listed = await env.ASSASSIN_KV.list({prefix:'push:'});
  for(const k of listed.keys){
    let rec;
    try{ rec = JSON.parse(await env.ASSASSIN_KV.get(k.name) || 'null'); }
    catch(err){ rec = null; }
    if(!rec || !rec.endpoint || !rec.docKey) continue;
    result.subscriptions++;

    const docRaw = await env.ASSASSIN_KV.get(rec.docKey);
    if(!docRaw){ result.skipped++; continue; }

    let doc;
    try{ doc = JSON.parse(docRaw); } catch(err){ result.skipped++; continue; }

    const due = dueReminders(doc, rec.tz || 'UTC', nowMs);
    const fresh = [];
    for(const r of due){
      const marker = sentKey(rec.hash, r.key);
      if(await env.ASSASSIN_KV.get(marker)) continue;
      await env.ASSASSIN_KV.put(marker, '1', {expirationTtl: 7*86400});
      fresh.push({title:r.title, body:r.body});
    }
    if(!fresh.length) continue;

    const outcome = await queueAndTickle(env, rec, fresh);
    if(outcome.status >= 200 && outcome.status < 300){
      result.sent += fresh.length;
    } else {
      result.failed = (result.failed || 0) + 1;
      result.lastError = outcome.error || `${outcome.status} ${outcome.detail || ''}`.trim();
    }
    if(rec.gone) result.dropped++;
  }
  return result;
}

// Parks the text where the service worker can fetch it, then wakes the device.
// A 404/410 from the push service means the subscription is dead — drop it so
// it doesn't get retried forever.
export async function queueAndTickle(env, rec, notifications){
  const existing = JSON.parse((await env.ASSASSIN_KV.get(pendingKey(rec.hash))) || '[]');
  const merged = [...existing, ...notifications].slice(-10);
  await env.ASSASSIN_KV.put(pendingKey(rec.hash), JSON.stringify(merged), {expirationTtl: 3600});

  const result = await sendTickle(rec.endpoint, env);

  if(result.status === 404 || result.status === 410){
    rec.gone = true;
    await env.ASSASSIN_KV.delete(subKey(rec.hash));
  }
  return result;
}
