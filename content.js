'use strict';

const TEXT_MAX = 120000;

const STOPWORDS = new Set(
  'the a an and or but if then else for of to in on at by with from as is are was were be been being this that these those it its it\'s not no so such do does did have has had will would can could may might must should shall about into over under again further once here there when where why how all any both each few more most other some only own same too very just also between through during before after above below up down out off your you they we he she i my our their his her them us me am have\'t don\'t can\'t won\'t you\'re we\'re they\'re would\'ve could\'ve shall\'ve might\'ve must\'ve'.split(' ')
);

function cleanTokens(text) {
  const words = text.toLowerCase().match(/[a-zà-ÿ]{4,}/g) || [];
  return words.filter((w) => !STOPWORDS.has(w));
}

function splitSentences(text) {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [];
  return parts.map((s) => s.trim()).filter((s) => s.length >= 20);
}

function analyze(text) {
  const sentences = splitSentences(text);
  const allTokens = cleanTokens(text);
  const freq = new Map();
  for (const w of allTokens) freq.set(w, (freq.get(w) || 0) + 1);
  const topTerms = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 8)
    .map(([w]) => w);
  const termSet = new Set(topTerms);
  const scored = sentences.map((s, i) => {
    const toks = cleanTokens(s);
    let score = 0;
    for (const t of new Set(toks)) if (termSet.has(t)) score += freq.get(t);
    return { s, i, score };
  });
  const summary = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.s);
  const keywords = topTerms.map((w) => [w, freq.get(w)]);
  const entities = {
    emails: (text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []),
    urls: (text.match(/https?:\/\/[^\s"'<>]+/gi) || []),
    prices: (text.match(/\b(?:(?:EUR|USD|€|\$)\s?\d[\d.,]*|\d[\d.,]*\s?(?:EUR|USD|€|\$))\b/gi) || []),
    dates: (text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []),
  };
  return { summary, keywords, entities };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ai:ping') {
    sendResponse({ type: 'ai:pong' });
    return true;
  }
  if (msg.type !== 'ai:ask') return;
  const text = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, TEXT_MAX);
  sendResponse({ type: 'ai:result', data: analyze(text) });
  return true;
});