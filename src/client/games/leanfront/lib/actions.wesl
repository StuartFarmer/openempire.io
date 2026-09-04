import package::kernel::{GRID, OFF, inBounds, refOf};
import package::params;
import package::layers;
import package::players;
import package::sim;
import package::lib::economy::{ActionDecision, decideAction};

const INVALID_TILE: u32 = 0xffffffffu;

struct SpawnReservation {
  accepted: u32,
  cityTile: u32,
  farmTile: u32,
}

struct ResolvedAction {
  decision: ActionDecision,
  spawnCityTile: u32,
  spawnFarmTile: u32,
}

fn isEmptyNeutralLand(tile: u32) -> bool {
  return layers::land::val(tile) != 0.0 &&
    layers::owner::val(tile) == 0u &&
    layers::cityLevel::val(tile) == 0u &&
    layers::farmLevel::val(tile) == 0u;
}

fn insideSpawnClaim(cityTile: u32, tile: u32) -> bool {
  let cityX = i32(cityTile % GRID.size.x);
  let cityY = i32(cityTile / GRID.size.x);
  let tileX = i32(tile % GRID.size.x);
  let tileY = i32(tile / GRID.size.x);
  let dx = tileX - cityX;
  let dy = tileY - cityY;
  return dx * dx + dy * dy <= 25;
}

fn spawnReservation(player: u32) -> SpawnReservation {
  // playerIntent(5): slot 0 is neutral and slots 1..4 are resolved in order.
  var acceptedSpawns = array<u32, 5>(0u, 0u, 0u, 0u, 0u);
  var reservedCities = array<u32, 5>(
    INVALID_TILE, INVALID_TILE, INVALID_TILE, INVALID_TILE, INVALID_TILE,
  );
  var reservedFarms = array<u32, 5>(
    INVALID_TILE, INVALID_TILE, INVALID_TILE, INVALID_TILE, INVALID_TILE,
  );

  for (var candidatePlayer = 1u; candidatePlayer <= player;
      candidatePlayer += 1u) {
    let action = players::val(candidatePlayer);
    let cells = GRID.size.x * GRID.size.y;
    if (action.actionTick != sim::tick() || action.actionKind != 1u ||
        action.actionTile >= cells ||
        sim::scalar_tilesOwned(candidatePlayer) != 0.0 ||
        !isEmptyNeutralLand(action.actionTile)) {
      continue;
    }

    var cityConflicts = false;
    for (var earlierPlayer = 1u; earlierPlayer < candidatePlayer;
        earlierPlayer += 1u) {
      if (acceptedSpawns[earlierPlayer] == 0u) { continue; }
      // Keep both reserved plots outside the other spawn's radius-five claim.
      if (insideSpawnClaim(reservedCities[earlierPlayer], action.actionTile) ||
          insideSpawnClaim(action.actionTile, reservedFarms[earlierPlayer])) {
        cityConflicts = true;
        break;
      }
    }
    if (cityConflicts) { continue; }

    let cityX = i32(action.actionTile % GRID.size.x);
    let cityY = i32(action.actionTile / GRID.size.x);
    var farmTile = INVALID_TILE;
    for (var k = 0; k < 8; k += 1) {
      let n = vec2i(cityX, cityY) + OFF[k];
      if (!inBounds(n.x, n.y)) { continue; }
      let neighbor = refOf(n.x, n.y);
      if (!isEmptyNeutralLand(neighbor)) { continue; }
      var farmConflicts = false;
      for (var earlierPlayer = 1u; earlierPlayer < candidatePlayer;
          earlierPlayer += 1u) {
        if (acceptedSpawns[earlierPlayer] != 0u &&
            (neighbor == reservedCities[earlierPlayer] ||
             neighbor == reservedFarms[earlierPlayer] ||
             insideSpawnClaim(reservedCities[earlierPlayer], neighbor))) {
          farmConflicts = true;
          break;
        }
      }
      if (!farmConflicts) {
        farmTile = neighbor;
        break;
      }
    }
    if (farmTile == INVALID_TILE) { continue; }

    acceptedSpawns[candidatePlayer] = 1u;
    reservedCities[candidatePlayer] = action.actionTile;
    reservedFarms[candidatePlayer] = farmTile;
  }

  return SpawnReservation(
    acceptedSpawns[player], reservedCities[player], reservedFarms[player],
  );
}

fn resolveAction(player: u32) -> ResolvedAction {
  let action = players::val(player);
  let cells = GRID.size.x * GRID.size.y;
  let valid = action.actionTile < cells;
  let targetTile = min(action.actionTile, cells - 1u);
  let spawn = spawnReservation(player);
  let d = decideAction(
    player, action.actionKind, action.actionTile, action.actionTick, sim::tick(),
    valid, layers::land::val(targetTile), layers::owner::val(targetTile),
    layers::cityLevel::val(targetTile), layers::farmLevel::val(targetTile),
    spawn.accepted != 0u, sim::scalar_tilesOwned(player),
    sim::scalar_totalFood(player), params::cityCapacityPerLevel(),
    params::farmCapacityPerLevel(), params::cityLevelCost(),
    params::farmLevelCost(), params::razeCost(),
  );
  return ResolvedAction(d, spawn.cityTile, spawn.farmTile);
}
