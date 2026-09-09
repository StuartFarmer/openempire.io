import { clamp } from "./config";

export interface AgeStyle {
  name: string;
  period: string;
  level: number;
  houses: readonly string[];
  ground: string;
  road: string;
}
// Visual style labels supplied for this experiment, not a historical timeline.
export const AGE_STYLES: readonly AgeStyle[] = [
  {
    name: "Village",
    period: "Village",
    level: 1,
    houses: ["#9e7852", "#bb9566", "#866247", "#a8845e"],
    ground: "#77785d",
    road: "#927453",
  },
  {
    name: "Middle Ages town",
    period: "Middle Ages",
    level: 3,
    houses: ["#a04f3e", "#b86a48", "#635d58", "#877465"],
    ground: "#797a68",
    road: "#927453",
  },
  {
    name: "Classical town",
    period: "1300–1600",
    level: 5,
    houses: ["#cc482f", "#e1734b", "#397bbc", "#e1ba69"],
    ground: "#a19a82",
    road: "#c2bba6",
  },
  {
    name: "Industrial / Victorian town",
    period: "1600–1800",
    level: 8,
    houses: ["#786460", "#666a6a", "#8d8173", "#726d76"],
    ground: "#64665d",
    road: "#494c48",
  },
  {
    name: "Modern town",
    period: "1800–1950",
    level: 12,
    houses: ["#b8c4c6", "#ddd1ab", "#69978f", "#ac8c70"],
    ground: "#858c86",
    road: "#464d50",
  },
  {
    name: "Post-modern town",
    period: "1950–future",
    level: 16,
    houses: ["#00f5db", "#ff3abf", "#9e65ff", "#f5f45b"],
    ground: "#242c39",
    road: "#111723",
  },
];

export const DEFAULT_AGE_LEVELS: readonly number[] = Object.freeze(
  AGE_STYLES.map((age) => age.level),
);

export function validateAgeLevels(levels: readonly number[]): string {
  if (
    levels.length !== AGE_STYLES.length ||
    levels.some((level) => !Number.isInteger(level) || level < 1 || level > 100)
  )
    return "Enter six whole-number levels from 1 to 100.";
  if (levels.some((level, index) => index > 0 && level <= levels[index - 1]))
    return "Each age must start at a higher level than the previous age.";
  return "";
}

export function blendColour(a: string, b: string, mix: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) => {
        const start = parseInt(a.slice(i, i + 2), 16),
          end = parseInt(b.slice(i, i + 2), 16);
        return Math.round(start + (end - start) * clamp(mix))
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}
export function ageAppearance(
  level: number,
  variant = 0,
  levels: readonly number[] = DEFAULT_AGE_LEVELS,
) {
  let index = 0;
  while (index < AGE_STYLES.length - 1 && level >= levels[index + 1]) index++;
  const from = AGE_STYLES[index],
    to = AGE_STYLES[Math.min(index + 1, AGE_STYLES.length - 1)];
  const progress =
    from === to
      ? 0
      : clamp((level - levels[index]) / (levels[index + 1] - levels[index]));
  const houseIndex = Math.min(3, Math.floor(clamp(variant) * 4));
  return {
    from,
    to,
    progress,
    house: blendColour(
      from.houses[houseIndex],
      to.houses[houseIndex],
      progress,
    ),
    ground: blendColour(from.ground, to.ground, progress),
    road: blendColour(from.road, to.road, progress),
  };
}
export function ageLabel(
  level: number,
  levels: readonly number[] = DEFAULT_AGE_LEVELS,
): string {
  if (level <= 0) return "Wilderness";
  const a = ageAppearance(level, 0, levels);
  return a.progress === 0
    ? a.from.name
    : `${a.from.name} → ${a.to.name} · ${Math.round(a.progress * 100)}%`;
}
