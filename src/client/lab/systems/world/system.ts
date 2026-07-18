import { defineFieldSystem } from "../../../webgpu/FieldDynamics";

// The shell's resident simulation, first tenant: seasons. The live `temp`
// layer swings around the baked annual-mean temperature with axial tilt and
// latitude; the `world` color view re-derives biomes/snow/sea-ice from it
// every tick. Future simulator mechanics (weather, food, territory) join
// this system as more layers.
export const world = defineFieldSystem({
  id: "world",
  name: "World",
  kind: "study",
  renderer: "blit",
  defaultMap: "Verdantia",
  defaultView: "world",

  params: {
    // Earth's tilt is 23.4°; slide it to see climates exaggerate or flatten.
    tilt: { value: 23.4, min: 0, max: 45, step: 0.1 },
    // Ticks per year: 520 = one week per second at the 10 ticks/s game
    // clock (full year in ~52s — fast enough to watch the seasons sweep).
    yearTicks: { value: 520, min: 120, max: 36000, step: 10 },
    seasonStrength: { value: 1.0, min: 0, max: 3 },
  },

  // No scalars: a sum over an XL map's 8.4M tiles would flirt with the i32
  // fixed-point ceiling; nothing needs it yet.

  views: {
    world: { source: "views/world.wesl" },
    temperature: {
      layer: "temp",
      ramp: ["#2850a0", "#e8dc78", "#c83c32"],
    },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
