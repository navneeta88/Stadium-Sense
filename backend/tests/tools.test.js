const { toolImplementations } = require("../tools");

describe("get_directions", () => {
  test("finds a route between two known locations", () => {
    const result = toolImplementations.get_directions({ from: "Gate A", to: "Section 101" });
    expect(result.error).toBeUndefined();
    expect(result.steps).toContain("Gate A");
    expect(result.steps[result.steps.length - 1]).toBe("Section 101");
    expect(result.estimated_walk_minutes).toBeGreaterThan(0);
  });

  test("respects accessible_only and avoids non-accessible edges", () => {
    const result = toolImplementations.get_directions({ from: "Gate A", to: "Section 102", accessible_only: true });
    // Section 102 is only reachable via a non-accessible edge in the fixture map
    expect(result.error).toBeDefined();
  });

  test("returns an error for an unknown location", () => {
    const result = toolImplementations.get_directions({ from: "Gate A", to: "Mars Colony" });
    expect(result.error).toBeDefined();
  });
});

describe("get_crowd_density", () => {
  test("returns density for a specific zone", () => {
    const result = toolImplementations.get_crowd_density({ zone: "Gate B" });
    expect(result.zone).toBe("gate_b");
    expect(typeof result.density_pct).toBe("number");
  });

  test("returns all zones when no zone is specified", () => {
    const result = toolImplementations.get_crowd_density({});
    expect(Array.isArray(result.zones)).toBe(true);
    expect(result.zones.length).toBeGreaterThan(0);
  });

  test("returns an error for an unknown zone", () => {
    const result = toolImplementations.get_crowd_density({ zone: "Atlantis" });
    expect(result.error).toBeDefined();
  });
});

describe("list_amenities", () => {
  test("filters amenities by type", () => {
    const result = toolImplementations.list_amenities({ type: "restroom" });
    expect(result.every((a) => a.type === "restroom")).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns all amenities when no type is given", () => {
    const all = toolImplementations.list_amenities({});
    const restrooms = toolImplementations.list_amenities({ type: "restroom" });
    expect(all.length).toBeGreaterThanOrEqual(restrooms.length);
  });
});
