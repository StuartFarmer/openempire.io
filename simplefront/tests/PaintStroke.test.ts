import { expect, test } from "vitest";
import { PaintStroke } from "../src/client/shell/PaintStroke";

test("integer interpolation fills jumps and deduplicates in traversal order", () => {
  const stroke = new PaintStroke(10, 10);
  stroke.add(1, 1);
  stroke.add(4, 1);
  stroke.add(1, 1);
  expect(stroke.tiles()).toEqual([11, 12, 13, 14]);
  stroke.clear();
  stroke.add(1, 1);
  stroke.add(4, 4);
  expect(stroke.tiles()).toEqual([11, 22, 33, 44]);
  stroke.clear();
  expect(stroke.tiles()).toEqual([]);
});
test("bounds and stroke limit cannot overflow the intent", () => {
  const stroke = new PaintStroke(10, 10, 2);
  stroke.add(-1, 0);
  stroke.add(NaN, 2);
  stroke.add(1.5, 2);
  expect(stroke.tiles()).toEqual([]);
  stroke.add(1, 1);
  stroke.add(4, 1);
  expect(stroke.tiles()).toEqual([11, 12]);
  expect(stroke.isFull()).toBe(true);
});
