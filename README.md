# Combat Recorder v3

A standalone RuneLite plugin that records client-visible gameplay and 3D scene data to local JSONL files. Submitted for Plugin Hub review; not approved or endorsed by RuneLite or Jagex.

## Recorder

Enable the plugin and use its sidebar to start/stop recording, change sampling FPS, or add a marker. Recording stops on logout. Copy recordings path copies the location of the plugin's `recordings` directory to your clipboard. Files are stored under RuneLite's per-plugin directory, not a launcher-specific location. The plugin is enabled on installation; recording remains off until you click Record.

Captured data includes visible players/NPCs, names and appearance, positions, model poses, animation/effect/projectile changes, hitsplats/health ratios, overhead text, local inventory/equipment/prayer state, visible ground items and scene/object changes. Chatbox messages, account credentials and session tokens are not recorded. Do not publish a recording unless you intend to share its contents. Recordings may be very large and sampling can affect client performance.

No data is transmitted. There is no local HTTP server, external process execution, game automation, live advice, cache scanning, or modification of other plugins in the Java plugin. Runtime serialization uses RuneLite's injected Gson and output uses Filepath.

## Playback

`viewer/` contains the separate browser viewer source, based on dennisdev/rs-map-viewer (the renderer behind osrs.world). It is not loaded or executed by the RuneLite plugin and is not part of the plugin jar. The plugin's viewer button opens its source/setup page through RuneLite's LinkBrowser.

The viewer supports free/follow/tile-orbit cameras, gameplay-state panels, camera keyframes, pauses and slow motion. It replays recorded events and does not accept gameplay input or predict future events. See [viewer setup](viewer/README.md). The Java plugin currently does not provide a one-click integrated viewer; acceptance of that architecture needs a separate review.

## Build and test

Java 11:

```sh
./gradlew check jar
./gradlew run
```

On Windows use `gradlew.bat`. The local build targets `latest.release`. Hub submissions use the standard Java build. Tests use temporary files only; no personal recording is included.

## Review questions

This is an initial recorder-only submission for explicit review of the retrospective 3D recording/playback use case. We understand the restriction on content simulation may be relevant and ask maintainers to decide whether this read-only replay qualifies. We also disclose capture of other visible players and overhead text; it is stored locally, not crowdsourced or exposed over HTTP.

No claim is made that the current project has passed RuneLite review. The external browser viewer is included as source for transparency, not as an attempt to bypass review restrictions.

## Licensing

Recorder/replay-specific source: BSD-2-Clause. Upstream renderer: its BSD license in `viewer/engine/LICENSE`, provenance in `viewer/engine/UPSTREAM.md`. Game-derived visual assets remain the property of Jagex; no game cache or personal recording is distributed here. See `THIRD_PARTY.md`.
