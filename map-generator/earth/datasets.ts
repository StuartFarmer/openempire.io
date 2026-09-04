/**
 * datasets.ts — the manifest of real-world source data used to build Earth maps.
 *
 * This is the single source of truth for WHERE the data comes from and WHAT it
 * feeds in the map pipeline. `download.ts` fetches it; the (future) resampler
 * reads it. Data lives OUTSIDE the repo (see `dataRoot()`) because it is tens
 * of gigabytes — only this manifest is version-controlled.
 *
 * Every `url` here has been verified to return HTTP 200/206 with no auth.
 * If you add one, verify it the same way — a manifest of guessed URLs is worse
 * than no manifest.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the downloaded data lives: the `world-maps` sibling of the repo, or
 * $WORLD_MAPS_DIR. Never inside the repo — these files are gigabytes.
 */
export function dataRoot(): string {
  const env = process.env.WORLD_MAPS_DIR;
  if (env) return path.resolve(env);
  return path.resolve(__dirname, "..", "..", "..", "world-maps");
}

/** The six layers.bin planes, plus the terrain image and the role-play extras. */
export type Feeds =
  | "terrain" // image.png — land/water + elevation magnitude
  | "crop"
  | "metal"
  | "oil"
  | "temperature"
  | "humidity"
  | "water"
  | "nations" // info.json nations[] — the role-play hook
  | "colors"; // terrain-colors.png sidecar

export type Format =
  | "geotiff"
  | "netcdf"
  | "shapefile-zip"
  | "csv-zip"
  | "geopackage"
  | "filegdb-zip"
  | "zip";

export interface Dataset {
  /** Stable slug — the CLI selector and the lockfile key. */
  id: string;
  title: string;
  /** Which parts of the map pipeline this feeds. */
  feeds: Feeds[];
  /** Verified direct-download URL. Empty string = known-needed, URL unresolved. */
  url: string;
  format: Format;
  /**
   * Path under dataRoot() where this lands. For archives, the directory the
   * contents are extracted into; otherwise the file itself.
   */
  dest: string;
  /** Unpack the archive after download (zip). */
  extract?: boolean;
  /** Rough size, for the `list` view and download planning. */
  approxMB?: number;
  /** Datasets already sitting in world-maps, fetched out of band. Never downloaded. */
  vendored?: boolean;
  /** Not part of the default global-map build; opt in with --group. */
  optional?: boolean;
  license: string;
  citation: string;
  notes?: string;
}

/**
 * Resolution note: the first target is a global 2048×1024 grid (~19.6 km/tile)
 * and its 1024×512 half (~39.1 km/tile). A ~1–2 km source is already 10–20×
 * oversampled for that, so we deliberately prefer the small global files
 * (ETOPO 60", WorldClim 10') over the giant ones (GEBCO 15", CHELSA 30").
 * The high-res sources are kept as `optional` for future regional maps.
 */
export const DATASETS: Dataset[] = [
  // ── Terrain: elevation + bathymetry. Without this there is no map at all. ──
  {
    id: "etopo-60s",
    title: "ETOPO 2022 global relief, 60 arc-second (ice surface)",
    feeds: ["terrain"],
    url: "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif",
    format: "geotiff",
    dest: "etopo/ETOPO_2022_v1_60s_N90W180_surface.tif",
    approxMB: 444,
    license: "Public domain (US Government work)",
    citation:
      "NOAA National Centers for Environmental Information. 2022. ETOPO 2022 15 Arc-Second Global Relief Model. doi:10.25921/fd45-gt74",
    notes:
      "THE load-bearing dataset — no elevation, no map. 21600×10800 float32 metres, +land/-ocean, so it supplies terrain AND bathymetry in one raster: land→blue 140-200, ocean→alpha 0. 60 arc-sec ≈ 1.85 km, ~19× oversampled for a 19.6 km tile (big file only because it's uncompressed float32).",
  },
  {
    id: "etopo-30s",
    title: "ETOPO 2022 global relief, 30 arc-second (ice surface)",
    feeds: ["terrain"],
    url: "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/30s/30s_surface_elev_gtif/ETOPO_2022_v1_30s_N90W180_surface.tif",
    format: "geotiff",
    dest: "etopo/ETOPO_2022_v1_30s_N90W180_surface.tif",
    approxMB: 1512,
    optional: true,
    license: "Public domain (US Government work)",
    citation: "NOAA NCEI, ETOPO 2022. doi:10.25921/fd45-gt74",
    notes:
      "Higher-res spare for regional (sub-global) maps. Pointless at global scale — 60s is already oversampled.",
  },

  // ── Coastline / land mask: cleans up the ETOPO 0 m contour. ──
  {
    id: "ne-land",
    title: "Natural Earth 10m land polygons",
    feeds: ["terrain"],
    url: "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip",
    format: "shapefile-zip",
    dest: "naturalearth/ne_10m_land",
    extract: true,
    approxMB: 3.1,
    license: "Public domain",
    citation: "Made with Natural Earth.",
    notes:
      "Authoritative coastline. ETOPO's 0 m contour is noisy near deltas/ice; intersect with this to decide land vs water.",
  },
  {
    id: "ne-ocean",
    title: "Natural Earth 10m ocean polygons",
    feeds: ["terrain"],
    url: "https://naciscdn.org/naturalearth/10m/physical/ne_10m_ocean.zip",
    format: "shapefile-zip",
    dest: "naturalearth/ne_10m_ocean",
    extract: true,
    approxMB: 4,
    license: "Public domain",
    citation: "Made with Natural Earth.",
  },

  // ── Temperature ──
  {
    id: "worldclim-tavg",
    title: "WorldClim 2.1 mean temperature, 10 arc-min (12 monthly rasters)",
    feeds: ["temperature"],
    url: "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_tavg.zip",
    format: "zip",
    dest: "worldclim/wc2.1_10m_tavg",
    extract: true,
    approxMB: 35.6,
    license: "CC BY-SA 4.0",
    citation:
      "Fick, S.E. and R.J. Hijmans, 2017. WorldClim 2: new 1km spatial resolution climate surfaces for global land areas. Int. J. Climatology 37:4302-4315.",
    notes:
      "10 arc-min ≈ 18.5 km — almost exactly one game tile. Annual mean of the 12 months → `temperature` plane.",
  },

  // ── Higher-resolution climate, for XL and regional (cropped) maps ──
  // WorldClim 10' is 2160x1080 (18.6 km/px): a good match for the 19.6 km global
  // map, but an upsample at XL (9.8 km/tile) and useless for SPQR (~3 km/tile).
  // 2.5' is 8640x4320 (4.6 km/px). ingest.py picks the finest one present.
  {
    id: "worldclim-tavg-2.5m",
    title: "WorldClim 2.1 mean temperature, 2.5 arc-min",
    feeds: ["temperature"],
    url: "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_2.5m_tavg.zip",
    format: "zip",
    dest: "worldclim/wc2.1_2.5m_tavg",
    extract: true,
    approxMB: 423,
    license: "CC BY-SA 4.0",
    citation: "Fick & Hijmans 2017, WorldClim 2.",
    notes: "Needed for earth-xl and any regional crop. 4.6 km/px.",
  },
  {
    id: "worldclim-prec-2.5m",
    title: "WorldClim 2.1 precipitation, 2.5 arc-min",
    feeds: ["humidity", "crop", "water"],
    url: "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_2.5m_prec.zip",
    format: "zip",
    dest: "worldclim/wc2.1_2.5m_prec",
    extract: true,
    approxMB: 69,
    license: "CC BY-SA 4.0",
    citation: "Fick & Hijmans 2017, WorldClim 2.",
    notes: "Needed for earth-xl and any regional crop. 4.6 km/px.",
  },

  // ── Humidity / precipitation ──
  {
    id: "worldclim-prec",
    title: "WorldClim 2.1 precipitation, 10 arc-min (12 monthly rasters)",
    feeds: ["humidity", "crop", "water"],
    url: "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_prec.zip",
    format: "zip",
    dest: "worldclim/wc2.1_10m_prec",
    extract: true,
    approxMB: 6.9,
    license: "CC BY-SA 4.0",
    citation: "Fick & Hijmans 2017, WorldClim 2.",
    notes:
      "Annual total → `humidity`. Cleaner than the CRU-TS monthly time-series already in world-maps (those are 120 dated files; these are climate normals).",
  },
  {
    id: "worldclim-bio",
    title: "WorldClim 2.1 bioclimatic variables, 10 arc-min (BIO1-19)",
    feeds: ["crop", "humidity"],
    url: "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip",
    format: "zip",
    dest: "worldclim/wc2.1_10m_bio",
    extract: true,
    approxMB: 47.6,
    license: "CC BY-SA 4.0",
    citation: "Fick & Hijmans 2017, WorldClim 2.",
    notes:
      "BIO1 (annual mean temp), BIO12 (annual precip), BIO4 (temp seasonality) are strong `crop` predictors — growing-season logic without hand-rolling it from the monthlies.",
  },

  // ── Freshwater: rivers + lakes → the `water` plane ──
  {
    id: "hydrorivers",
    title: "HydroRIVERS v1.0 global river network",
    feeds: ["water"],
    url: "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_shp.zip",
    format: "shapefile-zip",
    dest: "hydrosheds/HydroRIVERS_v10",
    extract: true,
    approxMB: 519,
    license: "CC BY 4.0 (HydroSHEDS, non-commercial-friendly attribution)",
    citation:
      "Lehner, B., Grill G. (2013). Global river hydrography and network routing. Hydrological Processes, 27(15): 2171-2186.",
    notes:
      "Has a DISCHARGE (m³/s) attribute — rasterize weighted by discharge so the Nile/Amazon dominate a creek, then distance-diffuse into `water`.",
  },
  {
    id: "hydrolakes",
    title: "HydroLAKES v1.0 global lake polygons",
    feeds: ["water"],
    url: "https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip",
    format: "shapefile-zip",
    dest: "hydrosheds/HydroLAKES_polys_v10",
    extract: true,
    approxMB: 782,
    license: "CC BY 4.0",
    citation:
      "Messager, M.L., Lehner, B., Grill, G., Nedeva, I., Schmitt, O. (2016). Nature Communications 7:13603.",
    notes:
      "1.4M lakes >10ha. Big lakes should also punch water into the terrain image, not just the `water` plane.",
  },
  {
    id: "ne-lakes",
    title: "Natural Earth 10m lakes",
    feeds: ["water", "terrain"],
    url: "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip",
    format: "shapefile-zip",
    dest: "naturalearth/ne_10m_lakes",
    extract: true,
    approxMB: 2.2,
    license: "Public domain",
    citation: "Made with Natural Earth.",
    notes:
      "Lightweight fallback / sanity-check for HydroLAKES. At 19.6 km/tile only the Great Lakes, Caspian, Victoria etc. survive anyway — this may be all you need.",
  },
  {
    id: "ne-rivers",
    title: "Natural Earth 10m rivers + lake centerlines",
    feeds: ["water"],
    url: "https://naciscdn.org/naturalearth/10m/physical/ne_10m_rivers_lake_centerlines.zip",
    format: "shapefile-zip",
    dest: "naturalearth/ne_10m_rivers",
    extract: true,
    approxMB: 2.0,
    license: "Public domain",
    citation: "Made with Natural Earth.",
    notes:
      "2 MB vs HydroRIVERS' 519 MB. At global scale this is arguably the better input — try it first.",
  },

  // ── Nations: the role-play hook (info.json nations[]) ──
  {
    id: "ne-popplaces",
    title: "Natural Earth 10m populated places",
    feeds: ["nations"],
    url: "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip",
    format: "shapefile-zip",
    dest: "naturalearth/ne_10m_populated_places",
    extract: true,
    approxMB: 2.7,
    license: "Public domain",
    citation: "Made with Natural Earth.",
    notes:
      "~7.3k cities with lat/lon, population, and a capital flag (FEATURECLA). Filter to admin-0 capitals → one spawn per country, projected to tile coords → info.json nations[]. This is what makes the map feel like Earth rather than a heightmap.",
  },
  {
    id: "ne-countries",
    title: "Natural Earth 10m admin-0 countries",
    feeds: ["nations", "colors"],
    url: "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip",
    format: "shapefile-zip",
    dest: "naturalearth/ne_10m_admin_0_countries",
    extract: true,
    approxMB: 4.7,
    license: "Public domain",
    citation: "Made with Natural Earth.",
    notes:
      "Country polygons with ISO_A2 codes — the `flag` field in nations[] wants exactly that (the classic `world` map uses 'us', 'ca', ...). Also lets us name/colour territory by real country.",
  },

  // ── Crop fertility ──
  {
    id: "sedac-npp",
    title: "SEDAC Net Primary Productivity (NPP), 0.25°",
    feeds: ["crop"],
    url: "",
    format: "geotiff",
    dest: "npp-geotiff",
    vendored: true,
    approxMB: 3,
    license: "CC BY 4.0",
    citation:
      "Imhoff, M.L. et al. 2004. Global patterns in human consumption of net primary production. Nature 429:870-873. Distributed by SEDAC.",
    notes:
      "ALREADY IN world-maps. 0.25° ≈ 28 km, slightly coarser than a 19.6 km tile — bilinear-resample up. Best direct proxy for agricultural fertility we have.",
  },
  {
    id: "ecoregions",
    title: "RESOLVE Ecoregions 2017",
    feeds: ["crop", "colors"],
    url: "",
    format: "shapefile-zip",
    dest: "Ecoregions2017",
    vendored: true,
    approxMB: 60,
    license: "CC BY 4.0",
    citation:
      "Dinerstein, E. et al. 2017. An Ecoregion-Based Approach to Protecting Half the Terrestrial Realm. BioScience 67(6):534-545.",
    notes:
      "ALREADY IN world-maps. Biome classes give both a crop multiplier (desert vs temperate grassland) and a believable palette for terrain-colors.png.",
  },
  {
    id: "chelsa-cmi",
    title: "CHELSA Climate Moisture Index, monthly (1981-2010)",
    feeds: ["humidity", "crop"],
    url: "",
    format: "geotiff",
    dest: "CHELSA_monthy_cmi_aggregates",
    vendored: true,
    optional: true,
    approxMB: 1500,
    license: "CC0",
    citation:
      "Karger, D.N. et al. 2017. Climatologies at high resolution for the earth's land surface areas. Scientific Data 4:170122.",
    notes:
      "ALREADY IN world-maps. Precip minus evapotranspiration — a better aridity signal than raw precipitation. 30 arc-sec is heavy overkill at global scale; more useful for regional maps.",
  },

  // ── Metal ─────────────────────────────────────────────────────────────────
  // MRDS is a *US* survey: measured 87.5% of its 304,632 records are in the
  // United States (Australia 0.4%, Canada 0.5% — both mining superpowers).
  // Kernel-densifying it would hand North America essentially all the metal on
  // Earth. So it is NOT the base field; the satellite-observed Maus grid is.
  {
    id: "maus-mining",
    title: "Maus et al. v2 — global mining land use, 5 arc-min grid",
    feeds: ["metal"],
    url: "https://download.pangaea.de/dataset/942325/files/global_miningarea_v2_5arcminute.tif",
    format: "geotiff",
    dest: "maus/global_miningarea_v2_5arcminute.tif",
    approxMB: 1.2,
    license: "CC BY-SA 4.0",
    citation:
      "Maus, V. et al. (2022). An update on global mining land use. Scientific Data 9:433. PANGAEA doi:10.1594/PANGAEA.942325",
    notes:
      "THE `metal` base field. 4320×2160 float32, EPSG:4326, bounds exactly (-180,-90,180,90) — a clean 2.11× of our 2048×1024, so it block-sums with NO reprojection. Value = mining area km²/cell. Satellite-observed, so it has no national-reporting bias BY CONSTRUCTION: Asia 30%, S.America 23%, N.America 14%, Africa 10%, Australia 8%, Europe 5%. Heavy-tailed (max 84 km²/cell) and sparse (only ~1.2% of tiles nonzero) — take log1p and Gaussian-blur σ≈4 tiles into a density field, or 99% of the map reads metal=0.",
  },
  {
    id: "maus-polygons",
    title: "Maus et al. v2 — global mining polygons",
    feeds: ["metal"],
    url: "https://download.pangaea.de/dataset/942325/files/global_mining_polygons_v2.gpkg",
    format: "geopackage",
    dest: "maus/global_mining_polygons_v2.gpkg",
    approxMB: 23.5,
    optional: true,
    license: "CC BY-SA 4.0",
    citation: "Maus, V. et al. (2022). Scientific Data 9:433.",
    notes:
      "Vector form of the same data — only needed if we want mine footprints sharper than the 5-arcmin grid. At ~20 km/tile the raster is sufficient.",
  },
  {
    id: "usgs-gmra-copper",
    title: "USGS Global Mineral Resource Assessment — copper tracts",
    feeds: ["metal"],
    url: "https://mrdata.usgs.gov/sir20105090z/sir20105090z-csv.zip",
    format: "shapefile-zip",
    dest: "usgs/gmra-copper",
    extract: true,
    approxMB: 61,
    license: "Public domain (US Government work)",
    citation:
      "U.S. Geological Survey, Global Mineral Resource Assessment, SIR 2010-5090-Z.",
    notes:
      "Geological plausibility term. 192 porphyry-copper + 48 sed-hosted-copper permissive-tract POLYGONS (17.8M km², global). `pcu_tracts.csv` carries `meancu_km2` — assessed copper tonnes PER KM², a ready-made richness density. Adds *undiscovered* potential (Andes, Tethyan belt, SW Pacific arcs) so the map reads geological, not just industrial. Africa has 1 tract (porphyry Cu genuinely isn't an African province) — so blend, never use alone.",
  },
  {
    id: "usgs-minfac",
    title: "USGS mineral operations OUTSIDE the United States",
    feeds: ["metal"],
    url: "https://mrdata.usgs.gov/mineral-operations/minfac.zip",
    format: "shapefile-zip",
    dest: "usgs/minfac",
    extract: true,
    approxMB: 0.5,
    license: "Public domain (US Government work)",
    citation: "U.S. Geological Survey Minerals Yearbook facility database.",
    notes:
      "The literal antidote to MRDS: 6,478 facility points that are, by definition, the non-US half of the world (Europe 32%, Asia 31%, Africa 19%, S.Am 9%, Oceania 6%, N.Am 4%). Pair with MRDS and the bias cancels. Has commodity/capacity/status.",
  },
  {
    id: "usgs-major-deposits",
    title: "USGS major mineral deposits of the world",
    feeds: ["metal"],
    url: "https://mrdata.usgs.gov/major-deposits/ofr20051294-csv.zip",
    format: "shapefile-zip",
    dest: "usgs/major-deposits",
    extract: true,
    approxMB: 0.3,
    license: "Public domain (US Government work)",
    citation: "U.S. Geological Survey OFR 2005-1294.",
    notes:
      "3,161 global deposit points, commodity-tagged. Africa 33%, Asia 28%, N.Am 19%, Europe 12% — a sane global spread. Cheap sprinkle term.",
  },
  {
    id: "usgs-mrds",
    title: "USGS Mineral Resources Data System (MRDS)",
    feeds: ["metal"],
    url: "https://mrdata.usgs.gov/mrds/mrds-csv.zip",
    format: "csv-zip",
    dest: "usgs/mrds",
    extract: true,
    approxMB: 24.6,
    optional: true,
    license: "Public domain (US Government work)",
    citation:
      "U.S. Geological Survey, Mineral Resources Data System, Reston, Virginia.",
    notes:
      "DEMOTED — do not use as a global density source. 304,632 points but 87.5% are in the US. Optional, low-weight, US regional TEXTURE only, and only after per-unit-area normalization against usgs-minfac. Maus already sees every US mine from orbit with the same eyes it uses on Chile.",
  },

  // ── Oil ───────────────────────────────────────────────────────────────────
  // Sparseness was the problem: assessment units don't tile the globe. Measured
  // coverage of a 2048×1024 grid — GOGI Basins 29.5%, DDS-69-FF AUs 5.3%,
  // WPA-2000 AUs 4.5%. Basins are the substrate; the AUs/fields are bonuses
  // painted on top (only ~2k cells of them fall outside a basin).
  // Note: certmapper/energy.cr.usgs.gov are dead as data hosts — everything
  // migrated to ScienceBase/pubs, which is why the old petroleum links 404.
  {
    id: "netl-gogi",
    title: "NETL GOGI — Global Oil & Gas Features Database",
    feeds: ["oil"],
    url: "https://edx.netl.doe.gov/dataset/27625d9b-4a28-4bdf-bc5c-09834f7a9dfb/resource/997be944-340a-4a4e-a632-a0495092f355/download/GOGI_V10_2.gdb.zip",
    format: "filegdb-zip",
    dest: "netl/gogi",
    extract: true,
    approxMB: 147,
    license: "Public domain (US DOE / NETL)",
    citation:
      "National Energy Technology Laboratory, Global Oil & Gas Features Database (GOGI) v1.0.2.",
    notes:
      "THE `oil` substrate. The `Basins` layer is the prize: 1,046 global sedimentary-basin POLYGONS with `MAX_FILLKM` (max sediment fill, km, 0-23, populated on 774) — deep basin = more source rock = the oil-richness weight. Covers 29.5% of our grid, 6.6× the WPA-2000 AUs, and correctly leaves cratonic shields/orogens at zero (the Canadian Shield SHOULD be oil-dead). Also carries `SUB_REGIME` (Passive Margin, Rift, Fore-arc...) to boost productive regimes. Effectively a Robertson/CGG-style basin framework redistributed free. Also has `Fields` (25,236 polygons — usable as a low-weight hotspot bonus, but US/N-Sea biased and its `Commodity` field is dirty). IGNORE its `Wells` layer (736k points, hopelessly US-biased). CRS is Eckert IV (ESRI:54012) — MUST reproject to EPSG:4326 before rasterizing.",
  },
  {
    id: "usgs-dds69ff",
    title: "USGS DDS-69-FF — World Petroleum Resources assessment units",
    feeds: ["oil"],
    url: "https://pubs.usgs.gov/dds/dds-069/dds-069-ff/geodatabase.zip",
    format: "filegdb-zip",
    dest: "usgs/dds69ff",
    extract: true,
    approxMB: 102,
    license: "Public domain (US Government work)",
    citation:
      "U.S. Geological Survey, Digital Data Series DDS-69-FF, World Petroleum Resources Project.",
    notes:
      "Known-resource bonus, and a strict upgrade over WPA-2000: `WEP_AU` (270 world assessment-unit polygons; better spread — Asia 90, Africa 60, S.Am 51) plus `CARA_AU` (70 Circum-Arctic units, which WPA-2000 lacks entirely). Multiply the basin value ~1.5-2× inside an AU. Caveat: the polygons carry NO volumes — attributes are just AU_CODE/AU_NAME/TPS_CODE. Real MMBO numbers live in the sibling exceltables.zip/tabtables.zip, joinable on AU_CODE.",
  },
  {
    id: "usgs-oilgas",
    title: "USGS World Petroleum Assessment 2000 — Assessment Unit polygons",
    feeds: ["oil"],
    url: "https://www.sciencebase.gov/catalog/file/get/60bfec21d34e86b938917fa7",
    format: "shapefile-zip",
    dest: "usgs/oilgas-au",
    extract: true,
    approxMB: 1.5,
    optional: true,
    license: "Public domain (US Government work)",
    citation:
      "U.S. Geological Survey World Petroleum Assessment 2000. Distributed via ScienceBase.",
    notes:
      "DEMOTED — superseded by usgs-dds69ff (more units, better spread, plus Arctic) and 98% subsumed by netl-gogi's basins. Kept only because `au_sumg.shp` + usgs-oilgas-tabular is the one pairing that yields actual assessed VOLUMES (auvol.tab: Cumulative/Remaining Oil in MMBO, joined on AU code).",
  },
  {
    id: "usgs-oilgas-tabular",
    title: "USGS DDS-60 tabular assessment results (per-AU resource volumes)",
    feeds: ["oil"],
    url: "https://www.sciencebase.gov/catalog/file/get/660b1cbbd34e4df16bd58c35",
    format: "zip",
    dest: "usgs/oilgas-tabular",
    extract: true,
    approxMB: 0.65,
    license: "Public domain (US Government work)",
    citation: "U.S. Geological Survey, DDS-60. Distributed via ScienceBase.",
    notes:
      "Joins to usgs-oilgas by AU code. Use it to weight each polygon by actual assessed volume so the Persian Gulf outranks a marginal basin.",
  },
  {
    id: "usgs-provinces",
    title: "USGS Geologic Provinces of the World",
    feeds: ["oil", "metal"],
    url: "https://www.sciencebase.gov/catalog/file/get/60ad2fd7d34e4043c850edb3",
    format: "shapefile-zip",
    dest: "usgs/geologic-provinces",
    extract: true,
    approxMB: 13,
    optional: true,
    license: "Public domain (US Government work)",
    citation: "U.S. Geological Survey World Petroleum Assessment 2000.",
    notes:
      "Full province coverage INCLUDING unassessed provinces — union with usgs-oilgas if the AU polygons leave too much of the map at oil=0.",
  },
  {
    id: "globsed",
    title: "GlobSed v3 — global sediment thickness (5 arc-min)",
    feeds: ["oil"],
    url: "https://data.caltech.edu/records/k4070-ngc79/files/GlobSed.zip?download=1",
    format: "zip",
    dest: "globsed",
    extract: true,
    approxMB: 64.6,
    optional: true,
    license: "CC BY 4.0",
    citation:
      "Straume, E.O. et al. (2019). GlobSed: Updated total sediment thickness in the world's oceans. Geochemistry, Geophysics, Geosystems, 20.",
    notes:
      "Continuous fallback proxy for `oil` — thick sedimentary basins are where oil is. Use to smooth/fill the discrete USGS polygons. NOAA NCEI decommissioned this in mid-2025; CaltechDATA is the live archive (HEAD 403s via the S3 redirect — GET works, which is what the downloader does).",
  },
];

export function byId(id: string): Dataset | undefined {
  return DATASETS.find((d) => d.id === id);
}

/** Datasets in the default build: not optional, not vendored, URL known. */
export function defaultDownloads(): Dataset[] {
  return DATASETS.filter((d) => !d.optional && !d.vendored && d.url !== "");
}

/** Needed for the pipeline but with no resolved URL yet — surfaced loudly. */
export function unresolved(): Dataset[] {
  return DATASETS.filter((d) => !d.vendored && d.url === "");
}

/** Absolute on-disk path for a dataset. */
export function destPath(d: Dataset): string {
  return path.join(dataRoot(), d.dest);
}

/** Vendored datasets must already exist; report if one has gone missing. */
export function vendoredMissing(): Dataset[] {
  return DATASETS.filter((d) => d.vendored && !fs.existsSync(destPath(d)));
}
