# shell-conduit-upload-perf

## ADDED Requirements

### Requirement: Per-tile conduits update incrementally

The shell SHALL keep the OpenFront-live GPU conduits (owner/plot/density/damage/
front) as persistent buffers and update them from the sim's per-tile deltas each
tick, uploading only the changed tiles (as merged contiguous runs, or a single
full upload when nearly everything changed) — never rebuilding or re-uploading
the whole map every tick. The rendered result SHALL be identical to a full
per-tick upload.

#### Scenario: A localized change uploads little

- **WHEN** a few tiles change ownership/structure/damage in a tick
- **THEN** only those tiles' contiguous runs are uploaded, not the whole buffer,
  and the overlay reflects the change that frame

#### Scenario: Large maps stay interactive

- **WHEN** OpenFront-live runs on a large map
- **THEN** the per-tick main-thread upload cost is bounded by the number of
  changed tiles, not the map size, and the sim (not the upload) is the dominant
  cost

### Requirement: Front recompute is bounded by the human's border

The shell SHALL recompute the front balance by walking the human's border tiles
(and clearing the previous tick's painted tiles), not by scanning the whole map.

#### Scenario: Front cost is independent of map size

- **WHEN** the front is recomputed each tick
- **THEN** the work scales with the human's border length, not the tile count

### Requirement: Big-map sim ticks cannot freeze a frame

The shell SHALL cap OpenFront-live sim catch-up per rendered frame so a slow
big-map tick cannot execute an entire accumulated batch synchronously.

#### Scenario: A slow tick degrades gracefully

- **WHEN** a sim tick is slow (large map) and frames fall behind
- **THEN** at most a small fixed number of ticks run per frame (the sim runs
  slightly below real-time) rather than blocking the frame with a full batch
