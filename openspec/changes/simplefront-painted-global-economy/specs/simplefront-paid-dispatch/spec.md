## ADDED Requirements

### Requirement: New commitments pay food atomically

A new validated land attack or transport dispatch SHALL pay the actual integer committed troop count multiplied by its configured milli-food price, initially 40 for both. Requests SHALL be clipped to available idle troops as before but SHALL NOT be reduced solely to fit food. Invalid/zero/unaffordable orders SHALL mutate neither food, troops, deployment state, nor hostile-order diplomacy. Debit SHALL occur exactly once at commitment.

#### Scenario: Affordable dispatch

- **WHEN** a valid order commits 500 troops with enough food
- **THEN** it deducts exactly 20 food and moves 500 troops from idle into deployment

#### Scenario: Insufficient food rejects rather than resizes

- **WHEN** a valid request for 500 available troops is submitted with 19 food
- **THEN** it commits no troops, spends nothing, creates no deployment, and causes no hostile-order side effects

### Requirement: Existing deployments are not charged again

Boat landing, attack merging/rebuilding, and retreat SHALL NOT count as new paid commitments. Only fresh reinforcement troops SHALL incur a new fee. A successfully committed fee SHALL NOT be refunded on later retreat, target friendship, or travel failure; existing troop refunds SHALL be retained.

#### Scenario: Landing preserves a single dispatch fee

- **WHEN** a paid transport lands and creates an inland attack
- **THEN** the original passengers incur no further food debit and remain counted as deployed throughout the queued handoff

### Requirement: Logistics no longer affect active armies

SimpleFront SHALL remove food consumption, food starvation, civilian aging, and supply-distance attrition from its selected runtime. Food depletion after a dispatch SHALL NOT halt movement, reduce combat strength, or cause troop losses. Existing movement, aiming, front distribution/seep/collision, terrain casualty/work calculations, transport routes, retreat losses, beachhead/collapse/pocket capture, immunity, and victory rules SHALL otherwise remain.

#### Scenario: Empty food after dispatch

- **WHEN** a deployed army's owner has zero food and no supply connection
- **THEN** the army continues under the existing movement/battle rules and loses troops only through retained non-logistics mechanics

### Requirement: Deployment transitions conserve total troops

Every committed soldier SHALL occupy capacity exactly once during queued boat landing, refund, attack merging, rescaling, or termination. Transitional handoff accounting SHALL be cleared exactly once when ownership of those soldiers moves to their next representation.

#### Scenario: Queued landing cannot recruit a replacement army

- **WHEN** a capacity-full player's transport is removed before its landing attack initializes
- **THEN** the passengers remain in total troop accounting and recruitment gains zero headroom from that gap
