export const LEAN_ACTION = {
  none: 0,
  spawn: 1,
  city: 2,
  farm: 3,
  raze: 4,
} as const;

export const LEAN_RESULT = {
  none: 0,
  accepted: 1,
  unaffordable: 2,
  notOwned: 3,
  impassable: 4,
  wrongType: 5,
  overflow: 6,
  invalid: 7,
} as const;

export function decodeLeanResult(packed: number) {
  return { tick: packed >>> 8, code: packed & 0xff };
}
