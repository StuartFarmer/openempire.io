# SimpleFront Tick Hash Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if the user explicitly chooses delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unused, periodic whole-development state checks in normal SimpleFront play with a cheap, ordered, tick-by-tick input hash chain; support verified catch-up, bounded recovery, and developer-only state diagnostics.

**Architecture:** A trusted authority seals one block per simulation tick, including empty ticks. Clients independently verify the genesis and each block before applying its commands exactly once, retaining separate verified and applied cursors. The existing numerical state checksum remains a separate diagnostic/replay facility, not the multiplayer input fingerprint.

**Tech Stack:** Existing TypeScript, Zod, Vitest, game workers, turn/intents model and WebSocket transport; native Web Crypto SHA-256. No blockchain framework, GPU hashing, new crypto dependency, mining, peer consensus, or full-state snapshot protocol.

**Spec:** The design contract below captures the user's agreed tick-block approach and proposed engineering defaults. Implementation was authorized with “ok go”; external multiplayer service deployment remains gated.

## Implementation progress

**Local-shell milestone implemented; the full multiplayer plan remains open.**

- Task 1: normal SimpleFront shell disables periodic whole-state checks; legacy callers still default to every 10 ticks. Direct checksum implementation and its phase are unchanged.
- Tasks 2–6: canonical SHA-256 chain, source/asset-bound genesis, immutable local authority, serialized verified execution, export and fresh replay are implemented. The local path includes empty ticks and ambient prewarm. A separate process replayed 10,000 ticks and matched the original final diagnostic hash.
- Task 7: missing-range recovery library and local fresh-worker rebuild/terminal stop are implemented. Tests cover partial mutation, bounded retries, repeated failures, stale completions, cancellation/timeout and retained export evidence. Native Chrome validated recovery and stop at ~600 ticks; late-match browser recovery is not yet validated.
- Task 8: wire schemas and a two-receiver library conformance test exist. **Negotiation/integration in Transport, LocalServer, ClientGameRunner and the legacy worker bridge remains unimplemented.** Those paths still use their legacy protocol; the shell remains local-only.
- Task 9: all nine SPQR runs completed (three modes × three 10,000-tick repetitions), with identical final simulation fingerprints and 92–94% less verification wall time. The late-game sub-1-ms end-to-end p95 target was not met (1.13–1.25 ms). Browser evidence covers native hashing and lifecycle, not a before/after late-game FPS claim. See `simplefront/docs/performance/tick-chain-validation.md` for measurements, build chronology and limitations.
- Task 10: externally gated; actual multiplayer service source and authorization are still required. No service deployment or root OpenFront live source changes were made.
- Implementation refinement: genesis permits `cityDevelopment: null` to preserve non-organic worker/backdrop mode. It also records `cityDevelopmentOrder: string[]`: the legacy checksum serializes property insertion order, so replay restores this order independently of canonical input hashing.
- Local restore reconstructs submission sequences from sealed actions only. It is explicitly not a remote-server receipt-ledger backup; unsent/unsealed actions are discarded on recovery.
- Existing fake-clock worker tests use real Node SHA digests with microtask completion. Native Web Crypto is tested separately; fake timers cannot advance native digest I/O.
- Final regression run: 71 files / 612 tests passed; production build and diff whitespace checks passed. Independent review findings were fixed and cleared in follow-up review. Fresh three-mode 1,000-tick parity, separate-process replay and Chrome paused-recovery/GPU-reset/terminal-stop checks passed after the final recovery-only worker change.

## Global Constraints

- Production changes stay under `simplefront/`. Root OpenFront live `src/` and its protocol remain untouched.
- Preserve existing user edits; several simulation and rendering files are already dirty. Reinspect before implementation; do not reset or overwrite them.
- Do not change growth, economy, movement, combat, AI decisions, random draws, or command execution order.
- Normal SimpleFront shell play must not call the periodic state checksum. Legacy callers retain existing behaviour unless explicitly opting into the new runtime policy.
- A chain verifies inputs, not correct execution, honesty of clients, or collision-free uniqueness. Do not describe it as an anti-cheat or state-equality guarantee.
- Never invent an empty block to fill a network gap. Empty blocks must come from the authority and verify normally.
- Never replace a local hash with a received hash to claim recovery. Verify the corresponding history and, when required, replay it.
- Never relabel the existing numeric `hash` field as an action hash. Introduce separately versioned chain messages and records.
- No automatic full-state transfers in version 1. The city-development snapshot is not a complete game snapshot.
- Prefix shell commands with `rtk`; use `apply_patch` for edits. Commands below assume the repository root unless a working directory is stated.
- No network deployment, changes to external services, or commits of unrelated work as part of this plan.

## 1. Verified starting point

| Existing code                                                             | Observed behaviour                                                                                                    | Consequence                                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `simplefront/src/core/game/GameImpl.ts`, `executeNextTick()` and `hash()` | Every 10 ticks, serializes development state and frontier details, then adds player hashes                            | Separate scheduling from checksum implementation; preserve the checksum for diagnosis                       |
| `simplefront/src/core/GameRunner.ts`                                      | Queues `Turn` objects and executes their intents; tick execution is synchronous                                       | Verify outside the synchronous core; enqueue only verified, contiguous turns                                |
| `simplefront/src/client/webgpu/ShellSim.worker.ts`                        | Generates game/client IDs, creates local turns, executes the real core; does not consume hash updates                 | Immediate performance target; persist initialization instead of generating new IDs on replay                |
| `simplefront/src/client/LocalServer.ts`                                   | Records turns, saves numeric state checks every 100 turns, compares them during replay                                | Preserve old record parsing; add a distinct chain-record path                                               |
| `simplefront/src/client/Transport.ts`                                     | Reconnects and sends `rejoin` with `lastTurn`; buffered sends are currently flushed with `pop()`                      | Reconnect is not rollback; new command retries need FIFO ordering and idempotent IDs                        |
| `simplefront/src/client/ClientGameRunner.ts`                              | Requests turns on reconnect; one start/catch-up path inserts empty turns for gaps; a desync message displays an error | Verified mode must bypass gap-filling and implement explicit recovery/terminal states                       |
| `simplefront/src/core/worker/Worker.worker.ts`                            | Drains queued turns in batches, yielding after four ticks                                                             | Reuse bounded scheduling; do not let async verification reorder execution                                   |
| `simplefront/src/server/`                                                 | Asset-manifest tooling, not the live multiplayer game server                                                          | Actual server integration is an external release prerequisite, not something this checkout already provides |

The prior instrumented SPQR replay measured about 57 ms per state-hash execution near tick 10,000. Combined construction/hash ticks had a median around 104 ms. Those measurements include snapshot construction, sorting, eligibility reads, serialization, and hashing; they are not a forecast of the new implementation's speed. Establish a fresh baseline because the worktree has since changed.

## 2. Design contract

### 2.1 Genesis and tick semantics

Use the existing turn number as the block tick. Block `t` is the exact input to the core step that starts with `game.ticks() === t`; after a successful step `game.ticks() === t + 1`. Genesis represents the state before block 0 and uses cursor `-1`.

Genesis contains:

- Protocol version `simplefront-tick-chain-v1`.
- Exact simulation build identity, not a shared `DEV` string or package version alone.
- Ruleset `simplefront`, the complete `GameStartInfo` including ordered players and original game ID, resolved city-development configuration, and tick duration.
- Digests of the actual simulation inputs: `map.bin`, `map4x.bin`, `layers.bin`, and canonical map manifest. Verify bytes loaded by the client, not just their URL or map name.
- Explicit initialization mode: normal game or ambient backdrop. Ambient setup installs an extra spawn timer and must be reproduced if recorded.

The game ID currently seeds several random streams. Preserve it and the player identifiers exactly; do not consume extra random draws to initialize the chain. Other fixed/default random seeds and economy/AI defaults are bound by the build identity and recorded resolved configuration. Do not include viewer-specific identity, access tokens, CDN URLs, graphics settings, pause wall time, or camera state.

For v1, the simulation build identity is SHA-256 over a sorted manifest of relevant source bytes and dependency/compiler inputs: `simplefront/src/core/**`, `simplefront/src/client/games/simplefront/runtime.ts`, `simplefront/package.json`, `simplefront/package-lock.json`, and `simplefront/tsconfig.json`. The tick-chain initialization code must account for any additional simulation-bearing imports discovered during implementation. Browser and Node tooling use the same manifest builder. Dirty source changes must change this identity; Git SHA alone is insufficient. Expose the generated identity through `__SIMPLEFRONT_SIMULATION_BUILD__` in the browser build, and make existing sessions pin their starting identity across HMR/reload.

Hash actual map bytes once during initialization, retaining the same immutable input bytes for fresh runner construction. Do not repeatedly fetch or hash terrain during ticks, and do not restore from a mutated `GameMap` instance. Initial asset bytes may be shared; mutable decoded maps must be fresh.

### 2.2 Canonical representation and algorithm

Choose native SHA-256 for collision resistance and no new dependency, not because it is assumed to be the fastest possible primitive. Benchmark end-to-end latency, including native-call overhead. Web Crypto `digest()` is asynchronous and operates on a supplied buffer; each block only supplies the previous digest plus its own small payload, not the entire historical log. See the [Web Crypto digest specification](https://www.w3.org/TR/webcrypto/#SubtleCrypto-method-digest).

Use this exact domain-separated definition, with `C` producing UTF-8 canonical JSON and digest strings represented as 64 lowercase hexadecimal characters:

```text
G   = SHA256(C(["simplefront/genesis/v1", genesis]))
H_0 = SHA256(C(["simplefront/tick/v1", G,   0, intents_0]))
H_t = SHA256(C(["simplefront/tick/v1", H_(t-1), t, intents_t]))
```

Canonical JSON rules:

1. Inputs are schema-validated plain JSON values. Reject non-finite numbers, unsafe integer counters, sparse arrays, unsupported objects, cycles, and excessive depth (over 32).
2. Object keys are serialized in lexical UTF-16 code-unit order using an explicit serializer; do not rely on property insertion order or locale sorting. Preserve array order, especially player and intent order.
3. Use ECMAScript `JSON.stringify` for primitive string escaping and finite-number formatting. Normalize negative zero to zero before both hashing and execution. Do not apply Unicode normalization.
4. Omit optional `undefined` object properties in the authority's input-normalization step. Reject `undefined` array entries. The normalized JSON is what both authority and client pass to execution; hashing and execution must never see different representations.
5. No whitespace. Do not sort actions by player, type, or payload. Do not remove no-op commands, replay pause commands, or diagnostic-looking intent fields from a sealed block.
6. Reject unknown v1 envelope fields. Validate supported intent payloads with the existing schemas before sealing; canonical bytes must preserve every accepted field that the executor consumes.

The cryptographic primitive is native; only the narrow canonical JSON encoder is local code. Golden encoding/digest vectors must be checked independently with Node's `createHash`, not merely by calling the same helper twice.

### 2.3 Public data and interfaces

Add `simplefront/src/core/sync/TickChainProtocol.ts` for chain-only schemas/types. It may import existing schemas; existing `Schemas.ts` must not import it back and create a cycle. Validate the new protocol separately from legacy `ServerMessageSchema` in negotiated chain mode.

```ts
type ChainHash = string; // schema: /^[0-9a-f]{64}$/

interface TickGenesis {
  protocol: "simplefront-tick-chain-v1";
  simulationBuild: ChainHash;
  ruleset: "simplefront";
  gameStartInfo: GameStartInfo;
  cityDevelopment: GrowthConfig | null;
  cityDevelopmentOrder: string[];
  tickMilliseconds: number;
  initialization: "normal" | "ambient";
  assets: {
    map: ChainHash;
    minimap: ChainHash;
    layers: ChainHash;
    manifest: ChainHash;
  };
}

interface TickBlock {
  tick: number;
  previousHash: ChainHash;
  intents: StampedIntent[];
  chainHash: ChainHash;
}

interface ChainCursor {
  tick: number; // -1 = genesis, otherwise last block at this cursor
  chainHash: ChainHash;
}

interface TickChainRecord {
  format: "simplefront-tick-chain-v1";
  genesis: TickGenesis;
  genesisHash: ChainHash;
  blocks: TickBlock[];
  appliedThrough: ChainCursor;
  stateCheckpoints: StateCheckpoint[];
}

interface StateCheckpoint {
  tick: number;
  phase: "post-economy-pre-water-healing-v1";
  algorithm: "legacy-simplefront-state-v1";
  stateHash: number;
}
```

`TickChain.ts` provides these pure, async operations (no game, renderer, global clock, socket, or terrain scans):

```ts
canonicalJSON(value: unknown): string;
hashGenesis(genesis: TickGenesis): Promise<ChainHash>;
sealTick(previous: ChainCursor, intents: StampedIntent[]): Promise<TickBlock>;
verifyTick(previous: ChainCursor, block: TickBlock): Promise<void>;
```

`sealTick` assigns `tick = previous.tick + 1`. `verifyTick` checks both links, exact next tick, and recomputed digest; it does not mutate its inputs. Both reject malformed/oversized input. Caller freezes or clones accepted normalized records before any asynchronous boundary; later mutations cannot change what is executed or archived.

Use a single serial operation queue per match. Do not dispatch concurrent async listener bodies that can advance the chain out of order. Generation IDs invalidate pending work after restart/stop.

Maintain separate cursors:

- `verifiedThrough`: contiguous blocks whose contents have been checked locally.
- `appliedThrough`: contiguous verified blocks whose core steps completed successfully.

Only send an applied acknowledgement after execution succeeds. Verification is not evidence of execution. An exception or failed tick invalidates the runner; never retry that tick on potentially partially mutated state.

### 2.4 Authority and wire contract

The authority validates sender identity, stamps `clientID`, assigns commands to the next unsealed tick, orders them once, and retains immutable blocks. Future commands may queue while a block is hashing, but cannot mutate that block. Internal AI decisions regenerate inside the deterministic simulation; they are not duplicated as external commands. Authority-originated disconnect/configuration/kick events that affect simulation must be normal logged intents.

Use authenticated existing transport. A hash chain by itself does not authenticate a server, prevent forged client acknowledgements, or enforce correct simulation on a malicious client.

New message family, separate from legacy numerical `hash` messages:

```ts
type ChainServerMessage =
  | {
      type: "chain_start";
      genesis: TickGenesis;
      genesisHash: ChainHash;
      head: ChainCursor;
    }
  | {
      type: "chain_blocks";
      requestID: number | null;
      blocks: TickBlock[];
      head: ChainCursor;
    }
  | {
      type: "chain_resume";
      requestID: number;
      after: ChainCursor;
      head: ChainCursor;
    }
  | { type: "chain_rebuild"; requestID: number; head: ChainCursor }
  | { type: "chain_command_ack"; sequence: number; tick: number }
  | {
      type: "chain_command_rejected";
      sequence: number;
      code: "invalid-command" | "admission-limit";
    }
  | {
      type: "chain_stop";
      code:
        | "incompatible"
        | "history-unavailable"
        | "recovery-failed"
        | "resource-limit";
      message: string;
    };

type ChainClientMessage =
  | {
      type: "chain_hello";
      protocol: "simplefront-tick-chain-v1";
      simulationBuild: ChainHash;
    }
  | { type: "chain_ack"; appliedThrough: ChainCursor }
  | { type: "chain_rejoin"; requestID: number; appliedThrough: ChainCursor }
  | {
      type: "chain_range";
      requestID: number;
      fromTick: number;
      throughTick: number;
    }
  | { type: "chain_intent"; sequence: number; intent: Intent };
```

Bind all messages to the authenticated match/session. Send `chain_hello` after the existing authenticated join but before accepting simulation inputs; the server replies with `chain_start` only after admitting the version/build. The authority compares a rejoin cursor to its stored block at that tick. Match: reply `chain_resume`; mismatch: reply `chain_rebuild`. A response/head does not let the client skip verifying intervening blocks. A resume response echoes the request cursor exactly. Range responses carry the initiating request ID; unsolicited live block batches use `null`. Ignore responses from previous connection/recovery generations.

Use a monotonic per-client sequence for submission idempotence. Scope it to the authenticated player/match identity and retain it across reconnect. Same sequence and same canonical payload: return the original receipt without resealing it. Same sequence and different payload: reject as a protocol violation. Preserve FIFO for unsent submissions. Block intake stops before consuming unverified input; user submissions are disabled during recovery and unsent commands are not silently reapplied after a rebuild.

A command receipt means assigned to a sealed tick, not successfully applied by every client. Rejected submissions have an explicit response and never enter the chain. Accepted commands whose gameplay effect later becomes a no-op stay in the chain. Retrying a pending sequence does not add another queue entry; its receipt is sent when its block seals.

Proposed v1 limits, enforced before large allocations/execution and tested at boundaries:

- One block per executed tick, including empty ticks; normal tick duration remains 100 ms.
- Applied acknowledgement every 10 successfully applied blocks, plus on reconnect and orderly stop.
- Maximum 256 intents or 64 KiB canonical bytes per block, whichever comes first. Authority applies deterministic admission/backpressure before sealing; clients do not truncate blocks.
- Recovery pages: at most 256 blocks and 1 MiB encoded bytes. Repeated range requests return the same sealed contents.
- Unverified client backlog: at most 256 blocks and 4 MiB; pause intake/request bounded ranges rather than allocate without limit.
- Whole-match in-memory recording limit: 256 MiB. Retain history from genesis for the active match and a proposed 10-minute reconnect grace period after it ends. Never prune a prefix while claiming genesis recovery is available. If the authority cannot retain required history, stop admission/end the affected session explicitly; do not silently discard inputs. Disk-backed service storage is a server deployment choice, not a new database built here.

For public releases, capability negotiation and identical build/genesis verification are mandatory before any chain block executes. Keep legacy connections on their existing path; do not reinterpret a legacy peer's messages or silently downgrade a match that requires v1. No mixed chain/legacy clients in one chain-required match.

### 2.5 Recovery and terminal failure

```text
INITIALIZING → RUNNING → RECOVERING → RUNNING
                   │         │
                   │         └→ REBUILDING → RUNNING
                   │                    │
                   └────────────────────┴→ STOPPED
```

**Missing/unverified inputs, runner still trusted:** stop advancing at the first gap. Ask the authority to validate the last applied cursor, then request the missing sealed range. Verify and apply all blocks, including empties. Identical duplicates are ignored; a conflicting duplicate is a protocol mismatch, not a second action. Different arrival order is handled within the bounded buffer, never by changing execution order.

**Untrusted history or suspect runner:** obtain a fixed authoritative target head, discard the suspect simulation worker, create a fresh runner from the verified genesis/immutable assets, and replay blocks 0 through that target. No in-place inverse actions and no claimed rollback from a hash alone. Rebuild offscreen with periodic progress messages; yield after at most four ticks, suppress audio/intermediate frames/duplicate intents, and reset all render caches before publishing the rebuilt world. Once at the target, catch up subsequent authoritative pages. If the client cannot catch up faster than the authority advances, fail with an explicit insufficient-performance reason instead of looping forever.

An input-chain match after rebuild proves the history was recovered, not that state equality was established. A diagnostic state mismatch requires a fresh replay and comparison against an independent known checkpoint at the same phase. If the same state discrepancy recurs, stop as a simulation defect; do not reset the action hash and claim success.

Proposed recovery budget:

- Each range request: 5-second timeout, at most 3 attempts. Duplicate messages do not reset the timeout or retry counter.
- At most 1 full runner rebuild in a recovery episode, with a 120-second wall-clock budget. Validated/application progress is reported but does not reset the absolute deadline.
- After 3 recovery episodes within 60 seconds, stop the client. Routine successful reconnect/catch-up without an integrity failure is not counted as repeated corruption.
- Build/protocol/asset mismatch fails immediately with an incompatibility message; replay cannot repair different code/assets.

“Kill” means stop this match's worker/timers, disable its inputs, stop reconnect attempts, close its connection intentionally, and show a stable error with a short diagnostic ID. It does not terminate the browser, kill other clients, or delete recordings. Suggested message: **“This match could not be synchronized. Please reload to rejoin. Diagnostic: …”** Preserve an exportable diagnostic record without tokens or private transport data. A production server applies its normal disconnect handling and logs the resulting authoritative intent.

### 2.6 State diagnostics and old replay compatibility

Add a runtime-only option `stateHashEveryTicks`, passed through `createGameRunner` → `createGame` → `GameImpl`. Omitted means 10 for backwards compatibility; `0` means no automatic checks; positive safe integers retain the exact current hash phase. This is not a gameplay/configuration intent and is excluded from genesis.

- New normal SimpleFront shell: explicitly `0`.
- Existing legacy/replay/tests: retain omitted/default `10` until explicitly migrated.
- Developer diagnostic sessions: proposed interval `300` (30 simulated seconds), or an explicit test-selected tick schedule.
- Keep `GameImpl.hash()` algorithm and existing numeric `HashUpdate` unchanged. If a separate on-demand probe is used, it must capture the same phase, not the later post-healing state under the same label.
- Separate Node replay tooling consumes genesis/blocks and prints diagnostic fingerprints without putting full-state scans into ordinary live ticks. Comparing against a live run needs checkpoints actually captured in that live run; two replays alone cannot certify its past state.
- Preserve old `GameRecord` schemas and numerical hash fields. Introduce `TickChainRecord` as a separate format; do not mechanically convert old records missing exact genesis/build/assets and claim verified reconstruction.
- Existing replay code filters pause intents; v1 verifies and executes the sealed input list unchanged. Ignore only the presentation-level wall-clock pause when fast replaying, after confirming how the executor handles that intent. If this changes simulation results, resolve it before the release gate.

## 3. Delivery boundaries

**Milestone A — useful in this repository:** remove unused shell state checks, implement the chain/genesis library, local recording/replay, a verified receiver, and bounded local recovery with fault-injection tests. This delivers the performance win and a tested multiplayer protocol foundation.

**Milestone B — actual multiplayer:** integrate the authority/retention/admission/rejoin contract in the real multiplayer server and connect the desired SimpleFront gameplay UI to it. The shell currently starts a local game; adding a chain does not make its game-selection UI multiplayer. Do not silently create lobbies/accounts/new hosting infrastructure as part of Milestone A.

The remote server's source/deployment location is not available in this checkout. Its owner must supply that location and approve service integration before Milestone B can be executed. Ship only the local milestone until a real server/client pair passes the protocol tests. A mock authority is not evidence that production multiplayer works.

## 4. File responsibilities

| File                                                                                            | Responsibility                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New `simplefront/src/core/sync/TickChainProtocol.ts`                                            | Chain/genesis/record/wire schemas and public types; imports legacy intent/start schemas without a reverse dependency                                       |
| New `simplefront/src/core/sync/TickChain.ts`                                                    | Canonical serialization, genesis digest, block sealing/verification                                                                                        |
| New `simplefront/src/core/sync/TickGenesis.ts`                                                  | Exact input identity, immutable map input retention, fresh loader creation                                                                                 |
| New `simplefront/scripts/simulation-build-id.ts`                                                | Shared Node build/source-manifest identity computation                                                                                                     |
| New `simplefront/src/core/sync/TickChainAuthority.ts`                                           | Trusted local authority: admission, sealing, retained history, sequence deduplication, range replies; usable in the remote server without DOM dependencies |
| New `simplefront/src/core/sync/TickChainSession.ts`                                             | Verified/applied cursors, serialized verification, bounded gaps, recovery state and failure counters; runner supplied by a concrete adapter                |
| New `simplefront/src/core/sync/TickChainReplay.ts`                                              | Record validation and fresh-runner replay, no UI or network dependency                                                                                     |
| Existing `GameImpl.ts`, `GameRunner.ts`                                                         | Diagnostic scheduling option; existing synchronous execution stays intact                                                                                  |
| Existing shell worker/protocol/page                                                             | Local sealing, action-record export, stop/rebuild lifecycle, visible recovery status                                                                       |
| Existing `LocalServer.ts`, `Transport.ts`, `ClientGameRunner.ts`, worker messages/client/worker | Explicit negotiated chain path alongside untouched legacy message semantics                                                                                |
| New `simplefront/scripts/replay-tick-chain.ts`                                                  | Developer verification CLI and scheduled diagnostic output                                                                                                 |
| New `simplefront/scripts/benchmark-tick-chain.ts`                                               | Isolated hashing and paired real-game measurements, outside live code                                                                                      |
| New tests named in tasks below                                                                  | Encoding, protocol, execution, recovery, legacy compatibility, and performance validation                                                                  |

This is a responsibility map, not a license to build generic middleware, transports, event buses, snapshots, or storage engines. Use existing runner/worker/transport facilities and native crypto.

## 5. Implementation tasks

### Task 1: Separate state-check scheduling from game rules

**Files:** Modify `simplefront/src/core/game/GameImpl.ts`, `simplefront/src/core/GameRunner.ts`, `simplefront/src/client/webgpu/ShellSim.worker.ts`; create `simplefront/tests/StateHashScheduling.test.ts`.

**Interfaces:** Export `RuntimeDiagnostics = { stateHashEveryTicks?: number }` from `GameImpl.ts`; append optional diagnostics arguments to `createGame`, the concrete constructor, and `createGameRunner` after the current development-config argument. No existing positional argument changes.

- [x] Write tests for default ticks 0/10/20, disabled automatic updates, custom interval 300, rejected negative/fractional intervals, and unchanged direct numerical hash. Use a paired fixture from `CityDevelopmentEconomy.test.ts` and compare development snapshots, player totals, and final direct hash with checks enabled/disabled.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/StateHashScheduling.test.ts`; expect the new scheduling assertions to fail before implementation.
- [x] Implement the guard at the current hash location, without moving it:

```ts
const every = diagnostics.stateHashEveryTicks ?? 10;
if (!Number.isSafeInteger(every) || every < 0)
  throw new Error("Invalid state hash interval");
// Store once at construction, then use inside executeNextTick:
if (every > 0 && this.ticks() % every === 0) {
  this.addUpdate({
    type: GameUpdateType.Hash,
    tick: this.ticks(),
    hash: this.hash(),
  });
}
```

- [x] Set `{ stateHashEveryTicks: 0 }` explicitly for the SimpleFront shell only. Add a worker integration assertion that normal SimpleFront executes 100 ticks without invoking `hash()`; preserve other rulesets and legacy defaults.
- [x] Run scheduling, city-development worker/economy/ownership tests and typecheck. Record the default/disabled parity evidence before proceeding. This task alone must be independently shippable.

### Task 2: Implement the canonical block format and hash primitives

**Files:** Create `TickChainProtocol.ts`, `TickChain.ts`, and `simplefront/tests/TickChain.test.ts` at the paths listed above.

**Interfaces:** Implement `canonicalJSON`, `hashGenesis`, `sealTick`, `verifyTick` exactly as section 2.3. Schema types must match the message/record interfaces above; do not add hash fields to legacy `Turn.hash`.

- [x] Write a golden serializer test and independent digest checks using Node `createHash` (Node test environment):

```ts
expect(canonicalJSON({ z: [2, 1], a: "Rio" })).toBe('{"a":"Rio","z":[2,1]}');
const previous = { tick: -1, chainHash: "0".repeat(64) };
const block = await sealTick(previous, []);
expect(block.tick).toBe(0);
expect(block.chainHash).toBe(
  createHash("sha256")
    .update('["simplefront/tick/v1","' + previous.chainHash + '",0,[]]')
    .digest("hex"),
);
await expect(verifyTick(previous, block)).resolves.toBeUndefined();
await expect(verifyTick(previous, { ...block, tick: 1 })).rejects.toThrow();
```

- [ ] Add tests for reordered object keys, numeric-looking keys, reordered intents, changed client identity, adjacent empty ticks, fractional finite payloads, null versus omission, escaping/Unicode, invalid counters, limits, mutation during an async call, and SHA-256 known vectors. A changed tick/intent/link must fail verification; duplicate JSON key wire text must not yield a different execution representation.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/TickChain.test.ts`; expect failures before implementation.
- [x] Implement the small canonical encoder and native digest adapter. Use `new TextEncoder().encode(canonicalJSON(value))`, `crypto.subtle.digest("SHA-256", bytes)`, and lowercase byte-to-hex conversion. Feature-detect crypto at initialization and fail explicitly in unsupported/insecure contexts; no silent downgrade to `simpleHash`.
- [ ] Run the tests, then test the same checked-in byte vectors in an actual browser worker. Record digest identity and measured per-call latency; native crypto availability in jsdom alone is not browser-worker validation.

### Task 3: Bind genesis to the inputs actually loaded

**Files:** Create `TickGenesis.ts`, `simplefront/scripts/simulation-build-id.ts`, `simplefront/tests/TickGenesis.test.ts`; modify `simplefront/vite.config.ts`, `simplefront/src/client/vite-env.d.ts`, and `simplefront/src/client/webgpu/ShellSim.worker.ts` initialization.

**Interfaces:** `loadTickGenesis(start: GameStartInfo, cityDevelopment: GrowthConfig | null, loader: GameMapLoader, simulationBuild: ChainHash, initialization: "normal" | "ambient"): Promise<{ genesis: TickGenesis; freshLoader: () => GameMapLoader }>`; `computeSimulationBuildID(simplefrontRoot: string): Promise<ChainHash>` in the Node script. `freshLoader()` serves retained immutable source inputs through fresh byte copies/manifest values, never shared mutable game objects.

- [ ] Create tests that change each simulation-bearing genesis component independently and expect a different genesis hash. Restore the exact original IDs/config to reproduce the original hash. Two calls to `freshLoader()` must produce independently mutable decoded maps.
- [ ] Add build-ID tests: stable sorted file order, changed dirty source bytes change identity, missing required inputs fail, and browser-injected/Node-computed IDs agree. Verify the root project's host loading the nested Vite config uses the same SimpleFront-relative source paths.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/TickGenesis.test.ts`; expect failures before implementation.
- [x] Wrap the existing loader to read actual required assets once, hash them with explicit field labels, retain bytes, and create the runner using those same inputs. Bind all normal/ambient initialization before block 0. Export the original `GameStartInfo` instead of reconstructing it later from current players.
- [x] Prove these invariants in the new tests:

```ts
expect(await hashGenesis(first.genesis)).toBe(
  await hashGenesis(second.genesis),
);
expect(
  await hashGenesis({ ...first.genesis, initialization: "ambient" }),
).not.toBe(await hashGenesis(first.genesis));
expect(first.genesis.gameStartInfo.gameID).toBe(originalStart.gameID);
```

- [ ] Run tests and typecheck. Confirm map hashing is initialization-only and no shader/render assets are rescanned per tick.

### Task 4: Seal authoritative ticks and retain an immutable command record

**Files:** Create `TickChainAuthority.ts` and `simplefront/tests/TickChainAuthority.test.ts`; modify local shell initialization/step loop. Keep `LocalServer.ts` legacy behaviour intact until Task 8.

**Interfaces:** `TickChainAuthority.create(genesis): Promise<TickChainAuthority>`; `submit(clientID: string, sequence: number, intent: Intent): void`; `receipt(clientID: string, sequence: number): number | null` (sealed tick or pending); `sealNext(): Promise<TickBlock>`; `range(fromTick: number, throughTick: number): TickBlock[]`; `head(): ChainCursor`. Authority owns the serial sealing queue; authenticated adapters supply trusted `clientID`. Define schema/admission errors with stable reason codes in the protocol file. After sealing, the adapter sends receipts for its pending sequences; it must not await a receipt before letting the seal loop run.

- [ ] Test empty blocks, concurrent sealing requests, frozen payloads, sender stamping, duplicate sequences, conflicting retries, oversize admission, immutable range replies, and exact FIFO command order. Retrying an accepted command must not cause a second charge or troop dispatch.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/TickChainAuthority.test.ts`; expect failures before implementation.
- [x] Replace the shell's raw turn creation only in chain mode:

```ts
// Commands collected during sealing belong to the next block, not this one.
const block = await authority.sealNext();
if (generation !== runGeneration || !running) return;
// The generation owns the sealed record even when execution pauses here.
// Retain it as pending; resume must apply it, never skip to a new block.
```

- [x] Preserve a pending sealed-but-unapplied block across pause/resume. Normal local sealing feeds the verified execution path from Task 5; ambient prewarm must also use it rather than bypassing blocks.
- [x] Add an exported `TickChainRecord` assembled from the immutable authority history and the receiver's applied cursor. It may contain a sealed pending tail; export/replay honours `appliedThrough` as the target, not the last sealed block. Stop logging at the declared resource limit with a clear failure instead of silently dropping history.
- [ ] Run authority tests and existing painted worker tests. Keep the old direct shell path behind an internal rollout switch until Task 5 parity tests pass; this intermediate task is not a multiplayer release.

### Task 5: Verify before execution and acknowledge only applied blocks

**Files:** Create `TickChainSession.ts`, `simplefront/tests/TickChainSession.test.ts`; modify `ShellSim.worker.ts`, `ShellSimProtocol.ts` and the existing runner integration as needed without making core ticks async.

**Interfaces:** `TickChainSession.create(genesis, apply: (block: TickBlock) => void): Promise<TickChainSession>`; `receive(block: TickBlock): Promise<"applied" | "duplicate" | "gap">`; `appliedThrough(): ChainCursor`; `verifiedThrough(): ChainCursor`; `stop(): void`. Recovery additions in Task 7 must retain these signatures.

- [ ] Test with an apply spy: valid blocks apply once; altered blocks never apply; a future block reports a gap; a matching duplicate is ignored; a conflicting duplicate triggers recovery; throwing apply freezes the session; stale async completions after stop cannot mutate cursors.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/TickChainSession.test.ts`; expect failures before implementation.
- [x] Add serialized intake and the concrete core adapter:

```ts
function applyBlock(block: TickBlock): void {
  if (runner.game.ticks() !== block.tick) throw new Error("Core tick mismatch");
  runner.addTurn({ turnNumber: block.tick, intents: block.intents });
  if (!runner.executeNextTick()) throw new Error("Core tick failed");
  if (runner.game.ticks() !== block.tick + 1)
    throw new Error("Core did not advance");
}
```

- [x] Keep a locally verified-prefix check even in the shell where authority and receiver are colocated. Run the existing runtime hooks in the same relative phase; no changes to simulation callbacks or RNG consumption. Treat a callback-reported core error as failure even if the existing runner API swallowed its exception.
- [x] Add real-core parity tests: feed identical inputs through legacy/direct and chain paths; compare physical development snapshot, owner/damage arrays, player economy/AI state and direct numerical state fingerprints at matched phases. The chain digest alone is not the parity oracle.
- [x] Activate the local chain path only after parity passes. Acknowledgements expose tick plus hash and are emitted after successful apply, never after mere receipt.

### Task 6: Replay records and expose developer-only state checkpoints

**Files:** Create `TickChainReplay.ts`, `simplefront/scripts/replay-tick-chain.ts`, `simplefront/tests/TickChainReplay.test.ts`; modify `simplefront/package.json`, shell protocol/page for record export, and state-checkpoint collection inside the worker.

**Interfaces:** `replayTickChain(record: TickChainRecord, targetTick: number, loader: GameMapLoader, simulationBuild: ChainHash, options: { stateHashEveryTicks: number; onProgress?: (cursor: ChainCursor) => void; signal?: AbortSignal }): Promise<{ runner: GameRunner; appliedThrough: ChainCursor; stateCheckpoints: StateCheckpoint[] }>`; use `loadTickGenesis`, existing runner setup and the same initialization mode. Target tick is a last-applied block index, not `game.ticks()`.

- [ ] Write tests for genesis-only records, empty ticks, recorded human actions, regenerated AI, exact IDs, pending sealed tails, missing blocks, changed map/build, checkpoint-phase mismatch, cancellation and repeated replay. Replay cannot accidentally regenerate random game/client IDs.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/TickChainReplay.test.ts`; expect failures before implementation.
- [x] Implement fresh-runner reconstruction and verify each block before applying. Hash/checkpoint collection uses the existing update at the named pre-water/healing phase. Default normal records have no state checkpoints; do not manufacture them at export time and label them historical.
- [x] Add `"replay:chain": "tsx scripts/replay-tick-chain.ts"` and CLI flags `--record`, `--through`, `--state-every`, `--out`. Require a compatible build/assets; report first bad block or first available mismatched state checkpoint. Output files use exclusive creation so existing reports are not overwritten.
- [x] Add a small record export action through the existing shell UI; include the worker's genesis, immutable blocks, applied cursor and actual captured checkpoints. Report retention-limit/unsupported-build errors visibly; do not include authentication tokens.
- [ ] Validate a replay through tick 10,000 against the original run and run existing old replay/schema tests unchanged. Run the CLI in a separate process to establish that no live game access is required.

### Task 7: Implement bounded recovery and terminal shutdown

**Files:** Extend `TickChainSession.ts`; create `simplefront/tests/TickChainRecovery.test.ts`; modify shell worker/protocol/page lifecycle and worker cleanup adapters.

**Interfaces:** Add `beginRecovery(reason: "gap" | "chain-mismatch" | "execution-failed" | "state-mismatch"): void`, `confirmResume(cursor: ChainCursor): void`, and `status(): "running" | "recovering" | "rebuilding" | "stopped"`. `confirmResume` accepts only an exact match to the retained local applied cursor in a trusted-runner recovery; it clears the handshake wait, not a verification check, and cannot set either cursor. The adapter owns replacing the worker/runner via `replayTickChain`; replacement creates a fresh session and establishes its cursors by replaying verified blocks, never by assigning the remote head. Counters/deadlines live at the match controller so recreation cannot reset the failure budget.

- [ ] With fake timers and a local authority, drop, duplicate, corrupt, delay and reorder blocks. Assert the missing action executes once after repair; invalid data never executes. Inject a failure after partial mutation and assert a new runner is constructed, not an in-place retry.
- [ ] Test 5-second range timeouts/three attempts, a 120-second rebuild deadline, three integrity-recovery episodes within 60 seconds, immediate incompatible-build failure, stale-generation completions, unsupported history, and deliberate stop with no automatic reconnect.
- [x] Run `rtk proxy npm --prefix simplefront test -- tests/TickChainRecovery.test.ts`; expect failures before implementation.
- [ ] Implement the state transitions and stop path exactly as section 2.5. Use existing four-tick yielding pattern for replay. Disable input during recovery; suppress transient audio/frames and explicitly reset render layers when the rebuilt worker becomes authoritative.
- [x] Verify the failure contract with tests equivalent to:

```ts
expect(controller.status()).toBe("stopped");
expect(worker.terminate).toHaveBeenCalledTimes(1);
expect(inputEnabled()).toBe(false);
expect(reconnectScheduled()).toBe(false);
expect(exportedRecord.blocks.length).toBeGreaterThan(0);
```

Here `controller`, `worker`, `inputEnabled`, `reconnectScheduled` and `exportedRecord` are the actual adapter/test fixture handles, not new production abstractions.

- [ ] Browser-check recovery/stop/reload on a late match. Report whether catch-up succeeds within budget; do not assume a full replay is instant or that a chain match proves simulation repair.

### Task 8: Wire the negotiated multiplayer protocol and local conformance harness

**Files:** Modify `Transport.ts`, `ClientGameRunner.ts`, `LocalServer.ts`, `core/worker/WorkerMessages.ts`, `WorkerClient.ts`, `Worker.worker.ts`; create `simplefront/tests/TickChainTransport.test.ts` and `simplefront/tests/TickChainMultiplayer.test.ts`.

**Interfaces:** Use `ChainServerMessage` and `ChainClientMessage` from section 2.4. Extend worker initialization with optional genesis/chain mode and add a `chain_block` input plus an applied-cursor/error output. Keep legacy `turn` and numeric `hash` interfaces unchanged for legacy mode. New connection mode is selected during explicit capability negotiation before match start, not inferred from one packet.

- [ ] Test two independent clients against `TickChainAuthority` over an in-memory transport using the exact wire schemas. Include different packet batching, reconnect, same-command retries, gaps, bad genesis, version rejection, delayed worker acknowledgements and one client repeatedly failing while the other continues.
- [ ] Add regression tests that chain mode never executes the legacy empty-gap insertion or pause-intent filtering. Legacy mode must still parse old records/messages and follow its existing semantics.
- [ ] Run `rtk proxy npm --prefix simplefront test -- tests/TickChainTransport.test.ts tests/TickChainMultiplayer.test.ts`; expect new-mode tests to fail before implementation.
- [ ] Route new packets through their own schemas and a single serialized queue. Forward verified execution acknowledgements from the worker; rejoin from `appliedThrough`, not `turnsSeen` or received-through. Retain the authoritative sequence ledger in local server mode. Bypass the existing LIFO retry buffer for v1 commands with the FIFO/idempotent submission path.
- [ ] Add terminal protocol shutdown that marks the transport closed before closing its socket. Existing `onclose` must not restart a deliberately killed match. Only a new explicit user rejoin may create a fresh recovery attempt.
- [ ] Run the two-client harness plus a real browser worker test. Label this result **local protocol conformance**, not production multiplayer support.

### Task 9: Benchmark the actual speedup and guard correctness

**Files:** Create `simplefront/scripts/benchmark-tick-chain.ts`, `simplefront/tests/TickChainPerformance.test.ts`, and `simplefront/docs/performance/tick-chain-validation.md`; add `"benchmark:chain": "tsx scripts/benchmark-tick-chain.ts"` to `simplefront/package.json`. Reuse `tests/perf/balance/RunGameCore.ts` and the real map loader where practical; do not modify existing untracked probes without checking ownership.

**Interfaces:** CLI accepts `--map SPQR`, `--seed`, `--ticks`, `--repeats`, `--out`. Each run reports mode, build/map identity, input bytes, chain calls, state-check calls, tick/observer timings and matched-phase final diagnostics.

- [x] Add structural tests: empty-block sealing never calls `GameImpl.hash`, `deterministicState`, territory scans, or rendering code. Increasing developed tiles with the same input block must not increase encoded block size or digest count.
- [ ] Run isolated encoding+seal+verify benchmarks for empty, one-action, representative burst and maximum admitted blocks. Measure both authority and receiver costs; do not quote hashing-kernel time alone.
- [ ] Run three paired modes with identical inputs: legacy periodic checks, checks disabled/no chain, and checks disabled/chain enabled. Use real SPQR, 50 bots plus authored nations, organic development, and at least ticks 9,000–10,000; three repetitions after warmup. Keep observer/profile instrumentation identical across modes.
- [ ] Target less than 1 ms p95 for ordinary seal+verify payloads on the development machine, and at least 90% reduction in total verification time versus the measured legacy hash work over the same tick window. These are acceptance targets, not existing results; report native async latency, frame impact, memory and startup asset-hash time separately. Maximum-size admitted blocks must remain below the 100 ms simulation budget on the supported test machine.
- [ ] Require identical simulation output at matched phases across modes using explicit state comparisons plus existing diagnostic hashes. Rebaseline against the current worktree rather than assuming an old decimal checksum still applies.
- [ ] Measure browser normal/turbo late-game play as well as headless core timing. Confirm the periodic hashing spike disappears without claiming all stutter is fixed: construction/combat/observer costs remain separate.

Run from the repository root after implementing the script:

```sh
rtk proxy npm --prefix simplefront test -- tests/TickChainPerformance.test.ts
rtk proxy npm --prefix simplefront run benchmark:chain -- --map SPQR --seed simplefront-pace-01 --ticks 10000 --repeats 3 --out /tmp/simplefront-chain-benchmark.json
rtk proxy npm --prefix simplefront run typecheck
rtk proxy npm --prefix simplefront test
rtk proxy npm --prefix simplefront run build
```

The benchmark must reject an existing output path; choose a new explicit path for a repeat. Failures outside this change are recorded separately, not hidden or “fixed” by unrelated rewrites.

### Task 10: External server rollout gate and handoff

**Files:** Update this plan's checkboxes and `simplefront/docs/performance/tick-chain-validation.md`. The real server paths must be supplied by its owner before server implementation starts; do not invent a server entry point inside asset tooling.

**Interfaces:** Remote authority implements the exact genesis/sealing/submission/range/rejoin/stop contract from sections 2.1–2.5 and passes the same conformance vectors as `TickChainAuthority`.

- [ ] Obtain the actual service repository/path and explicit scope for changing its match protocol. Document where command authentication/admission, ordering, retention and reconnect already live before editing them.
- [ ] Integrate the shared authority logic or its independently verified equivalent. Enforce identities, sequence deduplication, limits, full retained history and build/protocol admission server-side; client-side checks are not a substitute.
- [ ] Run real two-client integration tests against that service: matching inputs, missing ranges, forced reconnect, bad build, history unavailable, repeated failure disconnect, and late-game catch-up. Assert that one failed client does not kill the match for others.
- [ ] Decide and approve the gameplay UI entry point for multiplayer separately from the existing local-only shell. Do not declare the shell multiplayer merely because the legacy transport can negotiate the new messages.
- [ ] Release only when both ends negotiate v1 and recovery tests pass. Rollback affects new match creation; do not change hash formats or downgrade a running chain-required match midstream.
- [ ] Handoff states exactly which milestone shipped, what remained legacy, performance before/after, known limits, and whether production server tests ran. Mark the plan complete only when the intended release milestone is actually satisfied.

## 6. Final acceptance checklist

- [ ] Normal SimpleFront shell has zero periodic state-check calls.
- [ ] Every executed tick, including empty ticks and ambient prewarm if enabled, has one immutable block.
- [ ] Genesis binds actual code/assets/configuration/identities and replays do not generate replacement seeds.
- [ ] Block costs depend on input payload, not developed territory or elapsed match history.
- [ ] Canonical vectors agree across Node and browser worker execution.
- [ ] Same recorded inputs produce the same simulation output as before the change.
- [ ] No missing-turn fabrication, duplicate action application, cursor advancement before execution, or stale-worker completion.
- [ ] Recovery verifies the retained history, rebuilds suspect state from genesis when necessary, and is bounded.
- [ ] Terminal failure stops this client cleanly, preserves diagnostics, and does not auto-reconnect indefinitely.
- [ ] Legacy numeric state fingerprints/replays remain separate and compatible.
- [ ] A state mismatch with a matching input chain is reported as an execution diagnostic, not automatically considered repaired.
- [ ] Real multiplayer release is withheld until its external authority and client integration are verified together.

## 7. Planning self-review

- Performance removal: Task 1; cheap input verification: Tasks 2–5; reproducible initialization: Task 3; developer diagnosis: Task 6; bounded repair/kill: Task 7; network contract: Task 8; measurements: Task 9; production authority: Task 10.
- `tick` always means the pre-step block index; `appliedThrough.tick` is the last successful block, so core `game.ticks()` is one greater. State checkpoint phase is explicitly different and preserved.
- A chain hash, a legacy numerical state checksum and a build/asset digest are named separately. No migration relies on coincidentally compatible field types.
- Actual server code is an external dependency, explicitly gated rather than inferred from reconnect code.
- Root OpenFront live files remain outside implementation scope; preserve all unrelated worktree edits.
