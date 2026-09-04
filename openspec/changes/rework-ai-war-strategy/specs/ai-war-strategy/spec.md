# ai-war-strategy

## ADDED Requirements

### Requirement: Readiness gates measure achievable population

Nation attack readiness (reserve gate, trigger gate, and the reserve kept back when sizing attacks or donations) SHALL be computed against the nation's effective maximum troops: the greater of its food-supported capacity (`foodFlow().capacity`) and its living population (home troops plus deployed), clamped between 1 and housing capacity (`config.maxTroops`).

#### Scenario: Food-bound nation is not gated by housing capacity

- **WHEN** a nation's living population is at its food-supported capacity but far below its housing-based `maxTroops`
- **THEN** the reserve and trigger ratio gates evaluate against the food-supported capacity and the nation is considered ready to attack

#### Scenario: Effective maximum never exceeds housing

- **WHEN** a nation's food-supported capacity exceeds `config.maxTroops`
- **THEN** the effective maximum is clamped to `config.maxTroops`

### Requirement: War intelligence helpers

The AI SHALL derive strategic readings from live sim state: `totalPower(p)` (home troops plus troops in outgoing attacks and transports), `committedShare(p)` (deployed fraction of total power), and `foodRunwayTicks(p)` (food stock divided by per-tick consumption; unbounded when consumption is zero). Threat judgments (send caps, threat drift, surge detection) SHALL use total power; opportunity judgments (victim detection) SHALL use home troops and committed share.

#### Scenario: Send cap sees a committed neighbor's full strength

- **WHEN** a Hard or Impossible nation computes its troop send cap and its strongest non-allied neighbor has most of its troops deployed in outgoing attacks
- **THEN** the retained-troops threshold is computed from that neighbor's total power, not its diminished home pool

#### Scenario: Heavily committed enemy is a victim

- **WHEN** a bordering enemy has more than half of its total power deployed away and its total power fell since the previous pass
- **THEN** victim detection accepts it as a target even if incoming attacks alone are below half of its home troops

### Requirement: Campaign persistence with +EV pacing

When a nation's strategy pipeline successfully attacks a player target, the nation SHALL open a campaign against that target, snapshotting its own tile count and living population. On each subsequent attack pass (after the reserve gate, bypassing the trigger lottery and strategy scan), while the target is alive and not friendly: if the nation gained net tiles since the last pass AND its living population held at or above `campaignPopFloor` of the snapshot, it SHALL reinforce the same target through the normal attack-sizing path; if population fell below the floor it SHALL close the campaign immediately; if tiles did not grow it SHALL close the campaign after `campaignMaxStalls` consecutive stalled passes. Reinforcements remain bound by the reserve target, staffing floor, war share, and send caps.

#### Scenario: Winning cheaply keeps the pressure on

- **WHEN** a nation in a campaign gained net tiles since the previous pass and its population is at least `campaignPopFloor` of the campaign snapshot
- **THEN** it sends a follow-up attack at the campaign target without re-rolling the trigger lottery

#### Scenario: Population decline ends the campaign

- **WHEN** a nation in a campaign has a living population below `campaignPopFloor` of its last snapshot
- **THEN** the campaign is closed and no reinforcement is sent that pass

#### Scenario: Stalled campaign is abandoned

- **WHEN** a nation in a campaign gains no net tiles for `campaignMaxStalls` consecutive attack passes
- **THEN** the campaign is closed and normal strategy selection resumes

### Requirement: Join existing wars (dogpile)

Nations on Medium and above SHALL include a strategy that attacks a bordering non-friendly enemy already in active combat with a third party (an incoming attack from a non-friendly player other than this nation, or an outgoing attack against someone other than this nation), provided the enemy's home troops are below the nation's own home troops. The strategy's position in the difficulty-ordered list rises with difficulty.

#### Scenario: Nation joins a war in progress

- **WHEN** a bordering enemy with fewer home troops than the nation is exchanging attacks with a third party
- **THEN** the dogpile strategy attacks that enemy

#### Scenario: A duel with the nation itself is not a dogpile

- **WHEN** a bordering enemy's only active combat is against this nation
- **THEN** the dogpile strategy does not select it

### Requirement: Threat drift by local power differential

Once per attack pass, a nation SHALL reduce its relation toward each bordering non-friendly, non-bot player whose total power is at least `threatPowerRatio` times the nation's own total power, by `threatDriftPerPass`. The drift never applies to friendly players and never raises relations; existing relation decay restores the value when the differential ends.

#### Scenario: Dominant neighbor becomes hated

- **WHEN** a player's total power exceeds a bordering nation's by the threat ratio across several consecutive passes
- **THEN** the nation's relation to that player falls to Hostile, engaging the existing hostile-targeting and embargo behavior

#### Scenario: Comparable neighbor is not drifted

- **WHEN** a bordering player's total power is below the threat ratio multiple of the nation's
- **THEN** the nation's relation to that player is unchanged by threat drift

### Requirement: Famine-aware targeting

Nations on Medium and above SHALL include a strategy that attacks a bordering enemy whose food runway is below `starvingRunwayTicks`, subject to the same relative-strength guard as victim targeting, with its firing probability scaled by the difficulty's `resourceFocus`. Additionally, when a nation selects the aim point for an attack front against a player, contact tiles within radius 4 of the target's Farmland or Settlement units SHALL receive an integer weight of `1 + round(3 × resourceFocus)` versus 1 elsewhere in the random draw; fronts against unowned land keep a uniform draw.

#### Scenario: Starving neighbor is attacked

- **WHEN** an Impossible-difficulty nation borders an enemy whose food stock covers fewer than `starvingRunwayTicks` ticks of consumption and whose home troops do not exceed the FFA strength guard
- **THEN** the starving strategy attacks that enemy

#### Scenario: Attack fronts seek farmland

- **WHEN** a nation attacks a player and some contact-front tiles are within radius 4 of the target's Farmland or Settlement tiles
- **THEN** those tiles are proportionally favored as the front's aim point according to `resourceFocus`

### Requirement: Strength trend memory

A nation SHALL remember each bordering player's total power from the previous attack pass and treat a player as surging when current total power exceeds the remembered value by `surgeGrowthFactor`. In FFA, the weakest-neighbor and starving strategies SHALL NOT attack a surging enemy. A player seen for the first time is not surging. Entries for players no longer bordering are dropped.

#### Scenario: Surging enemy is skipped

- **WHEN** the weakest bordering enemy's total power grew beyond `surgeGrowthFactor` times its last-pass value in an FFA game
- **THEN** the weakest strategy skips it and considers the next candidate

#### Scenario: Unknown player is not surging

- **WHEN** a player borders the nation for the first time
- **THEN** it is not classified as surging that pass

### Requirement: War share scales with food runway

`deployableTroops` SHALL scale `maxWarShare` linearly with the player's food runway: at zero runway the share is `maxWarShare × warShareLeanScale`; at or above `warShareRichRunwayTicks` it is `maxWarShare × warShareRichScale`. The three scaling knobs live in `FoodConfig`. The scaled share remains a hard cap on total deployment and is never suspended. Setting both scales to 1 SHALL reproduce the previous flat behavior.

#### Scenario: Full barns fight bigger wars

- **WHEN** a player's stored food covers at least `warShareRichRunwayTicks` of consumption
- **THEN** deployable troops are computed from `maxWarShare × warShareRichScale` of the living population

#### Scenario: Empty stores throttle deployment

- **WHEN** a player's food stock is zero
- **THEN** deployable troops are computed from `maxWarShare × warShareLeanScale` of the living population

#### Scenario: Neutral scales reproduce legacy behavior

- **WHEN** `warShareLeanScale` and `warShareRichScale` are both 1
- **THEN** `deployableTroops` returns exactly the pre-change value for any stock level
