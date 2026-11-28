import { describe, it, expect } from "vitest";
import { getDefaultInitiativeState, getSortedInitiativeItems, itemHashKey, mergeInitiativeState } from "./initiative";
import { InitiativeBlock } from "../types";

function makeBlock(items: InitiativeBlock["items"], consumables?: InitiativeBlock["consumables"]): InitiativeBlock {
  return { state_key: "test", items, consumables };
}

describe("initiative", () => {
  describe("getDefaultInitiativeState", () => {
    it("uses name-based keys", () => {
      const block = makeBlock([
        { name: "Goblin", ac: 12, hp: 10 },
        { name: "Dragon", ac: 18, hp: 200 },
      ]);

      const state = getDefaultInitiativeState(block);

      expect(state.initiatives["Goblin"]).toBe(0);
      expect(state.initiatives["Dragon"]).toBe(0);
      expect(state.hp["Goblin"]["main"]).toBe(10);
      expect(state.hp["Dragon"]["main"]).toBe(200);

      // Index-based keys should not exist
      expect(state.initiatives["0"]).toBeUndefined();
      expect(state.initiatives["1"]).toBeUndefined();
    });

    it("handles group HP", () => {
      const block = makeBlock([{ name: "Wolves", ac: 11, hp: { alpha: 30, beta: 25 } }]);

      const state = getDefaultInitiativeState(block);

      expect(state.hp["Wolves"]["alpha"]).toBe(30);
      expect(state.hp["Wolves"]["beta"]).toBe(25);
    });
  });

  describe("mergeInitiativeState", () => {
    it("keeps existing creature state", () => {
      const block = makeBlock([
        { name: "Goblin", ac: 12, hp: 10 },
        { name: "Dragon", ac: 18, hp: 200 },
      ]);

      const saved = {
        activeIndex: 1,
        initiatives: { Goblin: 15, Dragon: 20 },
        hp: { Goblin: { main: 5 }, Dragon: { main: 180 } },
        round: 3,
        consumables: {},
      };

      const merged = mergeInitiativeState(block, saved);

      expect(merged.initiatives["Goblin"]).toBe(15);
      expect(merged.initiatives["Dragon"]).toBe(20);
      expect(merged.hp["Goblin"]["main"]).toBe(5);
      expect(merged.hp["Dragon"]["main"]).toBe(180);
      expect(merged.round).toBe(3);
      expect(merged.activeIndex).toBe(1);
    });

    it("initializes new creatures to max HP", () => {
      const block = makeBlock([
        { name: "Goblin", ac: 12, hp: 10 },
        { name: "Orc", ac: 13, hp: 30 },
      ]);

      const saved = {
        activeIndex: 0,
        initiatives: { Goblin: 15 },
        hp: { Goblin: { main: 5 } },
        round: 2,
        consumables: {},
      };

      const merged = mergeInitiativeState(block, saved);

      // Existing creature keeps state
      expect(merged.hp["Goblin"]["main"]).toBe(5);

      // New creature gets max HP
      expect(merged.hp["Orc"]["main"]).toBe(30);
      expect(merged.initiatives["Orc"]).toBe(0);
    });

    it("drops removed creatures", () => {
      const block = makeBlock([{ name: "Goblin", ac: 12, hp: 10 }]);

      const saved = {
        activeIndex: 0,
        initiatives: { Goblin: 15, Dragon: 20 },
        hp: { Goblin: { main: 5 }, Dragon: { main: 180 } },
        round: 2,
        consumables: {},
      };

      const merged = mergeInitiativeState(block, saved);

      expect(merged.initiatives["Goblin"]).toBe(15);
      expect(merged.initiatives["Dragon"]).toBeUndefined();
      expect(merged.hp["Dragon"]).toBeUndefined();
    });
  });

  describe("duplicate names", () => {
    const items = [
      { name: "Goblin", ac: 12, hp: 7 },
      { name: "Goblin", ac: 12, hp: 9 },
      { name: "Dragon", ac: 18, hp: 200 },
    ];

    it("itemHashKey keeps the bare name for unique names and the first occurrence, and suffixes later duplicates", () => {
      expect(itemHashKey(items[0], 0, items)).toBe("Goblin");
      expect(itemHashKey(items[1], 1, items)).toBe("Goblin_1");
      expect(itemHashKey(items[2], 2, items)).toBe("Dragon");
    });

    it("suffix counts occurrences of the same name, not the list position", () => {
      const list = [
        { name: "Goblin", ac: 12, hp: 7 },
        { name: "Dragon", ac: 18, hp: 200 },
        { name: "Goblin", ac: 12, hp: 9 },
        { name: "Goblin", ac: 12, hp: 5 },
      ];

      expect(list.map((item, i) => itemHashKey(item, i, list))).toEqual(["Goblin", "Dragon", "Goblin_1", "Goblin_2"]);
    });

    it("adding or reordering differently named items does not change duplicate keys", () => {
      const goblins = [
        { name: "Goblin", ac: 12, hp: 7 },
        { name: "Goblin", ac: 12, hp: 9 },
      ];
      const withOthers = [{ name: "Orc", ac: 13, hp: 30 }, goblins[0], { name: "Dragon", ac: 18, hp: 200 }, goblins[1]];

      expect(itemHashKey(goblins[0], 0, goblins)).toBe(itemHashKey(goblins[0], 1, withOthers));
      expect(itemHashKey(goblins[1], 1, goblins)).toBe(itemHashKey(goblins[1], 3, withOthers));
    });

    it("adding a duplicate keeps the existing item's key", () => {
      const single = [{ name: "Goblin", ac: 12, hp: 7 }];
      const double = [...single, { name: "Goblin", ac: 12, hp: 9 }];

      expect(itemHashKey(single[0], 0, single)).toBe("Goblin");
      expect(itemHashKey(double[0], 0, double)).toBe("Goblin");
    });

    it("tracks duplicate-named items separately in default state", () => {
      const state = getDefaultInitiativeState(makeBlock(items));

      expect(state.hp["Goblin"]["main"]).toBe(7);
      expect(state.hp["Goblin_1"]["main"]).toBe(9);
      expect(state.hp["Dragon"]["main"]).toBe(200);
    });

    it("sorts duplicate-named items by their own initiative", () => {
      const sorted = getSortedInitiativeItems(items, { Goblin: 5, Goblin_1: 18, Dragon: 10 });

      expect(sorted.map((s) => s.index)).toEqual([1, 2, 0]);
    });

    it("keeps unique-name saved state unchanged when merging", () => {
      const block = makeBlock([
        { name: "Goblin", ac: 12, hp: 10 },
        { name: "Dragon", ac: 18, hp: 200 },
      ]);
      const saved = {
        activeIndex: 0,
        initiatives: { Goblin: 15, Dragon: 20 },
        hp: { Goblin: { main: 5 }, Dragon: { main: 180 } },
        round: 2,
        consumables: {},
      };

      const merged = mergeInitiativeState(block, saved);

      expect(merged.initiatives).toEqual(saved.initiatives);
      expect(merged.hp).toEqual(saved.hp);
    });

    it("migrates state saved under the shared bare name to the first duplicate only", () => {
      const saved = {
        activeIndex: 0,
        initiatives: { Goblin: 15, Dragon: 20 },
        hp: { Goblin: { main: 3 }, Dragon: { main: 180 } },
        round: 2,
        consumables: {},
      };

      const merged = mergeInitiativeState(makeBlock(items), saved);

      expect(merged.hp["Goblin"]["main"]).toBe(3);
      expect(merged.hp["Goblin_1"]["main"]).toBe(9);
      expect(merged.initiatives["Goblin_1"]).toBe(0);
      expect(merged.hp["Dragon"]["main"]).toBe(180);
    });
  });
});
