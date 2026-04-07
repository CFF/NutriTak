# Product PRD

> This is the root reference document. All feature PRDs are derived from it.

## Overview

NutriTak is a personal meal tracking web app that helps users log daily food intake, track calories against a personalized daily goal, and get AI-generated calorie estimates from text or photos. It is built for someone who has a professional calorie target but no time for research — the app does the estimation, the user confirms and moves on. Distributed as open source, self-hostable, zero cost to the end user.

## Problem

People who start exercising and receive a daily calorie target consistently hit three friction points:

1. **Quantification** — "I had some bread and butter, but I have no idea what that is in calories."
2. **Unknown foods** — "I know I like hazelnuts, but I have no idea how many calories they are."
3. **Meal planning** — "I have random ingredients in my fridge but no idea what to make that fits my goal."

Existing apps (MyFitnessPal, Cronometer, Lose It) solve these with barcode scanners, massive food databases, and subscription upsells. That complexity kills the habit before it starts. NutriTak bets on AI estimation to make logging feel effortless, not clinical.

## Target users

**Primary user (v1):** Someone who recently started working out, received a personalized calorie maintenance number from a professional, eats real varied food (not meal-prepped, not from a database), and wants a lightweight daily companion — not another fitness app with a premium tier.

**Primary instance:** Built and used by Claire (maintenance floor: 1,300 kcal / daily goal: 1,900 kcal). May be shared with a small number of trusted others. No onboarding, no tutorial — the interface must explain itself on first sight.

## Jobs to be done

- When I eat something, I want to log it in under 30 seconds without knowing the calorie count, so I can stay on track without stopping to research.
- When I take a photo of my meal, I want each item identified and estimated, so I can review, adjust, and add everything at once.
- When I check in on my day, I want to see at a glance how many calories I have left, so I can make smart food choices without doing math.
- When I log a food the AI estimated well, I want to save it so I never have to estimate it again.
- When I open the app, I want to see today's progress immediately, so I stay aware without extra steps.

## Goals & success metrics

| Goal | Metric | Target |
|------|--------|--------|
| Fast logging | Time to log a single meal item | Under 30 seconds |
| No estimation burden | % of logs where user must know kcal in advance | 0% |
| Zero cost to user | Cost of AI features to end user | $0 |
| Lightweight feel | Absence of subscription prompts, onboarding flows, gamification | 0 of those things |
| Data durability | Data lost on browser clear | 0 (IndexedDB persists; export is backlog) |

## Constraints

- **Platform:** PWA only. No App Store, no native build. Revisit Expo only if PWA hits a hard wall on HealthKit, background notifications, or camera API.
- **Cost:** Zero cost to end user. AI powered by OpenRouter free tier (`openrouter/free`); API key is server-side only, never sent to the browser.
- **Data:** No backend, no user accounts. All data stored locally in IndexedDB via Dexie.
- **Distribution:** Open source under MIT license. Self-hostable: clone repo, add OpenRouter key, deploy.
- **Viewport:** Mobile-first, max 430px (iPhone). Light mode only.
- **AI behavior:** One clarifying question max before committing to an estimate. Default to a reasonable guess rather than refusing.

## MVP scope

All of the following are shipped as of v1.3:

- Daily food journal — flat chronological list, inline edit and delete, persisted in IndexedDB keyed by date
- AI food lookup — text input, one clarifying question max, confirm screen with serving stepper (×0.5 increments)
- Photo calorie estimation — upload or camera, HEIC converted to JPEG, image resized to 800px, AI returns per-item list, user reviews and edits before adding
- Dual-target calorie bar — maintenance floor (amber) + daily goal (green) on one track; hero number = kcal remaining
- Calorie profile — editable floor and goal, floor must be less than goal
- Food history and quick chips — foods logged 2+ times surface as chip shortcuts with quantity multiplier
- Past days — calendar view with total kcal and mini bar per day, expandable to per-entry view

## Out of scope

- Native iOS or Android app (revisit only if PWA hits a hard wall)
- Barcode scanning
- USDA or Open Food Facts cross-reference for AI estimates (open question, not committed)
- Multiple calorie modes (cut / maintain / bulk) (open question, not committed)
- PWA manifest and service worker (installable shell, offline caching) — backlog
- AI meal suggestions from fridge ingredients — backlog
- Push notifications — depends on service worker
- HealthKit sync — depends on native revisit
- Social features, leaderboards, gamification, streaks

## Feature registry

| Feature | File | Status |
|---------|------|--------|
| Save as Favorite | [prd-favorites.md](prd-favorites.md) | Ready to build |
