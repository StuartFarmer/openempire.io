import { describe, expect, test, vi } from "vitest";
import { GpuEconomy } from "../src/client/games/leanfront/economy/GpuEconomy";

function economyWith(kernel: { destroy(): void }): GpuEconomy {
  return Object.assign(Object.create(GpuEconomy.prototype), {
    kernel,
    ready: true,
  }) as GpuEconomy;
}

describe("GpuEconomy lifecycle", () => {
  test("dispose destroys the owned field kernel", () => {
    const destroy = vi.fn();

    economyWith({ destroy }).dispose();

    expect(destroy).toHaveBeenCalledOnce();
  });

  test("uninstallProviders keeps the field kernel alive for probe reuse", () => {
    const destroy = vi.fn();
    const economy = economyWith({ destroy });

    economy.uninstallProviders();

    expect(destroy).not.toHaveBeenCalled();
  });
});
