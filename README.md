# 🍩 Donut Tycoon

An idle / tap tycoon: tap the donut, hire a café crew, buy upgrades, and open
second cafés that multiply your income forever. It keeps earning while you're
away — offline progress is credited on your return.

Cross-platform (Expo): works on **web** (PWA, offline-first, deployed to
Cloudflare Pages) and **Android** from one codebase. No account, no network,
one save file.

## How it plays

- **Tap the donut** — every tap earns cash. Upgrades can double/triple tap power.
- **Hire generators** — Barista → Donut Fryer → Display Case → Drive-Thru →
  Coffee Roaster → Delivery Van → Second Store → Robo-Barista. Each owned unit
  adds income **per second**, even when the app is closed.
- **Buy upgrades** — one-time ×2/×3 boosts, some gated behind generator counts.
- **Claim milestones** — baked-in goals (taps, earnings, prestiges) pay cash.
- **Prestige ("Open a Second Café")** — reset the shop for **Cream Tokens**
  that grant +10% permanent income each, forever.

## Tech

| Layer | What |
| --- | --- |
| Platform | Expo SDK 54 · React Native · expo-router (single screen) |
| State | Zustand store wrapping a **pure, deterministic engine** (`src/tycoon/engine.ts`) |
| Persistence | localStorage (web) / JSON file via expo-file-system (native) |
| Art | 100% generated vector (react-native-svg) — no binary assets, no emoji-as-art |
| Sound | Tiny WebAudio synth on web, haptics on native — zero audio files |
| Verification | `npm run sim:tycoon` plays the real engine headlessly |

## Scripts

```bash
npm run typecheck       # tsc --noEmit
npm run sim:tycoon      # headless engine regression suite
npm run build:web       # static export → dist/ (for Cloudflare Pages)
npx expo export --platform android
```

## Architecture

```
app/_layout.tsx         providers + global overlays (toasts, celebrations)
app/index.tsx           the whole game screen (tap stage + shop/upgrades/stats)
src/tycoon/
  types.ts data.ts      domain types + balance tables (pure)
  engine.ts             pure simulation: tap/advance/buy/upgrade/prestige/offline
  format.ts             money/duration display (pure)
  save.ts               localStorage / expo-file-system adapter
  store.ts              zustand store (hydrate, actions, debounced persistence)
  ticker.ts             idle loop: 250ms advance, autosave, background flush
  sound.ts              WebAudio synth cues (web), haptics elsewhere
  art/                  DonutIcon + per-generator vector glyphs
  ui/                   TapDonut, ShopPanel, UpgradesPanel, StatsPanel, sheets
src/ui/                 generic design-system primitives + coffee theme tokens
tools/tycoon-sim/       headless engine harness (npm run sim:tycoon)
```

The engine has **no React or platform imports**, so the exact same code runs in
the app and in the Node regression suite.

## Deployment

- **Web:** `npm run build:web`, then ship `dist/` to Cloudflare Pages (or any
  static host). `public/_headers`, `public/_redirects` and `public/sw.js`
  provide cache rules, SPA fallback and offline support.
- **Android:** `npx expo export --platform android` or an EAS build
  (`eas.json` is configured).
