// Shared CPU constants: action none=0, spawn=1, city=2, farm=3, raze=4;
// result none=0, accepted=1, unaffordable=2, notOwned=3, impassable=4,
// wrongType=5, overflow=6, invalid=7.
struct ActionDecision {
  result: u32,
  costFx: u32,
  nextCityLevel: u32,
  nextFarmLevel: u32,
  clearsTile: u32,
}

fn gompertz(stock: f32, capacity: f32, rate: f32) -> f32 {
  if (capacity <= 0.0 || stock <= 0.0) { return 0.0; }
  let safe = min(stock, capacity);
  return min(capacity, safe + rate * safe * log(capacity / safe));
}

fn toFx(value: f32) -> u32 {
  return u32(max(0.0, round(value * 256.0)));
}

fn toUiFx(value: f32) -> u32 {
  let scaled = round(max(0.0, value) * 256.0);
  if (scaled >= 4294967040.0) { return 0xffffffffu; }
  return u32(scaled);
}

fn affordable(totalFood: f32, costFx: u32) -> bool {
  return totalFood >= f32(costFx) / 256.0;
}

fn attackCommit(requested: f32, totalPeople: f32, availableFood: f32,
                costPerPerson: f32) -> f32 {
  if (requested <= 0.0 || totalPeople <= 0.0 || costPerPerson <= 0.0) {
    return clamp(requested, 0.0, 1.0);
  }
  return min(clamp(requested, 0.0, 1.0),
    availableFood / (totalPeople * costPerPerson));
}

fn decision(result: u32, costFx: u32, city: u32, farm: u32,
            clears: u32) -> ActionDecision {
  return ActionDecision(result, costFx, city, farm, clears);
}

fn decideAction(
  player: u32,
  actionKind: u32,
  actionTile: u32,
  actionTick: u32,
  tick: u32,
  validTile: bool,
  land: f32,
  owner: u32,
  cityLevel: u32,
  farmLevel: u32,
  hasLandNeighbor: bool,
  tilesOwned: f32,
  totalFood: f32,
  cityCapacityPerLevel: f32,
  farmCapacityPerLevel: f32,
  cityLevelCost: f32,
  farmLevelCost: f32,
  razeCost: f32,
) -> ActionDecision {
  let unchanged = decision(0u, 0u, cityLevel, farmLevel, 0u);
  if (actionTick != tick || actionKind == 0u) { return unchanged; }
  if (!validTile || actionTile == 0xffffffffu) {
    return decision(7u, 0u, cityLevel, farmLevel, 0u);
  }
  if (land == 0.0) {
    return decision(4u, 0u, cityLevel, farmLevel, 0u);
  }

  if (actionKind == 1u) {
    if (tilesOwned != 0.0 || owner != 0u) {
      return decision(7u, 0u, cityLevel, farmLevel, 0u);
    }
    if (!hasLandNeighbor) {
      return decision(7u, 0u, cityLevel, farmLevel, 0u);
    }
    return decision(1u, 0u, 1u, 0u, 0u);
  }

  if (actionKind == 2u || actionKind == 3u) {
    if (owner != player) {
      return decision(3u, 0u, cityLevel, farmLevel, 0u);
    }
    let current = select(farmLevel, cityLevel, actionKind == 2u);
    let opposite = select(cityLevel, farmLevel, actionKind == 2u);
    if (opposite != 0u) {
      return decision(5u, 0u, cityLevel, farmLevel, 0u);
    }
    if (current == 0xffffffffu) {
      return decision(6u, 0u, cityLevel, farmLevel, 0u);
    }
    let next = current + 1u;
    let perLevel = select(farmCapacityPerLevel, cityCapacityPerLevel,
      actionKind == 2u);
    let capacity = f32(next) * perLevel;
    if (!(capacity > 0.0 && capacity <= 3.402823e38)) {
      return decision(6u, 0u, cityLevel, farmLevel, 0u);
    }
    let cost = toFx(select(farmLevelCost, cityLevelCost, actionKind == 2u));
    if (!affordable(totalFood, cost)) {
      return decision(2u, 0u, cityLevel, farmLevel, 0u);
    }
    if (actionKind == 2u) {
      return decision(1u, cost, next, 0u, 0u);
    }
    return decision(1u, cost, 0u, next, 0u);
  }

  if (actionKind == 4u) {
    if (owner == 0u && cityLevel == 0u && farmLevel == 0u) {
      return decision(5u, 0u, cityLevel, farmLevel, 0u);
    }
    let cost = toFx(razeCost);
    if (!affordable(totalFood, cost)) {
      return decision(2u, 0u, cityLevel, farmLevel, 0u);
    }
    return decision(1u, cost, 0u, 0u, 1u);
  }

  return decision(7u, 0u, cityLevel, farmLevel, 0u);
}
