# assistai

A tiny local page assistant for Chromium browsers (Manifest V3). No network calls, no API keys, no models in the cloud: assistai reads the page you are on and answers with deterministic local heuristics, and keeps a persistent conversation history in extension storage.

Landing page: `https://assistai-xxxx.vercel.app` (placeholder, replaced at deploy time)

## What it does

- **Brief** (`resumen`, `summarize`, `summary`, `brief`…): the three densest sentences of the page, picked by scoring sentences against the page's most repeated content words. Out-of-the-box English stop-word list.
- **Keywords** (`palabras clave`, `keywords`…): the page's most repeated content words with counts (top 8, ties broken alphabetically).
- **Entities** (`entidades`, `entities`…): emails, URLs, prices (`EUR`/`USD`/`€`/`$`) and ISO dates (`YYYY-MM-DD`) found by regex.
- **Clear** (`clear`, `limpiar`, `effacer`…): empties the conversation.
- Unknown commands get an honest localized "I don't understand <command>" — no invented answers.
- Quick chips in the popup run the same commands in the active language.
- 6 languages for the popup and landing: English, Spanish, French, Portuguese, Italian, German.

## Install

1. Download `assistai.zip` from the landing page and unpack it somewhere permanent.
2. Open `chrome://extensions`, enable Developer mode.
3. Click "Load unpacked" and pick the folder.
4. Open any page, open the assistai popup, and ask.

## Build

```
npm install
npm run gen-icons
npm run zip      # writes dist/assistai.zip and copies to landing/
npm run probe    # hermetic end-to-end probe against a headless Chrome
```

Set `PROBE_CHROME` to point at a Chrome/Chromium binary if the bundled one is not available. Set `ASSISTAI_DEPLOY_URL` to gate the deployed-landing checks.

## Honest limits

- It is not an LLM: the "brief" is a density heuristic, keywords are frequency counts, entities are regex matches. It cannot answer questions it hasn't been asked in a known command form.
- Content is capped at 120k characters of visible text; the analysis runs on the page's own text with no network calls.
- Commands are matched in a fixed list of aliases across the six languages; anything else is refused explicitly.

Built by [Harley Vásquez](https://www.linkedin.com/in/harleyvasquez/).