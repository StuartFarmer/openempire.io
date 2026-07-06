## 1. Food Resource State

- [ ] 1.1 Add player food state with read/add/remove helpers, using the existing player resource pattern.
- [ ] 1.2 Include food in player view/update data needed by client HUD rendering.
- [ ] 1.3 Add focused tests for food add/remove clamping and serialization/view exposure.

## 2. Food Production

- [ ] 2.1 Add configurable `foodPerOwnedTilePerTick` and `neutralFoodCostScale` defaults.
- [ ] 2.2 Apply per-tick food production from owned tile count during active gameplay.
- [ ] 2.3 Add a focused simulation test proving owned tiles produce food and zero owned tiles produce none.

## 3. Neutral Expansion Cost

- [ ] 3.1 Add a config helper that maps existing Terra Nullius terrain attack loss to food cost.
- [ ] 3.2 Change Terra Nullius tile capture to charge food instead of reducing player troop reserves for neutral expansion.
- [ ] 3.3 Stop the active neutral expansion attack when the next tile cost cannot be paid.
- [ ] 3.4 Add tests for plains/highland/mountain food costs and insufficient-food stopping.

## 4. Combat Compatibility

- [ ] 4.1 Keep player-vs-player attacks on the existing troop-spend and troop-loss path.
- [ ] 4.2 Add a regression test proving player-vs-player attacks do not charge food in this change.

## 5. HUD Integration

- [ ] 5.1 Display current food and food income in the normal in-game HUD.
- [ ] 5.2 Update food display when production or neutral expansion spending changes food.
- [ ] 5.3 Keep existing troop and gold display behavior intact.

## 6. Playtest Verification

- [ ] 6.1 Start the dev server and launch a normal solo game.
- [ ] 6.2 Verify food increases from owned land, neutral expansion spends food, and expansion stops when food is insufficient.
- [ ] 6.3 Verify attacking another player still uses troop combat behavior.
