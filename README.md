# NutriTak — Setup & Contribution Guide

## What is this?

NutriTak is an open source AI-powered meal planner. It runs as a Progressive Web App (PWA) — meaning you can install it directly on your iPhone or Android home screen from any browser, with no App Store required.

It uses your own Anthropic API key to power:

- Smart food calorie lookup (just type a food name — no calorie knowledge needed)
- Photo calorie estimation (snap a picture of your meal)
- AI recipe suggestions based on ingredients you have at home

Your data stays entirely on your device. No backend, no account, no subscription.

-----

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- An [Anthropic API key](https://console.anthropic.com/) (free to create, pay-per-use)
- A free [Vercel account](https://vercel.com/) if you want to deploy (optional — local also works)

-----

## Option A — Run locally

```bash
# 1. Clone the repo
git clone https://github.com/CFF/nutritak.git
cd nutritak

# 2. Install dependencies
npm install

# 3. Add your API key
cp .env.example .env
# Open .env and paste your Anthropic API key:
# VITE_ANTHROPIC_API_KEY=sk-ant-...

# 4. Start the app
npm run dev

# 5. Open http://localhost:5173 in your browser
# On iPhone: open the same URL on your local network (http://YOUR_IP:5173)
```

-----

## Option B — Deploy to Vercel (recommended)

This gives you a permanent personal URL you can add to your iPhone home screen.

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/CFF/nutritak)

Then in Vercel:

1. Go to your project → **Settings** → **Environment Variables**
1. Add `VITE_ANTHROPIC_API_KEY` = your Anthropic API key
1. Redeploy

### Manual deploy

```bash
npm install -g vercel
vercel
# Follow prompts — add VITE_ANTHROPIC_API_KEY when asked for env vars
```

-----

## Install on your iPhone (PWA)

1. Open your Vercel URL in **Safari** on iPhone
1. Tap the **Share** button (box with arrow)
1. Tap **“Add to Home Screen”**
1. Tap **Add**

The app will appear on your home screen with its icon, opens full screen, and works like a native app.

-----

## Project Structure

```
nutritak/
├── src/
│   ├── App.jsx              # Root component
│   ├── components/
│   │   ├── Journal.jsx      # Daily meal log
│   │   ├── FoodLookup.jsx   # Smart AI food search
│   │   ├── PhotoLog.jsx     # Camera / photo estimation
│   │   ├── MealSuggestions.jsx  # AI recipe ideas
│   │   └── Settings.jsx     # API key + calorie goal
│   ├── lib/
│   │   └── claude.js        # Anthropic API calls
│   └── main.jsx
├── public/
│   ├── manifest.json        # PWA manifest
│   └── icons/               # App icons (192px, 512px)
├── .env.example
├── vite.config.js           # Includes PWA plugin
├── PRD.md                   # Product Requirements Document
└── README.md                # This file
```

-----

## Environment Variables

|Variable                |Required|Description                                      |
|------------------------|--------|-------------------------------------------------|
|`VITE_ANTHROPIC_API_KEY`|Yes     |Your Anthropic API key from console.anthropic.com|

-----

## Contributing

This project is in active POC development. Contributions welcome.

1. Fork the repo
1. Create a feature branch: `git checkout -b feature/my-feature`
1. Commit your changes: `git commit -m 'Add my feature'`
1. Push and open a Pull Request

Please open an issue first for significant changes so we can discuss direction before you build.

### Current priorities (Phase 1)

- [ ] Smart food lookup via Claude API
- [ ] Photo calorie estimation via Claude Vision
- [ ] PWA manifest + service worker
- [ ] API key settings screen

See `PRD.md` for full product context and roadmap.

-----

## License

MIT — do whatever you want with it.
