#!/usr/bin/env python
"""
ingest.py — stage 1 of the Earth-map pipeline: messy sources -> clean raw fields.

Reads every source in datasets.ts, reprojects/resamples each onto the target
equirectangular grid, and writes ONE file of float32 planes in *physical units*
(metres, degC, mm/yr, km^2 of mining, km of basin fill, m^3/s of discharge).

It deliberately does NOT normalize to 0..255. That is stage 2 (normalize.ts),
which is pure, fast, and shared by the browser tuning page and the CLI baker.
Splitting it this way means retuning the map never re-runs GDAL.

This is the only Python in the repo. It exists because the sources are ESRI file
geodatabases in Eckert IV, 500 MB shapefiles, and multi-band GeoTIFFs — GDAL is
the right tool and there is no credible JS equivalent. It is an offline, dev-only
bake step: nothing here ships, and the simulation never sees it.

Usage:
    map-generator/earth/.venv/bin/python map-generator/earth/ingest.py
    ... --width 2048 --height 1024 --out <dir>

Output (in <dataRoot>/derived/global-<W>x<H>/):
    fields.bin   — concatenated float32 planes, row-major, in FIELDS order
    fields.json  — plane names, units, dimensions, and per-plane statistics
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

# ─────────────────────────── config ───────────────────────────

HERE = Path(__file__).resolve().parent
# Same root as datasets.ts dataRoot(): the world-maps SIBLING of the repo.
# repo/map-generator/earth/ingest.py -> parents[3] is the repo's parent.
DATA = Path(os.environ.get("WORLD_MAPS_DIR") or (Path(__file__).resolve().parents[3] / "world-maps"))

# The raw planes we emit. Order is the file layout; normalize.ts reads by name.
#   name -> (unit, description)
FIELDS: dict[str, tuple[str, str]] = {
    "elevation": ("m", "ETOPO 2022 elevation; +land / -ocean"),
    "land": ("0-1", "Natural Earth land mask (authoritative coastline)"),
    "temperature": ("degC", "WorldClim annual mean temp, gap-filled to coast"),
    "precip": ("mm/yr", "WorldClim annual total precipitation, gap-filled"),
    "npp": ("gC", "SEDAC net primary productivity"),
    "biome": ("class", "RESOLVE ecoregion BIOME_NUM (1-14, 0=none)"),
    "mining": ("km2", "Maus v2 observed mining land area per cell"),
    "cu_density": ("t/km2", "USGS GMRA assessed copper tonnes per km2"),
    "metal_pts": ("count", "Global metal deposit/facility point density"),
    "basin_fill": ("km", "GOGI sedimentary basin max sediment fill"),
    "oil_au": ("0-1", "Inside a USGS petroleum assessment unit"),
    "oil_field": ("0-1", "Inside a GOGI oil/gas field polygon"),
    "river": ("m3/s", "HydroRIVERS discharge (max per cell)"),
    "lake": ("0-1", "HydroLAKES / Natural Earth lake presence"),
}


# The area of the world a map covers, as (lon_min, lat_min, lon_max, lat_max).
# Whole Earth by default; a regional map crops it. Mutated once by main().
BBOX = (-180.0, -90.0, 180.0, 90.0)

# Named crops.
#
# A bbox has to be chosen so the TILES COME OUT SQUARE IN KILOMETRES, or the map
# renders visibly stretched. On an equirectangular grid a degree of longitude is
# only cos(lat) as wide as a degree of latitude, so for a 2:1 grid:
#
#     lon_span = 2 * lat_span * 110.57 / (111.32 * cos(mid_lat))
#
# The whole-Earth map gets away with ignoring this (it IS the whole world, and
# the stretch is the projection). A regional crop does not.
REGIONS: dict[str, tuple[float, float, float, float]] = {
    # SPQR — the Roman world at its greatest extent: Britain to Egypt, Iberia to
    # Mesopotamia, with the Atlantic frontier on the western edge. Solved for
    # square tiles at mid-latitude 41.5 deg => 3.13 x 3.13 km per tile, which is
    # ~6x the detail of the global Earth map.
    "spqr": (-21.0, 27.0, 56.0, 56.0),
}


def bbox_span() -> tuple[float, float]:
    return BBOX[2] - BBOX[0], BBOX[3] - BBOX[1]


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def km_per_tile(w: int, h: int) -> tuple[float, float]:
    """Real ground size of one tile, at the middle latitude of the bbox."""
    dlon, dlat = bbox_span()
    mid_lat = (BBOX[1] + BBOX[3]) / 2
    km_lon = (dlon / w) * 111.32 * math.cos(math.radians(mid_lat))
    km_lat = (dlat / h) * 110.57
    return km_lon, km_lat


# ─────────────────────────── raster helpers ───────────────────────────


def target_transform(w: int, h: int):
    from rasterio.transform import from_bounds

    return from_bounds(BBOX[0], BBOX[1], BBOX[2], BBOX[3], w, h)


def warp_raster(path: Path, w: int, h: int, resampling: str = "average", band: int = 1) -> np.ndarray:
    """Reproject/resample any georeferenced raster onto the target grid."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import reproject

    dst = np.full((h, w), np.nan, dtype="float32")
    with rasterio.open(path) as src:
        # Cast to float BEFORE unmasking: several sources (WorldClim prec) are
        # int16, and NaN cannot be stored in an integer array.
        arr = src.read(band, masked=True).astype("float32").filled(np.nan)
        reproject(
            source=arr,
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs or "EPSG:4326",
            dst_transform=target_transform(w, h),
            dst_crs="EPSG:4326",
            resampling=getattr(Resampling, resampling),
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )
    return dst


def rasterize(gdf, w: int, h: int, value_col: str | None = None, merge: str = "replace") -> np.ndarray:
    """Burn vector features onto the target grid, optionally weighted by a column."""
    from rasterio.features import rasterize as rio_rasterize
    from rasterio.enums import MergeAlg

    if len(gdf) == 0:
        return np.zeros((h, w), dtype="float32")
    if value_col is None:
        shapes = ((geom, 1.0) for geom in gdf.geometry if geom is not None)
    else:
        vals = gdf[value_col].fillna(0).astype("float64")
        shapes = (
            (geom, float(v))
            for geom, v in zip(gdf.geometry, vals)
            if geom is not None and v > 0
        )
    return rio_rasterize(
        shapes,
        out_shape=(h, w),
        transform=target_transform(w, h),
        fill=0.0,
        merge_alg=MergeAlg.add if merge == "add" else MergeAlg.replace,
        dtype="float32",
        all_touched=True,
    )


def read_vector(path: Path, layer: str | None = None, columns: list[str] | None = None):
    """Read a vector source and force it to EPSG:4326 (GOGI ships Eckert IV)."""
    import geopandas as gpd

    gdf = gpd.read_file(path, layer=layer, columns=columns, engine="pyogrio")
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    elif gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(4326)
    return gdf


def fill_nodata(arr: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """
    Nearest-neighbour fill of NaN holes.

    Mandatory, not cosmetic: WorldClim is land-only, and at ~20 km/tile a coastal
    *game-land* tile routinely samples a WorldClim ocean cell. Without this fill
    every coastline would read temperature=0, which is where civilisations
    actually live. Fill from the nearest valid cell instead.
    """
    from scipy.ndimage import distance_transform_edt

    if valid.all():
        return arr
    idx = distance_transform_edt(~valid, return_distances=False, return_indices=True)
    return arr[tuple(idx)]


def blur(arr: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur that wraps in longitude (the map is a cylinder)."""
    from scipy.ndimage import gaussian_filter

    return gaussian_filter(arr, sigma=sigma, mode=("nearest", "wrap"))


# ─────────────────────────── per-source ingest ───────────────────────────


def do_elevation(w, h):
    log("elevation — ETOPO 2022 60s")
    return warp_raster(DATA / "etopo/ETOPO_2022_v1_60s_N90W180_surface.tif", w, h, "average")


def do_land(w, h):
    log("land — Natural Earth 10m coastline")
    gdf = read_vector(DATA / "naturalearth/ne_10m_land/ne_10m_land.shp")
    return rasterize(gdf, w, h)


# WorldClim ships at several resolutions; we want the finest one that is actually
# on disk. 10' is 18.6 km/px — fine for the 19.6 km global map, but an upsample at
# XL (9.8 km/tile) and useless for a regional crop (~3 km/tile), where it would
# smear a continent's worth of climate across the Mediterranean.
WORLDCLIM_RESOLUTIONS = ["30s", "2.5m", "5m", "10m"]  # finest first


def _worldclim_dir(var: str) -> Path:
    for res in WORLDCLIM_RESOLUTIONS:
        d = DATA / "worldclim" / f"wc2.1_{res}_{var}"
        if d.is_dir() and any(d.glob("*.tif")):
            return d
    raise FileNotFoundError(
        f"no WorldClim {var} on disk — run: npm run earth:data fetch --feeds temperature,humidity"
    )


def _worldclim(var: str, w: int, h: int, agg: str):
    d = _worldclim_dir(var)
    tifs = sorted(d.glob("*.tif"))
    log(f"  source: {d.name}")
    if not tifs:
        raise FileNotFoundError(f"no rasters in {d}")
    stack = np.stack([warp_raster(t, w, h, "average") for t in tifs])
    with np.errstate(invalid="ignore"):
        out = np.nanmean(stack, axis=0) if agg == "mean" else np.nansum(stack, axis=0)
    valid = np.isfinite(stack).any(axis=0)
    out = np.where(valid, out, np.nan)
    return fill_nodata(np.nan_to_num(out, nan=0.0), valid)


def do_temperature(w, h):
    log("temperature — WorldClim tavg (12 months -> annual mean, gap-filled)")
    return _worldclim("tavg", w, h, "mean")


def do_precip(w, h):
    log("precip — WorldClim prec (12 months -> annual total, gap-filled)")
    return _worldclim("prec", w, h, "sum")


def do_npp(w, h):
    """
    SEDAC NPP. Two traps here, both of which produce silently plausible garbage:

    1. Values are grams of carbon and span 6e8..1.2e12. Do NOT clamp them to some
       "sane-looking" range — the big numbers ARE the tropics.
    2. It is carbon per CELL, and a 0.25 deg cell shrinks by cos(lat). Left raw,
       that conflates productivity with cell area and quietly under-rates the
       high latitudes. Divide by cos(lat) to get a per-area density, which is
       what a fertility field actually wants.

    Its nodata sentinel (-3.4e38) is declared in the GeoTIFF, so the masked read
    in warp_raster() already handles it; we must not "help" with extra filters.
    """
    log("npp — SEDAC NPP (per-cell carbon -> per-area density via cos(lat))")
    tif = next((DATA / "npp-geotiff").glob("*.tif"), None)
    if tif is None:
        log("  ! no NPP raster; zeros")
        return np.zeros((h, w), dtype="float32")
    a = warp_raster(tif, w, h, "average")
    valid = np.isfinite(a) & (a >= 0)
    a = np.where(valid, a, np.nan)

    lat_top, lat_bot = BBOX[3], BBOX[1]
    lat = np.linspace(lat_top, lat_bot, h, endpoint=False) - ((lat_top - lat_bot) / h) / 2
    coslat = np.clip(np.cos(np.deg2rad(lat)), 0.02, None)[:, None]
    a = a / coslat

    return fill_nodata(np.nan_to_num(a, nan=0.0), valid)


def do_biome(w, h):
    log("biome — RESOLVE Ecoregions 2017")
    shp = next((DATA / "Ecoregions2017").glob("*.shp"), None)
    if shp is None:
        return np.zeros((h, w), dtype="float32")
    gdf = read_vector(shp, columns=["BIOME_NUM"])
    return rasterize(gdf, w, h, "BIOME_NUM")


def do_mining(w, h):
    log("mining — Maus v2 5-arcmin (SUM: it is an area quantity, not an average)")
    # 4320x2160 -> 2048x1024. Values are km^2 PER CELL, so downsampling must SUM,
    # not average, or we silently shrink the world's mining footprint.
    return np.nan_to_num(
        warp_raster(DATA / "maus/global_miningarea_v2_5arcminute.tif", w, h, "sum"),
        nan=0.0,
    )


def do_cu_density(w, h):
    log("cu_density — USGS GMRA copper tracts (meancu_km2)")
    root = DATA / "usgs/gmra-copper"
    shp = next(root.rglob("pcu_tracts.shp"), None)
    csv = next(root.rglob("pcu_tracts.csv"), None)
    if shp is None:
        log("  ! no pcu_tracts.shp; zeros")
        return np.zeros((h, w), dtype="float32")
    gdf = read_vector(shp)
    if csv is not None:
        import pandas as pd

        t = pd.read_csv(csv, encoding="utf-8-sig", low_memory=False)
        t.columns = [c.strip().lower() for c in t.columns]
        gdf.columns = [c.strip().lower() if c != "geometry" else c for c in gdf.columns]
        if "coded_id" in t.columns and "meancu_km2" in t.columns and "coded_id" in gdf.columns:
            gdf = gdf.merge(t[["coded_id", "meancu_km2"]], on="coded_id", how="left")
    out = rasterize(gdf, w, h, "meancu_km2" if "meancu_km2" in gdf.columns else None)
    # Sed-hosted copper tracts too, if present.
    sed = next(root.rglob("sedcu_tracts.shp"), None)
    if sed is not None:
        out = np.maximum(out, rasterize(read_vector(sed), w, h) * float(np.nanmedian(out[out > 0]) or 1.0))
    return out


def do_metal_pts(w, h):
    """
    Global deposit points. Deliberately EXCLUDES MRDS: 87.5% of its 304,632
    records are in the United States, so including it would hand North America
    essentially all the metal on Earth. minfac is by definition the non-US half
    of the world, which is exactly the counterweight we want.
    """
    log("metal_pts — USGS major-deposits + minfac (MRDS excluded: 87.5% US)")
    out = np.zeros((h, w), dtype="float32")
    for sub in ("usgs/major-deposits", "usgs/minfac"):
        shp = next((DATA / sub).rglob("*.shp"), None)
        if shp is None:
            log(f"  ! no shapefile under {sub}")
            continue
        gdf = read_vector(shp)
        out += rasterize(gdf, w, h, None, merge="add")
    return out


def do_basins(w, h):
    log("basin_fill — NETL GOGI Basins (MAX_FILLKM), reprojected from Eckert IV")
    gdb = next((DATA / "netl/gogi").rglob("*.gdb"), None)
    if gdb is None:
        log("  ! GOGI geodatabase missing; zeros")
        return np.zeros((h, w), dtype="float32")
    gdf = read_vector(gdb, layer="Basins")
    cols = {c.upper(): c for c in gdf.columns}
    fill = cols.get("MAX_FILLKM")
    if fill is None:
        return rasterize(gdf, w, h)
    # 272 of 1046 basins have no fill value — a basin with unknown depth is still
    # a basin, so give it the median rather than dropping it to zero.
    med = float(gdf[fill].median())
    gdf[fill] = gdf[fill].fillna(med)
    return rasterize(gdf, w, h, fill)


def do_oil_field(w, h):
    log("oil_field — GOGI Fields")
    gdb = next((DATA / "netl/gogi").rglob("*.gdb"), None)
    if gdb is None:
        return np.zeros((h, w), dtype="float32")
    return rasterize(read_vector(gdb, layer="Fields"), w, h)


def do_oil_au(w, h):
    log("oil_au — USGS DDS-69-FF assessment units (WEP_AU + CARA_AU)")
    gdb = next((DATA / "usgs/dds69ff").rglob("DDS69ff.gdb"), None)
    if gdb is None:
        log("  ! DDS-69-FF missing; zeros")
        return np.zeros((h, w), dtype="float32")
    out = np.zeros((h, w), dtype="float32")
    for layer in ("WEP_AU", "CARA_AU"):
        try:
            out = np.maximum(out, rasterize(read_vector(gdb, layer=layer), w, h))
        except Exception as e:  # noqa: BLE001 - a missing layer must not kill the bake
            log(f"  ! {layer}: {e}")
    return out


def do_river(w, h):
    """
    HydroRIVERS discharge. Filtered to >=5 m3/s: at ~20 km/tile a 1 m3/s creek is
    invisible, and the filter drops ~90% of the 8.5M segments so this finishes.
    merge=replace with MAX semantics via a manual max-accumulate would be ideal;
    rasterize's `replace` keeps last-wins, so we sort ascending and let the
    biggest river win the cell.
    """
    log("river — HydroRIVERS (discharge >= 5 m3/s, biggest river wins the cell)")
    shp = next((DATA / "hydrosheds/HydroRIVERS_v10").rglob("*.shp"), None)
    if shp is None:
        log("  ! HydroRIVERS missing; falling back to Natural Earth rivers")
        ne = next((DATA / "naturalearth/ne_10m_rivers").rglob("*.shp"), None)
        return rasterize(read_vector(ne), w, h) * 50.0 if ne else np.zeros((h, w), "float32")
    gdf = read_vector(shp, columns=["DIS_AV_CMS"])
    gdf = gdf[gdf["DIS_AV_CMS"] >= 5.0].sort_values("DIS_AV_CMS")
    log(f"  {len(gdf):,} segments after discharge filter")
    return rasterize(gdf, w, h, "DIS_AV_CMS")


def do_lake(w, h):
    log("lake — HydroLAKES (>=500 km2; smaller lakes vanish at 20 km/tile)")
    shp = next((DATA / "hydrosheds/HydroLAKES_polys_v10").rglob("*.shp"), None)
    if shp is None:
        ne = next((DATA / "naturalearth/ne_10m_lakes").rglob("*.shp"), None)
        return rasterize(read_vector(ne), w, h) if ne else np.zeros((h, w), "float32")
    gdf = read_vector(shp, columns=["Lake_area"])
    gdf = gdf[gdf["Lake_area"] >= 500.0]
    log(f"  {len(gdf):,} lakes >= 500 km2")
    return rasterize(gdf, w, h)


BUILDERS = {
    "elevation": do_elevation,
    "land": do_land,
    "temperature": do_temperature,
    "precip": do_precip,
    "npp": do_npp,
    "biome": do_biome,
    "mining": do_mining,
    "cu_density": do_cu_density,
    "metal_pts": do_metal_pts,
    "basin_fill": do_basins,
    "oil_au": do_oil_au,
    "oil_field": do_oil_field,
    "river": do_river,
    "lake": do_lake,
}


# ─────────────────────────── main ───────────────────────────


def stats(a: np.ndarray) -> dict:
    finite = a[np.isfinite(a)]
    if finite.size == 0:
        return {"min": 0, "max": 0, "mean": 0, "p1": 0, "p50": 0, "p99": 0, "nonzero": 0}
    nz = finite[finite != 0]
    q = np.percentile(nz, [1, 50, 99]) if nz.size else [0, 0, 0]
    return {
        "min": float(finite.min()),
        "max": float(finite.max()),
        "mean": float(finite.mean()),
        # Percentiles over NONZERO cells: these fields are mostly empty (mining
        # covers ~1% of tiles), so whole-array percentiles would all be 0 and
        # tell the tuning UI nothing.
        "p1": float(q[0]),
        "p50": float(q[1]),
        "p99": float(q[2]),
        "nonzero": int(nz.size),
    }


def main() -> int:
    global BBOX

    ap = argparse.ArgumentParser(
        description="Resample real-world sources onto a game grid.",
        epilog="regions: " + ", ".join(REGIONS),
    )
    ap.add_argument("--name", type=str, default=None, help="output dir name under derived/")
    ap.add_argument("--region", type=str, default=None, help=f"preset bbox ({', '.join(REGIONS)})")
    ap.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        metavar=("LON_MIN", "LAT_MIN", "LON_MAX", "LAT_MAX"),
        default=None,
    )
    ap.add_argument("--width", type=int, default=2048)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--only", type=str, default=None, help="comma-separated field subset")
    args = ap.parse_args()

    w, h = args.width, args.height

    if args.region and args.bbox:
        raise SystemExit("pass --region or --bbox, not both")
    if args.region:
        if args.region not in REGIONS:
            raise SystemExit(f"unknown region {args.region!r}; known: {', '.join(REGIONS)}")
        BBOX = REGIONS[args.region]
    elif args.bbox:
        BBOX = tuple(args.bbox)

    name = args.name or (args.region if args.region else "global")
    out_dir = args.out or (DATA / "derived" / f"{name}-{w}x{h}")
    out_dir.mkdir(parents=True, exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    names = [n for n in FIELDS if only is None or n in only]

    km_lon, km_lat = km_per_tile(w, h)
    print(f"\ningest {name} -> {w}x{h}  bbox {BBOX}")
    print(f"  ~{km_lon:.1f} x {km_lat:.1f} km per tile  ({out_dir})\n")
    if abs(km_lon - km_lat) / max(km_lon, km_lat) > 0.12:
        print(
            f"  ! tiles are non-square ({km_lon:.1f} x {km_lat:.1f} km) — the map will look\n"
            f"    stretched. Widen/narrow the bbox so lon_span ~= "
            f"{2 * (BBOX[3] - BBOX[1]) * (w / h) / 2:.1f} deg / cos(mid_lat).\n"
        )

    print(f"\ningest -> {w}x{h} equirectangular  ({out_dir})\n")

    planes: dict[str, np.ndarray] = {}
    # NB: `field` here, not `name` — `name` is the DATASET name and is used again
    # below for the metadata; rebinding it in this loop silently wrote the last
    # plane's name ("lake") into fields.json.
    for field in names:
        a = BUILDERS[field](w, h).astype("float32")
        if a.shape != (h, w):
            raise SystemExit(f"{field}: shape {a.shape} != {(h, w)}")
        planes[field] = np.nan_to_num(a, nan=0.0, posinf=0.0, neginf=0.0)

    # Reuse existing planes for a partial (--only) run so fields.bin stays whole.
    bin_path = out_dir / "fields.bin"
    if only and bin_path.exists():
        prev = np.fromfile(bin_path, dtype="float32").reshape(len(FIELDS), h, w)
        for i, n in enumerate(FIELDS):
            planes.setdefault(n, prev[i])

    missing = [n for n in FIELDS if n not in planes]
    if missing:
        raise SystemExit(f"cannot write a partial fields.bin; missing: {missing}")

    stacked = np.stack([planes[n] for n in FIELDS]).astype("float32")
    stacked.tofile(bin_path)

    meta = {
        "name": name,
        "width": w,
        "height": h,
        # The baker projects capitals with this; a crop is NOT the whole world.
        "bbox": list(BBOX),
        "kmPerTile": [round(km_lon, 3), round(km_lat, 3)],
        "projection": "equirectangular EPSG:4326",
        "fields": [
            {"name": n, "unit": FIELDS[n][0], "description": FIELDS[n][1], **stats(planes[n])}
            for n in FIELDS
        ],
    }
    (out_dir / "fields.json").write_text(json.dumps(meta, indent=2) + "\n")

    print(f"\nwrote {bin_path} ({bin_path.stat().st_size / 1048576:.1f} MB)")
    print(f"      {out_dir / 'fields.json'}\n")
    for f in meta["fields"]:
        print(
            f"  {f['name']:12} {f['unit']:>7}  "
            f"min {f['min']:>10.2f}  p50 {f['p50']:>9.2f}  p99 {f['p99']:>10.2f}  "
            f"max {f['max']:>10.2f}  nonzero {f['nonzero']:>8,}"
        )
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
