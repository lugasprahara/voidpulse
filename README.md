# voidpulse

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/lugasprahara/voidpulse/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/lugasprahara/voidpulse/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

VOIDPULSE is an original neon twin-stick arena shooter in vanilla JS: you fly a lone dart through an escalating swarm, and every few seconds a gravity rift tears the arena open — feed it your bullets and the enemies it swallows until it goes nova and clears the screen, or watch it eat your pickups and die hungry. Every fifth wave, the Dread Star comes.

## Run it

```sh
node serve.ts            # then open http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=aes5np1n&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

## The game

The swarm pours in from the dark in waves — weaving darts, telegraphed
chargers, splitters, orbiting gunners, armoured brutes. You aim with the
mouse and fire yourself; nothing shoots for you. The twist is the rifts:
gravity wells that drag enemies, pickups, your own bullets and even your
ship toward a swallowing core. A rift is a weapon if you work it — every
bullet you bend into it and every enemy it eats charges it, and at full
charge it detonates in a screen-clearing nova. Ignore it and it eats the
cores you were saving and collapses for nothing. Every fifth wave the
Dread Star arrives: a rotating fortress that fires radial rings, summons
weavers and charges across the arena behind a telegraphed lane.

## How to play

- **Fly:** WASD or the arrow keys. **Aim:** mouse. **Fire:** hold left
  click or `Space`.
- **Dash:** `Shift` or right-click — a burst of speed with invulnerable
  frames; it is also the reliable way out of a rift's pull.
- **Rifts:** shoot the core and let it swallow enemies to charge it. At
  100% it goes nova: huge damage to everything near it, bonus score per
  kill. Rifts also bend your bullets — use the curve.
- **Pickups:** cores (score, magnetised), hearts (hull), Overdrive
  (double fire rate for 8 s), Aegis (a shield that swallows one hit).
- **Combo:** kills chain into a multiplier up to ×9; letting the chain
  timer lapse resets it.
- **Pause:** `Esc` / `P`. **Mute:** `M`. **Restart after death:** `R` or
  click. Your best score is remembered.

## Hand it in

`main.ts` is the entry program: it copies `game/` and `screenshots/` to
the output directory and writes `dossier.json` with the vendored make.fun
library (`vendor/makefun-game.ts`, the kit's copy, unchanged).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — the page and its styling.
- `game/src/main.js` — state machine, wave director, collisions, score.
- `game/src/entities.js` — player, the five enemy behaviours, the boss,
  rifts, bullets, pickups, particles.
- `game/src/render.js` — canvas drawing: world, juice, HUD, screens.
- `game/src/audio.js` — synthesized WebAudio effects and the music loop.
- `game/src/input.js` — keyboard and mouse, polled per frame.
- `game/src/shots.js` — deterministic screenshot poses
  (`?shot=title|action|boss|over&seed=N`).
- `game/src/config.js` — palette and balance tuning.
- `game/src/random.js` — seeded RNG (mulberry32).

Screenshots in `screenshots/` are real renders of the game, captured from
the poses named in `shots.json`.

## License

MIT — see `LICENSE`.
