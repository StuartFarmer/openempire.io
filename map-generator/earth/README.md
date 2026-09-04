# Earth maps

Tooling to build **real-world** OpenFront maps from public geospatial data — so a
match can be played on an actual slice of Earth instead of a generated world.

## The pipeline

```
1. download.ts   sources        →  world-maps/            npm run earth:data fetch
2. ingest.py     sources        →  fields.bin             .venv/bin/python ingest.py
                                   (14 raw float32 planes, PHYSICAL units)
3. #earth        fields.bin     →  tuning.json            npm run dev, open #earth
                                   (inspect, tune, approve)
4. bake.ts       fields+tuning  →  image.png + layers.bin + info.json
                                                          npx tsx bake.ts --name earth
5. gen-maps      →  resources/maps/earth/                 npm run gen-maps
```

The split at step 2/3 is the important one. **Ingest is slow** (GDAL, minutes) and
emits raw physical units — metres, °C, mm/yr, km² of mining, km of basin fill.
**Normalization is fast** (milliseconds) and is where all the judgement lives: the
curves, clamps and weights that turn those into 0–255 bytes. Keeping them apart
means retuning the map never re-runs GDAL, so the sliders can be live.

Steps 3 and 4 both call the **same** `buildMap()` from
`src/games/alternative/earth/BuildLayers.ts`, so what you approve on screen is
byte-for-byte what gets baked. (Same relationship as `#generator` ↔ `gen-world.ts`.)

`ingest.py` is the only Python in the repo. It exists because the sources are ESRI
file geodatabases in Eckert IV, 500 MB shapefiles and multi-band GeoTIFFs — GDAL is
the right tool and there is no credible JS equivalent. It is an offline dev step;
nothing it uses ships, and the simulation never sees it.

```bash
uv venv --python 3.12 map-generator/earth/.venv
VIRTUAL_ENV=map-generator/earth/.venv uv pip install rasterio geopandas pyogrio shapely numpy scipy
```

## Normalizing to 0–255

Every plane is one byte, so every field needs a **curve**, a **range** and a
**gamma**. The range choice is the one that matters:

- **absolute** — when the unit means something on its own. Temperature is clamped
  to −30…+35 °C, and 20 °C is 20 °C on every map we ever bake.
- **percentile** (over **nonzero** cells) — when the unit is arbitrary or brutally
  heavy-tailed. Mining is km²/cell with a median nonzero of 0.47 and a max of 330;
  an absolute range would crush 99% of the world's mines into byte 0. And because
  mining touches only ~1.2% of tiles, whole-array percentiles would be 0 at every
  level, so zeros are excluded.

Three traps we actually fell into, all of which produced a **plausible-looking but
wrong** map — they're pinned by `tests/EarthNormalize.test.ts`:

| Trap                              | Symptom                                                                                                                | Fix                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `log1p` on precipitation          | Sahara (19 mm/yr) → byte **95**, i.e. "37% humid"                                                                      | `sqrt` → byte 20                         |
| Boosting oil _before_ normalizing | Bonuses reach 2.8×, so a "0–23 km" clamp really carried 0–64. **Ghawar**, the largest oil field on Earth → byte **17** | Normalize geology first, _then_ multiply |
| Unsigned temperature              | −30 °C and 0 °C quantize identically                                                                                   | `normalizeSigned()`                      |

Sanity spot-checks on the current defaults — the map genuinely knows where things
are: Ghawar oil **255**, Atacama metal **253**, US Corn Belt crop **241** /
water **255**, Sahara crop 14 / metal 0 / humidity 20, Amazon humidity 217,
West Siberia oil 255, Antarctica temperature 0.

## Rendering: the `terrain-colors.png` sidecar is not optional

A map **without** a `terrain-colors.png` sidecar silently falls back to **vanilla
OpenFront shading** — flat blue sea, no bathymetry, no biomes. Nothing warns you;
it just looks wrong. `EarthColors.ts` emits the sidecar, the Go baker sets
`manifest.terrain_colors: true`, and `TerrainPass` then renders it through the
fork's own terrain renderer.

`EarthColors.ts` re-implements **no** colouring. It feeds real measurements into
the field conventions `buildWorldEngineTerrainColors()` already expects. Three
translations are load-bearing, and each one produced a broken-looking planet
before it was right (all pinned in `tests/EarthNormalize.test.ts`):

- **Rivers.** HydroRIVERS keeps every trickle down to 5 m³/s — **28.65% of all
  land**. Passed straight through, the renderer floods a quarter of the planet
  with river-blue: the Amazon basin, Siberia and Canada all read as open sea.
  Gate at **1000 m³/s** (1.69% of land) and you get the Amazon, Nile,
  Mississippi, Yangtze, Congo, Ob — an actual river network.
- **Elevation.** Earth's land is LOW (median 555 m; 26% under 200 m). A linear
  ramp parks the planet at the bottom of the engine's elevation range, flattening
  all relief and dragging low ground into the renderer's "coastal" band. Gamma
  0.6 lifts the midlands.
- **Ocean temperature.** WorldClim is land-only, so ingest gap-fills it from the
  nearest land. That is _correct_ for a coastal land tile, but over open ocean it
  tiles the sea into Voronoi blocks of whatever continent was nearest — which the
  cold-water tint then renders as visible rectangles. Ocean uses a latitude-based
  SST instead.

The biome palette itself is the engine's (`WORLD_ENGINE_BIOME_COLORS`) and was
tuned for generated worlds, not Earth — expect to revisit the colours.

## The maps

| Map          | Grid      | km/tile | Built from                          |
| ------------ | --------- | ------- | ----------------------------------- |
| `Earth`      | 2048×1024 | ~19.6   | `global-2048x1024`                  |
| `Earth Mini` | 1024×512  | ~39.1   | same ingest, `--div 2`              |
| `Earth XL`   | 4096×2048 | ~9.8    | `global-4096x2048` (its own ingest) |
| `SPQR`       | 2048×1024 | ~3.1    | `spqr-2048x1024` (a **crop**)       |

```bash
# ingest (slow, once per dataset)
.venv/bin/python ingest.py --name global --width 2048 --height 1024
.venv/bin/python ingest.py --name global --width 4096 --height 2048
.venv/bin/python ingest.py --region spqr
.venv/bin/python ingest.py --bbox -12 30 40 55 --name aegean # arbitrary crop

# bake
npx tsx bake.ts --name earth --fields global-2048x1024
npx tsx bake.ts --name earthmini --fields global-2048x1024 --div 2 --title "Earth Mini"
npx tsx bake.ts --name earthxl --fields global-4096x2048 --title "Earth XL"
npx tsx bake.ts --name spqr --fields spqr-2048x1024 --title "SPQR"

# season.bin (optional): the seasonal harmonic from monthly MODIS LST, same
# --fields/--div grids as bake so they line up. Fills world-maps/surface_temp_data.
.venv/bin/python season.py --name earth --fields global-2048x1024
.venv/bin/python season.py --name earthmini --fields global-2048x1024 --div 2
.venv/bin/python season.py --name earthxl --fields global-4096x2048
.venv/bin/python season.py --name spqr --fields spqr-2048x1024

npm run gen-maps
```

**Earth Mini is derived from the same ingest as Earth** (`--div 2`, a box average)
rather than re-ingested at half size, so the small map is literally the big one
averaged and the two cannot drift apart.

## Target grids, and why a crop needs a solved bbox

A _global_ map is inherently **2:1** — Earth is 40,075 km around the equator and
20,004 km pole-to-pole. Grids are powers of two and multiples of 4 (the Go baker
normalizes to multiples of 4 for its 4x/16x mipmaps).

A **regional crop cannot just be any box.** On an equirectangular grid a degree
of longitude is only `cos(lat)` as wide as a degree of latitude, so a naive bbox
gives non-square tiles and the map renders visibly stretched. Solve for it:

```
lon_span = 2 · lat_span · 110.57 / (111.32 · cos(mid_lat))
```

SPQR: lat 27–56 (Egypt to Britain), mid-latitude 41.5° ⇒ lon span 77° ⇒
bbox `(-21, 27, 56, 56)`, which lands on **3.135 × 3.131 km** tiles — square to
within 0.1%. `ingest.py` prints a warning if a bbox you pass yields tiles more
than 12% off square.

The whole-Earth map gets away with ignoring this: it _is_ the whole world, and
the stretch is just the projection.

## Source resolution has to keep up

`ingest.py` picks the finest WorldClim on disk (`30s` → `2.5m` → `5m` → `10m`).
This matters: WorldClim 10′ is 2160×1080 (**18.6 km/px**) — a fine match for the
19.6 km global map, but an upsample at XL (9.8 km/tile) and hopeless for SPQR
(~3 km/tile), where it would smear a continent's worth of climate across the
Mediterranean. `worldclim-tavg-2.5m` / `worldclim-prec-2.5m` (4.6 km/px) exist in
the manifest for exactly this. ETOPO 60″ (1.9 km/px) is fine down to ~2 km tiles.

**Because one tile is ~20 km, a ~1–2 km source raster is already 10–20×
oversampled.** The manifest deliberately prefers the small global files (ETOPO
60″, WorldClim 10′) over the giant ones (GEBCO 15″, CHELSA 30″). The heavy
sources are marked `optional` for future regional maps.

## What the pipeline needs

Two artifacts, baked by two different tools:

1. **`image.png`** — read by the Go baker (`map_generator.go`). Only the **blue
   channel** matters: alpha<20 or blue=106 → water; blue 140–200 → land with
   elevation magnitude `(blue-140)/2`; `#000` → impassable.
2. **`layers.bin`** — six Uint8 planes defined by `src/core/game/MapLayers.ts`:
   `crop`, `metal`, `oil`, `temperature`, `humidity`, `water`. Always write it
   via `encodeLayers()` so the encoder and the sim's decoder cannot drift.

Plus optionally `terrain-colors.png` (realistic coloring) and `nations[]` in
`info.json` (the role-play hook — the classic `world` map has 72).

## Source → layer mapping

| Layer         | Primary source                                | In manifest as                    |
| ------------- | --------------------------------------------- | --------------------------------- |
| `terrain`     | ETOPO 2022 60″ (elevation **and** bathymetry) | `etopo-60s`                       |
| coastline     | Natural Earth 10m land/ocean                  | `ne-land`, `ne-ocean`             |
| `temperature` | WorldClim 2.1 `tavg` 10′                      | `worldclim-tavg`                  |
| `humidity`    | WorldClim 2.1 `prec` 10′ + `bio`              | `worldclim-prec/-bio`             |
| `crop`        | SEDAC NPP + RESOLVE Ecoregions + bioclim      | `sedac-npp`, `ecoregions`         |
| `water`       | HydroRIVERS + HydroLAKES (or the NE pair)     | `hydrorivers`, `hydrolakes`       |
| `metal`       | Maus satellite mining grid + USGS tracts      | `maus-mining`, `usgs-gmra-copper` |
| `oil`         | NETL GOGI sedimentary basins                  | `netl-gogi`, `usgs-dds69ff`       |
| `nations`     | Natural Earth populated places + countries    | `ne-popplaces`, `ne-countries`    |

If a dataset's `url` is ever empty, `status` flags it loudly and `fetch` skips
it rather than silently pretending the layer is covered.

## Why `metal` and `oil` use the sources they do

Both layers have an obvious-looking source that is **wrong**, so this is worth
recording before someone "simplifies" it back.

**`metal`: do NOT base this on USGS MRDS.** MRDS is a _US_ survey. Measured on
the actual file: **87.5% of its 304,632 records are in the United States**
(Australia 0.4%, Canada 0.5% — both mining superpowers). Kernel-densifying it
would hand North America essentially all the metal on Earth.

The base is **`maus-mining`** instead: a satellite-derived global mining
land-use grid, so it has no national-reporting bias _by construction_ — Asia
30%, S.America 23%, N.America 14%, Africa 10%, Australia 8%, Europe 5%. It is
also a happy accident of resolution: **4320×2160, EPSG:4326, on exactly
(-180,-90,180,90)** — a clean 2.109× of our 2048×1024, so it block-sums with no
reprojection at all.

Two things it needs: `log1p` (values are heavy-tailed, max 84 km²/cell) and a
Gaussian blur (σ≈4 tiles) — only ~1.2% of tiles are nonzero, because mining
really is point-like. Then blend in `usgs-gmra-copper` for _undiscovered_
geological potential (its `meancu_km2` column is a ready-made richness density)
and `usgs-minfac`, which is literally the non-US half of the world and cancels
MRDS's bias. MRDS itself is kept `optional`, for US texture only.

**`oil`: assessment units are too sparse.** They don't tile the globe, so most
of the map would sit at oil=0. Measured coverage of a 2048×1024 grid:

| Source                                 | Grid coverage |
| -------------------------------------- | ------------- |
| **`netl-gogi` `Basins`**               | **29.5%**     |
| `usgs-dds69ff` assessment units        | 5.3%          |
| `usgs-oilgas` (WPA-2000, the old pick) | 4.5%          |

**GOGI's `Basins` layer is the substrate**: 1,046 global sedimentary-basin
polygons carrying `MAX_FILLKM` (sediment fill depth — deep basin, more source
rock, more oil). That's 6.6× the coverage of the old source, and it correctly
leaves cratonic shields and orogens at zero, which is _right_ — the Canadian
Shield should be oil-dead. The assessment units and `Fields` become bonus
multipliers painted on top (only ~2k cells of them fall outside a basin).

Gotchas: GOGI is **Eckert IV (`ESRI:54012`)** and must be reprojected to
EPSG:4326 before rasterizing; its `Wells` layer is hopelessly US-biased (ignore
it); and its `Fields.Commodity` column is dirty (raw KML path strings — needs a
`OIL|ÓLEO|GAS|GÁS` regex).

## Usage

Data lands in the **`world-maps/` sibling of the repo** (override with
`$WORLD_MAPS_DIR`). It is gigabytes and is never committed — only the manifest is.

```bash
npm run earth:data list                   # every dataset, size, what it feeds
npm run earth:data status                 # what's on disk vs what's missing
npm run earth:data fetch                  # the default global-map set
npm run earth:data fetch --only etopo-60s # one dataset
npm run earth:data fetch --feeds water    # everything feeding the `water` plane
npm run earth:data fetch --all            # includes optional/high-res sources
npm run earth:data verify                 # re-check sha256 against the lockfile
```

Downloads are **resumable** (partial → `.part`, resumed via HTTP Range),
**idempotent** (present + lockfile URL match → skipped), and **verifiable**
(size + sha256 recorded in `world-maps/download-lock.json`). A truncated
transfer never gets promoted to the real filename.

## Adding a dataset

Add an entry to `datasets.ts`. **Verify the URL returns 200/206 with no auth
before committing it** —

```bash
curl -sIL -o /dev/null -w '%{http_code}\n' "<url>"
```

A manifest of guessed URLs is worse than no manifest. Every `url` currently in
`datasets.ts` was checked this way.
