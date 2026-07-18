#!/usr/bin/env python3
"""
season.py — fit the seasonal temperature cycle from monthly MODIS land-surface
temperature and write the season.bin sidecar (see src/core/game/SeasonMap.ts).

Per pixel: take the 12 monthly means (deg C, 99999 = nodata over ocean),
subtract the annual mean, and least-squares fit the first harmonic
    dev(month) ~= amplitude * cos(2*pi*month/12 - phi)
giving a per-tile seasonal AMPLITUDE (deg C) and PHASE (fraction of the year
where temperature peaks). Ocean/nodata is nearest-filled from land so coastal
tiles get sensible values, then resampled to the target map grid + bbox
(matching bake.ts exactly). Runtime reconstructs:
    T(t) = annualMean + amplitude * cos(2*pi*(yearPhase - phase))

Usage (mirrors bake.ts --fields/--div so grids line up):
    map-generator/earth/.venv/bin/python map-generator/earth/season.py \
        --name earthxl --fields global-4096x2048 --div 1
then `npm run gen-maps`.
"""
import argparse
import glob
import json
import os
import sys

import numpy as np
import rasterio
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_ROOT = os.environ.get(
    "WORLD_MAPS_DIR", os.path.abspath(os.path.join(HERE, "..", "..", "..", "world-maps"))
)
MODIS_DIR = os.path.join(DATA_ROOT, "surface_temp_data")
AMPLITUDE_MAX_C = 50.0  # keep in sync with SeasonMap.ts SEASON_AMPLITUDE_MAX_C


def fit_harmonic():
    files = sorted(glob.glob(os.path.join(MODIS_DIR, "MOD_LSTD_M_2020-*_rgb_3600x1800.FLOAT.TIFF")))
    if len(files) != 12:
        sys.exit(f"expected 12 monthly MODIS TIFFs in {MODIS_DIR}, found {len(files)}")
    stack = []
    for f in files:
        with rasterio.open(f) as ds:
            a = ds.read(1).astype("float32")
        a[a > 100.0] = np.nan  # 99999 nodata
        stack.append(a)
    S = np.stack(stack)  # 12 x H x W, Jan..Dec, row 0 = +90 lat
    k = np.arange(12)
    cos = np.cos(2 * np.pi * k / 12)[:, None, None]
    sin = np.sin(2 * np.pi * k / 12)[:, None, None]
    valid = np.isfinite(S)
    n = valid.sum(0)
    with np.errstate(invalid="ignore"):
        mean = np.nanmean(S, 0)
    dev = np.where(valid, S - mean, 0.0)
    denom = np.maximum(n, 1)
    a1 = 2 * np.nansum(dev * cos, 0) / denom
    b1 = 2 * np.nansum(dev * sin, 0) / denom
    amp = np.sqrt(a1**2 + b1**2)
    phase = (np.arctan2(b1, a1) / (2 * np.pi)) % 1.0
    # Nearest-fill tiles with too few valid months (ocean, polar gaps) from the
    # nearest well-sampled land, so coastal target tiles don't read amp 0.
    good = n >= 6
    if not good.any():
        sys.exit("no well-sampled MODIS pixels")
    idx = ndimage.distance_transform_edt(~good, return_distances=False, return_indices=True)
    amp = amp[tuple(idx)]
    phase = phase[tuple(idx)]
    return amp, phase


def resample(field, out_w, out_h, bbox):
    """Nearest-sample a global 3600x1800 equirect field onto (out_w,out_h,bbox)."""
    src_h, src_w = field.shape
    lon0, lat0, lon1, lat1 = bbox  # (left, bottom, right, top)
    xs = np.arange(out_w)
    ys = np.arange(out_h)
    lon = lon0 + (xs + 0.5) / out_w * (lon1 - lon0)
    lat = lat1 - (ys + 0.5) / out_h * (lat1 - lat0)  # row 0 = top
    sx = np.clip(((lon + 180) / 360 * src_w).astype(int), 0, src_w - 1)
    sy = np.clip(((90 - lat) / 180 * src_h).astype(int), 0, src_h - 1)
    return field[np.ix_(sy, sx)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--fields", default="global-2048x1024")
    ap.add_argument("--div", type=int, default=1)
    args = ap.parse_args()

    meta_path = os.path.join(DATA_ROOT, "derived", args.fields, "fields.json")
    with open(meta_path) as fh:
        meta = json.load(fh)
    factor = max(1, args.div)
    out_w = meta["width"] // factor
    out_h = meta["height"] // factor
    bbox = meta.get("bbox", [-180.0, -90.0, 180.0, 90.0])

    amp, phase = fit_harmonic()
    amp_r = resample(amp, out_w, out_h, bbox)
    phase_r = resample(phase, out_w, out_h, bbox)

    out = np.empty((2, out_h, out_w), dtype=np.uint8)
    out[0] = np.clip(amp_r / AMPLITUDE_MAX_C, 0, 1) * 255 + 0.5
    out[1] = np.clip(phase_r, 0, 1) * 255 + 0.5

    out_dir = os.path.join(HERE, "..", "assets", "maps", args.name)
    out_path = os.path.join(out_dir, "season.bin")
    out.tofile(out_path)
    land_amp = amp_r[amp_r > 1]
    print(
        f"wrote {out_path} ({out_w}x{out_h}) — "
        f"amp median {np.median(land_amp):.1f}C, p99 {np.percentile(land_amp, 99):.1f}C"
    )


if __name__ == "__main__":
    main()
