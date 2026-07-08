# English/Tagalog Language Toggle — Design

## Context

EduQueSCT is English-only today. The user wants a language toggle offering English and Tagalog, covering all UI chrome across every page plus the offline quiz question bank for Science and Math topics (English/Reading stays English-only, since it's literally an English-language subject). This is a static-HTML site with no build step and a house convention of "inline everything, no shared JS/CSS files" (per `CLAUDE.md`) — this feature deliberately introduces one shared file to avoid duplicating ~270 translated questions across pages.

## Decisions made during brainstorming

- **Storage**: a single shared `strings.js`, included via `<script src="strings.js">` on every page that needs it — the one accepted deviation from "inline everything."
- **Toggle placement**: on `login.html` (first touchpoint) and `index.html` (main menu, changeable anytime), both writing the same `localStorage` key.
- **Scope**: full UI chrome translation (all static + dynamic user-facing text) across every page except `landing.html` (pre-login, out of scope) and `apps-script-backend.gs` (no user-facing text). English/Reading (Literature, Grammar) topic content is never translated.
- **Question content**: 270 Tagalog questions (6 Science/Math topics × 3 grade tiers × 15 questions) drafted in one pass by Claude, no native-speaker review checkpoint requested.
- **Build order**: infrastructure, UI translation, and question content all built together in one pass (not split into a separate follow-up).

## Design

### 1. `strings.js` (new file)

```js
// selectedLanguage: "en" | "tl", defaults to "en"
function getLanguage() {
  return localStorage.getItem("selectedLanguage") === "tl" ? "tl" : "en";
}

function setLanguage(lang) {
  localStorage.setItem("selectedLanguage", lang === "tl" ? "tl" : "en");
}

const UI_STRINGS = {
  en: { /* key -> English string, one entry per translatable UI string */ },
  tl: { /* key -> Tagalog string, same keys as en */ }
};

function t(key) {
  const lang = getLanguage();
  return (UI_STRINGS[lang] && UI_STRINGS[lang][key]) || UI_STRINGS.en[key] || key;
}

const SUBJECT_LABELS = {
  en: { "Science": "Science", "Math": "Math", "English/Reading": "English/Reading" },
  tl: { "Science": "Agham", "Math": "Matematika", "English/Reading": "English/Reading" }
};
function subjectLabel(name) {
  const lang = getLanguage();
  return (SUBJECT_LABELS[lang] && SUBJECT_LABELS[lang][name]) || name;
}

const TOPIC_LABELS = {
  en: { Biology:"Biology", Physics:"Physics", Geology:"Geology", Arithmetic:"Arithmetic", Algebra:"Algebra", Geometry:"Geometry", Literature:"Literature", Grammar:"Grammar" },
  tl: { Biology:"Biyolohiya", Physics:"Pisika", Geology:"Heolohiya", Arithmetic:"Aritmetika", Algebra:"Algebra", Geometry:"Geometriya", Literature:"Literature", Grammar:"Grammar" }
};
function topicLabel(key) {
  const lang = getLanguage();
  return (TOPIC_LABELS[lang] && TOPIC_LABELS[lang][key]) || key;
}

// Auto-applies data-i18n / data-i18n-placeholder attributes on every page that includes this file.
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.getAttribute("data-i18n-placeholder")); });
}
document.addEventListener("DOMContentLoaded", applyStaticI18n);

const SCI_MATH_TOPICS = ["Biology","Physics","Geology","Arithmetic","Algebra","Geometry"];

const FALLBACK_BANKS_TL = {
  Biology: { low: [ /* 15 x {text, choices, correct} */ ], mid: [ /* 15 */ ], high: [ /* 15 */ ] },
  Physics: { low: [...], mid: [...], high: [...] },
  Geology: { low: [...], mid: [...], high: [...] },
  Arithmetic: { low: [...], mid: [...], high: [...] },
  Algebra: { low: [...], mid: [...], high: [...] },
  Geometry: { low: [...], mid: [...], high: [...] }
};
```

`UI_STRINGS` keys cover every dynamic/static string cataloged during research: login errors/labels, index.html menu/instructions/end-screen labels, character page messages, grade-select labels (mostly static, still gets keys for consistency), level map/level-select static chrome, start.html HUD/quiz/summary/error/level-intro text, rank.html headings.

### 2. Static HTML — `data-i18n` attributes

Every static text node identified in research (headings, button labels, instructional copy) gets `data-i18n="<key>"`; input placeholders get `data-i18n-placeholder="<key>"`. `applyStaticI18n()` (auto-run on `DOMContentLoaded` from `strings.js`) fills them in. Applies to: `login.html`, `index.html`, `character page.html`, `grade-select.html`, `level map.html`, `level-select.html`, `start.html`, `rank.html`.

### 3. Dynamic JS strings — swap literals for `t()`

Every hardcoded string currently assigned via `.textContent =`, `alert()`, or template literal (catalogued per-file in research) is replaced with a call to `t('key')`, interpolating variables the same way (e.g. `` `Correct! +${n} point${n>1?"s":""}` `` becomes a `t()` call with the count substituted into the translated template). This covers: `login.html` error/status messages, `character page.html`'s selection messages, `start.html`'s quiz feedback/level-intro/summary/error text, `LEVEL_NAMES` display.

### 4. Topic/Subject display labels — labels only, keys untouched

`level map.html`: subject buttons, topic buttons, and the `mapTitle` heading wrap their existing `.textContent =` assignments with `subjectLabel(...)`/`topicLabel(...)`. The values written to `localStorage.selectedTopic`/`selectedSubject`, and the `completedTopics.includes(...)` checks, are **not** changed — they keep using the raw English strings (`topic.key`, `subject.name`) exactly as today, since those are load-bearing data keys (matched against `FALLBACK_BANKS` and `completedTopics`).

`level-select.html`: the `topicLabel.textContent = \`${selectedSubject} — ${selectedTopic}\`` line becomes `` `${subjectLabel(selectedSubject)} — ${topicLabel(selectedTopic)}` ``.

`start.html`: `document.getElementById("lvl").textContent = selectedTopic` becomes `topicLabel(selectedTopic)`.

### 5. Question bank selection — `start.html`

`pickFallback(topic, grade)` (currently `start.html`, returns `FALLBACK_BANKS[topic][tier]`) gains a language branch:

```js
function pickFallback(topic, grade) {
  const tier = grade <= 8 ? "low" : grade === 9 ? "mid" : "high";
  if (getLanguage() === "tl" && SCI_MATH_TOPICS.includes(topic) && FALLBACK_BANKS_TL[topic]) {
    return FALLBACK_BANKS_TL[topic][tier];
  }
  return FALLBACK_BANKS[topic][tier];
}
```

No other change to `loadQuestions()`, `questionsForLevel()`, `shuffleArray()`, or scoring — they operate on whatever `activeQuestions` array `pickFallback` returns, unaware of language.

### 6. Toggle UI

Small "EN | TL" button pair added to `login.html` (near the top of the login card) and `index.html` (main menu). `onclick` calls `setLanguage("en"|"tl")` then re-runs `applyStaticI18n()` (and re-renders any currently-visible dynamic text) so the switch is visible immediately without a page reload; the choice persists via `localStorage` so it also applies on every subsequent page load through the rest of the flow.

## Not changing

- `landing.html` — pre-login, explicitly out of scope.
- `apps-script-backend.gs` — no user-facing text.
- Any `localStorage` keys other than the new `selectedLanguage` (e.g. `selectedTopic`, `selectedSubject`, `completedTopics`, `chosenCharacter`) — all keep using raw English values exactly as today.
- Literature/Grammar question content — always English, regardless of language setting.
- `FALLBACK_BANKS` (English bank) — untouched; `FALLBACK_BANKS_TL` is additive.

## Verification

1. Serve the site locally (`.claude/launch.json` → a static-server config) and use the browser preview.
2. On `login.html`, toggle to Tagalog; confirm visible chrome updates immediately (labels, placeholders, guest button, etc.).
3. Register/login or continue as guest; confirm `index.html`, `character page.html`, `grade-select.html`, `level map.html` all render Tagalog chrome, and that subject/topic buttons show Tagalog labels (Agham/Biyolohiya/etc.) while `localStorage.selectedTopic`/`selectedSubject` still hold the raw English values (inspect via `preview_eval`).
4. Pick a Science or Math topic in Tagalog mode; confirm `activeQuestions` in `start.html` came from `FALLBACK_BANKS_TL` (spot-check question text is Tagalog).
5. Pick Literature or Grammar in Tagalog mode; confirm questions are still English (falls through to `FALLBACK_BANKS`).
6. Toggle back to English from `index.html`'s menu toggle; confirm everything reverts, including mid-session (no logout required).
7. Confirm `completedTopics` and leaderboard submission still work end-to-end in Tagalog mode (topic-completion keys are unaffected by the language setting).
