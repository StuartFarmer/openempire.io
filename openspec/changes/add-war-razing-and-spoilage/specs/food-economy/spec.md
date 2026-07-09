# Spec delta: food-economy (add-war-razing-and-spoilage)

## MODIFIED Requirements

### Requirement: Storage caps the stock and stored food decays

Food above the player's storage cap SHALL be lost the tick it is produced (surplus overflow). The stored stock SHALL decay each tick by a configured fraction (integer floor) tuned so that roughly a quarter of an untouched stock spoils per minute — hoarded war chests rot, so sustained campaigns require farm income rather than accumulated mountains. Storage cap derives from Barns per the tribal-buildings capability.

#### Scenario: Grain mountains rot

- **WHEN** a full granary sits untouched with zero production and consumption for one minute
- **THEN** roughly a quarter of the stock has spoiled
