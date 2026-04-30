# Nutritak — Project Guide

## Design Context

### Users
Anyone interested in tracking their daily food intake personally. The primary user (Claire) built this for herself, to accompany her fitness journey, but it may be shared with a handful of trusted others. Users open the app multiple times a day — logging meals in the moment, checking progress, glancing at how the day is going. There is no onboarding, no tutorial. The interface must explain itself.

### Brand Personality
**Clean, sharp, minimal.**
Confident and precise — nothing decorative, nothing that doesn't earn its place. The warmth comes from the palette and typography, not from ornament. Think a beautifully typeset pocket journal, not a wellness brand poster.

Emotional goal: **motivating and clear.** Progress is always visible. The big number tells the whole story at a glance. Goals feel reachable, not punishing.

### Aesthetic Direction
- **Warm minimalism** — not cold Swiss grid, not cozy wellness. The terracotta accent (`#C4593A`) provides life without noise.
- **Editorial typography** — DM Serif Display for display numbers and headers, Courier Prime for all UI labels and data. The monospace/serif pairing is the identity.
- **Palette:** off-white `#FAF8F5`, near-black `#1C1917`, terracotta `#C4593A`, warm grays `#A89E96` / `#EDE8E3` / `#D9D2CB`, light warm bg `#F2EDE8`.
- **Light mode only.** Mobile-first, max 430px (iPhone viewport).

**Anti-references:**
- Generic health apps: no teal, no white + green, no stock salad photos, no corporate wellness gradients
- Clinical/medical: no hospital whites, no dense chart grids, no food-diary-for-doctors energy
- No gamification: no streaks, badges, or leaderboard energy

### Design Principles

1. **One number tells the story.** The most important piece of information — kcal remaining — is always the largest element on screen. Everything else supports it. Never bury the lead.

2. **Warm precision.** Every element is intentional and measured, but the palette and type keep it human. Minimal does not mean cold.

3. **Editorial restraint.** Typography does the heavy lifting. Decorative elements must earn their place. If it doesn't communicate, it doesn't exist.

4. **Self-explaining interactions.** Since the app may be shared with others without a walkthrough, every control should be legible on first sight. No hidden gestures, no unlabeled icons on primary actions.

5. **Feedback that feels satisfying.** Transitions and state changes should feel smooth and purposeful — the flash on new entries, the bar animating — but never flashy or distracting.

---

## Tech Stack
- React 18 + Vite (no CSS framework, all inline styles)
- Lucide React for icons
- Google Fonts: DM Serif Display + Courier Prime (loaded via @import in component)
- OpenRouter API (proxied via Vite/Vercel) for AI food estimation and vision — free models, key is server-side only
- USDA FoodData Central API (proxied via Vite/Vercel) for text food lookup — free key, server-side only (`USDA_FDC_API_KEY`)
- Dexie (IndexedDB) for all persistence (logs keyed by date, food history, profile)
- heic2any — HEIC→JPEG conversion for photos taken on iPhone

---

## Product & UX Decisions

These are settled decisions. Don't relitigate them without a reason.

**Food logging — two paths, one sheet**
- **Text path (primary):** user types a food name → USDA FDC lookup returns up to 5 DB matches → user taps the closest one → confirm with serving stepper. "Generate with AI" button at the bottom of results triggers the AI fallback. If FDC returns nothing, AI fallback fires automatically.
- **Photo path (secondary):** camera icon on the input screen → user takes/picks a photo → vision AI (multimodal model via OpenRouter) identifies every ingredient with quantity → per-item review list → user can edit, remove, or add items → "Add all to log" saves each item as a separate food entry.
- **AI text fallback:** one clarifying question max. Default to a reasonable guess. Returns a single `{ name, calories, protein, carbs, fats, portion }` object → same confirm screen as FDC path.
- "Review before saving" is the pattern for the photo path. Editable, removable per item.

**Distribution**
- Users supply no API key. OpenRouter key is server-side, proxied through Vite. Zero friction, zero cost to user.

**Development guideline**
- When adding new features, always preserve existing components in full. Do not simplify or remove existing UI while adding new UI. Rebuild the whole if needed, but nothing gets dropped.
