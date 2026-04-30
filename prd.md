# Product Requirements Document
## NutriTak — AI-Powered Meal Planner

**Version:** 1.3  
**Date:** April 29, 2026  
**Status:** Active  
**Author:** Claire

---

## Version history

| Version | Date | Decision |
|---|---|---|
| 1.3 | April 29, 2026 | Dual-path food logging: text → USDA FDC lookup (primary) + AI fallback; photo → vision AI per-item breakdown. Replaces AI-only text estimation. |
| 1.2 | March 14, 2026 | Initial published version. |

---

## 1. Overview

NutriTak is a personal meal planning web app that helps users log daily food intake, track calories against a personalized daily goal, and get AI-generated recipe suggestions based on ingredients they already have at home.

The app is designed for people who have recently started a fitness journey and received a calorie maintenance target from a professional assessment — where the challenge isn't motivation, it's the daily friction of translating real food into numbers.

---

## 2. Problem Statement

People who start exercising and receive a daily calorie target consistently hit three friction points:

1. **Quantification** — "I had some bread and butter, but I have no idea what that is in calories."
2. **Unknown foods** — "I know I like hazelnuts, but I have no idea how many calories they are."
3. **Meal planning** — "I have random ingredients in my fridge but no idea what to make that fits my goal."

Existing apps (MyFitnessPal, Cronometer, Lose It) solve these with barcode scanners, massive food databases, and subscription upsells — all of which add complexity and onboarding friction that kills the habit before it starts. NutriTak bets on AI to make estimation feel effortless, not clinical.

---

## 3. Goals

- Make daily calorie logging take under 30 seconds per meal
- Let users log food they actually eat, not just food they can look up
- Eliminate the need to know calorie counts in advance — the app figures it out
- Stay simple enough to feel like a personal tool, not a fitness product
- Ship as a PWA so it's installable on any phone, no App Store required
- Distribute as open source so anyone can self-host with their own API key

---

## 4. Target User

**Primary user (v1):** Someone who just started working out, has received a personalized calorie maintenance number from a professional, eats real varied food (not meal-prepped, not from a database), and wants a lightweight daily companion — not another fitness app with a premium tier.

---

## 5. Platform Decisions

### 5.1 Progressive Web App (PWA) — primary platform

**Decision:** Build and ship NutriTak as a Progressive Web App. This is the definitive platform choice for v1 and the foreseeable future.

**What a PWA means in practice:**
- The app runs in the browser like any website
- On iPhone, users visit the URL → tap Share → "Add to Home Screen" → the app installs with a custom icon, no browser chrome, full screen — indistinguishable from a native app in daily use
- On Android, Chrome offers an automatic "Install" prompt
- Works offline for core features (journal, preset foods) via a service worker cache
- No App Store, no review process, no $99/year Apple Developer enrollment
- Updates ship instantly — no user action required

**Why this is the right call:**
The core product question — *does this app actually help users eat better* — can be fully answered through a PWA. The experience on the home screen is native-quality. Distribution is frictionless: share a URL, it's installed. For an open source personal tool, this is strictly better than the App Store for early distribution.

**What was considered and rejected:**

| Option | Why rejected |
|---|---|
| React Native via Expo | Premature. Requires Apple Developer Program ($99/yr), Xcode, App Store review cycles, and a full component migration. Adds weeks of overhead without answering any product question faster. The right trigger to revisit is if a hard native capability (e.g. HealthKit sync, background processing) becomes a genuine requirement. |
| Capacitor (web-to-native wrapper) | Fastest path to the App Store, but produces a less polished result and adds a build layer without solving any real user problem. PWA achieves the same "installed on home screen" outcome without the App Store dependency. |
| Native-only | No justification at this stage. |

**Future trigger to reconsider native:** If the validated PWA hits a hard wall — e.g. HealthKit integration for automatic calorie sync, background notifications, or a camera API limitation — we revisit Expo at that point. Not before.

### 5.2 Open Source Distribution

**Decision:** Publish the repo publicly on GitHub under an MIT license.

**Rationale:** NutriTak requires users to supply their own Anthropic API key to power AI features. This makes a traditional SaaS model impractical without a backend and billing system — both out of scope for the POC. A public repo with clear setup instructions is the natural distribution model: clone, add your API key, deploy.

**How distribution works in practice:**

---

## Feature registry

### Active
- [Favorites / quick-add foods](prd-favorites.md)
- [Logging flow](prd-logging-flow.md)

### Draft
- [Calorie milestone celebration](prd-calorie-milestone-celebration.md)
- [Onboarding flow](prd-onboarding.md)

