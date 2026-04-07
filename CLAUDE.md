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
- OpenRouter API (proxied via Vite) for AI food estimation — free models, no cost to user, key is server-side only
- Dexie (IndexedDB) for all persistence (logs keyed by date, food history, profile)

---

## Product & UX Decisions

These are settled decisions. Don't relitigate them without a reason.

**AI estimation flow**
- AI picks a default calorie estimate; user confirms or edits. Not a form.
- One clarifying question max before committing to an estimate. Default to a reasonable guess.
- Photo estimation returns a per-item list. User reviews, edits individual values, removes items, then adds. Confidence shown as a tip (not a percentage). "Review before saving" is the pattern.

**Distribution**
- Users supply no API key. OpenRouter key is server-side, proxied through Vite. Zero friction, zero cost to user.

**Development guideline**
- When adding new features, always preserve existing components in full. Do not simplify or remove existing UI while adding new UI. Rebuild the whole if needed, but nothing gets dropped.
