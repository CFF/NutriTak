# NutriTak

An open source AI-powered meal planner. Runs as a Progressive Web App — install it on your iPhone or Android home screen from any browser, no App Store required.

Log what you eat, track calories against a personal daily goal, and get calorie estimates from text or photos using AI. Your data stays entirely on your device.

---

## How it works

NutriTak uses [OpenRouter](https://openrouter.ai) to route AI requests to free models — no cost to the user, no API key required from the user. The app owner provides a single OpenRouter key in the server config. Meal logs, food history, and your calorie profile are all stored locally in IndexedDB (via Dexie), never sent to a server.

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- A free [OpenRouter account](https://openrouter.ai/) and API key

---

## Run locally

```bash
# 1. Clone the repo
git clone https://github.com/CFF/nutritak.git
cd nutritak

# 2. Install dependencies
npm install

# 3. Add your OpenRouter API key
cp .env.local.example .env.local
# Open .env.local and set:
# OPENROUTER_API_KEY=sk-or-...

# 4. Start the app
npm run dev

# 5. Open http://localhost:5173
# On iPhone: open http://YOUR_IP:5173 in Safari
```

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
# When prompted, add OPENROUTER_API_KEY as an environment variable
```

After deploying, open the URL in Safari on iPhone → Share → Add to Home Screen.

---

## Project structure

```
nutritak/
├── src/
│   ├── App.jsx          # All UI components and app logic
│   ├── main.jsx         # React entry point
│   └── lib/
│       ├── db.js        # Dexie (IndexedDB) schema
│       └── storage.js   # Async read/write helpers for logs, profile, history
├── index.html
├── vite.config.js       # Dev server + OpenRouter proxy
├── .env.local           # OPENROUTER_API_KEY (never committed)
├── CLAUDE.md            # Design system reference
└── README.md
```

---

## Environment variables

| Variable            | Required | Description                           |
|---------------------|----------|---------------------------------------|
| `OPENROUTER_API_KEY` | Yes     | Your key from openrouter.ai — injected server-side, never sent to the browser |

---

## What's built

- Daily calorie journal — log food by name or photo
- AI calorie estimation via text (type any food, get an estimate)
- AI calorie estimation via photo (upload or take a picture, review per-item estimates)
- Dual-target progress bar — maintenance floor + daily goal
- Food history — frequently logged foods surface as quick chips
- Past days — browse previous days' logs with totals
- Calorie profile screen — set your maintenance floor and daily goal

---

## Backlog

Features planned but not yet built, in rough priority order:

- **PWA manifest + service worker** — makes the app installable on iOS/Android home screen and enables offline support
- **AI meal suggestions** — user enters available ingredients, app suggests recipes scoped to remaining calorie budget
- **Multiple calorie modes** — support for cut / maintain / bulk targets in addition to the current floor + goal model
- **Cross-reference food database** — optionally validate AI estimates against USDA or Open Food Facts for higher accuracy
- **Push notifications** — reminders to log meals (requires PWA service worker first)
- **HealthKit sync** — auto-import activity data from Apple Health (would require native app; revisit only if PWA hits a hard wall)

---

## Contributing

This project is in active development. Contributions welcome.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes and open a Pull Request

Open an issue first for anything significant so we can align before you build.

---

## License

MIT — do whatever you want with it.
