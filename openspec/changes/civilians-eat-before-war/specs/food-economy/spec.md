## MODIFIED Requirements

### Requirement: Food feeds the farm's region

Farm output SHALL be distributed locally rather than pooled globally. The feeding REGION is the connected component of the food-shed (cells whose floods touch share food — the shed CUTOFF, not the Voronoi seam, is the locality bound): each region's fed-ratio is computed from its own production and granaries against the people living there, with cell headcounts scaled from housing to the live population (density is housing, not headcount). People beyond every shed form the CAMP cohort, fed only by the aspatial camp stock (`baseStorage` — the spawn stake). District civilians and the camp SHALL be fed FIRST from their own production and stores. Deployed troops form the WAR cohort, fed by requisition ONLY from what remains after civilians eat — the tick's post-civilian production surplus, then the camp stock, then the granary reserves. Requisition SHALL NOT reduce the food available to civilians below what their own district production and stores provide: an unmet war need SHALL starve the deployed cohort (war-cohort attrition), never the civilian population. Starvation SHALL be computed per cohort, and urban recession SHALL prefer razing tiles of the worst-fed regions. A shortfall in one region SHALL NOT be covered by production in a disconnected or out-of-reach one.

#### Scenario: A regional famine is regional

- **WHEN** one metro's farms are razed while another metro across the map is well-fed
- **THEN** the razed metro's population starves and its city recedes while the other thrives — visible on the map as one region receding

#### Scenario: A metro eats from every farm within reach

- **WHEN** a dense city sits inside a belt of many farms whose shed floods touch
- **THEN** the whole belt feeds it as one region — the Voronoi seams between farms are labor boundaries, not dinner tables

#### Scenario: Deploying an army does not starve civilians

- **WHEN** a nation at its food-production ceiling commits a large attack wave (a war need approaching or exceeding its production)
- **THEN** its civilian population SHALL keep eating its district production and SHALL NOT collapse from the deployment; the war cohort draws only the surplus and reserves

#### Scenario: An unsupplied army starves itself, not the nation

- **WHEN** a sustained over-deployment's war need cannot be met from surplus plus reserves
- **THEN** the deployed cohort (outgoing attacks and transport-ship troops) SHALL take the starvation loss, thinning over time, while the civilian population survives on local production
