# OpenEmpire.io

A singleplayer real-time strategy game about growing an empire from a single
settlement. You feed a population, that population _is_ your army, and you take
ground from AI nations by pushing troops along a front.

It runs entirely in your browser — there is no server, no account, no login.

This is a lean fork of [OpenFront.io](https://openfront.io/), itself a rewrite
of WarFront.io. Credit to <https://github.com/WarFrontIO>.

---

## Before you start

**You need two things:**

|                           |                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Node.js 22 or newer**   | `node -v` to check. Get it from <https://nodejs.org> (the LTS build is fine).                                            |
| **A browser with WebGPU** | **Chrome or Edge** is the safe choice. Safari 18+ (macOS 15+) works. Firefox may not — if the map is black, this is why. |

Nothing else. No database, no Docker, no API keys.

---

## Install and run

Five commands. Copy-paste them one at a time into a terminal.

**1. Get the code**

```bash
git clone https://github.com/StuartFarmer/openempire.io.git
```

**2. Go into the folder**

```bash
cd openempire.io
```

**3. Switch to the playable branch**

```bash
git checkout lean
```

**4. Install the dependencies**

```bash
npm run inst
```

> ⚠️ Use `npm run inst`, **not** `npm install`. It runs `npm ci --ignore-scripts`,
> which installs the exact locked versions and skips some heavy native builds you
> do not need to play. `npm install` can take much longer and may fail.

This takes a minute or two and prints a pile of warnings about vulnerabilities.
That is normal — ignore it.

**5. Start the game**

```bash
npm run dev
```

It will open <http://localhost:9000> in your browser automatically. If it does
not, open that address yourself.

Leave the terminal window open — closing it stops the game. Press `Ctrl+C` in
that terminal when you are done.

---

## Playing

You land on a dark menu with a live game running behind it — that is the actual
simulation, not a video.

1. Type a name (and optionally a 2–5 character clan tag) in the box.
2. Hit **Start Game**.
3. **Click anywhere on land** to plant your settlement. The other nations'
   landing sites are labelled in amber so you can see who you are settling next
   to.
4. The camera flies in, and everything outside your borders darkens.

**Controls**

| Action           | How                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Attack / expand  | **Click** enemy or unclaimed land next to your border                                       |
| Aim a push       | Click **further away** for a narrow spearhead, **close to your border** for a broad advance |
| Look at a nation | **Hover** it — it lights up and a chip shows its name and population                        |
| Pan              | **Drag**                                                                                    |
| Zoom             | **Scroll**                                                                                  |
| Build            | The **Settlement** / **Farmland** buttons at the bottom, then click a tile                  |
| Attack strength  | The **attack %** slider, bottom right                                                       |

**Reading the screen**

- **Bottom left** — details of whatever tile is under your cursor.
- **Bottom centre** — your troops, population, food and territory.
- **Bottom right** — your empire over time. `surplus` is the one to watch: if it
  goes negative you are eating your reserves and your population is about to
  fall. Hover a nation and its numbers ghost onto the same charts so you can see
  whether you are gaining on them.
- **Coloured border during a fight** — green where you are winning, red where
  you are losing, per tile. It shows you _where_ a push is biting.

**Buttons along the top**

`Pause`, `turbo` (fast-forward), `bots` (how many opponents), `restart` (new
game, same map), `stats`, and `climate` (sliders for the world's weather — your
settings are saved between sessions and can be exported as JSON).

You can switch maps and game types with the dropdowns at the top left.

---

## Playing on the same network

If your friends are on the same wifi and you want them to open it on their own
machines:

```bash
npm run dev:host
```

The terminal prints a **Network:** address like `http://192.168.1.42:9000` —
they open that. Each person still plays their own separate game; there is no
multiplayer.

---

## If something goes wrong

**The map is black, or it says "This browser does not expose navigator.gpu"**
Your browser does not have WebGPU. Use Chrome or Edge.

**`Port 9000 is already in use`**
An old copy is still running. Stop it:

```bash
pkill -f vite
```

Then `npm run dev` again.

**`npm run inst` fails, or the game behaves strangely after pulling changes**
Wipe the dependencies and reinstall:

```bash
rm -rf node_modules
npm run inst
```

**`git checkout lean` says the branch does not exist**
Fetch it first:

```bash
git fetch origin lean
git checkout lean
```

**Getting the latest version later**

```bash
git pull
npm run inst
npm run dev
```

---

## For developers

```bash
npm test           # test suite (Vitest)
npm run lint       # ESLint
npm run format     # Prettier
npm run build-prod # production build (static site)
```

Five test files fail on a clean checkout — `InputHandler`, `UserSettings`,
`SoundManager`, and the client `GameView` / `PlayerView` tests. That is a known
pre-existing baseline, not something you broke. Everything else should pass.

`CLAUDE.md` carries the architecture notes, and `openspec/changes/` holds the
design documents behind each rule change.
