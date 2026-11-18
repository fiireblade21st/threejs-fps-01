# EMBER YARD — a three.js tactical FPS

A round-based tactical first-person shooter for the make.fun `threejs-fps-01` bounty.
Single-player against bots, in a desktop browser, from static files — no build step,
no network.

## The game

Two teams, 4v4. **Ember** attacks, **Wardens** defend. Short rounds, first to 5 wins
the match. Ember wins a round by eliminating the Wardens or by planting the charge at
site A (Furnace) or B (Depot) and defending it until it detonates. Wardens win by
elimination, by holding the sites until the timer expires, or by defusing a planted
charge.

- **Economy:** $800 to start, $300 a kill, $3,250 a round win, $1,900 a loss. Press
  **B** in the buy phase to buy the Rasp-9 SMG ($1,500), Kestrel VK rifle ($2,700),
  Longshot DMR ($4,750), frag grenades ($300) and flash grenades ($200).
- **Gunplay:** hitscan with headshot damage, recoil and spread that punish firing on
  the move, crouching, jumping and collision with the map.
- **Bots:** follow a waypoint graph through the lanes, hold sites, rotate to gunfire
  and to the plant, strafe while firing, and plant or defuse the charge.
- **Map:** an original foundry yard at dusk — three lanes, a furnace hall with two
  doorways, a catwalk, a raised depot platform, containers, crates and pipes.
- **Sound:** synthesised with WebAudio. **Textures:** drawn on canvas at load time.

## Controls

WASD move · Mouse look · Click fire · R reload · Ctrl crouch · Space jump ·
B buy menu · 1–5 buy · G frag grenade · F flash grenade · E plant/defuse ·
Right-click scope (Longshot) · Click the overlay to play (pointer lock).

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Screenshots are deterministic captures: `?shot=start|play|plant|end&seed=1` renders a
frozen frame and sets `window.__shotReady`.

## Entry

`node main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json` with the vendored `vendor/makefun-threejs.ts`
library. Outside the grader, `MAKEFUN_OUTPUT_DIR=out node main.ts`.
