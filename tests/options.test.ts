import { describe, expect, it } from "vitest";
import {
  lineTotalMinor,
  optionGroupsOf,
  parseOptionGroups,
  validateSelections,
  type ProductOptionGroup,
} from "@/lib/domain/options";

const groups: ProductOptionGroup[] = [
  {
    groupId: "size",
    name: "Size",
    type: "single",
    required: true,
    minSelections: 1,
    maxSelections: 1,
    active: true,
    options: [
      { optionId: "s", name: "Small", priceDeltaMinor: 0, active: true },
      { optionId: "m", name: "Medium", priceDeltaMinor: 15000, active: true },
      { optionId: "x", name: "Extra", priceDeltaMinor: 30000, active: false },
    ],
  },
  {
    groupId: "extras",
    name: "Add-ons",
    type: "multiple",
    required: false,
    minSelections: 0,
    maxSelections: 2,
    active: true,
    options: [
      { optionId: "cheese", name: "Cheese", priceDeltaMinor: 10000, active: true },
      { optionId: "olives", name: "Olives", priceDeltaMinor: 5000, active: true },
    ],
  },
];

describe("option groups", () => {
  it("resolves names and prices from the product configuration", () => {
    const result = validateSelections(groups, [
      { groupId: "size", optionIds: ["m"] },
      { groupId: "extras", optionIds: ["cheese", "olives"] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.priceDeltaMinor).toBe(15000 + 10000 + 5000);
    expect(result.resolved[0].optionNames).toEqual(["Medium"]);
    expect(result.resolved[1].groupName).toBe("Add-ons");
  });

  it("rejects a missing required group", () => {
    const result = validateSelections(groups, []);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Size/);
  });

  it("rejects an unknown option", () => {
    const result = validateSelections(groups, [
      { groupId: "size", optionIds: ["nope"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an inactive option", () => {
    const result = validateSelections(groups, [
      { groupId: "size", optionIds: ["x"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects more than one choice in a single-choice group", () => {
    const result = validateSelections(groups, [
      { groupId: "size", optionIds: ["s", "m"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("enforces the maximum number of choices", () => {
    const wide = groups.map((group) =>
      group.groupId === "extras"
        ? {
            ...group,
            maxSelections: 2,
            options: [
              ...group.options,
              { optionId: "fries", name: "Fries", priceDeltaMinor: 8000, active: true },
            ],
          }
        : group
    );
    const allowed = validateSelections(wide, [
      { groupId: "size", optionIds: ["s"] },
      { groupId: "extras", optionIds: ["cheese", "olives"] },
    ]);
    expect(allowed.ok).toBe(true);

    const tooMany = validateSelections(wide, [
      { groupId: "size", optionIds: ["s"] },
      { groupId: "extras", optionIds: ["cheese", "olives", "fries"] },
    ]);
    expect(tooMany.ok).toBe(false);
    expect(tooMany.error).toMatch(/at most 2/);
  });

  it("ignores a repeated choice", () => {
    const result = validateSelections(groups, [
      { groupId: "size", optionIds: ["s"] },
      { groupId: "extras", optionIds: ["cheese", "cheese"] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.priceDeltaMinor).toBe(10000);
  });

  it("rejects a selection for a group that no longer exists", () => {
    const result = validateSelections(groups, [
      { groupId: "size", optionIds: ["s"] },
      { groupId: "removed", optionIds: ["x"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("ignores an inactive group when validating", () => {
    const inactive = groups.map((group) =>
      group.groupId === "extras" ? { ...group, active: false } : group
    );
    const result = validateSelections(inactive, [
      { groupId: "size", optionIds: ["s"] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.priceDeltaMinor).toBe(0);
  });

  it("computes the line total from base price plus deltas", () => {
    expect(lineTotalMinor(35000, 15000, 2)).toBe(100000);
    expect(lineTotalMinor(35000, 0, 1)).toBe(35000);
  });
});

describe("parseOptionGroups", () => {
  it("normalises a stored configuration", () => {
    const parsed = parseOptionGroups([
      {
        groupId: "g1",
        name: "Size",
        type: "single",
        options: [{ optionId: "o1", name: "Small" }],
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.groups[0].required).toBe(true);
      expect(parsed.groups[0].minSelections).toBe(1);
      expect(parsed.groups[0].maxSelections).toBe(1);
    }
  });

  it("rejects a malformed configuration instead of dropping it", () => {
    const parsed = parseOptionGroups([{ groupId: "", name: "Size" }]);
    expect(parsed.ok).toBe(false);
  });

  it("rejects duplicate group ids", () => {
    const parsed = parseOptionGroups([
      { groupId: "g1", name: "A", options: [{ optionId: "o1", name: "One" }] },
      { groupId: "g1", name: "B", options: [{ optionId: "o2", name: "Two" }] },
    ]);
    expect(parsed.ok).toBe(false);
  });

  it("ignores broken stored documents", () => {
    expect(optionGroupsOf({ optionGroups: "nope" })).toEqual([]);
    expect(optionGroupsOf({})).toEqual([]);
  });
});
