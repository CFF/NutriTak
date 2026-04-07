# Feature PRD: Save as Favorite

> Derived from: [prd.md](prd.md)
> Any principle not explicitly overridden here follows the product PRD.

## Overview

Users can save any AI-estimated food — from Smart lookup or Photo estimation — as a personal favorite with one tap. Saved favorites appear as chips in the Quick add tab alongside history chips, making repeat foods instant to log without re-estimation. This is the path from "AI just estimated this well" to "use this number again tomorrow."

## Problem this feature solves

Every time a user logs a food they eat regularly via Smart lookup or Photo, the AI re-estimates it from scratch. There is no memory. This means repeated friction for common foods, inconsistent calorie values across days for the same food, and no way to benefit from the accuracy of a first calibrated estimate.

This connects to the JTBD: "When I log a food the AI estimated well, I want to save it so I never have to estimate it again."

## Users

Same as product PRD — primary user is Claire, logging meals 3–5 times per day, eating real varied food (not meal-prepped), with a professional calorie target (1,300 kcal floor / 1,900 kcal goal). Wants logging under 30 seconds per meal.

Secondary: anyone Claire shares the app with. No onboarding, no tutorial — controls must be legible on first use.

## Acceptance criteria

- [ ] A star icon (☆) appears on the Smart lookup result card
- [ ] Tapping the star saves the food as a favorite and toggles the icon to filled (★) — no confirmation, no naming screen
- [ ] A star icon (☆) appears on each item row in the Photo estimation result list
- [ ] The saved calorie value matches whatever is in the editable field at the moment of tapping
- [ ] Star state is loaded from Dexie on render — not just tracked in session state
- [ ] Tapping a filled star removes the favorite
- [ ] Duplicate saves (case-insensitive name match) are silently no-oped — no error, star stays filled
- [ ] Saved favorites appear as chips in the Quick add tab, prepended before hardcoded presets
- [ ] A favorite chip has a visual distinction from hardcoded presets (★ prefix or subtle terracotta border)
- [ ] Tapping a favorite chip adds it to the meal log — identical behavior to hardcoded chips
- [ ] A ✕ appears on chip tap/press to allow removal
- [ ] Removing via ✕ deletes the favorite from Dexie and removes the chip immediately
- [ ] Favorites persist across sessions and app restarts (IndexedDB via Dexie)
- [ ] No network call required — fully local, works offline

## Functional requirements

**Save trigger — Smart lookup result card**

Add a star icon (☆) to the result card, positioned top-right or inline next to the food name. Tapping saves the food as a favorite; icon toggles to filled (★). Saving and adding to meal are independent actions. If the food is already saved, star renders as filled on load. Tapping again removes the favorite.

**Save trigger — Photo estimation result list**

Add a star icon (☆) at the end of each item row. Same toggle behavior as Smart lookup. The saved calorie value is whatever is in the editable field at the moment of tapping — if the user edits 340 → 280 then taps ★, 280 is saved. Star state reflects current Dexie state on render via `isFavorite(name)`, not just session state.

**What gets saved**

Name and calories only. No portion string, no note. Matches the chip format used by existing presets.

```js
{
  id: uuid(),
  name: "Greek Yogurt",   // AI-returned name, trimmed
  calories: 130,          // integer
  source: "user",
  createdAt: ISO string
}
```

**Preset chip display**

On mount, load favorites from Dexie and prepend them to the chip list before hardcoded presets. Favorites use the same chip style with one visual distinction: a small ★ prefix or subtle terracotta border to signal they are user-created. No separate section, no label — star prefix is sufficient.

```
[★ Greek Yogurt 130]  [★ Banana Bread 210]  [Banana 89]  [Oat Milk Latte 120]  ...
```

Tapping a favorite chip adds it to the meal — identical behavior to hardcoded chips. A ✕ appears on tap/press of a chip to allow removal. Long-press alone is not sufficient — it has zero discoverability for users who did not build the app.

**Duplicate handling**

If the user saves a food whose name already exists in favorites (case-insensitive), silently no-op. No duplicate added, no error shown. Star stays filled.

**Empty state**

No empty state message needed. If no favorites exist, the Quick add tab shows only hardcoded presets. First saved favorite appears at the front of the row immediately.

**Dexie schema change**

```js
db.version(1).stores({ logs: 'date' })                          // keep as-is, do not redefine
db.version(2).stores({ favorites: '++id, name, createdAt' })    // add only
```

This is a migration. Dexie handles it automatically on app load without touching existing `logs` data.

**Storage helpers (`src/lib/storage.js`)**

```js
export async function getFavorites() {
  return await db.favorites.orderBy('createdAt').reverse().toArray()
}

export async function saveFavorite({ name, calories }) {
  const existing = await db.favorites.where('name').equalsIgnoreCase(name).first()
  if (existing) return existing
  return await db.favorites.add({ name, calories, source: 'user', createdAt: new Date().toISOString() })
}

export async function deleteFavorite(id) {
  return await db.favorites.delete(id)
}

export async function isFavorite(name) {
  const match = await db.favorites.where('name').equalsIgnoreCase(name).first()
  return !!match
}
```

## Non-functional requirements

- Save action must feel instant — optimistic UI: update star state immediately on tap, write to Dexie in background
- Favorites must persist across sessions and app restarts (IndexedDB via Dexie)
- No network call required — fully local, works offline
- Consistent with NutriTak's offline-first PWA approach

## Success metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Re-estimation of repeat foods | Every log triggers AI call | User logs a saved favorite within first 3 sessions of use |
| Logging speed for known foods | Requires AI lookup | Favorite chip tap is fastest path to adding a known food |
| Calorie consistency across days | Same food can return different AI estimates | Same food logged on different days returns the same number |

## Design and UX notes

- Star icon uses the same terracotta accent (`#C4593A`) when filled — ties into the existing palette without introducing a new color
- Chip visual distinction: ★ prefix is preferred over a border to avoid adding visual weight to the row
- Tap/press to reveal ✕ on chips follows the same interaction pattern already used elsewhere — do not introduce swipe-to-delete here (zero discoverability)
- No confirmation dialog for saving or removing — both actions are instant and reversible

## Out of scope

- Renaming saved favorites (delete and re-add)
- Editing the calorie value of an existing favorite in place
- Reordering favorites manually
- Separate "My favorites" section or label in the chip row
- Auto-suggesting to save when user taps "Add X items to meal" in photo flow (decided: do not interrupt the confirmation flow)
- Most-recently-used chip ordering (deferred — start with most-recently-saved, revisit with usage data)
- Voice logging

## Open questions

| Question | Status |
|----------|--------|
| Chip order: most-recently-saved vs most-recently-used? | Deferred — launch with most-recently-saved |
| Auto-suggest saving after "Add X items to meal" in photo flow? | Decided: no — don't interrupt the confirmation flow |
