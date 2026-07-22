# Proposal: front-line-troops

## Why

An attack's strength is a single number, so **force has no location**. The
player's report:

> when i am being attacked, i just click ANYWHERE on the front and the entire
> push is addressed instead of exactly where i apply force

That is literally what the code does. `AttackExecution.init()` resolves opposing
attacks with two scalars subtracting:

```js
for (const incoming of this._owner.incomingAttacks()) {
  if (incoming.attacker() === this.target) {
    if (incoming.troops() > this.attack.troops()) {
      incoming.setTroops(incoming.troops() - this.attack.troops());
      this.attack.delete(); ...
    } else {
      this.attack.setTroops(this.attack.troops() - incoming.troops());
      incoming.delete();
    }
```

No tiles are consulted. A counter-attack launched 400 tiles away deletes a push
grinding into the opposite border, instantly and at zero cost.

**The input side already does the right thing and the sim discards it.**
`ShellSim.worker.ts` computes `borderSegment(...)` from the click and ships it as
`sourceTiles`; `AttackExecution` uses it to choose _where to advance_ — then does
the global annihilation above regardless. The player aims, and the aim is thrown
away.

The same missing locality is why spreading beats concentrating. Advance rate is
`≈ 0.45 · attack.borderSize()` — proportional to front width — while cost per
tile is independent of width. A 200-tile front takes ground ~100× faster than a
2-tile spearhead for identical troops-per-tile, so the concentrated push is
strictly the worse move.

## What Changes

- **An attack's troops become a per-tile field over its front** instead of one
  number. `attack.troops()` keeps returning the sum, so every existing reader
  (HUD, AI, stats, retreat, boats) keeps working.
- **Committed troops land on the stretch you clicked.** `borderSegment()` already
  maps cursor distance to breadth — near the border a wide front, deep in enemy
  territory a narrow spearhead. Those troops are distributed across that
  stretch's frontier and nowhere else.
- **BREAKING: opposing attacks resolve locally, not globally.** The scalar
  annihilation is deleted. Two opposing pushes interact only where their fronts
  are physically adjacent, tile by tile. Countering at one end of a border does
  nothing to a push at the other end.
- **Advance is paid for locally.** Taking a tile draws troops from the force at
  that tile, not from a global pool, so a stretch that runs out of troops stalls
  while the rest of the front keeps moving.
- **Troops seep along the front** a bounded amount per tick, so a breakthrough
  can be reinforced and an army is not perfectly rigid.
- **The AI commits to segments too**, rather than smearing its whole force along
  its entire border.

## Capabilities

### New Capabilities

- `front-line-troops`: the per-tile troop field on an attack — how a commitment
  is distributed across the clicked segment, how advance spends the local force,
  how troops seep along the front, and how two opposing fronts clash locally.

### Modified Capabilities

- `openfront-conquest-game`: attacker loss and advance speed read the force
  local to the tile being taken rather than the attack's global total.

## Impact

- **Core sim:** `AttackImpl` (the field replaces `_troops`), `AttackExecution`
  (seeding, local spend, seep, local clash), `Config.attackLogic` /
  `attackTilesPerTick` (local inputs), `AiAttackBehavior` (segment selection).
- **Determinism:** the field is integer and updated in a fixed tile order.
- **Client:** none required. `attack.troops()` is unchanged as a sum, so the HUD
  and front labels keep working.
- **Tests:** mandatory (`src/core`). Must cover: countering at one end leaves the
  far end untouched; concentration outperforms an equal force spread thin;
  a stretch that exhausts its troops stalls while the rest advances.
- **Prior art:** `src/client/lab/systems/conquest/lib/conquest.wesl` already
  implements per-tile `troops` with `defenseOf` / `attackerLoss` / `conquers`
  and a hysteresis margin against front oscillation. Port that shape rather than
  inventing one.
