import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

let puppeteer;
try {
  puppeteer = createRequire(import.meta.url)('puppeteer');
} catch (e) {
  console.error('puppeteer not installed — run `npm install` first');
  process.exit(2);
}
let CHROME;
try {
  CHROME = process.env.PROBE_CHROME || (await puppeteer.executablePath());
} catch (e) {
  CHROME = process.env.PROBE_CHROME;
}

const DEPLOY_URL = (process.env.ASSISTAI_DEPLOY_URL || '').replace(/\/+$/, '');
const EXT = path.resolve(import.meta.dirname, '..');
const EXT_FWD = EXT.replaceAll('\\', '/');
const FIXTURE = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'site.html'), 'utf8');

const EXPECTED_LABELS = {
  tagline: {
    en: 'reads the page and answers locally',
    es: 'lee la página y responde en local',
    fr: 'lit la page et répond en local',
    pt: 'lê a página e responde localmente',
    it: 'legge la pagina e risponde in locale',
    de: 'liest die Seite und antwortet lokal',
  },
  credit: {
    en: 'Built by Harley Vásquez',
    es: 'Creado por Harley Vásquez',
    fr: 'Créé par Harley Vásquez',
    pt: 'Criado por Harley Vásquez',
    it: 'Creato da Harley Vásquez',
    de: 'Erstellt von Harley Vásquez',
  },
};

let passes = 0;
let failures = 0;
const problems = [];
const check = (name, ok, detail = '') => {
  if (ok) {
    passes++;
    console.log('  PASS ' + name);
  } else {
    failures++;
    problems.push(name + (detail ? ' — ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, timeout = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      /* retry */
    }
    await sleep(120);
  }
  return null;
};
const getAll = async (popup) => (await popup.evaluate(() => chrome.storage.local.get(null)));
const lastAiText = (popup) =>
  popup.evaluate(() => {
    const turns = Array.from(document.querySelectorAll('.turn.a'));
    return turns.length ? turns[turns.length - 1].textContent : '';
  });
const turnCount = (popup) => popup.evaluate(() => document.querySelectorAll('.turn').length);
const submitText = (popup, text) =>
  popup.evaluate((t) => {
    document.getElementById('askInput').value = t;
    document.getElementById('askRow').dispatchEvent(new Event('submit'));
  }, text);

console.log('assistai probe (extension: ' + EXT + ')');

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (p === '/site.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const SITE_PAGE = `http://127.0.0.1:${PORT}/site.html`;
const LANDING = path.join(EXT, 'landing', 'index.html');
console.log('fixture server: ' + SITE_PAGE);
let ZIP_BYTES = null;

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: [`--disable-extensions-except=${EXT_FWD}`, `--load-extension=${EXT_FWD}`],
  protocolTimeout: 60000,
});

let base = null;
let popup = null;
const popupErrors = [];
try {
  // ---------- BASELINE (no extension page yet) ----------
  base = await browser.newPage();
  const baseErrors = [];
  base.on('pageerror', (e) => baseErrors.push(e.message));
  await base.goto(SITE_PAGE + '?noext=1', { waitUntil: 'domcontentloaded' });
  await base.bringToFront();
  await sleep(600);
  check('baseline: fixture loads', (await base.evaluate(() => document.querySelector('h1')?.textContent || '')) === 'Immigrant Menu Lab — spaghetti and meatballs for Sunday', '');
  check('baseline: no JS errors on fixture page', baseErrors.length === 0, baseErrors.join(' | '));
  await base.close();
  base = null;

  // ---------- EXTENSION REGISTERED ----------
  const reg = await browser.newPage();
  await reg.goto('chrome://extensions-internals', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const data = JSON.parse(await reg.evaluate(() => document.body.innerText));
  const entry = data.find((e) => e.name === 'assistai');
  check('extension registered and ENABLED', !!entry && entry.registry_status === 'ENABLED' && entry.location === 'COMMAND_LINE', entry ? entry.registry_status : 'not found');
  const manifestVersion = entry ? entry.manifest_version : 0;
  check('manifest_version 3 confirmed by Chrome', manifestVersion === 3, JSON.stringify(manifestVersion));
  if (!entry) throw new Error('assistai extension not found');
  const popupUrl = `chrome-extension://${entry.id}/popup.html`;
  await reg.close();

  // fixture page BEFORE popup so it can be made the active tab for NLU
  const page = await browser.newPage();
  await page.goto(SITE_PAGE + '?nlu=1', { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await sleep(600);

  // ---------- POPUP ----------
  popup = await browser.newPage();
  popup.on('pageerror', (e) => popupErrors.push(e.message));
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.getElementById('sendBtn') !== null, { timeout: 8000, polling: 100 });
  await sleep(400);

  const defaults = await getAll(popup);
  check('defaults: ai:convo = []', Array.isArray(defaults['ai:convo']) && defaults['ai:convo'].length === 0, JSON.stringify(defaults['ai:convo']));
  check('popup renders without JS exceptions', popupErrors.length === 0, popupErrors.join(' | '));
  check('popup shows empty state', (await popup.evaluate(() => !!document.querySelector('#convo .empty'))) === true, '');
  check(
    'popup surface: input, send, 3 quick chips, clear, lang, credit',
    (await popup.evaluate(
      () =>
        !!document.getElementById('askInput') &&
        !!document.getElementById('sendBtn') &&
        ['qBrief', 'qKeywords', 'qEntities'].every((id) => !!document.getElementById(id)) &&
        !!document.getElementById('clearBtn') &&
        !!document.getElementById('langSel') &&
        !!document.querySelector('[data-i18n="credit"]')
    )) === true,
    ''
  );

  // ---------- PERMISSION SURFACE ----------
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const hasAllUrls = (m) => /<all_urls>/.test(JSON.stringify(m));
  check(
    'permission surface: storage only, no <all_urls>',
    Array.isArray(manifest.permissions) && manifest.permissions.length === 1 && manifest.permissions[0] === 'storage' && !hasAllUrls(manifest),
    JSON.stringify(manifest.permissions)
  );
  check(
    'content_scripts: http/https only, no <all_urls>',
    Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 1 && JSON.stringify(manifest.content_scripts[0].matches) === JSON.stringify(['http://*/*', 'https://*/*']) && !hasAllUrls(manifest),
    JSON.stringify(manifest.content_scripts)
  );

  // ---------- NLU PIPELINE (content script target pinned explicitly) ----------
  await page.bringToFront();
  const targetPin = await popup.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0] || typeof tabs[0].id !== 'number') return 'no-tab';
    window.__aiTargetTab = tabs[0].id;
    return 'pinned:' + tabs[0].id;
  });
  check('probe pinned the fixture tab as NLU target', targetPin.startsWith('pinned:'), targetPin);
  const ping = await popup.evaluate(async () => {
    const id = window.__aiTargetTab;
    if (typeof id !== 'number') return 'no-target';
    try {
      const r = await chrome.tabs.sendMessage(id, { type: 'ai:ping' });
      return r && r.type === 'ai:pong' ? 'pong' : 'wrong:' + JSON.stringify(r);
    } catch (e) {
      return 'err:' + e.message;
    }
  });
  check('content script answers ai:ping on the fixture tab', ping === 'pong', ping);

  await popup.evaluate(() => document.getElementById('qBrief').click());
  const briefText = await waitFor(async () => {
    const t = await lastAiText(popup);
    return t.includes('meatballs') ? t : null;
  }, 8000);
  check('quick Brief: reply rendered', !!briefText, briefText ? '' : 'none');
  if (briefText) {
    check('quick Brief: summary cites the densest sentences (farro + meatballs)', briefText.includes('farro') && briefText.includes('meatballs') && briefText.includes('spaghetti'), briefText.slice(0, 120));
    check('quick Brief: starts with local summary header', briefText.startsWith('Summary'), briefText.slice(0, 40));
  }

  await submitText(popup, 'frobnicate the gizmo');
  const unkText = await waitFor(async () => {
    const t = await lastAiText(popup);
    return t.includes('Unknown command') ? t : null;
  }, 8000);
  check('unknown command: honest localized refusal', !!unkText, unkText || 'none');
  check('unknown command: echoes the command', !!unkText && unkText.includes('frobnicate the gizmo'), unkText ? unkText.slice(0, 100) : '');
  check('unknown command: suggests the known commands', !!unkText && unkText.includes('brief') && unkText.includes('keywords'), '');

  await popup.evaluate(() => document.getElementById('qKeywords').click());
  const kwText = await waitFor(async () => {
    const t = await lastAiText(popup);
    return t.includes('meatballs ×5') ? t : null;
  }, 8000);
  check('quick Keywords: top keyword with count', !!kwText, kwText || 'none');
  check('quick Keywords: farro carried too', !!kwText && kwText.includes('farro ×3'), '');

  await popup.evaluate(() => document.getElementById('qEntities').click());
  const entText = await waitFor(async () => {
    const t = await lastAiText(popup);
    return t.includes('gino@example.com') ? t : null;
  }, 8000);
  check('quick Entities: email found', !!entText, entText || 'none');
  check('quick Entities: URL found', !!entText && entText.includes('https://example.com/receipt'), '');
  check('quick Entities: price found (both orders)', !!entText && entText.includes('42 EUR') && entText.includes('12.50 USD'), '');
  check('quick Entities: ISO date found', !!entText && entText.includes('2026-06-01'), '');

  const n1 = await turnCount(popup);
  check('conversation accumulated 8 turns (4 exchanges)', n1 === 8, String(n1));
  const stored1 = await popup.evaluate(async () => (await chrome.storage.local.get('ai:convo'))['ai:convo']);
  check('storage: ai:convo has 8 persisted turns', Array.isArray(stored1) && stored1.length === 8, '');
  check(
    'conversation turns alternate user/assistant',
    stored1.every((t, i) => (i % 2 === 0 ? t.role === 'u' : t.role === 'a')),
    JSON.stringify(stored1.map((t) => t.role))
  );

  // ---------- RELOAD: conversation persists ----------
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.getElementById('sendBtn') !== null, { timeout: 8000, polling: 100 });
  await sleep(400);
  const n2 = await turnCount(popup);
  check('reload: conversation history re-rendered (8 turns)', n2 === 8, String(n2));
  const stillThere = await lastAiText(popup);
  check('reload: the last reply is still there', stillThere.includes('gino@example.com'), stillThere.slice(0, 60));

  // ---------- LOCALIZED NLU (French) ----------
  await popup.select('#langSel', 'fr');
  await waitFor(() => popup.evaluate(() => document.querySelector('[data-i18n="tagline"]')?.textContent === EXPECTED_LABELS.tagline.fr), 6000);
  await page.bringToFront();
  await popup.evaluate(() => document.getElementById('qBrief').click());
  const frBrief = await waitFor(async () => {
    const t = await lastAiText(popup);
    return t.includes('farro') && t.includes('Résumé') ? t : null;
  }, 8000);
  check('French quick Brief: header + summary in French', !!frBrief, frBrief || 'none');
  await submitText(popup, 'xyz');
  const frUnk = await waitFor(async () => {
    const t = await lastAiText(popup);
    return t.includes('Commande inconnue') ? t : null;
  }, 8000);
  check('French unknown command: refusal localized', !!frUnk, frUnk || 'none');

  // back to English, then clear
  await popup.select('#langSel', 'en');
  await waitFor(() => popup.evaluate(() => document.querySelector('[data-i18n="tagline"]')?.textContent === EXPECTED_LABELS.tagline.en), 6000);
  await popup.evaluate(() => document.getElementById('clearBtn').click());
  const cleared = await waitFor(async () => {
    const s = await popup.evaluate(async () => (await chrome.storage.local.get('ai:convo'))['ai:convo']);
    return Array.isArray(s) && s.length === 0 ? true : null;
  }, 8000);
  check('clear: conversation emptied', cleared === true, '');
  check('clear: empty state back in popup', (await popup.evaluate(() => !!document.querySelector('#convo .empty'))) === true, '');

  // ---------- FROZEN ----------
  const frozenAll = await getAll(popup);
  const keys = Object.keys(frozenAll).filter((k) => k.startsWith('ai:'));
  check('frozen: only ai:convo + ai:lang in storage', keys.length === 2 && ['ai:convo', 'ai:lang'].every((k) => keys.includes(k)), keys.join(','));

  // ---------- i18n popup ----------
  const langCheck = async (code, expected) => {
    await popup.select('#langSel', code);
    const ok = await waitFor(() => popup.evaluate((exp) => document.querySelector('[data-i18n="tagline"]')?.textContent === exp, expected), 6000);
    check(`language switch to ${code} re-renders popup`, ok === true, expected);
    if (ok) {
      const credit = await popup.evaluate(() => document.querySelector('[data-i18n="credit"]')?.textContent);
      check(`language ${code}: credit localized`, credit === EXPECTED_LABELS.credit[code], credit);
      await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
      await popup.waitForFunction(() => document.querySelector('[data-i18n="tagline"]')?.textContent !== '', { timeout: 8000, polling: 100 });
      const persisted = await popup.evaluate((exp) => document.querySelector('[data-i18n="tagline"]')?.textContent === exp, expected);
      check(`language ${code}: persisted across reload`, persisted === true, 'reverted');
    }
  };
  await popup.select('#langSel', 'en');
  for (const code of ['es', 'fr', 'pt', 'it', 'de']) {
    await langCheck(code, EXPECTED_LABELS.tagline[code]);
  }
  await popup.evaluate(() => chrome.storage.local.remove('ai:lang'));
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.querySelector('[data-i18n="tagline"]')?.textContent !== '', { timeout: 8000, polling: 100 });
  const navLang = await popup.evaluate(() => (navigator.language || 'en').toLowerCase().split('-')[0]);
  const defaulted = await popup.evaluate(() => document.querySelector('[data-i18n="tagline"]')?.textContent);
  check('default language = navigator language (or en)', ['en', 'es', 'fr', 'pt', 'it', 'de'].includes(navLang) && EXPECTED_LABELS.tagline[navLang] === defaulted, `nav=${navLang} got=${defaulted}`);
  await popup.evaluate(() => chrome.storage.local.set({ 'ai:lang': 'en' }));
  const popupCreditUrl = await popup.evaluate(() => {
    const a = document.querySelector('[data-i18n="credit"]');
    return a && a.tagName === 'A' ? a.href : '';
  });
  check('credit links to LinkedIn (popup)', popupCreditUrl === 'https://www.linkedin.com/in/harleyvasquez/', popupCreditUrl);

  // ---------- STATIC: content script performs no logging ----------
  const contentSrc = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
  check('content.js stays silent (no console.log)', !/console\./.test(contentSrc), '');

  // ---------- Landing ----------
  const landing = await browser.newPage();
  const landingErrors = [];
  landing.on('pageerror', (e) => landingErrors.push(e.message));
  await landing.goto('file://' + LANDING.replaceAll('\\', '/'), { waitUntil: 'domcontentloaded' });
  await sleep(700);
  const heroOk = await landing.evaluate(() => {
    const t = document.querySelector('[data-i18n="heroTitle"]')?.textContent || '';
    return t.length > 0 && document.title !== '';
  });
  check('landing renders with localized hero', heroOk === true, '');
  await landing.select('#langSel', 'es');
  const heroEs = await waitFor(() => landing.evaluate(() => document.querySelector('[data-i18n="tagline"]')?.textContent), 5000);
  check('landing switch to es works', heroEs?.length > 5, heroEs);
  const titleEs = await waitFor(() => landing.evaluate((exp) => (document.title.toLowerCase().includes(exp) ? document.title : null), 'responde'), 5000);
  check('landing document.title translated on switch', titleEs !== null, titleEs);
  check('no JS errors on landing', landingErrors.length === 0, landingErrors.join(' | '));
  const landingCreditUrl = await landing.evaluate(() => {
    const a = document.querySelector('[data-i18n="credit"]');
    return a && a.tagName === 'A' ? a.href : '';
  });
  check('credit links to LinkedIn (landing)', landingCreditUrl === 'https://www.linkedin.com/in/harleyvasquez/', landingCreditUrl);
  await landing.close();

  // ---------- Packaging ----------
  const zipPath = path.join(EXT, 'dist', 'assistai.zip');
  const landingZip = path.join(EXT, 'landing', 'assistai.zip');
  check('dist/assistai.zip exists', fs.existsSync(zipPath), zipPath);
  check('landing/assistai.zip exists (CTA target)', fs.existsSync(landingZip), landingZip);
  if (fs.existsSync(zipPath) && fs.existsSync(landingZip)) {
    const s = fs.statSync(zipPath);
    const l = fs.statSync(landingZip);
    check('landing zip byte-identical to dist zip', s.size === l.size && s.size > 0, `dist=${s.size} landing=${l.size}`);
    ZIP_BYTES = l.size;
  }
  const iconOk = ['icon16.png', 'icon48.png', 'icon128.png'].every((f) => {
    const p = path.join(EXT, 'icons', f);
    return fs.existsSync(p) && fs.readFileSync(p)[0] === 0x89 && fs.readFileSync(p)[1] === 0x50;
  });
  check('icons 16/48/128 present and valid PNG', iconOk, '');

  // ---------- Deploy (gated) ----------
  if (DEPLOY_URL) {
    try {
      const res = await fetch(DEPLOY_URL + '/', { headers: { 'User-Agent': 'assistai-probe' } });
      const body = await res.text();
      check('deployed landing responds (Vercel)', res.status === 200 && body.includes('assistai'), res.status + ' len=' + body.length);
      const zipRes = await fetch(DEPLOY_URL + '/assistai.zip', { headers: { 'User-Agent': 'assistai-probe' } });
      const zipBody = await zipRes.arrayBuffer();
      check('deployed landing serves the extension zip', zipRes.status === 200 && typeof ZIP_BYTES === 'number' && zipBody.byteLength === ZIP_BYTES, zipRes.status + ' bytes=' + zipBody.byteLength + ' expected=' + ZIP_BYTES);
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      check('deployed landing responds (Vercel)', false, msg);
      check('deployed landing serves the extension zip', false, msg);
    }
  } else {
    console.log('  [info] ASSISTAI_DEPLOY_URL not set; skipping deployed-landing checks.');
  }
} finally {
  if (browser) await browser.close();
  if (base) await base.close();
  server.close();
}

console.log('');
console.log(`RESULT: ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log('PROBLEMS:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
process.exit(0);