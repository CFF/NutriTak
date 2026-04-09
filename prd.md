# Product PRD

> This is the root reference document. All feature PRDs are derived from it.

**Version:** 1.4
**Date:** April 2026
**Status:** Active
**Author:** Claire

---

## 1. Overview

NutriTak is a personal meal tracking web app that helps users log daily food intake, track calories against a personalized daily goal, and get AI-generated calorie estimates from text or photos.

The app is designed for people who have recently started a fitness journey and received a calorie maintenance target from a professional — where the challenge isn't motivation, it's the daily friction of translating real food into numbers. Distributed as open source, self-hostable, zero cost to the end user.

---

## 2. Problem Statement

People who start exercising and receive a daily calorie target consistently hit three friction points:

1. **Quantification** — "I had some bread and butter, but I have no idea what that is in calories."
2. **Unknown foods** — "I know I like hazelnuts, but I have no idea how many calories they are."
3. **Meal planning** — "I have random ingredients in my fridge but no idea what to make that fits my goal."

Existing apps (MyFitnessPal, Cronometer, Lose It) solve these with barcode scanners, massive food databases, and subscription upsells — all of which add complexity and onboarding friction that kills the habit before it starts. NutriTak bets on AI to make estimation feel effortless, not clinical.

---

## 3. Target User

**Primary user (v1):** Someone who recently started working out, received a personalized calorie maintenance number from a professional, eats real varied food (not meal-prepped, not from a database), and wants a lightweight daily companion — not another fitness app with a premium tier.

**Primary instance:** Built and used by Claire (maintenance floor: 1,300 kcal / daily goal: 1,900 kcal). May be shared with a small number of trusted others. No onboarding, no tutorial — the interface must explain itself on first sight.

---

## 4. Jobs to be Done

- When I eat something, I want to log it in under 30 seconds without knowing the calorie count, so I can stay on track without researching.
- When I take a photo of my meal, I want each item identified and estimated, so I can review, adjust, and add everything at once.
- When I check in on my day, I want to see at a glance how many calories I have left, so I can make smart food choices without doing math.
- When I log a food the AI estimated well, I want to save it so I never have to estimate it again.
- When I open the app, I want to see today's progress immediately, so I stay aware without extra steps.

---

## 5. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Fast logging | Time to log a single meal item | Under 30 seconds |
| No estimation burden | % of logs where user must know kcal in advance | 0% |
| Zero cost to user | Cost of AI features to end user | $0 |
| Lightweight feel | Absence of subscription prompts, onboarding flows, gamification | 0 of those things |
| Data durability | Data lost on browser clear | 0 (IndexedDB persists; export is backlog) |

---

## 6. Platform Decisions

### 6.1 Progressive Web App (PWA) — primary platform

**Decision:** Build and ship NutriTak as a Progressive Web App. Definitive platform choice for v1 and the foreseeable future.

**In practice:**
- Runs in the browser; on iPhone, visit URL → Share → "Add to Home Screen" → installed with custom icon, no browser chrome
- No App Store, no review process, no Apple Developer enrollment
- Updates ship instantly

**Trigger to revisit native:** If the PWA hits a hard wall — HealthKit sync, background notifications, or a camera API limitation — revisit Expo at that point. Not before.

### 6.2 Open Source Distribution

**Decision:** Publish publicly on GitHub under MIT license.

**Rationale:** App owner provides a single OpenRouter API key server-side (proxied via Vite, never sent to the browser). End users pay nothing. Distribution model: clone, add your OpenRouter key, deploy.

### 6.3 AI Provider

**Decision:** OpenRouter free router (`openrouter/free`).

**Rationale:** Automatically routes to the best available free model based on request type — text for food lookup, vision-capable model for photo estimation. Zero cost, no user account required. If a specific model becomes preferable, the model string is a one-line change.

**What was considered and rejected:**
- Anthropic API with user-supplied key: adds friction (user must create and manage an account), and usage costs fall on the user
- Hardcoded paid model: violates the zero-cost goal

---

## 7. Features

### 7.1 Daily Calorie Journal ✅

- Flat chronological list of food entries for the current day
- Each entry: name, kcal, optional serving multiplier
- Tap to edit name or kcal inline; swipe/button to delete
- Entries persist in IndexedDB (Dexie) keyed by date

### 7.2 AI Food Lookup ✅

- User types any food description, AI returns name + calorie estimate
- One clarifying question max, then commits to a default
- Confirm screen shows estimate with a serving stepper (×0.5 increments)
- Result added to today's log

### 7.3 Photo Calorie Estimation ✅

- User uploads or photographs a meal
- HEIC images converted to JPEG before upload
- Image resized to max 800px before sending to AI
- AI returns a list of identified items, each with name + calorie estimate
- User reviews, edits any value, removes items, then adds to log

### 7.4 Dual-Target Calorie Bar ✅

- Maintenance floor marker (amber) + daily goal marker (green) on a single track
- Bar color: gray below maintenance, terracotta in range, red over goal
- Hero number = kcal remaining to goal (or kcal over, in red)

### 7.5 Calorie Profile ✅

- Settings sheet: maintenance floor + daily goal, both editable
- Validation: maintenance must be less than goal
- Persists in IndexedDB

### 7.6 Food History & Quick Chips ✅

- Foods logged 2+ times surface as chip shortcuts in the food entry sheet
- Chips support quantity multiplier before adding
- History persists in IndexedDB

### 7.7 Past Days ✅

- Calendar sheet shows previous days with total kcal and mini bar
- Expandable to see individual entries per day

### 7.8 Logging Flow 🔲

Full entry flow for three log types — food, water, and exercise — accessed via a floating action button (FAB) that fans out into three sub-actions. Replaces the placeholder "+" button.

See full spec: `prd-logging-flow.md`

---

## 8. Feature Registry

| Feature | File | Status |
|---------|------|--------|
| Save as Favorite | [prd-favorites.md](prd-favorites.md) | Spec complete, not built |
| Logging Flow | [prd-logging-flow.md](prd-logging-flow.md) | Ready to build |

---

## 9. Out of Scope

- Native iOS or Android app (revisit only if PWA hits a hard wall)
- Barcode scanning
- USDA or Open Food Facts cross-reference for AI estimates (open question)
- Multiple calorie modes (cut / maintain / bulk) (open question)
- PWA manifest and service worker (installable shell, offline caching) — backlog
- AI meal suggestions from fridge ingredients — backlog
- Push notifications — depends on service worker
- HealthKit sync — depends on native revisit
- Social features, leaderboards, gamification, streaks

---

## 10. Data & Privacy

- All data (logs, profile, food history) stored in IndexedDB on the user's device
- No backend, no user accounts, no data sent off-device except AI API calls
- AI calls are proxied server-side; the API key is never exposed to the browser

---

## 11. Open Questions

1. Should AI food lookup cross-reference USDA / Open Food Facts for accuracy, or rely on the AI model alone? → **Still open**
2. Should we support multiple calorie modes (cut / maintain / bulk) in v1? → **Still open**

---

## 12. Version History

### v1.4 — April 2026 (current)
- Added Logging Flow (7.8): FAB fans into Food / Water / Exercise sub-actions
- Food log: AI estimates calories + macros (protein, carbs, fats) from text description
- Water log: preset quick-add buttons (250ml, 500ml, 750ml) + custom ml input
- Exercise log: AI estimates calories burned from text description
- All three entry types appear inline in the "Recently Logged" list
- Exercise entries subtract from net calorie total (calories burned)
- Inline edit and delete on every log entry
- Ring progress and macro bars update live as entries are added or removed

### v1.3 — April 2026
- Switched AI provider from Anthropic API (user-supplied key) to OpenRouter free router — zero cost to end user, key is server-side only
- Switched persistence from localStorage to IndexedDB via Dexie
- Added Food History & Quick Chips (7.6): frequently logged foods surface as chip shortcuts
- Added Past Days (7.7): calendar view of previous days with totals and per-day entries
- Removed user-managed API key requirement from distribution model
- Daily goal for primary instance corrected to 1,900 kcal

### v1.2 — March 14, 2026
- Added Smart Food Lookup (AI-powered, one clarifying question max)
- Added Photo Calorie Estimation via Claude Vision (per-item review before saving)
- Added Dual-Target Calorie Bar (maintenance floor + daily goal on one track)
- Added Profile screen (editable name, floor, goal with live bar preview)
- Distribution model: user supplies own Anthropic API key
- Persistence: localStorage

### v1.1 — February 2026
- Initial working prototype as standalone HTML file (`nutritak.html`)
- Four meal slots (Breakfast, Lunch, Dinner, Snack) with collapsible cards
- Preset food chip library
- AI meal suggestions (ingredient-based, scoped to remaining calorie budget)
- Single calorie goal target (no floor/goal split yet)
