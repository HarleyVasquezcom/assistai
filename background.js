'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['ai:convo'], (s) => {
    const set = {};
    if (!Array.isArray(s['ai:convo'])) set['ai:convo'] = [];
    if (Object.keys(set).length) chrome.storage.local.set(set);
  });
});