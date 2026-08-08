const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/**
 * `expo-sqlite` runs real SQLite in the browser: its web worker imports a
 * 600 KB `wa-sqlite.wasm`, which Metro will not resolve unless `.wasm` is a
 * known asset extension. Without this the web bundle fails outright with
 * "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm".
 *
 * This is additive and platform-agnostic: nothing in the native graph imports a
 * `.wasm` file, so the Android bundle is byte-for-byte unaffected.
 */
config.resolver.assetExts.push('wasm');

/**
 * Assets imported from inside packages ship under `node_modules`-nested URLs
 * (e.g. `/assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.<hash>.wasm`),
 * which Cloudflare Pages does not serve — the SPA fallback answers with the
 * HTML shell, killing the SQLite worker with a WebAssembly magic-word error
 * and breaking images. `tools/relocate-node-modules-assets.js` moves such
 * assets to the root-level `/assets/` directory and keeps every bundle
 * reference in sync (see that file for the full reasoning).
 */
config.transformer = config.transformer ?? {};
config.transformer.assetPlugins = [
  ...(config.transformer.assetPlugins ?? []),
  require.resolve('./tools/relocate-node-modules-assets.js'),
];

/**
 * The same SQLite worker uses `SharedArrayBuffer` on its synchronous code path,
 * which browsers only expose to cross-origin-isolated documents. The dev server
 * has to send the isolation headers or the database fails to open on web.
 *
 * Production is hosted by Cloudflare Pages, which does not read this file — the
 * matching headers live in `public/_headers` and ship in `dist/`. If web saves
 * ever stop persisting after a deploy, check that file first.
 */
config.server = config.server ?? {};
const previousEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = previousEnhance ? previousEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return base(req, res, next);
  };
};

module.exports = config;
