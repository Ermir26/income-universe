import { describe, it, expect } from "vitest";
import { getTier } from "@/lib/tipster/tiers";

describe("getTier", () => {
  it("returns null for null input", () => {
    expect(getTier(null as unknown as number)).toBeNull();
  });

  it("returns null for 0", () => {
    expect(getTier(0)).toBeNull();
  });

  it("returns null for 59 (below threshold)", () => {
    expect(getTier(59)).toBeNull();
  });

  it("returns VALUE for 60 (threshold)", () => {
    expect(getTier(60)).toEqual(
      expect.objectContaining({ name: "VALUE", stake: 1 }),
    );
  });

  it("returns VALUE for 64.999", () => {
    expect(getTier(64.999)).toEqual(
      expect.objectContaining({ name: "VALUE" }),
    );
  });

  it("returns VALUE for 65 (no pickType)", () => {
    expect(getTier(65)).toEqual(
      expect.objectContaining({ name: "VALUE" }),
    );
  });

  it("returns VALUE for 100", () => {
    expect(getTier(100)).toEqual(
      expect.objectContaining({ name: "VALUE", stake: 1 }),
    );
  });

  it("returns VALUE for 64 with pickType=foundation (cascade — below 65)", () => {
    const tier = getTier(64, "foundation");
    expect(tier).toEqual(
      expect.objectContaining({ name: "VALUE", stake: 1 }),
    );
  });

  it("returns FOUNDATION for 65 with pickType=foundation", () => {
    expect(getTier(65, "foundation")).toEqual(
      expect.objectContaining({ name: "FOUNDATION", stake: 1 }),
    );
  });

  it("returns FOUNDATION for 85 with pickType=foundation", () => {
    expect(getTier(85, "foundation")).toEqual(
      expect.objectContaining({ name: "FOUNDATION", stake: 1 }),
    );
  });

  it("returns VALUE for 85 without pickType — STRONG VALUE/MAXIMUM are dead", () => {
    const tier = getTier(85);
    expect(tier).toEqual(
      expect.objectContaining({ name: "VALUE", stake: 1 }),
    );
    expect(tier!.name).not.toBe("STRONG VALUE");
    expect(tier!.name).not.toBe("MAXIMUM");
  });
});
