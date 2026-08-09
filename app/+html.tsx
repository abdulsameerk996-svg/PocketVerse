import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The web HTML shell.
 *
 * Web-only by construction: Expo Router uses this file to build `index.html`
 * and never bundles it for native, so nothing here can affect the Android app.
 *
 * It exists to supply the things a React tree cannot: PWA metadata, the icon
 * set, the service-worker registration, and the handful of CSS rules that stop
 * a browser from treating a game like a document.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        <title>PocketVerse Arcade</title>
        <meta
          name="description"
          content="Two games, one arcade: Donut Tycoon's idle café empire and Neon Rings' bounce-and-launch reflex runs. Offline-first, no account, no network."
        />

        {/* ── PWA ─────────────────────────────────────────────────────── */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#160F0B" />
        <meta name="color-scheme" content="dark" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Donut Tycoon" />
        <meta name="application-name" content="Donut Tycoon" />

        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

        {/* ── Social ──────────────────────────────────────────────────── */}
        <meta property="og:title" content="PocketVerse Arcade" />
        <meta property="og:description" content="Donut Tycoon idle café empire + Neon Rings reflex runs — two games, offline-first." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta name="twitter:card" content="summary" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: RESET }} />
        <script dangerouslySetInnerHTML={{ __html: REGISTER_SW }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * The browser defaults that make a full-screen game feel broken, undone.
 * Deliberately small — anything that belongs to a component belongs in that
 * component's StyleSheet, not here.
 */
const RESET = `
html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
  background-color: #160F0B;
}
body {
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  text-rendering: optimizeLegibility;
}
#root {
  -webkit-user-select: none;
  user-select: none;
}
input, textarea {
  -webkit-user-select: auto;
  user-select: auto;
}
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255,236,214,0.18) transparent;
}
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background-color: rgba(255,236,214,0.18);
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: content-box;
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

const REGISTER_SW = `
(function () {
  if (!('serviceWorker' in navigator)) return;
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (!window.isSecureContext || isLocal) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      /* offline support is an enhancement; never block boot on it */
    });
  });
})();
`;
