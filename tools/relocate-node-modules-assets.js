/**
 * Metro asset plugin — relocate assets out of `node_modules`-nested paths so
 * Cloudflare Pages serves them.
 *
 * Why this exists
 * ---------------
 * Metro keeps a module's directory when it emits an asset, so anything imported
 * from inside a package ships under a URL like:
 *
 *   /assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.<hash>.wasm
 *   /assets/node_modules/@react-navigation/elements/lib/module/assets/back-icon.<hash>.png
 *
 * Cloudflare Pages does not serve files under a `node_modules` segment in the
 * deployed output. The browser asks for that URL, Cloudflare's SPA fallback
 * (`/* /index.html 200`) answers with the app shell, and:
 *
 *   · the SQLite worker dies with
 *       WebAssembly.instantiate(): expected magic word 00 61 73 6d,
 *       found 3c 21 44 4f …
 *   · images render as broken (the HTML shell in an <img>).
 *
 * The plugin rewrites each affected asset's `httpServerLocation` to the clean,
 * root-level `/assets` directory. Metro uses that field both to emit the file
 * in `dist/` and to build the URL inside the bundle, so the reference and the
 * file always stay in sync:
 *
 *   /assets/wa-sqlite.<hash>.wasm
 *   /assets/back-icon.<hash>.png
 *
 * Name collisions cannot happen: the URL always carries the content hash, so
 * two different files with the same basename get different URLs, and identical
 * files collapse to the same URL, which is fine.
 *
 * Only assets whose path contains `node_modules` are touched. The native
 * (Android) graph does not resolve these URLs for production bundles — native
 * uses resource IDs, not `httpServerLocation` — so this is effectively a web
 * deployment concern.
 */
module.exports = function relocateNodeModulesAssets(assetData) {
  if (
    assetData.httpServerLocation != null &&
    assetData.httpServerLocation.includes('node_modules')
  ) {
    return {
      ...assetData,
      httpServerLocation: '/assets',
    };
  }
  return assetData;
};
