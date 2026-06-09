# JobLens — LinkedIn Job Analyzer

A Chrome extension that overlays signal chips on every LinkedIn job posting and lets you permanently hide jobs from companies you don't want to see — all without reading a single full description.

![JobLens chips: Sponsorship · Software Role · Experience · Applicants](icons/icon128.png)

---

## Chips

| Chip | What it shows |
|------|--------------|
| **Sponsorship** | Teal = likely sponsors. Red = explicit denial detected. |
| **Applicants** | Color-coded count — green (<100) → yellow → red → dark red (1000+). |
| **Pay** | Salary/comp range extracted from the JD. |
| **Experience** | Years required extracted from the JD (e.g. `3–5 yrs`, `2+ yrs`). |
| **Language** | Top 1–2 tech languages/frameworks detected (e.g. Python, React). |
| **Software Role** | Green = software eng. Red = non-software (hardware/mfg). Yellow = unclear. |

Hovering a chip shows a tooltip with matched keywords and confidence details.

---

## Company Blocklist

**The killer feature.** Never see jobs from recruiters, body shops, or companies you've already ruled out.

- **Hover ✕ button** — hover any job card on the left panel and a red ✕ appears at the bottom-right. Click it to instantly hide all jobs from that company, forever.
- **Popup manager** — click the JobLens icon in your toolbar to view, add, or remove blocked companies.
- **Persistent** — blocklist is stored in `chrome.storage.local` and survives page reloads, browser restarts, and LinkedIn SPA navigation.
- **Partial matching** — blocking `"google"` hides `"Google LLC"`, `"Google DeepMind"`, etc.
- **Instant effect** — cards vanish the moment you block a company; unblocking restores them on the next page load.

---

## Features

- **H-1B / Visa sponsorship detection** — 60+ positive and negative patterns covering explicit denials (`"does not provide visa sponsorship"`, `"not eligible for U.S. immigration sponsorship"`), exclusion lists (`"No H1B, OPT, CPT"`), security clearance requirements (ITAR, DoD), and positive signals (`"immigration assistance"`, `"willing to sponsor"`).
- **Software role classifier** — weighted keyword scoring across job title, responsibilities, requirements, and about sections.
- **Experience extraction** — regex engine covering ranges (`3–5 yrs`), plus (`2+ yrs`), written numbers (`"four years"`), parentheticals (`"(4) years"`), hyphenated forms, and 10+ other patterns.
- **Applicant count** — supports both old and new LinkedIn layouts, including premium insight panels.
- **In-page highlighting** — matched sponsorship, experience, and language phrases are highlighted directly in the job description with word-boundary precision (dark-mode compatible).
- **SPA-aware** — uses MutationObserver + URL-based job key caching to update chips on navigation without flickering.
- **Works on all LinkedIn job URLs** — search results side panel, direct `/jobs/view/` links, and new `data-sdui-screen` layout.

---

## Install (Developer Mode)

1. Clone or download this repo.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select this folder.
5. Open any LinkedIn job posting — chips appear below the job title.

To update after pulling changes: click the refresh icon on the extension card in `chrome://extensions`, then hard-refresh (`Cmd+Shift+R`) the LinkedIn tab.

---

## File Overview

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) |
| `classifier.js` | Keyword classifier · experience extractor · sponsorship analyzer · language detector |
| `highlighter.js` | DOM text highlighter for sponsorship, experience, compensation, and language phrases |
| `blocker.js` | Company blocklist — card detection, hover ✕ button, storage, MutationObserver |
| `popup.html` / `popup.js` | Toolbar popup UI for managing the blocked companies list |
| `content-script.js` | DOM orchestration — finds title, injects chip row, drives all modules |
| `styles.css` | Chip, highlight, blocklist button, and blocked-card styles |

---

## Tech

- Manifest V3, content scripts only
- No external APIs — fully client-side
- `chrome.storage.local` for blocklist persistence
- Tested on Chrome; should work on any Chromium-based browser
