# Crazy 8 Ball

A rooftop pool lounge hub (original design, inspired by the genre): walk onto a glowing join pad beside a table (1v1 / 2v2 / 3v3), the table fills with players, and an 8-ball match starts on that table. The hub sits on a skyscraper above a city at golden hour (N = night).

## Repos
- Frontend (this repo): `C:\ThreeJS\Crazy-8-ball\Crazy-8-ball`. It was copied from Bowling Roll; old code is in git `HEAD` (`git show HEAD:src/<file>`).
- Backend: `C:\ThreeJS\Crazy-8-ball\Crazy-8-ball-backend` (Colyseus + MongoDB). **The frontend does not talk to it yet**: other players are simulated bots and saves are localStorage (`ECONOMY.storageKey`).
- Dev server: `.claude/launch.json` in the parent folder, config `crazy-dev` (port 5231, `VITE_DEV_MODE=true`).

## The hub (`src/hub/`)
- `rooftop.js` tower + tiled roof, parapet/glass railing (invisible walls 3.2 m), instanced city with a world-space window shader (lit windows follow `lighting.windows()`), streets, islands.
- `layout.js` everything else on the roof (lounge pavilion with sofas, fire pit, piano and string lights; leaderboard stands; entrance arch with the title sign; elevator; showcase pedestals; cabana; umbrellas; cherry trees, pines, planters, ferns; lantern bollards; night lamps). Static props are baked (`bake.js`). `floorAt(x, z)` = floor height (the lounge deck is raised 0.4 m).
- `props.js` the procedural models (pool table, cue, sofa, piano, trees, ferns, umbrella, lounger, pergola, ...). `paint.js` canvas painters (floor, wood, felt, balls, pad decals, chevrons, flags, boards, sign).
- `tables.js` tables, join pads (decal + rising hologram rings + JOIN arrows), instanced balls, lobby states `open -> waiting -> countdown -> playing (bots) | match (player) -> cooldown`. Bot games are real simulations. `tablesim.js` 2D billiards physics + `pickShot` AI.
- `bots.js` simulated players (wander, join pads, play, aim pose; `fillFor(table)` sends bots to the player's table). `nav.js` grid A* used by bots and the guide.
- `match.js` + `match.css` the player's match: top-down camera (table along the screen's long side, portrait too), aim by pointer/drag, power bar or Space, fine-aim buttons/A-D, simplified 8-ball rules, ball in hand, shot clock, forfeit, rewards (`ECONOMY`, cash only, never premium currency).
- `guide.js` chevron trail to the target pad; `fx.js` petals, pad sparkles, confetti + ring, fire, fireflies; `boards.js` leaderboards (sample data); `hud.js` + `hud.css` DOM HUD (tutorial line, settings, players list, skip tutorial, cash, streak, leave button, name tags, table card, popups).
- `src/audio/` synthesised audio: `core.js`/`synth.js` (from the old game), `sfx.js` (UI, pads, footsteps, cue/ball/rail/pocket sounds), `ambience.js` (wind, city, birds/crickets, fire, chimes, generative lounge piano), `index.js` (`at(x, z)` positional gain/pan).
- Tunables: `ROOF`, `CITY`, `FACADE`, `TABLE`, `TABLE_MODES`, `TABLE_GRID`, `PAD`, `LOBBY`, `BOTS`, `ECONOMY`, `MATCH`, `AUDIO` in `config.js`.

## Base (kept from the template)
Three.js (vanilla, no React) + Vite + Rapier (`@dimforge/rapier3d-compat`, wasm inlined; `main.js` awaits its init at top level, hence `build.target: 'es2022'`). Everything is procedural (canvas textures); the only imported model is the Bloxity base rig `public/avatars/player.glb`. Font: Fredoka (loaded in `index.html`).

- `npm run dev` / `npm run build`. `VITE_DEV_MODE=true` (see `.env.example`) skips the Bloxity SDK/CDN. Deploy: `.github/workflows/deploy.yml` uploads `dist/` to Bloxity Hosting (main = prod, dev = dev channel).
- All Bloxity SDK calls go through `src/bloxity.js` and must never throw (SDK may be blocked).

## Files (`src/`)
- `main.js`: boot order = Bloxity SDK -> renderer -> Rapier -> sea + clouds, lighting, ground slab + colliders, player body -> avatar (async, swaps in when ready) -> loop (physics, interpolate player, avatar animator, camera, sea ripples, lighting, bloom render). `__game` (dev only) exposes `player`, `scene`, `renderer`, `camera`, `postfx`, `bodies`, `toggleMode`, `teleport(x, y, z, facing)` (facing `Math.PI` = north, -Z).
- **Player**: `player.js` kinematic capsule + Rapier `KinematicCharacterController` (autostep, slopes, snap-to-ground, pushes dynamic bodies), own gravity/jump (coyote time + buffer). Feet position is `player.position`; `player.renderPosition` is interpolated for drawing. Falling below `PHYSICS.killY` respawns. `camera.js` third-person chase cam (boom, wheel zoom, wall clearance via `segmentClear`, speed FOV) and first person at the inner zoom end; `modes.js` `character` (avatar visible) / `player` (first person, avatar hidden), V toggles. `input.js` keyboard / mouse / pointer lock into `inputState`; `touch.js` + `touch.css` touch controls.
- `avatar/`: `character.js` (player.glb or procedural fallback), `loader.js` (Bloxity cosmetics + proportions from the CDN, `cdn.js`), `rig.js` + `animator.js` (procedural idle/run/airborne/landing; tunables in `ANIM`).
- **Physics**: `physics.js` Rapier world, fixed 60 Hz step with an accumulator; dynamic meshes bound via `bindMesh`/`addDynamic` are interpolated between ticks. Static geometry uses `addFixed` / `addFixedBoxFor`. `segmentClear` is the camera's ray against static colliders only.
- **Sea + clouds**: `world.js` `createWorld(scene)` (the sea at street level + clouds). `buildGround`/`landColliders` (the old sand slab) are unused.
- **Sky and light**: `lighting.js` sky shader, stars, PMREM environment, shadowed sun following the player, fog, day/night blend (N). `addLamp` and `setMoods(sky)` are unused hooks. `postfx.js` bloom (EffectComposer: HDR half-float render -> UnrealBloomPass -> OutputPass), on for the High/Ultra presets only (`BLOOM`; threshold 2.0 so sunlit surfaces never bloom).
- **Materials and textures**: `textures.js` canvas painters (cracked sand, water ripples, grass/tiles/crates/planks, outlined text, soft dots, sparkles, ...) and `toTexture` / `mulberry32`. `propkit.js` shared prop helpers: `std`, `glow`, `neon(color, k)` (unlit, HDR-bright with bloom; switched by `setNeonBloom`), `put`, `solidBox` / `solidPole` colliders, `label` (outlined text sprite, repainted once Fredoka loads). `bake.js` merges a Group's static meshes to one mesh per material (draw-call saver; unused so far).
- Controls: WASD/arrows, Shift sprint, Space jump, mouse look (click grabs the cursor = pointer lock, Esc releases it, then Esc opens the portal menu), wheel zoom, V mode, N day/night, R respawn. Never bind P (CrazyGames: Boxity's pause menu).
- Graphics: `graphicsPreset(name)` in config resolves the preset; on coarse pointers the default is Medium and every preset is capped by `MOBILE_GRAPHICS_CAP` (DPR 1.5, 1024 shadow map, no bloom), because the Bloxity SDK sends `High` itself.
- Boxity layout (required to publish, docs.bloxity.io Platform UI rules): Boxity draws the menu / pause menu, chat, emotes, avatar editor, invite, leaderboard and sign-in itself in a toolbar in the top-left corner with the chat feed under it, so the game never draws those buttons and keeps any HUD out of those rectangles (`bloxity.onReservedAreas`).

## Mobile & responsive (required for every change)
The game must play on phones and tablets (portrait and landscape) as well as desktop. Treat a feature as unfinished until it works on touch and on a small screen.
- **Input**: every action needs a touch path, not just a key. Use Pointer Events (`pointerdown/move/up`, check `e.pointerType`), never mouse-only events. Layout (implemented in `src/touch.js`): left-thumb virtual joystick -> `inputState.move`, right-side drag -> `inputState.look`, on-screen buttons for jump/sprint/mode/etc., pinch -> `inputState.zoom`. Everything still feeds `inputState` in `src/input.js` so game code stays input-agnostic. Pointer lock does not exist on touch; never rely on it.
- **Detection**: decide touch UI with `matchMedia('(pointer: coarse)')` / `navigator.maxTouchPoints`, not the user agent. Show touch controls only on coarse pointers; a device can have both.
- **Layout/UI**: HUD and menus use relative units (`%`, `vw/vh`, `dvh`, `clamp()`) and flexbox/grid, no fixed pixel layouts. Tap targets >= 44px. Respect notches with `env(safe-area-inset-*)` (viewport already has `viewport-fit=cover`). Text readable at 360px width. No hover-only interactions. Add `touch-action: none` on the canvas and game controls so the browser does not scroll/zoom.
- **Resize/orientation**: anything sized to the screen (camera aspect, renderer, HUD) must react to `resize` (covers orientation changes). Use `visualViewport` where the on-screen keyboard or browser bars matter.
- **Performance**: mobile GPUs are weak. Respect the `graphics_quality` presets in `src/config.js` (cap DPR, shadow map size, draw distance); default to a lower preset on coarse-pointer devices. Avoid per-frame allocations; keep draw calls and texture sizes low.
- **Testing**: check every UI/input change at a phone viewport (e.g. 375x812 and landscape 812x375) with touch emulation, plus desktop, before calling it done.
