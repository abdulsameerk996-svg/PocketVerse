# Registry validation

```bash
npm run sim:registry
```

Guards the game-module contract. The module graph cannot load in plain Node
(`react-native` is a Metro-only module), so the suite is split:

- the **pure** parts are compiled and `require`d for real — the sprite engine
  (`GAME_THUMBS`) and the registry contract (`CATEGORY_LABEL`) — doubling as the
  usual coupling guard;
- the **module list + metadata** are read from the same source files the app
  boots from (`src/games/index.ts` registration array, then each module's
  `export const …Module` object), so a game that drifts off the contract fails
  here instead of on a device.

## What it checks

- every registered module has an import mapping and a module file
- every module declares `id`, `title` and `tagline` metadata
- no duplicate game ids
- every category is one of the registry's `GameCategory` values
- every registered game has its own explicit entry in `GAME_THUMBS` — a
  missing entry (which would silently fall back to the shared `joystick`
  glyph) is a failure; an explicitly chosen `joystick` (The Arcade) is fine
- no orphan logos (a `GAME_THUMBS` entry whose game is not registered)
- no two games share the same logo motif
- the game host route (`app/game/[id].tsx`) exists

Add a game and this suite runs over it for free: missing art or metadata is a
red `FAIL` the moment the new module is registered.
