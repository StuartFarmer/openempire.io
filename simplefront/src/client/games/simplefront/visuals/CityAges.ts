import approved from "../../../../../docs/city-local-palette.json";

export interface AgeStyle {
  name: string;
  period: string;
  level: number;
  houses: readonly string[];
  ground: string;
  road: string;
}

/** Renderer-only six-colour palette at each physical level. */
export class CityAges {
  private levels: readonly number[] = [...approved.ageLevels];
  private styles: readonly AgeStyle[] = structuredClone(approved.palettes);

  setAgeLevels(levels: readonly number[]): void {
    if (
      levels.length !== 6 ||
      levels.some(
        (n, i) =>
          !Number.isInteger(n) ||
          n < 1 ||
          n > 100 ||
          (i > 0 && n <= levels[i - 1]),
      )
    )
      throw new Error(
        "Use six increasing whole-number age levels from 1 to 100.",
      );
    this.levels = [...levels];
  }

  setPalette(styles: readonly AgeStyle[]): void {
    if (
      styles.length !== 6 ||
      styles.some(
        (s) =>
          s.houses.length !== 4 ||
          [s.ground, s.road, ...s.houses].some(
            (c) => !/^#[0-9a-f]{6}$/i.test(c),
          ),
      )
    )
      throw new Error(
        "Use six age palettes with ground, road and four #RRGGBB house colours.",
      );
    this.styles = styles.map((s) => ({ ...s, houses: [...s.houses] }));
  }

  reset(): void {
    this.levels = [...approved.ageLevels];
    this.styles = structuredClone(approved.palettes);
  }

  color(level: number, pixel: number): string {
    let index = 0;
    while (index < 5 && level >= this.levels[index + 1]) index++;
    const next = Math.min(index + 1, 5);
    const progress =
      next === index
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (level - this.levels[index]) /
                (this.levels[next] - this.levels[index]),
            ),
          );
    const pick = (style: AgeStyle) =>
      pixel === 0
        ? style.ground
        : pixel === 1
          ? style.road
          : style.houses[pixel - 2];
    const from = pick(this.styles[index]),
      to = pick(this.styles[next]);
    return (
      "#" +
      [1, 3, 5]
        .map((offset) => {
          const a = parseInt(from.slice(offset, offset + 2), 16),
            b = parseInt(to.slice(offset, offset + 2), 16);
          return Math.round(a + (b - a) * progress)
            .toString(16)
            .padStart(2, "0");
        })
        .join("")
    );
  }

  /** Tiny 6×101 RGBA lookup; palette edits never rewrite map sprite textures. */
  pixels(): Uint8Array {
    const pixels = new Uint8Array(6 * 101 * 4);
    for (let level = 0; level <= 100; level++)
      for (let code = 0; code < 6; code++) {
        const rgb = parseInt(this.color(level, code).slice(1), 16);
        pixels.set(
          [rgb >>> 16, (rgb >>> 8) & 255, rgb & 255, 255],
          (level * 6 + code) * 4,
        );
      }
    return pixels;
  }
}
