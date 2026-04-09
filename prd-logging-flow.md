# Feature PRD: Logging Flow

> Derived from: [PRD.md](PRD.md)
> Any principle not explicitly overridden here follows the product PRD.

**Version:** 1.1
**Date:** April 2026
**Status:** Ready to build
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
- [ ] **Food flow:** user types a description → AI returns name + calories + protein + carbs + fats → confirm screen → entry added to journal
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

**Step 1 — Input sheet**
- Bottom sheet slides up
- Single text input: "What did you eat?"
- Autofocus on open
- Submit on Enter or tap "Look up" button
- Sheet dismisses on swipe down or tap outside

**Step 2 — AI call**
- Send description to OpenRouter
- AI must return a structured response: `{ name, calories, protein, carbs, fats, portion }`
- Calories and macros are integers (grams for macros, kcal for calories)
- One clarifying question allowed if the input is ambiguous — AI asks in the same sheet before committing
- If no clarification needed, go straight to confirm screen

**Step 3 — Confirm screen**
- Shows: food name, calorie estimate, macro breakdown (protein / carbs / fats), portion description
- Serving stepper: ×0.5 increments, range ×0.5 to ×5. All values scale proportionally.
- "Add to log" primary button → adds entry, sheet closes
- "Start over" secondary link → returns to input
- User can tap any value to edit it manually before confirming

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

## AI prompt contracts

### Food lookup prompt

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

- Each AI call must complete in under 10 seconds on a standard mobile connection; show a loading state while waiting
- All entries persist in IndexedDB via Dexie on the same day-keyed structure as existing logs
- The flow must work offline for water entries (no AI call); food and exercise require network
- Sheet open/close animations must run at 60fps — use CSS transitions, not JS animation loops
- FAB fan animation: stagger the three buttons with 40ms delay between each

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
| `FAB` | Build new | Fan-out animation, three sub-actions, scrim |
| `FoodSheet` | Build new | Input → AI call → confirm screen |
| `WaterSheet` | Build new | Presets + custom input, no AI |
| `ExerciseSheet` | Build new | Input → AI call → confirm screen |
| `LogEntry` | Build new | Row component handles food / water / exercise display + inline edit/delete |
| `RecentlyLogged` | Modify | Replace placeholder list with real `LogEntry` rows |
| `CalorieRing` | Modify | Wire to net calories, animate on update |
| `MacroBars` | Modify | Wire to live food totals, animate on update |
| `HomeScreen` | Modify | Compose all of the above, pass state down |
| `src/lib/storage.js` | Modify | Add `saveEntry`, `deleteEntry`, `updateEntry`, `getEntriesByDate` if not already present |

---

## Out of scope

- Photo estimation in this flow (already built as a separate feature — 6.3)
- Quick chips / food history in the food sheet (already built — 6.6; integrate in a follow-up)
- Macro editing inline (name + calories only for inline edit)
- Water goal tracking or hydration progress bar
- Exercise duration stored or displayed after confirmation
- Serving size stored for water (ml only)
- Voice input

---

## Open questions

| Question | Decision |
|---|---|
| Should macro targets (protein/carbs/fats) be editable in the profile screen? | **Closed.** Hardcode defaults (120g protein / 200g carbs / 65g fats) now. Add editable macro targets to the profile screen in a follow-up once the coach's nutrition plan is available. |
| Should exercise entries reduce the ring fill or use a separate visual treatment? | **Closed.** Exercise calories burned increase the remaining budget. Net = food calories − exercise calories. Ring fill and remaining number both reflect net. No separate visual treatment needed. |
| Should the FAB hide when a sheet is open? | **Closed.** Yes — hide the FAB whenever any sheet is open. The sheet covers the bottom of the screen and the FAB behind it creates visual noise. Restore it when the sheet closes. |
