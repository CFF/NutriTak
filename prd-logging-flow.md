# Feature PRD: Logging Flow

> Derived from: [PRD.md](PRD.md)
> Any principle not explicitly overridden here follows the product PRD.

**Version:** 1.2
**Date:** April 29, 2026
**Status:** Active
**Author:** Claire

---

## Overview

The logging flow is the primary interaction in NutriTak — the path from tapping "+" to seeing a new entry appear in the journal. It covers three entry types: food, water, and exercise. Entry point is a floating action button (FAB) that fans out into three sub-actions. All three entry types land in the same "Recently Logged" list. Entries are editable and deletable inline.

---

## Problem this feature solves

The "+" button exists but leads nowhere. Users have no way to log anything. This is the core loop that makes the app usable at all.

---

## Users

Same as product PRD. Primary user is Claire, logging 3–5 times per day, wants each log action to take under 30 seconds.

---

## Acceptance criteria

- [ ] Tapping "+" opens a FAB fan with three labeled sub-actions: Food, Water, Exercise
- [ ] Tapping anywhere outside the fan closes it without logging anything
- [ ] **Food flow — text path:** user types a food description → USDA FDC returns up to 5 matching entries → user picks one → confirm screen → entry added to journal
- [ ] **Food flow — text path fallback:** "Generate with AI" button at the bottom of results → AI estimation → clarify if needed → confirm screen → entry added to journal
- [ ] **Food flow — photo path:** user taps camera icon → takes photo or picks from library → vision AI identifies each ingredient with quantity → per-item review list → user can edit, remove, or add items → all items logged as separate entries
- [ ] **Water flow:** user taps a preset (250ml, 500ml, 750ml) or enters a custom ml value → entry added immediately
- [ ] **Exercise flow:** user types a description → AI returns activity name + calories burned → confirm screen → entry added to journal
- [ ] All three entry types appear inline in the "Recently Logged" list, visually distinguished by type
- [ ] Exercise entries subtract from the net calorie total (ring and remaining number reflect net)
- [ ] Every entry has an inline edit action (name and calories editable)
- [ ] Every entry has an inline delete action
- [ ] The calorie ring animates to reflect the new total after each entry is added or removed
- [ ] The macro bars (protein, carbs, fats) update live — food entries only
- [ ] Water entries do not affect the calorie ring or macro bars
- [ ] All entries persist in IndexedDB (Dexie) keyed by date

---

## Functional requirements

### FAB behavior

The "+" button in the bottom nav is the entry point.

On tap, the button rotates 45° and three sub-action buttons animate upward in a fan:
- Food (fork + knife icon)
- Water (droplet icon)
- Exercise (dumbbell icon)

Each sub-action shows an icon and a text label. Tapping a sub-action opens the corresponding flow sheet. Tapping the "+" again, or tapping the scrim behind the fan, collapses it.

---

### Food flow

The food sheet opens with two entry points: a text input (default, autofocused) and a camera icon button in the top-right corner of the sheet. Each leads to a separate sub-path but both converge on the same confirm screen pattern.

---

#### Text path (primary)

**Step 1 — Input**
- Bottom sheet slides up
- Single text input: "Search for a food…", autofocused
- Camera icon button top-right → switches to photo path
- Submit on Enter or tap "Search" button

**Step 2 — FDC results**
- Query `/api/fdc?query={text}` (USDA FoodData Central, proxied server-side)
- Show up to 5 matching entries, each card: food name, brand or "Generic", kcal · serving size
- User taps a card → goes to confirm screen
- "Generate with AI" button at the bottom of the list → goes to AI sub-path
- If FDC returns zero results → automatically fall through to AI sub-path with the typed text pre-filled

**Step 2b — AI sub-path (fallback)**
- User describes what they ate in a text input (pre-filled if coming from a failed FDC search)
- One clarifying question allowed if input is ambiguous
- Returns `{ name, calories, protein, carbs, fats, portion }`

**Step 3 — Confirm screen (single item)**
- Shows: food name, calorie value, macro breakdown, portion/serving description
- Serving stepper: ×0.5 increments, ×0.5 to ×5. All values scale proportionally.
- "Add to log" primary button → entry added, sheet closes
- "Start over" secondary link → returns to Step 1

---

#### Photo path (secondary)

**Step 1 — Camera / image picker**
- Triggered by tapping the camera icon on the input screen
- Opens `<input type="file" accept="image/*" capture="environment">` — on mobile this opens the camera; on desktop, a file picker
- HEIC images converted to JPEG via `heic2any` before sending
- Image compressed client-side to max 1200px / 80% quality before encoding to base64

**Step 2 — Vision AI call**
- Image sent to OpenRouter as a multimodal message (base64 data URL)
- Vision model identifies each ingredient with estimated quantity
- Returns a JSON array: `[{ name, calories, protein, carbs, fats, portion }, ...]`
- Show loading state: "Analysing your meal…"

**Step 3 — Per-item review screen**
- Shows the photo thumbnail at top
- Below: list of identified items, each showing name, kcal, portion
- Per item: tap name or kcal to edit inline; swipe or tap trash icon to remove
- "Add item manually" link at the bottom → opens a single-item text input (same AI sub-path as text fallback)
- "Add all to log" primary button → each item saved as a separate food entry, sheet closes
- "Retake" secondary link → returns to Step 1

**Entry data model (food):**
```js
{
  id: uuid,
  type: 'food',
  name: String,
  calories: Number (kcal, integer),
  protein: Number (g, integer),
  carbs: Number (g, integer),
  fats: Number (g, integer),
  portion: String,
  loggedAt: ISO string,
  date: 'YYYY-MM-DD'
}
```

---

### Water flow

**Sheet**
- Bottom sheet slides up
- Three preset tap targets: 250 ml, 500 ml, 750 ml
- Tapping a preset adds the entry immediately and closes the sheet — no confirm step
- Custom input field below presets: numeric input for ml, "Add" button to confirm
- No AI call — purely local

**Entry data model (water):**
```js
{
  id: uuid,
  type: 'water',
  name: 'Water',
  amount: Number (ml),
  loggedAt: ISO string,
  date: 'YYYY-MM-DD'
}
```

Water entries do not carry calories, protein, carbs, or fats. They do not affect the calorie ring or macro bars.

---

### Exercise flow

**Step 1 — Input sheet**
- Bottom sheet slides up
- Single text input: "What did you do?"
- Autofocus on open
- Submit on Enter or tap "Look up" button

**Step 2 — AI call**
- Send description to OpenRouter
- AI must return: `{ name, caloriesBurned, duration }`
- `caloriesBurned` is an integer
- `duration` is a display string (e.g. "30 min") — used for context only, not stored

**Step 3 — Confirm screen**
- Shows: activity name, calories burned estimate, duration context
- "Log exercise" primary button → adds entry, sheet closes
- "Start over" secondary link → returns to input
- User can tap calories value to edit manually before confirming

**Entry data model (exercise):**
```js
{
  id: uuid,
  type: 'exercise',
  name: String,
  calories: Number (kcal burned, integer),
  loggedAt: ISO string,
  date: 'YYYY-MM-DD'
}
```

Exercise entries subtract from net calories. Net = food calories − exercise calories. The ring and remaining number both reflect net.

---

### Recently Logged list

All entry types appear in a single flat chronological list, most recent at top.

Each row shows:
- Type icon (food / water / exercise), colored by type
- Entry name
- Calorie value (food: "+X kcal", exercise: "−X kcal", water: "X ml")
- Edit icon (pencil) — opens inline edit
- Delete icon (trash) — removes entry immediately with no confirmation prompt

**Inline edit behavior:**
- Tapping the edit icon makes the name and calorie/amount field editable in place
- Confirm with checkmark button or blur
- Cancel with X button
- Macro values are not editable inline (would require a separate expanded view — out of scope for now)

**Empty state:**
- When no entries exist, show a placeholder message and a ghost entry card to signal the pattern
- Existing screenshot shows this pattern — preserve it

---

### Calorie ring

The ring on the home screen reflects net calories consumed today.

- Net = sum of food entries − sum of exercise entries
- Ring fills from 0 to daily goal
- Color: gray below maintenance floor, terracotta between floor and goal, red above goal
- Animates smoothly when entries are added or removed
- Center number = kcal remaining to goal (can go negative if over goal — show in red)

---

### Macro bars

Three bars below the ring: Protein, Carbs, Fats.

- Values are the sum of all food entries for the day
- Exercise entries do not affect macros
- Water entries do not affect macros
- Bar fill relative to a daily macro target (configurable in profile, or use defaults: protein 120g, carbs 200g, fats 65g)
- Animate on update

---

## API contracts

### USDA FoodData Central — food search (text path)

Endpoint proxied via `/api/fdc`:
```
GET https://api.nal.usda.gov/fdc/v1/foods/search
  ?query={query}
  &pageSize=5
  &dataType=Branded,Foundation,SR%20Legacy
  &api_key={USDA_FDC_API_KEY}   ← injected server-side only
```

Nutrients extracted per result (by nutrient ID):
- `1008` → calories (kcal)
- `1003` → protein (g)
- `1005` → carbohydrate (g)
- `1004` → total fat (g)

Serving: use `servingSize` + `servingSizeUnit` when present on Branded items; default to "100g" for Foundation/SR Legacy.

Environment variable required: `USDA_FDC_API_KEY` (free key at fdc.nal.usda.gov/api-key-signup — `DEMO_KEY` works for development).

---

### Vision AI prompt (photo path)

Vision model: prefer `google/gemini-2.0-flash-exp:free` or `meta-llama/llama-3.2-11b-vision-instruct:free` via OpenRouter.

Multimodal message format: image sent as base64 data URL in the `image_url` content block alongside the text prompt.

```
You are a nutrition assistant. Identify every distinct food item visible in this photo.
Return ONLY a JSON array, no markdown, no explanation.

Required format:
[
  { "name": "Chicken Breast", "calories": 243, "protein": 46, "carbs": 0,  "fats": 5, "portion": "3 pieces (~300g)" },
  { "name": "Yellow Rice",    "calories": 143, "protein": 3,  "carbs": 30, "fats": 1, "portion": "1 serving (~120g)" }
]

Rules:
- Each distinct ingredient or component gets its own object
- calories, protein, carbs, fats must be integers
- portion is a human-readable string (count, volume, or weight estimate) of what you see in the photo
- If you cannot identify something precisely, make your best guess — do not omit it
- Do not add commentary, caveats, or extra fields
```

### Text AI fallback prompt (text path — AI sub-path)

```
You are a nutrition assistant. The user described a food or meal. Return ONLY a JSON object, no markdown, no explanation.

Required format:
{
  "name": "Short food name",
  "calories": 350,
  "protein": 12,
  "carbs": 45,
  "fats": 8,
  "portion": "1 medium bowl (approx 300g)"
}

Rules:
- calories, protein, carbs, fats must be integers
- If the description is ambiguous and one question would meaningfully change the estimate, return:
  { "clarify": "Your question here?" }
- Ask at most one clarifying question. If still ambiguous after one answer, commit to a reasonable default.
- Do not add commentary, caveats, or extra fields.

User input: "{description}"
```

### Exercise lookup prompt

```
You are a fitness assistant. The user described a physical activity. Return ONLY a JSON object, no markdown, no explanation.

Required format:
{
  "name": "Activity name",
  "caloriesBurned": 280,
  "duration": "30 min"
}

Rules:
- caloriesBurned must be an integer
- Assume an average adult (70kg) unless the user specified otherwise
- duration is a human-readable string for display only
- Do not add commentary, caveats, or extra fields.

User input: "{description}"
```

---

## Non-functional requirements

- FDC text lookup must complete in under 2 seconds; show loading state while waiting
- Vision AI photo call must complete in under 15 seconds; show "Analysing your meal…" loading state
- Text AI fallback call must complete in under 10 seconds; show loading state
- All entries persist in IndexedDB via Dexie on the same day-keyed structure as existing logs
- The flow must work offline for water entries; food and exercise require network
- Images are compressed client-side before sending (max 1200px, 80% JPEG quality) to keep payloads reasonable
- Sheet open/close animations must run at 60fps — use CSS transitions, not JS animation loops
- FAB fan animation: stagger the three buttons with 40ms delay between each
- Environment variables required: `OPENROUTER_API_KEY` (existing), `USDA_FDC_API_KEY` (new — free key at fdc.nal.usda.gov/api-key-signup, `DEMO_KEY` works for dev)

---

## Data storage

### Dexie schema

No schema changes required if the existing `logs` store accepts arbitrary entry shapes keyed by date. Confirm the current schema handles `type`, `protein`, `carbs`, `fats` fields — if not, add a migration.

The existing store:
```js
db.version(1).stores({ logs: 'date' })
```

Each day's record holds an array of entries. New entry types (water, exercise) slot into the same array with their `type` field as the discriminator.

---

## Components to build or modify

| Component | Action | Notes |
|---|---|---|
| `FAB` | Built | Fan-out animation, three sub-actions, scrim |
| `FoodSheet` | Modify | Add FDC text path (search → select), photo path (camera → vision AI → per-item review), keep existing AI path as fallback |
| `WaterSheet` | Built | Presets + custom input, no AI |
| `ExerciseSheet` | Built | Input → AI call → confirm screen |
| `LogEntry` | Built | Row component handles food / water / exercise display + inline edit/delete |
| `api/fdc.js` | Build new | Vercel serverless function; proxies USDA FDC search, injects API key, returns cleaned results |
| `vite.config.js` | Modify | Add `/api/fdc` proxy for local dev |
| `src/lib/storage.js` | No change | `saveEntry`, `deleteEntry`, `updateEntry`, `getEntriesByDate` already present |

---

## Out of scope

- Per-photo item confidence scores or explanations
- Quick chips / food history in the food sheet (already built — 6.6; integrate in a follow-up)
- Macro editing inline (name + calories only for inline edit)
- Water goal tracking or hydration progress bar
- Exercise duration stored or displayed after confirmation
- Serving size stored for water (ml only)
- Voice input

---

## Open questions

**Should macro targets (protein/carbs/fats) be editable in the profile screen?**
Closed. Hardcode defaults (120g protein / 200g carbs / 65g fats) now. Add editable macro targets to the profile screen in a follow-up once the coach's nutrition plan is available.

**Should exercise entries reduce the ring fill or use a separate visual treatment?**
Closed. Exercise calories burned increase the remaining budget. Net = food calories − exercise calories. Ring fill and remaining number both reflect net. No separate visual treatment needed.

**Should the FAB hide when a sheet is open?**
Closed. Yes — hide the FAB whenever any sheet is open. The sheet covers the bottom of the screen and the FAB behind it creates visual noise. Restore it when the sheet closes.
