'use strict';

const DICT = {
  en: {
    appTitle: 'assistai',
    tagline: 'reads the page and answers locally',
    placeholder: 'Ask about this page — e.g. "resumen", "keywords", "entities", or say "clear"',
    sendBtn: 'Ask',
    qBrief: 'Brief',
    qKeywords: 'Keywords',
    qEntities: 'Entities',
    clearBtn: 'Clear',
    empty: 'No questions yet — open a page and ask.',
    noPage: 'Open a page first, then ask again.',
    briefHeader: 'Summary',
    keywordsHeader: 'Keywords',
    entitiesHeader: 'Entities',
    unknown: 'Unknown command "%s". Try: brief, keywords, entities, clear.',
    clearDone: 'Conversation cleared.',
    statusOk: 'Done — see the conversation.',
    credit: 'Built by Harley Vásquez',
  },
  es: {
    appTitle: 'assistai',
    tagline: 'lee la página y responde en local',
    placeholder: 'Pregunta sobre esta página — ej. "resumen", "palabras clave", "entidades" o "limpiar"',
    sendBtn: 'Enviar',
    qBrief: 'Resumen',
    qKeywords: 'Palabras clave',
    qEntities: 'Entidades',
    clearBtn: 'Limpiar',
    empty: 'Aún no hay preguntas — abre una página y pregunta.',
    noPage: 'Primero abre una página y vuelve a preguntar.',
    briefHeader: 'Resumen',
    keywordsHeader: 'Palabras clave',
    entitiesHeader: 'Entidades',
    unknown: 'Comando desconocido "%s". Prueba: resumen, palabras clave, entidades, limpiar.',
    clearDone: 'Conversación borrada.',
    statusOk: 'Listo — mira la conversación.',
    credit: 'Creado por Harley Vásquez',
  },
  fr: {
    appTitle: 'assistai',
    tagline: 'lit la page et répond en local',
    placeholder: 'Interrogez cette page — ex. « résumé », « mots-clés », « entités » ou « effacer »',
    sendBtn: 'Envoyer',
    qBrief: 'Résumé',
    qKeywords: 'Mots-clés',
    qEntities: 'Entités',
    clearBtn: 'Effacer',
    empty: 'Aucune question pour l’instant — ouvrez une page et demandez.',
    noPage: 'Ouvrez d’abord une page, puis redemandez.',
    briefHeader: 'Résumé',
    keywordsHeader: 'Mots-clés',
    entitiesHeader: 'Entités',
    unknown: 'Commande inconnue « %s ». Essayez : résumé, mots-clés, entités, effacer.',
    clearDone: 'Conversation effacée.',
    statusOk: 'Terminé — voyez la conversation.',
    credit: 'Créé par Harley Vásquez',
  },
  pt: {
    appTitle: 'assistai',
    tagline: 'lê a página e responde localmente',
    placeholder: 'Pergunte sobre esta página — ex.: "resumo", "palavras-chave", "entidades" ou "limpar"',
    sendBtn: 'Perguntar',
    qBrief: 'Resumo',
    qKeywords: 'Palavras-chave',
    qEntities: 'Entidades',
    clearBtn: 'Limpar',
    empty: 'Sem perguntas ainda — abra uma página e pergunte.',
    noPage: 'Abra uma página primeiro e pergunte de novo.',
    briefHeader: 'Resumo',
    keywordsHeader: 'Palavras-chave',
    entitiesHeader: 'Entidades',
    unknown: 'Comando desconhecido "%s". Tente: resumo, palavras-chave, entidades, limpar.',
    clearDone: 'Conversa apagada.',
    statusOk: 'Pronto — veja a conversa.',
    credit: 'Criado por Harley Vásquez',
  },
  it: {
    appTitle: 'assistai',
    tagline: 'legge la pagina e risponde in locale',
    placeholder: 'Chiedi su questa pagina — es. "riassunto", "parole chiave", "entità" o "cancella"',
    sendBtn: 'Chiedi',
    qBrief: 'Riassunto',
    qKeywords: 'Parole chiave',
    qEntities: 'Entità',
    clearBtn: 'Cancella',
    empty: 'Nessuna domanda — apri una pagina e chiedi.',
    noPage: 'Apri prima una pagina, poi riprova.',
    briefHeader: 'Riassunto',
    keywordsHeader: 'Parole chiave',
    entitiesHeader: 'Entità',
    unknown: 'Comando sconosciuto "%s". Prova: riassunto, parole chiave, entità, cancella.',
    clearDone: 'Conversazione cancellata.',
    statusOk: 'Fatto — guarda la conversazione.',
    credit: 'Creato da Harley Vásquez',
  },
  de: {
    appTitle: 'assistai',
    tagline: 'liest die Seite und antwortet lokal',
    placeholder: 'Frage zu dieser Seite — z. B. „Zusammenfassung", „Stichwörter", „Entitäten" oder „löschen"',
    sendBtn: 'Fragen',
    qBrief: 'Zusammenfassung',
    qKeywords: 'Stichwörter',
    qEntities: 'Entitäten',
    clearBtn: 'Löschen',
    empty: 'Noch keine Fragen — öffne eine Seite und frag.',
    noPage: 'Öffne zuerst eine Seite und frag dann erneut.',
    briefHeader: 'Zusammenfassung',
    keywordsHeader: 'Stichwörter',
    entitiesHeader: 'Entitäten',
    unknown: 'Unbekannter Befehl "%s". Versuch: zusammenfassung, stichwörter, entitäten, löschen.',
    clearDone: 'Unterhaltung gelöscht.',
    statusOk: 'Fertig — sieh dir das Gespräch an.',
    credit: 'Erstellt von Harley Vásquez',
  },
};

const LS_KEY = 'ai:lang';
let CURRENT_LANG = 'en';

function pickLang() {
  const nav = (navigator.language || 'en').toLowerCase().split('-')[0];
  return nav in DICT ? nav : 'en';
}

function setLang(lang) {
  CURRENT_LANG = lang in DICT ? lang : 'en';
  const d = DICT[CURRENT_LANG] || DICT.en;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n;
    if (k === 'credit' && el.children.length) return;
    if (d[k] != null) el.textContent = d[k];
  });
  document.documentElement.lang = lang;
}

function storeLang(lang) {
  chrome.storage.local.set({ [LS_KEY]: lang });
}

function applyI18n(cb) {
  const navL = pickLang();
  const apply = (lang) => {
    if (lang && lang !== navL) storeLang(lang);
    setLang(lang);
    if (cb) cb(lang);
  };
  chrome.storage.local.get(LS_KEY, (s) => {
    const stored = s[LS_KEY];
    apply(stored && stored in DICT ? stored : navL);
  });
}

window.__aiDict = () => DICT;
window.__aiT = (k) => {
  const d = DICT[CURRENT_LANG] || DICT.en;
  return d[k] != null ? d[k] : '';
};
window.__aiNow = () => CURRENT_LANG;
window.__aiSetLang = (lang, cb) => {
  storeLang(lang);
  setLang(lang);
  if (cb) cb(lang);
};
window.__aiLang = () => 'en';
window.__aiApply = (cb) => applyI18n(cb);
window.__aiPickLang = () => pickLang();