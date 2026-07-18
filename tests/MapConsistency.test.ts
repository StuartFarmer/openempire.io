import fs from "fs";
import path from "path";
import { expectedElevationByteLength } from "../src/core/game/ElevationMap";
import { GameMapName, GameMapType, MapInfo, maps } from "../src/core/game/Game";
import { expectedHydroByteLength } from "../src/core/game/HydroMap";
import { expectedSeasonByteLength } from "../src/core/game/SeasonMap";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a GameMapName enum key to its folder name (lowercase key). */
function toFolderName(key: GameMapName): string {
  return key.toLowerCase();
}

const ROOT = path.resolve(__dirname, "..");
const MAP_GEN_MAPS = path.join(ROOT, "map-generator", "assets", "maps");
const RESOURCES_MAPS = path.join(ROOT, "resources", "maps");
const EN_JSON = path.join(ROOT, "resources", "lang", "en.json");

const allMapKeys = Object.keys(GameMapType) as GameMapName[];

// Maps excluded from the frequency requirement (not part of regular playlists).
const FREQUENCY_EXEMPTIONS: Set<GameMapName> = new Set([
  // Generated maps (world-engine generator output, not in multiplayer rotation).
  "MajorMenor",
  "Pangea001",
  "Pangea002",
  "Verdantia",
  "Estuaria",
  // Built from real-world geospatial data (map-generator/earth), not in rotation.
  "Earth",
  "EarthMini",
  "EarthXL",
  "SPQR",
]);

// Keys in the en.json "map" section that are UI strings, not map names.
const EN_JSON_META_KEYS = new Set([
  "map",
  "featured",
  "all",
  "favorites",
  "random",
]);

/** Get the en.json "map" section. */
function getEnJsonMapSection(): Record<string, string> {
  const content = JSON.parse(fs.readFileSync(EN_JSON, "utf8"));
  return content.map as Record<string, string>;
}

const mapsById = new Map<GameMapName, MapInfo>(maps.map((m) => [m.id, m]));

/** Read the parsed info.json for a map, or null if missing. */
function readInfoJson(key: GameMapName): Record<string, unknown> | null {
  const infoPath = path.join(MAP_GEN_MAPS, toFolderName(key), "info.json");
  if (!fs.existsSync(infoPath)) return null;
  return JSON.parse(fs.readFileSync(infoPath, "utf8"));
}

/** The generator treats falsy info.json values (0, "") as "omitted". */
function orOmitted(value: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return value || undefined;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Map consistency", () => {
  test("Every GameMapType has map-generator assets (image.png + info.json only)", () => {
    const errors: string[] = [];
    for (const key of allMapKeys) {
      const folder = toFolderName(key);
      const dir = path.join(MAP_GEN_MAPS, folder);

      if (!fs.existsSync(dir)) {
        errors.push(
          `${key}: directory "${folder}" missing in map-generator/assets/maps/`,
        );
        continue;
      }

      const files = fs.readdirSync(dir).sort();
      // Every map must ship the full source set — both sidecars are mandatory
      // (retrofit legacy sources with `npx tsx map-generator/derive-layers.ts`).
      const required = [
        "elevation.bin",
        "hydro.bin",
        "image.png",
        "info.json",
        "layers.bin",
        "terrain-colors.png",
      ];
      // season.bin is an optional sidecar (real-data maps only).
      const optional = ["season.bin"];
      const missing = required.filter((f) => !files.includes(f));
      const unexpected = files.filter(
        (f) => !required.includes(f) && !optional.includes(f),
      );
      if (missing.length > 0 || unexpected.length > 0) {
        errors.push(
          `${key}: expected [${required.join(", ")}] but found [${files.join(", ")}]`,
        );
      }
    }
    if (errors.length > 0) {
      throw new Error("Map generator asset violations:\n" + errors.join("\n"));
    }
  });

  test("The maps list and GameMapType match one-to-one", () => {
    const errors: string[] = [];
    for (const key of allMapKeys) {
      if (!mapsById.has(key)) {
        errors.push(`${key} has no entry in the generated maps list`);
      }
    }
    for (const m of maps) {
      if (!(m.id in GameMapType)) {
        errors.push(`maps list entry "${m.id}" is not a GameMapType key`);
      }
    }
    if (maps.length !== mapsById.size) {
      errors.push("maps list contains duplicate ids");
    }
    if (errors.length > 0) {
      throw new Error("maps list violations:\n" + errors.join("\n"));
    }
  });

  // Maps.gen.ts is generated from the info.json files by the map-generator.
  // If this test fails, run `npm run gen-maps` to regenerate it.
  test("info.json metadata matches the generated Maps.gen.ts", () => {
    const errors: string[] = [];
    for (const key of allMapKeys) {
      const info = readInfoJson(key);
      const map = mapsById.get(key);
      if (info === null || map === undefined) {
        continue; // Other tests catch missing files/entries.
      }
      const value = GameMapType[key];
      if (info.id !== key) {
        errors.push(`${key}: info.json id is "${info.id}", expected "${key}"`);
      }
      if (info.name !== value) {
        errors.push(
          `${key}: info.json name is "${info.name}", but GameMapType.${key} is "${value}"`,
        );
      }
      const fields: [string, unknown, unknown][] = [
        ["categories", info.categories, map.categories],
        ["translation_key", info.translation_key, map.translationKey],
        [
          "multiplayer_frequency",
          info.multiplayer_frequency ?? 0,
          map.multiplayerFrequency,
        ],
        ["featured_rank", orOmitted(info.featured_rank), map.featuredRank],
        [
          "special_team_count",
          orOmitted(info.special_team_count),
          map.specialTeamCount,
        ],
      ];
      for (const [field, infoValue, mapValue] of fields) {
        if (JSON.stringify(infoValue) !== JSON.stringify(mapValue)) {
          errors.push(
            `${key}: info.json ${field} is ${JSON.stringify(infoValue)}, but the maps list has ${JSON.stringify(mapValue)}`,
          );
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(
        "info.json and Maps.gen.ts are out of sync (run `npm run gen-maps`):\n" +
          errors.join("\n"),
      );
    }
  });

  test("Every GameMapType (except exemptions) has a positive multiplayer_frequency", () => {
    const errors: string[] = [];
    for (const key of allMapKeys) {
      if (FREQUENCY_EXEMPTIONS.has(key)) continue;
      const info = readInfoJson(key);
      if (info === null) continue; // Other tests catch missing files.
      const freq = info.multiplayer_frequency;
      if (typeof freq !== "number" || freq <= 0) {
        errors.push(
          `${key} has multiplayer_frequency ${JSON.stringify(freq)} in info.json (must be > 0, or add the map to FREQUENCY_EXEMPTIONS)`,
        );
      }
    }
    if (errors.length > 0) {
      throw new Error(
        "Maps missing a multiplayer frequency (not exempted):\n" +
          errors.join("\n"),
      );
    }
  });

  // The en.json "map" section is generated from the info.json files.
  // If this test fails, run `npm run gen-maps` to regenerate it.
  test("en.json map translations match info.json display names", () => {
    const enMapSection = getEnJsonMapSection();
    const errors: string[] = [];
    for (const key of allMapKeys) {
      const folder = toFolderName(key);
      const info = readInfoJson(key);
      if (info === null) continue; // Other tests catch missing files.
      const expected = orOmitted(info.display_name) ?? info.name;
      if (enMapSection[folder] === undefined) {
        errors.push(
          `${key} (key "${folder}") is missing from en.json map translations`,
        );
      } else if (enMapSection[folder] !== expected) {
        errors.push(
          `${key}: en.json map.${folder} is "${enMapSection[folder]}", but info.json says "${expected}"`,
        );
      }
    }
    const validKeys = new Set(allMapKeys.map((k) => toFolderName(k)));
    for (const enKey of Object.keys(enMapSection)) {
      if (!EN_JSON_META_KEYS.has(enKey) && !validKeys.has(enKey)) {
        errors.push(`en.json map.${enKey} does not match any map`);
      }
    }
    if (errors.length > 0) {
      throw new Error(
        "en.json map section is out of sync (run `npm run gen-maps`):\n" +
          errors.join("\n"),
      );
    }
  });

  test("Every GameMapType has resources/maps/ with map.bin, both sidecars, thumbnail, and manifest", () => {
    const errors: string[] = [];
    const requiredFiles = [
      "manifest.json",
      "map.bin",
      "layers.bin",
      "elevation.bin",
      "hydro.bin",
      "terrain-colors.png",
      "thumbnail.webp",
    ];

    for (const key of allMapKeys) {
      const folder = toFolderName(key);
      const dir = path.join(RESOURCES_MAPS, folder);

      if (!fs.existsSync(dir)) {
        errors.push(`${key}: directory "${folder}" missing in resources/maps/`);
        continue;
      }

      const files = fs.readdirSync(dir);
      for (const req of requiredFiles) {
        if (!files.includes(req)) {
          errors.push(`${key}: missing "${req}" in resources/maps/${folder}/`);
        }
      }
    }
    if (errors.length > 0) {
      throw new Error("Resource map file violations:\n" + errors.join("\n"));
    }
  });

  test("Every manifest declares all sidecars (layers + terrain_colors + elevation)", () => {
    const errors: string[] = [];
    for (const key of allMapKeys) {
      const folder = toFolderName(key);
      const manifestPath = path.join(RESOURCES_MAPS, folder, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue; // Other tests catch this.
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.layers !== true) {
        errors.push(`${key}: manifest.layers is ${manifest.layers}`);
      }
      if (manifest.terrain_colors !== true) {
        errors.push(
          `${key}: manifest.terrain_colors is ${manifest.terrain_colors}`,
        );
      }
      if (manifest.elevation !== true) {
        errors.push(`${key}: manifest.elevation is ${manifest.elevation}`);
      }
      if (manifest.hydro !== true) {
        errors.push(`${key}: manifest.hydro is ${manifest.hydro}`);
      }
    }
    if (errors.length > 0) {
      throw new Error(
        "There is exactly one game mode — every map must ship layers.bin, terrain-colors.png, elevation.bin, and hydro.bin:\n" +
          errors.join("\n"),
      );
    }
  });

  test("Every elevation.bin matches the manifest dimensions and a render config travels with it", () => {
    const errors: string[] = [];
    for (const key of allMapKeys) {
      const folder = toFolderName(key);
      const manifestPath = path.join(RESOURCES_MAPS, folder, "manifest.json");
      const elevationPath = path.join(RESOURCES_MAPS, folder, "elevation.bin");
      if (!fs.existsSync(manifestPath) || !fs.existsSync(elevationPath)) {
        continue; // Other tests catch missing files.
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const expected = expectedElevationByteLength(
        manifest.map.width,
        manifest.map.height,
      );
      const actual = fs.statSync(elevationPath).size;
      if (actual !== expected) {
        errors.push(
          `${key}: elevation.bin is ${actual} bytes, expected ${expected} (${manifest.map.width}x${manifest.map.height} u16)`,
        );
      }
      const hydroPath = path.join(RESOURCES_MAPS, folder, "hydro.bin");
      if (fs.existsSync(hydroPath)) {
        const hydroExpected = expectedHydroByteLength(
          manifest.map.width,
          manifest.map.height,
        );
        const hydroActual = fs.statSync(hydroPath).size;
        if (hydroActual !== hydroExpected) {
          errors.push(
            `${key}: hydro.bin is ${hydroActual} bytes, expected ${hydroExpected} (2 planes × ${manifest.map.width}x${manifest.map.height})`,
          );
        }
      }
      // season.bin is optional; when present it must match, and the manifest
      // flag must agree with the file.
      const seasonPath = path.join(RESOURCES_MAPS, folder, "season.bin");
      const hasSeason = fs.existsSync(seasonPath);
      if (hasSeason !== (manifest.season === true)) {
        errors.push(
          `${key}: season.bin ${hasSeason ? "exists" : "missing"} but manifest.season is ${manifest.season}`,
        );
      }
      if (hasSeason) {
        const seasonExpected = expectedSeasonByteLength(
          manifest.map.width,
          manifest.map.height,
        );
        const seasonActual = fs.statSync(seasonPath).size;
        if (seasonActual !== seasonExpected) {
          errors.push(
            `${key}: season.bin is ${seasonActual} bytes, expected ${seasonExpected} (2 planes × ${manifest.map.width}x${manifest.map.height})`,
          );
        }
      }
      const config = manifest.world_engine;
      if (typeof config !== "object" || config === null) {
        errors.push(`${key}: manifest has no world_engine render config`);
        continue;
      }
      // The keys runtime derivation needs to replay the worldgen passes —
      // see WorldEngineManifestConfig in TerrainMapLoader.ts.
      const requiredKeys = [
        "seed",
        "seaLevel",
        "continentScale",
        "mountainStrength",
        "latitudeEffect",
        "elevationCooling",
        "rainNoise",
        "warmthRainfall",
        "riverFlowRetention",
        "lakeWaterThreshold",
        "lakeElevationRange",
        "riverWeakThreshold",
        "riverStrongThreshold",
      ];
      for (const k of requiredKeys) {
        if (typeof config[k] !== "number") {
          errors.push(
            `${key}: manifest world_engine.${k} is ${JSON.stringify(config[k])} (must be a number)`,
          );
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(
        "elevation.bin / world_engine violations (retrofit with derive-layers.ts + gen-maps):\n" +
          errors.join("\n"),
      );
    }
  });

  test("No excess folders in resources/maps/ or map-generator/assets/maps/", () => {
    const expectedFolders = new Set(allMapKeys.map((k) => toFolderName(k)));
    const errors: string[] = [];

    const resourceDirs = fs
      .readdirSync(RESOURCES_MAPS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of resourceDirs) {
      if (!expectedFolders.has(dir)) {
        errors.push(`resources/maps/${dir}/ has no matching GameMapType entry`);
      }
    }

    const genDirs = fs
      .readdirSync(MAP_GEN_MAPS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of genDirs) {
      if (!expectedFolders.has(dir)) {
        errors.push(
          `map-generator/assets/maps/${dir}/ has no matching GameMapType entry`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error("Excess map folders:\n" + errors.join("\n"));
    }
  });

  test("Nations in info.json and manifest.json should match", () => {
    const errors: string[] = [];

    for (const key of allMapKeys) {
      const folder = toFolderName(key);
      const infoPath = path.join(MAP_GEN_MAPS, folder, "info.json");
      const manifestPath = path.join(RESOURCES_MAPS, folder, "manifest.json");

      if (!fs.existsSync(infoPath) || !fs.existsSync(manifestPath)) {
        continue; // Other tests catch missing files.
      }

      try {
        const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

        // ── Compare nations ──────────────────────────────────────────────
        type NationEntry = {
          name: string;
          coordinates?: [number, number];
        };

        function compareNationArrays(
          label: string,
          infoArr: NationEntry[],
          manifestArr: NationEntry[],
        ): void {
          if (infoArr.length !== manifestArr.length) {
            errors.push(
              `${key}: ${label} count mismatch — info.json has ${infoArr.length}, manifest.json has ${manifestArr.length}`,
            );
            return;
          }
          for (let i = 0; i < infoArr.length; i++) {
            const inf = infoArr[i];
            const man = manifestArr[i];
            if (inf.name !== man.name) {
              errors.push(
                `${key}: ${label}[${i}] name mismatch — info.json "${inf.name}" vs manifest.json "${man.name}"`,
              );
              continue;
            }
            const infHasCoords = inf.coordinates !== undefined;
            const manHasCoords = man.coordinates !== undefined;
            if (infHasCoords !== manHasCoords) {
              errors.push(
                `${key}: ${label} "${inf.name}" (index ${i}) coordinate presence differs — info.json ${infHasCoords ? "has" : "missing"} coordinates, manifest.json ${manHasCoords ? "has" : "missing"} coordinates`,
              );
              continue;
            }
            if (inf.coordinates && man.coordinates) {
              const [ix, iy] = inf.coordinates;
              const [mx, my] = man.coordinates;
              if (ix !== mx || iy !== my) {
                errors.push(
                  `${key}: ${label} "${inf.name}" (index ${i}) coordinates differ — info.json [${ix}, ${iy}] vs manifest.json [${mx}, ${my}]`,
                );
              }
            }
          }
        }

        const toEntry = (n: NationEntry) => ({
          name: n.name,
          coordinates: n.coordinates,
        });

        compareNationArrays(
          "nation",
          (info.nations ?? []).map(toEntry),
          (manifest.nations ?? []).map(toEntry),
        );

        compareNationArrays(
          "additionalNation",
          (info.additionalNations ?? []).map(toEntry),
          (manifest.additionalNations ?? []).map(toEntry),
        );
      } catch (err) {
        errors.push(`${key}: failed to parse JSON — ${(err as Error).message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        "Nation data mismatches between info.json and manifest.json:\n" +
          errors.join("\n"),
      );
    }
  });

  test("Map metadata in info.json and manifest.json should match", () => {
    const metadataKeys = [
      "id",
      "name",
      "display_name",
      "translation_key",
      "categories",
      "multiplayer_frequency",
      "featured_rank",
      "special_team_count",
      "world_engine",
    ];
    const errors: string[] = [];

    for (const key of allMapKeys) {
      const info = readInfoJson(key);
      const manifestPath = path.join(
        RESOURCES_MAPS,
        toFolderName(key),
        "manifest.json",
      );
      if (info === null || !fs.existsSync(manifestPath)) {
        continue; // Other tests catch missing files.
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

      // Go's JSON marshaller sorts object keys; compare order-insensitively.
      const canonical = (value: unknown): string =>
        JSON.stringify(value, (_, v: unknown) =>
          typeof v === "object" && v !== null && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).sort())
            : v,
        );

      for (const field of metadataKeys) {
        if (canonical(info[field]) !== canonical(manifest[field])) {
          errors.push(
            `${key}: "${field}" mismatch — info.json ${JSON.stringify(info[field])} vs manifest.json ${JSON.stringify(manifest[field])}`,
          );
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(
        "Metadata mismatches between info.json and manifest.json (run `npm run gen-maps`):\n" +
          errors.join("\n"),
      );
    }
  });
});
