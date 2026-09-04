# Game Board Library

The reusable board entrypoint is `src/client/board`.

Minimum consumer setup:

- Use Vite or another bundler that supports `?worker&inline` imports for `Worker.worker.ts`.
- Serve OpenFront map and atlas assets through the existing asset URL mechanism.
- Mount with a real DOM container; the board creates and later removes its own WebGL canvas and input overlay.
- Use the default local turn adapter for local play, or provide a turn adapter that forwards typed turns and receives outgoing intents.

Map data uses a small board-map contract: required OpenFront-compatible
`terrain: Uint8Array`, required `state: Uint16Array`, and optional named typed
layers such as `elevation` or `moisture`. If a map supplies a terrain
colorizer, the renderer uses its RGBA output; otherwise it keeps the default
OpenFront terrain-byte coloring.

Not included in the board entrypoint: auth, WebSocket transport, lobby, matchmaking, ads, store, clan, chat, leaderboard, moderation, server, or deploy code.
