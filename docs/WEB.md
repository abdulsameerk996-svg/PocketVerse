# Web, PWA and Cloudflare Pages

PocketVerse runs from one codebase on Android and in a browser. Nothing was
forked: the web build is the same app, with a handful of `.web.ts` files
supplying browser implementations of things a phone does natively.

```bash
npm run build:web     # → dist/
npm run preview:web   # serves dist/ the way Cloudflare Pages will
```

> `npm run web` (the Metro dev server) is for iterating. **`preview:web` is what
> to trust before deploying** — it is the only local server that sends the
> cross-origin isolation headers the database needs.

---

## The one thing that will break the deploy

`expo-sqlite` runs real SQLite in the browser: a Web Worker, a 600 KB
`wa-sqlite.wasm`, and OPFS for storage. It needs the page to be
**cross-origin isolated**, which means two response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them the worker cannot use `SharedArrayBuffer`, the database never
opens, and the app boots straight to its error screen. They are configured in
three places, and all three have to stay in sync:

| Where | File |
|---|---|
| Dev server | `metro.config.js` (`server.enhanceMiddleware`) |
| Production | `public/_headers` → copied to `dist/_headers` |
| Local preview | `tools/preview-web/server.js` |

The cost of `require-corp` is that every cross-origin subresource now needs
CORP/CORS headers. PocketVerse loads none — no CDN, no web fonts, no analytics —
so nothing else is affected. **If you ever add a third-party embed, this is what
will break first.**

Metro also needs `.wasm` registered as an asset extension, which is why
`metro.config.js` pushes it onto `resolver.assetExts`. That line is additive and
platform-agnostic; the Android bundle is unaffected.

---

## Cloudflare Pages settings

| Setting | Value |
|---|---|
| Framework preset | **None** |
| Build command | `npm run build:web` |
| Build output directory | `dist` |
| Root directory | *(repository root)* |
| Node version | 20 or 22 (`NODE_VERSION` environment variable) |

`public/` is copied verbatim into `dist/` by `expo export`, which is how
`_headers`, `_redirects`, `manifest.webmanifest`, `sw.js` and `icons/` reach the
deploy. Nothing needs to be uploaded by hand.

### Deep links

`web.output` is `static`, so the common routes are prerendered to real HTML
(`/play` → `play.html`) and load without JavaScript running first. Dynamic
routes like `/game/penfight` have no file, so `public/_redirects` sends anything
unmatched to the shell and the client router takes it from there:

```
/*    /index.html   200
```

### Sub-path hosting is not supported

The SQLite worker is registered at an absolute path
(`/_expo/static/js/web/worker-*.js`). Deploying under `example.com/pocketverse/`
would 404 that worker and the database would not open. Deploy at a domain or
subdomain root.

---

## What the browser does differently

| Concern | Native | Web |
|---|---|---|
| Storage | SQLite file in app storage | SQLite via wa-sqlite + OPFS — same schema, same migrations, same repositories |
| Audio | silent (no assets yet) | **audible** — cues are synthesised with the Web Audio API, `src/ui/hooks/soundBackend.web.ts` |
| Haptics | expo-haptics | no-ops, already guarded |
| Back button | Android hardware back pauses the run | **Escape** pauses. The browser's Back button is left alone on purpose — see `useBackGuard.web.ts` |
| Save on exit | AppState background | plus `pagehide` / `visibilitychange`, because closing a tab is instant |
| Avatar photo | copied into the document directory | inlined as a `data:` URL — a `blob:` URL would break on reload |
| Layout | full screen | a centred column, max 520px (`MAX_FRAME_WIDTH`) |
| Controls | touch | touch **and** mouse **and** keyboard — WASD in Last Signal, arrows/space in Neon Sprint |
| Splash screen | expo-splash-screen | skipped; the HTML shell paints the background |

### Why the layout is a column

Every size in the app derives from window width against a 390pt reference. On a
1920px desktop that makes `s(18)` resolve to 88px and the whole UI becomes
enormous. `useResponsive` therefore clamps to `MAX_FRAME_WIDTH` on web and
`app/_layout.tsx` renders the app into a matching centred frame, so a game's
arena maths lands inside the box it is actually drawn in.

---

## PWA

- `public/manifest.webmanifest` — standalone display, portrait, shortcuts to
  Play and Quests.
- `public/sw.js` — network-first for navigations (a deploy takes effect
  immediately), cache-first for content-hashed build output. Registered from
  `app/+html.tsx`, and **only on HTTPS, never on localhost**, so the dev server
  is never served a stale shell.
- `public/icons/` — generated, not committed art: `npm run icons` redraws them
  from `tools/icons/generate.js`. Includes a maskable 512 for Android.

Bump `CACHE_VERSION` in `sw.js` when you change the service worker.

### PWABuilder → APK

The manifest is already shaped for it: `id`, `scope`, `start_url`, a maskable
512 icon, and `prefer_related_applications: false`. Point PWABuilder at the
deployed URL once it is live.

Note that a PWABuilder APK and the Expo APK are **different applications** with
different package names and separate save data. The Expo build is the real
Android app; the packaged PWA is a wrapper around this site.

---

## Known web limitations

- **Progress is per-browser, per-origin.** OPFS is origin-scoped, so a phone
  install and a desktop browser are separate save files. There is no account
  system to reconcile them, by design.
- **Clearing site data wipes the save**, the same way uninstalling would.
- **Private/incognito windows** may block OPFS entirely; the app will show its
  boot error rather than silently losing data.
- **iOS Safari** only offers install via Share ▸ Add to Home Screen, and evicts
  storage after ~7 days without a visit.
- Audio starts only after the first tap or keypress — a browser rule, not a bug.
