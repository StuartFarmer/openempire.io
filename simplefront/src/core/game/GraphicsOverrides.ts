import { z } from "zod";

export const GraphicsOverridesSchema = z
  .object({
    name: z
      .object({
        nameScaleFactor: z.number(),
        cullThreshold: z.number(),
        darkNames: z.boolean(),
        hoverFadeAlpha: z.number(),
        hoverGlowWidth: z.number(),
        hoverGlowAlpha: z.number(),
      })
      .partial(),
    structure: z
      .object({
        iconSize: z.number(),
        classicIcons: z.boolean(),
        classicNumbers: z.boolean(),
        showDots: z.boolean(),
      })
      .partial(),
    mapOverlay: z
      .object({
        highlightFillBrighten: z.number(),
        highlightBrighten: z.number(),
        highlightThicken: z.number(),
        territorySaturation: z.number(),
        territoryAlpha: z.number(),
        coordinateGridOpacity: z.number(),
        staleNukeColor: z.string(),
      })
      .partial(),
    railroad: z
      .object({
        railMinZoom: z.number(),
        railThickness: z.number(),
      })
      .partial(),
    passEnabled: z
      .object({
        fx: z.boolean(),
        fallout: z.boolean(),
      })
      .partial(),
    accessibility: z
      .object({
        colorblind: z.boolean(),
      })
      .partial(),
    terrain: z
      .object({
        oceanColor: z.string(),
        sandColor: z.string(),
        plainsColor: z.string(),
        highlandColor: z.string(),
        mountainColor: z.string(),
      })
      .partial(),
    lighting: z
      .object({
        ambient: z.number(),
        falloffPower: z.number(),
      })
      .partial(),
  })
  .partial();

export type GraphicsOverrides = z.infer<typeof GraphicsOverridesSchema>;
