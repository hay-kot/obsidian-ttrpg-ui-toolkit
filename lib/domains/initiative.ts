import * as Utils from "lib/utils/utils";
import { InitiativeBlock, InitiativeItem } from "lib/types";
import { parseYamlObject } from "lib/utils/yaml";

export interface InitiativeState {
  activeIndex: number;
  initiatives: Record<string, number>;
  hp: Record<string, Record<string, number>>;
  round: number;
  consumables: Record<string, number>;
}

export function parseInitiativeBlock(yamlString: string): InitiativeBlock & { state_key?: string } {
  const def: InitiativeBlock = {
    // @ts-expect-error - no viable default for state_key
    state_key: undefined,
    items: [],
    consumables: [],
  };

  const parsed = parseYamlObject<InitiativeBlock>(yamlString);
  const merged = Utils.mergeWithDefaults(parsed, def);

  // Apply defaults to consumables
  if (merged.consumables) {
    merged.consumables = merged.consumables.map((consumable) => ({
      ...consumable,
      reset_on_round: consumable.reset_on_round ?? false,
    }));
  }

  return merged;
}

export function getDefaultInitiativeState(block: InitiativeBlock): InitiativeState {
  const initiatives: Record<string, number> = {};
  const hp: Record<string, Record<string, number>> = {};
  const consumables: Record<string, number> = {};

  // Initialize with default values (0 for initiative, max hp for health)
  block.items.forEach((item, index) => {
    const key = itemHashKey(item, index, block.items);
    initiatives[key] = 0;
    hp[key] = {};

    if (typeof item.hp === "number") {
      hp[key]["main"] = item.hp;
    } else if (item.hp && typeof item.hp === "object") {
      Object.entries(item.hp).forEach(([k, value]) => {
        hp[key][k] = value;
      });
    }
  });

  // Initialize consumables with 0 uses
  if (block.consumables) {
    block.consumables.forEach((consumable) => {
      consumables[consumable.state_key] = 0;
    });
  }

  return {
    activeIndex: -1, // No active combatant at first
    initiatives,
    hp,
    round: 1, // Start at round 1
    consumables,
  };
}

export function mergeInitiativeState(block: InitiativeBlock, saved: InitiativeState): InitiativeState {
  const defaults = getDefaultInitiativeState(block);

  const initiatives: Record<string, number> = {};
  const hp: Record<string, Record<string, number>> = {};

  block.items.forEach((item, index) => {
    const key = itemHashKey(item, index, block.items);
    initiatives[key] = saved.initiatives[key] ?? defaults.initiatives[key] ?? 0;
    hp[key] = saved.hp[key] ?? defaults.hp[key] ?? {};
  });

  return {
    activeIndex: saved.activeIndex,
    initiatives,
    hp,
    round: saved.round,
    consumables: { ...defaults.consumables, ...saved.consumables },
  };
}

/**
 * Generates a unique key for an initiative item. The first item with a given
 * name uses the name alone. Later items with the same name get the count of
 * earlier same-name items as a suffix (e.g., three "Goblin" entries become
 * "Goblin", "Goblin_1" and "Goblin_2"). Because the suffix counts only items
 * with the same name, adding or moving differently named items does not change
 * any key, and a unique name always keeps its bare-name key.
 */
export function itemHashKey(item: InitiativeItem, index: number, allItems: InitiativeItem[]): string {
  let occurrence = 0;
  for (let i = 0; i < index; i++) {
    if (allItems[i].name === item.name) occurrence++;
  }
  return occurrence === 0 ? item.name : `${item.name}_${occurrence}`;
}

// Sort items by initiative value, higher values first
export function getSortedInitiativeItems(
  items: InitiativeItem[],
  initiativeValues: Record<string, number>
): { item: InitiativeItem; index: number; initiative: number }[] {
  return items
    .map((item, index) => ({
      item,
      index,
      initiative: initiativeValues[itemHashKey(item, index, items)] || 0,
    }))
    .sort((a, b) => b.initiative - a.initiative);
}

// Check if an HP object is a group (has multiple keys)
export function isGroupHp(hp: Record<string, number>): boolean {
  return Object.keys(hp).length > 1 || (Object.keys(hp).length === 1 && Object.keys(hp)[0] !== "main");
}

// Get the max HP for a specific monster
export function getMaxHp(item: InitiativeItem, monsterKey?: string): number {
  if (typeof item.hp === "number") {
    return item.hp;
  } else if (item.hp && typeof item.hp === "object") {
    if (monsterKey && monsterKey in item.hp) {
      return item.hp[monsterKey];
    } else if (Object.keys(item.hp).length === 1) {
      return Object.values(item.hp)[0];
    }
  }
  return 0;
}
