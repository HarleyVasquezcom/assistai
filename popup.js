'use strict';

const LS_CONVO = 'ai:convo';
const BRIEF = ['resumen', 'resume', 'summarize', 'summary', 'brief', 'riassunto', 'résumé', 'resumo', 'zusammenfassung'];
const KEYWORDS = ['palabras clave', 'palabra clave', 'keywords', 'keyword', 'mots-clés', 'mots clés', 'palavras-chave', 'parole chiave', 'stichwörter'];
const ENTITIES = ['entidades', 'entities', 'entités', 'entità', 'entitäten'];
const CLEAR = ['clear', 'limpiar', 'borrar', 'borra', 'effacer', 'limpar', 'apagar', 'cancella', 'löschen'];

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (k, ...args) => {
  let s = window.__aiT ? window.__aiT(k) : (window.__aiDict() ? window.__aiDict().en[k] || '' : '');
  for (const a of args) s = s.replace('%s', a);
  return s;
};

let convo = [];

async function readConvo() {
  const s = await chrome.storage.local.get(LS_CONVO);
  convo = Array.isArray(s[LS_CONVO]) ? s[LS_CONVO] : [];
  return convo;
}

async function persist() {
  await chrome.storage.local.set({ [LS_CONVO]: convo });
}

function render() {
  const host = $('convo');
  host.innerHTML = convo.length
    ? convo
        .map((t) => `<div class="turn ${t.role === 'u' ? 'u' : 'a'}">${esc(t.text)}</div>`)
        .join('')
    : `<div class="empty">${esc(L('empty'))}</div>`;
  host.scrollTop = host.scrollHeight;
}

function setStatus(text) {
  $('status').textContent = text;
}

async function activeTabId() {
  if (typeof window.__aiTargetTab === 'number') return window.__aiTargetTab;
  return new Promise((res) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (t) => res(t && t[0] ? t[0].id : null));
  });
}

function sendToTab(tabId, msg) {
  return new Promise((res, rej) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
      else res(r);
    });
  });
}

const entLines = (ent, key, label) => {
  const arr = ent && Array.isArray(ent[key]) ? ent[key] : [];
  return arr.length ? arr.map((v) => `${label}: ${v}`).join('\n') + '\n' : '';
};

async function askPage(cmd) {
  const id = await activeTabId();
  if (id == null) {
    setStatus(L('noPage'));
    return;
  }
  let reply;
  try {
    reply = await sendToTab(id, { type: 'ai:ask', cmd });
  } catch (e) {
    setStatus(L('noPage'));
    return;
  }
  if (!reply || reply.type !== 'ai:result') {
    setStatus(L('noPage'));
    return;
  }
  const d = reply.data;
  let text = '';
  if (cmd === 'brief') {
    text = L('briefHeader') + '\n' + (d.summary && d.summary.length ? d.summary.map((s) => '• ' + s).join('\n') : '· none');
  } else if (cmd === 'keywords') {
    text = L('keywordsHeader') + '\n' + (d.keywords && d.keywords.length ? d.keywords.map(([w, c]) => `${w} ×${c}`).join('\n') : '· none');
  } else if (cmd === 'entities') {
    const e = d.entities || {};
    text = L('entitiesHeader') + '\n' + entLines(e, 'emails', 'Email') + entLines(e, 'urls', 'URL') + entLines(e, 'prices', 'Price') + entLines(e, 'dates', 'Date');
    text = text.replace(/\n$/, '');
  }
  await pushTurn('a', text);
  setStatus(L('statusOk'));
}

async function pushTurn(role, text) {
  convo.push({ role, text, at: Date.now() });
  render();
  await persist();
}

async function sendText(raw) {
  const q = raw.trim();
  if (!q) return;
  const low = q.toLowerCase();
  let cmd = null;
  if (CLEAR.includes(low)) {
    convo = [];
    render();
    await persist();
    setStatus(L('clearDone'));
    return;
  }
  if (BRIEF.includes(low)) cmd = 'brief';
  else if (KEYWORDS.includes(low)) cmd = 'keywords';
  else if (ENTITIES.includes(low)) cmd = 'entities';
  await pushTurn('u', q);
  if (cmd) await askPage(cmd);
  else await pushTurn('a', L('unknown', q));
}

function init() {
  window.__aiApply(() => {
    $('askRow').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('askInput');
      sendText(input.value);
      input.value = '';
    });
    $('qBrief').addEventListener('click', () => {
      sendText(L('qBrief'));
    });
    $('qKeywords').addEventListener('click', () => {
      sendText(L('qKeywords'));
    });
    $('qEntities').addEventListener('click', () => {
      sendText(L('qEntities'));
    });
    $('clearBtn').addEventListener('click', () => {
      convo = [];
      render();
      persist();
      setStatus(L('clearDone'));
    });
    $('langSel').addEventListener('change', (e) => {
      window.__aiSetLang(e.target.value, setStatus.bind(null, ''));
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[LS_CONVO]) {
        convo = Array.isArray(changes[LS_CONVO].newValue) ? changes[LS_CONVO].newValue : [];
        render();
      }
    });
    readConvo().then(() => {
      render();
      setStatus('');
    });
  });
}

document.addEventListener('DOMContentLoaded', init);