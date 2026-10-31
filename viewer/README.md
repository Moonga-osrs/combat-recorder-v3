# Browser replay viewer (separate from the RuneLite plugin)

This source is not packaged in the plugin jar. There is no hosted public viewer and the plugin does not start this server.

With Node.js installed:

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8793 and select a recording. The file is read by the browser and never uploaded. The development server binds to loopback and serves only viewer files and explicitly named world-cache assets; it does not serve recordings.

## World cache

Set `MOONGA_CACHE_DIR` to a compatible, decrypted cache directory containing `main_file_cache.dat2`, indexes, and `world-cache.json`. The default development location is the current user's local Moonga world-cache/2752 directory. No cache is included or downloaded automatically.

**Direct import of RuneLite's live cache is not implemented.** An installed RuneLite alone is not sufficient to supply the current viewer's expected cache metadata/decryption. Missing or mismatched cache data may prevent playback. Long-term compatibility after game updates is not guaranteed.

Upstream renderer source and its license are retained under `engine/`. Product source text is English. The local development environment additionally has fonts and game-derived UI images under public/assets; these are attributed to Jagex, not relicensed as our original artwork.
