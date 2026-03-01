/**
 * Replit Keep-Alive — Advanced Stealth Pinger
 * 
 * Simulates REAL browser sessions to avoid detection:
 *  - Full page load → asset discovery → asset fetching (JS/CSS/images)
 *  - Persistent cookie jar across requests in a session
 *  - Realistic navigation chains (landing → subpage → back)
 *  - Chaotic timing based on Poisson distribution + time-of-day weighting
 *  - "Burst" and "idle" periods like real users
 *  - Multiple session personas (desktop, mobile, tablet)
 *  - Sometimes skips visits entirely (real users don't visit every cycle)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const TARGET_URL = 'https://bee-lert-1--kjlethin24.replit.app';

// ═══════════════════════════════════════════
//  PERSONA SYSTEM — consistent browser fingerprints per session
// ═══════════════════════════════════════════

const PERSONAS = [
  {
    name: 'Win Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    platform: '"Windows"',
    uaList: '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    mobile: false,
  },
  {
    name: 'Mac Safari',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    platform: '"macOS"',
    uaList: null,
    mobile: false,
  },
  {
    name: 'Linux FF',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
    platform: '"Linux"',
    uaList: null,
    mobile: false,
  },
  {
    name: 'iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: '"iOS"',
    uaList: null,
    mobile: true,
  },
  {
    name: 'Android Chrome',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    platform: '"Android"',
    uaList: '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    mobile: true,
  },
  {
    name: 'Win Edge',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
    platform: '"Windows"',
    uaList: '"Chromium";v="125", "Microsoft Edge";v="125", "Not.A/Brand";v="24"',
    mobile: false,
  },
  {
    name: 'iPad',
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: '"iOS"',
    uaList: null,
    mobile: true,
  },
  {
    name: 'Mac Chrome',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    platform: '"macOS"',
    uaList: '"Chromium";v="124", "Google Chrome";v="124", "Not.A/Brand";v="24"',
    mobile: false,
  },
  {
    name: 'Pixel',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    platform: '"Android"',
    uaList: '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    mobile: true,
  },
  {
    name: 'Win FF',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    platform: '"Windows"',
    uaList: null,
    mobile: false,
  },
];

const REFERERS = [
  'https://www.google.com/',
  'https://www.google.com/search?q=bee+lert+app',
  'https://www.google.com/search?q=bee+alert+monitoring',
  'https://www.google.co.in/search?q=bee+lert',
  'https://www.bing.com/search?q=bee-lert+app',
  'https://duckduckgo.com/?q=bee+alert+replit',
  'https://www.reddit.com/r/beekeeping/',
  'https://github.com/',
  'https://replit.com/@kjlethin24',
  'https://twitter.com/',
  'https://www.facebook.com/',
  'https://t.co/abc123',
  'https://l.facebook.com/',
  'https://www.youtube.com/',
  'https://search.yahoo.com/search?p=bee+lert',
  null, null, null, // direct visits (weighted higher)
];

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9',
  'en-US,en;q=0.9,es;q=0.8',
  'en-US,en;q=0.9,fr;q=0.8',
  'en,en-US;q=0.9,de;q=0.7',
  'en-US,en;q=0.8',
  'en-IN,en;q=0.9,hi;q=0.8',
  'en-AU,en;q=0.9',
  'en-CA,en;q=0.9',
  'en-US,en;q=0.9,ja;q=0.5',
];

// Subpages a real visitor might explore
const SUBPAGES = [
  '/', '/', '/',  // weight root
  '/about',
  '/status',
  '/health',
  '/api',
  '/dashboard',
  '/login',
  '/?ref=google',
  '/?utm_source=reddit&utm_medium=social',
  '/#features',
];

// ═══════════════════════════════════════════
//  COOKIE JAR — persists cookies within a session
// ═══════════════════════════════════════════

class CookieJar {
  constructor() { this.cookies = {}; }

  parseSetCookies(headers) {
    const sc = headers['set-cookie'];
    if (!sc) return;
    const arr = Array.isArray(sc) ? sc : [sc];
    for (const raw of arr) {
      const parts = raw.split(';')[0].split('=');
      if (parts.length >= 2) {
        this.cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    }
  }

  toString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has() { return Object.keys(this.cookies).length > 0; }
}

// ═══════════════════════════════════════════
//  CHAOTIC TIMING ENGINE
// ═══════════════════════════════════════════

// UTC hour → activity weight (1.0 = peak, 0.1 = dead quiet)
const HOUR_WEIGHTS = [
  0.3, 0.2, 0.15, 0.1, 0.1, 0.15,  // 00-05
  0.3, 0.5, 0.7,  0.9, 1.0, 1.0,   // 06-11
  1.0, 0.9, 0.8,  0.7, 0.8, 0.9,   // 12-17
  1.0, 0.9, 0.7,  0.5, 0.4, 0.3,   // 18-23
];

function hourWeight() {
  return HOUR_WEIGHTS[new Date().getUTCHours()];
}

/** Poisson-distributed delay (exponential inter-arrival) */
function poissonDelay(meanMin) {
  return -meanMin * Math.log(1 - Math.random());
}

/**
 * Next visit delay in ms:
 *   base mean 2-7 min (weighted by hour)
 *   Poisson sampled
 *   clamped 1-15 min
 *   ±45s micro-jitter
 */
function getNextDelay() {
  const hw = hourWeight();
  const baseMean = 2 + (5 * (1 - hw));          // 2-7 min
  let delayMin = poissonDelay(baseMean);
  delayMin = Math.max(1, Math.min(15, delayMin));  // clamp
  const jitterMs = (Math.random() - 0.5) * 90000;  // ±45s
  const totalMs = Math.max(45000, delayMin * 60000 + jitterMs);
  return { delayMin: delayMin.toFixed(1), totalMs, hw, baseMean: baseMean.toFixed(1) };
}

// ═══════════════════════════════════════════
//  HTTP HELPERS
// ═══════════════════════════════════════════

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeRequest(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const client = u.protocol === 'https:' ? https : http;
    const ro = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 20000,
    };
    const req = client.request(ro, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d, url }));
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: '', url, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '', url, error: 'timeout' }); });
    req.end();
  });
}

// ═══════════════════════════════════════════
//  HEADER BUILDER
// ═══════════════════════════════════════════

function buildHeaders(persona, referer, jar, type = 'document') {
  const h = {
    'User-Agent': persona.ua,
    'Accept-Language': pick(ACCEPT_LANGUAGES),
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  };

  const ACCEPT_MAP = {
    document: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    script:   '*/*',
    style:    'text/css,*/*;q=0.1',
    image:    'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    favicon:  'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    xhr:      'application/json, text/plain, */*',
  };
  h['Accept'] = ACCEPT_MAP[type] || '*/*';

  if (type === 'document') {
    h['Upgrade-Insecure-Requests'] = '1';
    h['Sec-Fetch-Dest'] = 'document';
    h['Sec-Fetch-Mode'] = 'navigate';
    h['Sec-Fetch-Site'] = referer ? 'cross-site' : 'none';
    h['Sec-Fetch-User'] = '?1';
  } else if (type === 'xhr') {
    h['Sec-Fetch-Dest'] = 'empty';
    h['Sec-Fetch-Mode'] = 'cors';
    h['Sec-Fetch-Site'] = 'same-origin';
    h['X-Requested-With'] = 'XMLHttpRequest';
  } else {
    h['Sec-Fetch-Dest'] = type === 'script' ? 'script' : type === 'style' ? 'style' : 'image';
    h['Sec-Fetch-Mode'] = 'no-cors';
    h['Sec-Fetch-Site'] = 'same-origin';
  }

  if (referer) h['Referer'] = referer;
  if (jar.has()) h['Cookie'] = jar.toString();

  // Chrome client hints
  if (persona.uaList) {
    h['Sec-CH-UA'] = persona.uaList;
    h['Sec-CH-UA-Mobile'] = persona.mobile ? '?1' : '?0';
    h['Sec-CH-UA-Platform'] = persona.platform;
  }

  // Random optional headers
  if (Math.random() > 0.6) h['DNT'] = '1';
  if (Math.random() > 0.85) h['Cache-Control'] = pick(['no-cache', 'max-age=0']);

  return h;
}

// ═══════════════════════════════════════════
//  ASSET DISCOVERY
// ═══════════════════════════════════════════

function resolveUrl(path, base) {
  try {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('//')) return 'https:' + path;
    return new URL(path, base).href;
  } catch { return base + path; }
}

function discoverAssets(html, base) {
  const assets = [];
  let m;

  const cssRe = /href=["']([^"']*\.css[^"']*)/gi;
  while ((m = cssRe.exec(html))) assets.push({ url: resolveUrl(m[1], base), type: 'style' });

  const jsRe = /src=["']([^"']*\.js[^"']*)/gi;
  while ((m = jsRe.exec(html))) assets.push({ url: resolveUrl(m[1], base), type: 'script' });

  const imgRe = /src=["']([^"']*\.(png|jpg|jpeg|gif|svg|webp|ico|avif)[^"']*)/gi;
  while ((m = imgRe.exec(html))) assets.push({ url: resolveUrl(m[1], base), type: 'image' });

  // Find links for possible navigation
  const linkRe = /href=["']([^"']*)/gi;
  while ((m = linkRe.exec(html))) {
    const href = m[1];
    if (href.startsWith('/') && !href.endsWith('.css') && !href.endsWith('.js') && !href.startsWith('//')) {
      assets.push({ url: resolveUrl(href, base), type: 'page' });
    }
  }

  // Always try favicon
  assets.push({ url: resolveUrl('/favicon.ico', base), type: 'favicon' });

  return assets;
}

// ═══════════════════════════════════════════
//  SESSION SIMULATOR
// ═══════════════════════════════════════════

let sessionCount = 0;
let totalRequests = 0;
let isRunning = false;

/**
 * Full browser session simulation:
 *  1) GET landing page
 *  2) Parse & fetch assets (CSS, JS, images, favicon)
 *  3) "Read" the page (random delay)
 *  4) Maybe navigate to a subpage (+ its assets)
 *  5) Maybe fire an XHR
 */
async function simulateSession() {
  sessionCount++;
  const sid = sessionCount;
  const persona = pick(PERSONAS);
  const jar = new CookieJar();
  const referer = pick(REFERERS);
  const ts = new Date().toISOString();

  console.log(`\n[${ts}] 🌐 Session #${sid} — ${persona.name}`);

  // --- Step 1: Land on a page ---
  const landing = pick(SUBPAGES);
  const pageUrl = TARGET_URL + landing;
  const pageRes = await makeRequest(pageUrl, { headers: buildHeaders(persona, referer, jar, 'document') });
  totalRequests++;
  jar.parseSetCookies(pageRes.headers);
  console.log(`   📄 GET ${landing} → ${pageRes.status}`);

  if (pageRes.status === 0) {
    console.log(`   ⚠️  Unreachable: ${pageRes.error}`);
    return;
  }

  // --- Step 2: Browser parsing delay ---
  await sleep(150 + Math.random() * 600);

  // --- Step 3: Fetch discovered assets ---
  const assets = discoverAssets(pageRes.body, TARGET_URL);
  const internalPages = assets.filter(a => a.type === 'page').map(a => a.url);
  const fetchable = assets
    .filter(a => a.type !== 'page')
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(assets.length, 2 + Math.floor(Math.random() * 5)));

  for (const asset of fetchable) {
    await sleep(30 + Math.random() * 200);  // stagger
    const aRes = await makeRequest(asset.url, { headers: buildHeaders(persona, pageUrl, jar, asset.type) });
    totalRequests++;
    jar.parseSetCookies(aRes.headers);
    const short = asset.url.replace(TARGET_URL, '').substring(0, 55);
    console.log(`   📦 ${asset.type.padEnd(7)} ${short} → ${aRes.status}`);
  }

  // --- Step 4: "Reading" delay ---
  await sleep(1500 + Math.random() * 10000); // 1.5-11.5s

  // --- Step 5: Maybe navigate internally (45%) ---
  if (Math.random() < 0.45) {
    let nextPath;
    if (internalPages.length > 0 && Math.random() < 0.6) {
      nextPath = new URL(pick(internalPages)).pathname;
    } else {
      nextPath = pick(SUBPAGES);
    }

    if (nextPath !== landing) {
      const navRes = await makeRequest(TARGET_URL + nextPath, {
        headers: buildHeaders(persona, pageUrl, jar, 'document'),
      });
      totalRequests++;
      jar.parseSetCookies(navRes.headers);
      console.log(`   🔗 Navigate → ${nextPath} → ${navRes.status}`);

      // Fetch some assets on second page too
      if (navRes.body) {
        const navAssets = discoverAssets(navRes.body, TARGET_URL)
          .filter(a => a.type !== 'page')
          .sort(() => Math.random() - 0.5)
          .slice(0, 1 + Math.floor(Math.random() * 3));

        for (const asset of navAssets) {
          await sleep(30 + Math.random() * 150);
          const ar = await makeRequest(asset.url, { headers: buildHeaders(persona, TARGET_URL + nextPath, jar, asset.type) });
          totalRequests++;
          jar.parseSetCookies(ar.headers);
        }
      }

      await sleep(1000 + Math.random() * 5000);

      // Maybe go back to original page (30%) — like pressing browser Back
      if (Math.random() < 0.3) {
        const backRes = await makeRequest(pageUrl, {
          headers: buildHeaders(persona, TARGET_URL + nextPath, jar, 'document'),
        });
        totalRequests++;
        jar.parseSetCookies(backRes.headers);
        console.log(`   ↩️  Back → ${landing} → ${backRes.status}`);
        await sleep(500 + Math.random() * 2000);
      }
    }
  }

  // --- Step 6: Maybe XHR (25%) ---
  if (Math.random() < 0.25) {
    const xhrPaths = ['/api', '/health', '/status', '/'];
    const xhrRes = await makeRequest(TARGET_URL + pick(xhrPaths), {
      headers: buildHeaders(persona, pageUrl, jar, 'xhr'),
    });
    totalRequests++;
    jar.parseSetCookies(xhrRes.headers);
    console.log(`   📡 XHR → ${xhrRes.status}`);
  }

  // --- Step 7: Maybe a POST request (10%) - like submitting a form ---
  if (Math.random() < 0.1) {
    const postHeaders = buildHeaders(persona, pageUrl, jar, 'document');
    postHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    postHeaders['Content-Length'] = '0';
    const postRes = await makeRequest(TARGET_URL + '/', { method: 'POST', headers: postHeaders });
    totalRequests++;
    console.log(`   📝 POST / → ${postRes.status}`);
  }

  console.log(`   ✅ Session #${sid} done (${totalRequests} total reqs)`);
}

// ═══════════════════════════════════════════
//  VISIT DECISION & BURST PATTERNS
// ═══════════════════════════════════════════

/** Skip some cycles — real users aren't 100% reliable */
function shouldVisit() {
  const w = hourWeight();
  const chance = 0.4 + (w * 0.5); // 40-90%
  return Math.random() < chance;
}

/** 15% chance of 2-3 rapid repeat visits (user refreshing) */
async function maybeBurst() {
  if (Math.random() < 0.15) {
    const n = 2 + Math.floor(Math.random() * 2);
    console.log(`   ⚡ Burst: ${n} rapid visits`);
    for (let i = 1; i < n; i++) {
      await sleep(3000 + Math.random() * 12000);
      await simulateSession();
    }
  }
}

/** Occasionally do a "long idle" — 20-45 min gap (like user went AFK) */
function maybeExtendedIdle() {
  if (Math.random() < 0.08) { // 8% chance
    const idleMin = 20 + Math.random() * 25;
    console.log(`   😴 Extended idle: ${idleMin.toFixed(0)}min (simulating AFK)`);
    return idleMin * 60000;
  }
  return 0;
}

// ═══════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════

async function startPinger() {
  if (isRunning) {
    console.log('⚠️  Pinger already running');
    return;
  }
  isRunning = true;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏓 Replit Stealth Keep-Alive — STARTED`);
  console.log(`   Target: ${TARGET_URL}`);
  console.log(`   Mode: Full browser session simulation`);
  console.log(`   Timing: Poisson + hour-weight + jitter + idle/burst`);
  console.log(`   Personas: ${PERSONAS.length} profiles`);
  console.log(`   Behavior: Assets, cookies, navigation, XHR, POST, back-nav`);
  console.log(`${'═'.repeat(60)}\n`);

  // Random startup delay (5-45s) — don't ping immediately on boot
  const startDelay = 5000 + Math.random() * 40000;
  console.log(`   ⏳ First visit in ${(startDelay / 1000).toFixed(0)}s...`);
  await sleep(startDelay);

  await simulateSession();
  await maybeBurst();
  scheduleNext();
}

function scheduleNext() {
  if (!isRunning) return;

  // Check for extended idle
  const idleMs = maybeExtendedIdle();
  if (idleMs > 0) {
    setTimeout(() => {
      if (!isRunning) return;
      // After long idle, always visit (user "came back")
      simulateSession().then(() => maybeBurst()).then(() => scheduleNext());
    }, idleMs);
    return;
  }

  const { delayMin, totalMs, hw, baseMean } = getNextDelay();

  console.log(`   ⏳ Next in ~${delayMin}min (mean=${baseMean}m, hw=${hw.toFixed(1)}, ${(totalMs/1000).toFixed(0)}s)`);

  setTimeout(async () => {
    if (!isRunning) return;

    if (!shouldVisit()) {
      console.log(`\n[${new Date().toISOString()}] 💤 Skipped (simulating absence)`);
      scheduleNext();
      return;
    }

    await simulateSession();
    await maybeBurst();
    scheduleNext();
  }, totalMs);
}

function stopPinger() {
  isRunning = false;
  console.log('🛑 Pinger stopped');
}

function getPingerStats() {
  return { sessions: sessionCount, totalRequests, isRunning };
}

module.exports = { startPinger, stopPinger, getPingerStats };
